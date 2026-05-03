import { dbgLog, dbgWarn } from '../utils/logger.js';

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const OPENROUTER_APP_URL = 'https://thinkreview.dev';
const OPENROUTER_APP_TITLE = 'ThinkReview';
const OPENROUTER_REVIEW_MAX_TOKENS_BUDGET = 4096;
const OPENROUTER_CONVERSATION_MAX_TOKENS_BUDGET = 2048;
const OPENROUTER_RESERVED_RESPONSE_TOKENS = 1024;

function getStoredOpenRouterConfig() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['openrouterConfig'], (result) => {
      resolve(result?.openrouterConfig || {});
    });
  });
}

async function resolveOpenRouterApiKey(apiKeyOverride = null) {
  const override = typeof apiKeyOverride === 'string' ? apiKeyOverride.trim() : '';
  if (override) {
    return override;
  }
  const config = await getStoredOpenRouterConfig();
  return config.apiKey?.trim() || '';
}

function getRequestHeaders(apiKey) {
  return {
    Authorization: `Bearer ${apiKey}`,
    'HTTP-Referer': OPENROUTER_APP_URL,
    'X-OpenRouter-Title': OPENROUTER_APP_TITLE,
    'Content-Type': 'application/json'
  };
}

function buildReviewPrompt(patchContent, language) {
  const promptBeforePatch = `You are an expert code reviewer. Analyze this git patch and provide a comprehensive code review in ${language}.

You MUST provide a comprehensive code review with the following sections:
1. Summary: an explanatory high level, 1 up to 7 numbered bullet points with an extra line separator between each point - depending on the code's purpose and design, you mention and summarize every change in the patch.
2. Suggestions: An array of strings containing specific, actionable recommendations to directly improve the provided code , be well descriptive and focus on critical issues . If none, this MUST be an empty array ([]).
3. Security Issues: An array of strings identifying potential security vulnerabilities (e.g., injection risks, hardcoded secrets, insecure dependencies). If none, this MUST be an empty array.
4. Suggested Follow-up Questions: An array containing exactly 3 relevant, insightful follow-up questions a developer might ask to deepen their understanding of the underlying principles related to the review feedback.
5. Metrics: An object containing scores from 0-100 (overallScore, codeQuality, securityScore, bestPracticesScore).

You MUST format your response as VALID JSON with this structure:
{
  "summary": "Brief summary of the changes",
  "suggestions": ["Suggestion 1", "Suggestion 2", ...],
  "securityIssues": ["Security issue 1", "Security issue 2", ...],
  "suggestedQuestions": ["Question 1?", "Question 2?", "Question 3?"],
  "metrics": {
    "overallScore": 85,
    "codeQuality": 80,
    "securityScore": 90,
    "bestPracticesScore": 85
  }
}

Import rules:
- Return ONLY valid JSON, no markdown formatting, no code blocks, no explanations.
- All metric scores should be 0-100. Provide at least 3 code suggestions. Provide exactly 3 follow-up questions.

Here is the patch to review:

`;
  const promptAfterPatch = `

Important: Respond ONLY with valid JSON. Do not include any explanatory text before or after the JSON.`;

  return {
    promptBeforePatch,
    promptAfterPatch,
    prompt: `${promptBeforePatch}${patchContent}${promptAfterPatch}`
  };
}

function buildConversationMessages(patchContent, conversationHistory, language) {
  const truncatedPatch = patchContent.length > 40000
    ? patchContent.substring(0, 20000) + '\n... (truncated for brevity)'
    : patchContent;

  const systemContext = `You are an expert code reviewer. The following code patch is being discussed:\n\nCODE PATCH (Git Diff Format):\n\`\`\`\n${truncatedPatch}\n\`\`\`\n\nYour role is to answer questions about this code review in a helpful, concise manner using Markdown formatting.`;

  const languageInstruction = language && language !== 'English'
    ? `\n\nIMPORTANT: You MUST respond entirely in ${language}. Your entire response must be written in ${language}.`
    : '';

  const MAX_HISTORY_MESSAGES = 11;
  let truncatedHistory = conversationHistory;

  if (conversationHistory.length > MAX_HISTORY_MESSAGES) {
    truncatedHistory = [
      conversationHistory[0],
      ...conversationHistory.slice(-(MAX_HISTORY_MESSAGES - 1))
    ];
    dbgLog(`Truncated conversation history from ${conversationHistory.length} to ${truncatedHistory.length} messages`);
  }

  const lastUserMessage = truncatedHistory[truncatedHistory.length - 1];
  if (!lastUserMessage || lastUserMessage.role !== 'user') {
    throw new Error('The last message in the history must be from the user');
  }

  return [
    { role: 'system', content: systemContext },
    ...truncatedHistory.slice(0, -1).map((message) => ({
      role: message.role === 'user' ? 'user' : 'assistant',
      content: message.content
    })),
    {
      role: 'user',
      content: lastUserMessage.content + (languageInstruction ? `\n\n${languageInstruction}` : '') + '\n\nKeep your response concise and well-formatted using Markdown.'
    }
  ];
}

