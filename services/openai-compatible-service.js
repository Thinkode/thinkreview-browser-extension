import { dbgLog, dbgWarn } from '../utils/logger.js';
import { normalizeOpenAICompatibleConfig } from '../utils/openai-compatible-options.js';

const OPENAI_COMPATIBLE_REVIEW_MAX_TOKENS_BUDGET = 200000;
const OPENAI_COMPATIBLE_CONVERSATION_MAX_TOKENS_BUDGET = 200000;
const OPENAI_COMPATIBLE_RESERVED_RESPONSE_TOKENS = 1024;
const OPENAI_COMPATIBLE_CONNECTION_TIMEOUT_MS = 10000;
const OPENAI_COMPATIBLE_MODEL_DISCOVERY_TIMEOUT_MS = 15000;
const OPENAI_COMPATIBLE_MODEL_TEST_TIMEOUT_MS = 300000;

function getStoredOpenAICompatibleConfig() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['openaiCompatibleConfig'], (result) => {
      resolve(result?.openaiCompatibleConfig || {});
    });
  });
}

function buildOpenAICompatiblePatchSize(patchContent, patchToUse) {
  const originalLength = typeof patchContent === 'string' ? patchContent.length : 0;
  const sentLength = typeof patchToUse === 'string' ? patchToUse.length : 0;

  return {
    original: originalLength,
    truncated: sentLength,
    filesExcluded: 0,
    excludedFileNames: [],
    wasTruncated: sentLength > 0 && sentLength < originalLength,
    wasForcedTruncated: false
  };
}

function normalizeBaseUrl(baseUrl) {
  const value = typeof baseUrl === 'string' ? baseUrl.trim() : '';
  if (!value) {
    return '';
  }
  return value.replace(/\/+$/, '');
}

function validateBaseUrl(baseUrl) {
  const normalized = normalizeBaseUrl(baseUrl);
  if (!normalized) {
    throw new Error('OpenAI Compatible base URL is missing. Open the extension settings and save your base URL first.');
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(normalized);
  } catch {
    throw new Error('OpenAI Compatible base URL is invalid. Use a full URL such as http://127.0.0.1:1234/v1.');
  }

  if (!parsedUrl.pathname.endsWith('/v1')) {
    throw new Error('OpenAI Compatible base URL must end with /v1, for example http://127.0.0.1:1234/v1.');
  }

  return normalized;
}

async function resolveOpenAICompatibleBaseUrl(baseUrlOverride = null) {
  const override = typeof baseUrlOverride === 'string' ? baseUrlOverride.trim() : '';
  if (override) {
    return validateBaseUrl(override);
  }

  const config = await getStoredOpenAICompatibleConfig();
  return validateBaseUrl(config.baseUrl || '');
}

async function resolveOpenAICompatibleApiKey(apiKeyOverride = null) {
  const override = typeof apiKeyOverride === 'string' ? apiKeyOverride.trim() : '';
  if (override) {
    return override;
  }

  const config = await getStoredOpenAICompatibleConfig();
  return config.apiKey?.trim() || '';
}

function getRequestHeaders(apiKey) {
  const headers = {
    'Content-Type': 'application/json'
  };

  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  return headers;
}

function isOpenAICompatibleTimeoutError(error) {
  const message = String(error?.message || error || '').toLowerCase();
  return error?.name === 'AbortError'
    || message.includes('signal timed out')
    || message.includes('timed out')
    || message.includes('the operation was aborted')
    || message.includes('timeout');
}

function createOpenAICompatibleTimeoutError(timeoutMs) {
  const error = new Error(`OpenAI Compatible request timed out after ${Math.round(timeoutMs / 1000)} seconds. Try a smaller model or a shorter prompt.`);
  error.code = 'TIMEOUT';
  return error;
}