function estimatePromptTokensFromMessages(messages) {
  const totalCharacters = Array.isArray(messages)
    ? messages.reduce((total, message) => total + String(message?.content || '').length, 0)
    : 0;

  return Math.ceil(totalCharacters / 2);
}

function resolveOpenRouterMaxTokens(contextLength, promptTokens, fallbackBudget) {
  const parsedBudget = Number(fallbackBudget);
  const budget = Number.isFinite(parsedBudget) && parsedBudget > 0
    ? Math.floor(parsedBudget)
    : 1024;
  const parsedContextLength = Number(contextLength);
  const parsedPromptTokens = Number(promptTokens);

  if (Number.isFinite(parsedContextLength) && parsedContextLength > 0) {
    const availableTokens = Math.max(
      1,
      parsedContextLength - OPENROUTER_RESERVED_RESPONSE_TOKENS - (Number.isFinite(parsedPromptTokens) && parsedPromptTokens > 0 ? Math.floor(parsedPromptTokens) : 0)
    );
    return Math.max(1, Math.min(availableTokens, budget));
  }

  return budget;
}

function extractJsonFromText(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error('No JSON found in response');
  }
  return JSON.parse(match[0]);
}

function normalizeReview(parsedReview, model) {
  const suggestions = [];
  if (Array.isArray(parsedReview.suggestions)) {
    parsedReview.suggestions.forEach((suggestion) => {
      if (typeof suggestion === 'string') {
        suggestions.push(suggestion);
      } else if (suggestion && typeof suggestion === 'object' && suggestion.description) {
        suggestions.push(`[${suggestion.type?.toUpperCase() || 'TIP'}] ${suggestion.description} (${suggestion.file || ''}:${suggestion.line || ''})`);
      }
    });
  }
  if (suggestions.length === 0 && Array.isArray(parsedReview.issues)) {
    parsedReview.issues.forEach((issue) => {
      suggestions.push(`[${issue.severity?.toUpperCase() || 'INFO'}] ${issue.description} (${issue.file}:${issue.line})`);
    });
  }

  const securityIssues = [];
  if (Array.isArray(parsedReview.securityIssues)) {
    parsedReview.securityIssues.forEach((securityIssue) => securityIssues.push(String(securityIssue)));
  }
  if (securityIssues.length === 0 && Array.isArray(parsedReview.security)) {
    parsedReview.security.forEach((securityItem) => {
      securityIssues.push(`[${securityItem.severity?.toUpperCase() || 'WARNING'}] ${securityItem.description}\n**Recommendation:** ${securityItem.recommendation || 'Review and address this concern.'}`);
    });
  }

  const bestPractices = Array.isArray(parsedReview.positives)
    ? parsedReview.positives
    : (Array.isArray(parsedReview.bestPractices) ? parsedReview.bestPractices : []);

  return {
    summary: parsedReview.summary || 'Code review completed',
    suggestions,
    securityIssues,
    bestPractices,
    metrics: parsedReview.metrics || {
      overallScore: 75,
      codeQuality: 75,
      securityScore: 85,
      bestPracticesScore: 75
    },
    suggestedQuestions: parsedReview.suggestedQuestions || [
      'How does this change affect existing functionality?',
      'Are there any edge cases we should consider?',
      'What testing strategy would you recommend?'
    ],
    provider: 'openrouter',
    model
  };
}

async function performOpenRouterRequest(path, body, apiKey) {
  const response = await fetch(`${OPENROUTER_BASE_URL}${path}`, {
    method: 'POST',
    headers: getRequestHeaders(apiKey),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000)
  });

  if (!response.ok) {
    const errorText = await response.text();
    const error = new Error(`OpenRouter API error (${response.status}): ${errorText}`);
    error.status = response.status;
    throw error;
  }

  return response.json();
}

export class OpenRouterService {
  static async testSelectedModel(modelId, apiKeyOverride = null) {
    const apiKey = await resolveOpenRouterApiKey(apiKeyOverride);
    const model = typeof modelId === 'string' ? modelId.trim() : '';

    if (!apiKey) {
      throw new Error('OpenRouter API key is missing. Open the extension settings and save your API key first.');
    }

    if (!model) {
      throw new Error('OpenRouter model is missing. Open the extension settings and select a model first.');
    }

    dbgLog('Testing selected OpenRouter model:', model);

    const requestBody = {
      model,
      messages: [
        {
          role: 'user',
          content: 'Reply with OK.'
        }
      ],
      stream: false,
      temperature: 0,
      max_tokens: 8
    };

    try {
      const data = await performOpenRouterRequest('/chat/completions', requestBody, apiKey);
      const responseContent = data.choices?.[0]?.message?.content ?? '';

      return {
        connected: true,
        model,
        response: responseContent
      };
    } catch (error) {
      dbgWarn('OpenRouter selected model test failed:', error);
      if (error.status === 401) {
        throw new Error('OpenRouter rejected the API key. Please check the key in extension settings and save again.');
      }
      throw new Error(`OpenRouter model test failed: ${error.message}`);
    }
  }

  static async reviewPatchCode(patchContent, language = 'English', mrId = null, mrUrl = null) {
    dbgLog('Sending patch for code review via OpenRouter');

    if (!patchContent) {
      dbgWarn('Cannot review code: Missing patch content');
      throw new Error('Missing patch content');
    }

    const config = await getStoredOpenRouterConfig();
    const apiKey = config.apiKey?.trim();
    const model = config.model?.trim();
    const contextLength = Number(config.contextLength) || null;

    if (!apiKey) {
      throw new Error('OpenRouter API key is missing. Open the extension settings and save your API key first.');
    }
    if (!model) {
      throw new Error('OpenRouter model is missing. Open the extension settings and select a model first.');
    }

    const { promptBeforePatch, promptAfterPatch } = buildReviewPrompt(patchContent, language);

    let patchToUse = patchContent;
    if (contextLength != null && contextLength > 0) {
      const CHARS_PER_TOKEN = 2;
      const RESERVED_RESPONSE_TOKENS = 1024;
      const promptTokens = Math.ceil((promptBeforePatch.length + promptAfterPatch.length) / CHARS_PER_TOKEN);
      const maxPatchTokens = Math.max(0, contextLength - RESERVED_RESPONSE_TOKENS - promptTokens);
      const maxPatchChars = maxPatchTokens * CHARS_PER_TOKEN;
      if (patchContent.length > maxPatchChars) {
        patchToUse = patchContent.substring(0, maxPatchChars) + '\n\n... (truncated for context limit)';
        dbgLog('OpenRouter patch truncated to fit context:', { contextLength, maxPatchChars, originalLength: patchContent.length });
      }
    }

    const reviewMessages = [
      {
        role: 'system',
        content: 'You are an expert code reviewer. Return only valid JSON that matches the requested schema.'
      },
      {
        role: 'user',
        content: `${promptBeforePatch}${patchToUse}${promptAfterPatch}`
      }
    ];
    const maxTokens = resolveOpenRouterMaxTokens(
      contextLength,
      estimatePromptTokensFromMessages(reviewMessages),
      OPENROUTER_REVIEW_MAX_TOKENS_BUDGET
    );
    dbgLog('OpenRouter max_tokens resolved for review:', {
      contextLength,
      budget: OPENROUTER_REVIEW_MAX_TOKENS_BUDGET,
      maxTokens
    });

    const requestBody = {
      model,
      messages: reviewMessages,
      stream: false,
      temperature: 0.2,
      max_tokens: maxTokens
    };

    try {
      const data = await performOpenRouterRequest('/chat/completions', requestBody, apiKey);
      dbgLog('OpenRouter raw response received:', {
        hasChoices: Array.isArray(data?.choices),
        choiceCount: data?.choices?.length || 0
      });

      const reviewText = data.choices?.[0]?.message?.content ?? '';
      try {
        const parsedReview = extractJsonFromText(reviewText);
        return {
          status: 'success',
          review: normalizeReview(parsedReview, model),
          raw: parsedReview,
          provider: 'openrouter'
        };
      } catch (parseError) {
        dbgWarn('Failed to parse OpenRouter JSON response, using fallback structure:', parseError);
        return {
          status: 'success',
          review: {
            summary: reviewText.substring(0, 500) + (reviewText.length > 500 ? '...' : ''),
            suggestions: ['Review the full text response for detailed feedback'],
            securityIssues: [],
            bestPractices: [],
            metrics: {
              overallScore: 75,
              codeQuality: 75,
              securityScore: 85,
              bestPracticesScore: 75
            },
            suggestedQuestions: [
              'Can you explain this change in more detail?',
              'What are the potential risks?',
              'How should this be tested?'
            ],
            provider: 'openrouter',
            model,
            note: 'Model did not return structured JSON. See raw response below.'
          },
          rawResponse: reviewText
        };
      }
    } catch (error) {
      dbgWarn('Error reviewing code with OpenRouter:', error);
      if (error.status === 401) {
        throw new Error('OpenRouter rejected the API key. Please check the key in extension settings and save again.');
      }
      throw new Error(`OpenRouter error: ${error.message}`);
    }
  }