function getOpenAICompatibleRequestSignal(timeoutMs) {
  const parsedTimeout = Number(timeoutMs);
  if (!Number.isFinite(parsedTimeout) || parsedTimeout <= 0) {
    return undefined;
  }
  return AbortSignal.timeout(parsedTimeout);
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

function resolveOpenAICompatibleMaxTokens(contextLength, promptTokens, fallbackBudget) {
  const parsedBudget = Number(fallbackBudget);
  const budget = Number.isFinite(parsedBudget) && parsedBudget > 0
    ? Math.floor(parsedBudget)
    : 1024;
  const parsedContextLength = Number(contextLength);
  const parsedPromptTokens = Number(promptTokens);

  if (Number.isFinite(parsedContextLength) && parsedContextLength > 0) {
    const availableTokens = Math.max(
      1,
      parsedContextLength - OPENAI_COMPATIBLE_RESERVED_RESPONSE_TOKENS - (Number.isFinite(parsedPromptTokens) && parsedPromptTokens > 0 ? Math.floor(parsedPromptTokens) : 0)
    );
    return Math.max(1, Math.min(availableTokens, budget));
  }

  return budget;
}

function applyOpenAICompatibleGenerationOptions(requestBody, config, maxTokens) {
  const normalizedConfig = normalizeOpenAICompatibleConfig(config);
  requestBody.temperature = normalizedConfig.temperature;
  requestBody.max_tokens = maxTokens;

  if (normalizedConfig.top_p != null) {
    requestBody.top_p = normalizedConfig.top_p;
  }

  if (normalizedConfig.top_k != null) {
    requestBody.top_k = normalizedConfig.top_k;
  }

  if (normalizedConfig.reasoning_effort) {
    requestBody.reasoning_effort = normalizedConfig.reasoning_effort;
  }

  return requestBody;
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
    provider: 'openai-compatible',
    model
  };
}

async function performOpenAICompatibleRequest(baseUrl, path, body, apiKey, options = {}) {
  const timeoutMs = options?.timeoutMs;
  let response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: getRequestHeaders(apiKey),
      body: JSON.stringify(body),
      signal: getOpenAICompatibleRequestSignal(timeoutMs)
    });
  } catch (error) {
    if (timeoutMs && isOpenAICompatibleTimeoutError(error)) {
      throw createOpenAICompatibleTimeoutError(timeoutMs);
    }
    throw error;
  }

  if (!response.ok) {
    const errorText = await response.text();
    const error = new Error(`OpenAI Compatible API error (${response.status}): ${errorText}`);
    error.status = response.status;
    throw error;
  }

  return response.json();
}

function parseModels(data) {
  return Array.isArray(data?.data)
    ? data.data.map((model) => ({
        id: model.id,
        name: model.name || model.id,
        context_length: model.context_length,
        max_output_length: model.max_output_length,
        supported_features: model.supported_features || []
      }))
    : [];
}

export class OpenAICompatibleService {
  static async testSelectedModel(modelId, baseUrlOverride = null, apiKeyOverride = null) {
    const baseUrl = await resolveOpenAICompatibleBaseUrl(baseUrlOverride);
    const apiKey = await resolveOpenAICompatibleApiKey(apiKeyOverride);
    const config = normalizeOpenAICompatibleConfig(await getStoredOpenAICompatibleConfig());
    const model = typeof modelId === 'string' ? modelId.trim() : '';

    if (!model) {
      throw new Error('OpenAI Compatible model is missing. Open the extension settings and select a model first.');
    }

    dbgLog('Testing selected OpenAI Compatible model:', model);

    const requestBody = {
      model,
      messages: [
        {
          role: 'user',
          content: 'Reply with OK.'
        }
      ],
      stream: false
    };

    applyOpenAICompatibleGenerationOptions(
      requestBody,
      config,
      Math.max(1, Math.min(8, config.max_tokens))
    );

    try {
      const data = await performOpenAICompatibleRequest(baseUrl, '/chat/completions', requestBody, apiKey, {
        timeoutMs: OPENAI_COMPATIBLE_MODEL_TEST_TIMEOUT_MS
      });
      const responseContent = data.choices?.[0]?.message?.content ?? '';

      return {
        connected: true,
        model,
        response: responseContent
      };
    } catch (error) {
      dbgWarn('OpenAI Compatible selected model test failed:', error);
      if (error.status === 401) {
        throw new Error('OpenAI Compatible endpoint rejected the API key. Please check the key in extension settings and save again.');
      }
      throw new Error(`OpenAI Compatible model test failed: ${error.message}`);
    }
  }