  static async getConversationalResponse(patchContent, conversationHistory, language = 'English', mrId = null, mrUrl = null) {
    dbgLog('Getting conversational response from OpenRouter');

    if (!patchContent || !conversationHistory || conversationHistory.length === 0) {
      throw new Error('Missing patch content or conversation history');
    }

    const config = await getStoredOpenRouterConfig();
    const apiKey = config.apiKey?.trim();
    const model = config.model?.trim();
    const contextLength = Number(config.contextLength) || null;

    if (!apiKey) {
      throw new Error('OpenRouter API key is missing. Open the extension settings and save your API key first.');
    }
    if (!model) {
      throw new Error('OpenRouter model is missing. Open the extension settings and select a model first.');
    }

    const messages = buildConversationMessages(patchContent, conversationHistory, language);

    const maxTokens = resolveOpenRouterMaxTokens(
      contextLength,
      estimatePromptTokensFromMessages(messages),
      OPENROUTER_CONVERSATION_MAX_TOKENS_BUDGET
    );
    dbgLog('OpenRouter max_tokens resolved for conversation:', {
      contextLength,
      budget: OPENROUTER_CONVERSATION_MAX_TOKENS_BUDGET,
      maxTokens
    });

    const requestBody = {
      model,
      messages,
      stream: false,
      temperature: 0.2,
      max_tokens: maxTokens
    };

    try {
      const data = await performOpenRouterRequest('/chat/completions', requestBody, apiKey);
      const responseContent = data.choices?.[0]?.message?.content ?? '';
      return {
        response: responseContent || 'No response generated',
        provider: 'openrouter',
        model
      };
    } catch (error) {
      dbgWarn('Error getting conversational response from OpenRouter:', error);
      if (error.status === 401) {
        throw new Error('OpenRouter rejected the API key. Please check the key in extension settings and save again.');
      }
      throw new Error(`OpenRouter error: ${error.message}`);
    }
  }

  static async checkConnection(apiKeyOverride = null) {
    const apiKey = await resolveOpenRouterApiKey(apiKeyOverride);

    if (!apiKey) {
      return { connected: false, error: 'OpenRouter API key is missing', isAuthError: true };
    }

    try {
      dbgLog('Checking connection to OpenRouter');
      const response = await fetch(`${OPENROUTER_BASE_URL}/models`, {
        method: 'GET',
        headers: getRequestHeaders(apiKey),
        signal: AbortSignal.timeout(5000)
      });
      const connected = response.ok;
      return { connected, error: connected ? null : `HTTP ${response.status}`, isAuthError: response.status === 401 };
    } catch (error) {
      dbgWarn('OpenRouter connection check failed:', error);
      const errorMessage = error.message || String(error);
      return { connected: false, error: errorMessage, isAuthError: errorMessage.includes('401') };
    }
  }

  static async getAvailableModels(apiKeyOverride = null) {
    const apiKey = await resolveOpenRouterApiKey(apiKeyOverride);

    if (!apiKey) {
      return { models: [], error: 'OpenRouter API key is missing', isAuthError: true };
    }

    try {
      dbgLog('Fetching available OpenRouter models');
      const response = await fetch(`${OPENROUTER_BASE_URL}/models`, {
        method: 'GET',
        headers: getRequestHeaders(apiKey),
        signal: AbortSignal.timeout(5000)
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.status}`);
      }

      const data = await response.json();
      const models = Array.isArray(data?.data)
        ? data.data.map((model) => ({
            id: model.id,
            name: model.name || model.id,
            context_length: model.context_length,
            max_output_length: model.max_output_length,
            supported_features: model.supported_features || []
          }))
        : [];

      dbgLog(`Found ${models.length} OpenRouter models`);
      return { models, error: null, isAuthError: false };
    } catch (error) {
      dbgWarn('Error fetching OpenRouter models:', error);
      const errorMessage = error.message || String(error);
      return {
        models: [],
        error: errorMessage,
        isAuthError: errorMessage.includes('401')
      };
    }
  }
}