  static async reviewPatchCode(patchContent, language = 'English', mrId = null, mrUrl = null) {
    dbgLog('Sending patch for code review via OpenAI Compatible provider');

    if (!patchContent) {
      dbgWarn('Cannot review code: Missing patch content');
      throw new Error('Missing patch content');
    }

    const config = normalizeOpenAICompatibleConfig(await getStoredOpenAICompatibleConfig());
    const baseUrl = validateBaseUrl(config.baseUrl || '');
    const apiKey = config.apiKey?.trim();
    const model = config.model?.trim();
    const contextLength = Number(config.contextLength) || null;

    if (!model) {
      throw new Error('OpenAI Compatible model is missing. Open the extension settings and select a model first.');
    }

    const { promptBeforePatch, promptAfterPatch } = buildReviewPrompt(patchContent, language);

    let patchToUse = patchContent;
    if (contextLength != null && contextLength > 0) {
      const CHARS_PER_TOKEN = 2;
      const RESERVED_RESPONSE_TOKENS = OPENAI_COMPATIBLE_RESERVED_RESPONSE_TOKENS;
      const promptTokens = Math.ceil((promptBeforePatch.length + promptAfterPatch.length) / CHARS_PER_TOKEN);
      const maxPatchTokens = Math.max(0, contextLength - RESERVED_RESPONSE_TOKENS - promptTokens);
      const maxPatchChars = maxPatchTokens * CHARS_PER_TOKEN;
      if (patchContent.length > maxPatchChars) {
        patchToUse = patchContent.substring(0, maxPatchChars) + '\n\n... (truncated for context limit)';
        dbgLog('OpenAI Compatible patch truncated to fit context:', { contextLength, maxPatchChars, originalLength: patchContent.length });
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
    const maxTokens = resolveOpenAICompatibleMaxTokens(
      contextLength,
      estimatePromptTokensFromMessages(reviewMessages),
      OPENAI_COMPATIBLE_REVIEW_MAX_TOKENS_BUDGET
    );
    dbgLog('OpenAI Compatible max_tokens resolved for review:', {
      contextLength,
      budget: OPENAI_COMPATIBLE_REVIEW_MAX_TOKENS_BUDGET,
      maxTokens
    });

    const requestBody = {
      model,
      messages: reviewMessages,
      stream: false
    };

    applyOpenAICompatibleGenerationOptions(requestBody, config, maxTokens);
    const patchSize = buildOpenAICompatiblePatchSize(patchContent, patchToUse);

    try {
      const data = await performOpenAICompatibleRequest(baseUrl, '/chat/completions', requestBody, apiKey);
      dbgLog('OpenAI Compatible raw response received:', {
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
          provider: 'openai-compatible',
          patchSize,
          modelUsed: model
        };
      } catch (parseError) {
        dbgWarn('Failed to parse OpenAI Compatible JSON response, using fallback structure:', parseError);
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
            provider: 'openai-compatible',
            model,
            note: 'Model did not return structured JSON. See raw response below.'
          },
          patchSize,
          modelUsed: model,
          rawResponse: reviewText
        };
      }
    } catch (error) {
      dbgWarn('Error reviewing code with OpenAI Compatible provider:', error);
      if (error.code === 'TIMEOUT') {
        throw error;
      }
      if (error.status === 401) {
        throw new Error('OpenAI Compatible endpoint rejected the API key. Please check the key in extension settings and save again.');
      }
      throw new Error(`OpenAI Compatible error: ${error.message}`);
    }
  }

  static async getConversationalResponse(patchContent, conversationHistory, language = 'English', mrId = null, mrUrl = null) {
    dbgLog('Getting conversational response from OpenAI Compatible provider');

    if (!patchContent || !conversationHistory || conversationHistory.length === 0) {
      throw new Error('Missing patch content or conversation history');
    }

    const config = normalizeOpenAICompatibleConfig(await getStoredOpenAICompatibleConfig());
    const baseUrl = validateBaseUrl(config.baseUrl || '');
    const apiKey = config.apiKey?.trim();
    const model = config.model?.trim();
    const contextLength = Number(config.contextLength) || null;

    if (!model) {
      throw new Error('OpenAI Compatible model is missing. Open the extension settings and select a model first.');
    }

    const messages = buildConversationMessages(patchContent, conversationHistory, language);

    const maxTokens = resolveOpenAICompatibleMaxTokens(
      contextLength,
      estimatePromptTokensFromMessages(messages),
      OPENAI_COMPATIBLE_CONVERSATION_MAX_TOKENS_BUDGET
    );
    dbgLog('OpenAI Compatible max_tokens resolved for conversation:', {
      contextLength,
      budget: OPENAI_COMPATIBLE_CONVERSATION_MAX_TOKENS_BUDGET,
      maxTokens
    });

    const requestBody = {
      model,
      messages,
      stream: false
    };

    applyOpenAICompatibleGenerationOptions(requestBody, config, maxTokens);

    try {
      const data = await performOpenAICompatibleRequest(baseUrl, '/chat/completions', requestBody, apiKey);
      const responseContent = data.choices?.[0]?.message?.content ?? '';
      return {
        response: responseContent || 'No response generated',
        provider: 'openai-compatible',
        model
      };
    } catch (error) {
      dbgWarn('Error getting conversational response from OpenAI Compatible provider:', error);
      if (error.code === 'TIMEOUT') {
        throw error;
      }
      if (error.status === 401) {
        throw new Error('OpenAI Compatible endpoint rejected the API key. Please check the key in extension settings and save again.');
      }
      throw new Error(`OpenAI Compatible error: ${error.message}`);
    }
  }

  static async checkConnection(baseUrlOverride = null, apiKeyOverride = null) {
    let baseUrl;
    try {
      baseUrl = await resolveOpenAICompatibleBaseUrl(baseUrlOverride);
    } catch (error) {
      return { connected: false, error: error.message, isAuthError: false };
    }

    const apiKey = await resolveOpenAICompatibleApiKey(apiKeyOverride);

    try {
      dbgLog('Checking connection to OpenAI Compatible endpoint');
      const response = await fetch(`${baseUrl}/models`, {
        method: 'GET',
        headers: getRequestHeaders(apiKey),
        signal: AbortSignal.timeout(OPENAI_COMPATIBLE_CONNECTION_TIMEOUT_MS)
      });
      const connected = response.ok;
      return { connected, error: connected ? null : `HTTP ${response.status}`, isAuthError: response.status === 401 };
    } catch (error) {
      dbgWarn('OpenAI Compatible connection check failed:', error);
      const isTimeout = isOpenAICompatibleTimeoutError(error);
      const errorMessage = isTimeout
        ? `OpenAI Compatible request timed out after ${Math.round(OPENAI_COMPATIBLE_CONNECTION_TIMEOUT_MS / 1000)} seconds.`
        : error.message || String(error);
      return {
        connected: false,
        error: errorMessage,
        errorCode: isTimeout ? 'TIMEOUT' : null,
        isAuthError: errorMessage.includes('401')
      };
    }
  }

  static async getAvailableModels(baseUrlOverride = null, apiKeyOverride = null) {
    let baseUrl;
    try {
      baseUrl = await resolveOpenAICompatibleBaseUrl(baseUrlOverride);
    } catch (error) {
      return { models: [], error: error.message, isAuthError: false };
    }

    const apiKey = await resolveOpenAICompatibleApiKey(apiKeyOverride);

    try {
      dbgLog('Fetching available OpenAI Compatible models');
      const response = await fetch(`${baseUrl}/models`, {
        method: 'GET',
        headers: getRequestHeaders(apiKey),
        signal: AbortSignal.timeout(OPENAI_COMPATIBLE_MODEL_DISCOVERY_TIMEOUT_MS)
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.status}`);
      }

      const data = await response.json();
      const models = parseModels(data);

      dbgLog(`Found ${models.length} OpenAI Compatible models`);
      return { models, error: null, isAuthError: false };
    } catch (error) {
      dbgWarn('Error fetching OpenAI Compatible models:', error);
      const isTimeout = isOpenAICompatibleTimeoutError(error);
      const errorMessage = isTimeout
        ? `OpenAI Compatible request timed out after ${Math.round(OPENAI_COMPATIBLE_MODEL_DISCOVERY_TIMEOUT_MS / 1000)} seconds.`
        : error.message || String(error);
      return {
        models: [],
        error: errorMessage,
        errorCode: isTimeout ? 'TIMEOUT' : null,
        isAuthError: errorMessage.includes('401')
      };
    }
  }
}