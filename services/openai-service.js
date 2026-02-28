import { dbgLog, dbgWarn, dbgError } from '../utils/logger.js';
import { clampOllamaOptions } from '../utils/ollama-options.js';


/**
 * OpenAI-Compatible API Service for ThinkReview
 * Handles code reviews using any OpenAI-compatible endpoint
 * (OpenAI, Groq, Together AI, LM Studio, vLLM, Azure OpenAI, etc.)
 */
export class OpenAIService {
  /**
   * Review patch code using an OpenAI-compatible endpoint
   * @param {string} patchContent - The patch content in git diff format
   * @param {string} [language] - Optional language preference for the review
   * @param {string} [mrId] - Optional merge request ID for tracking
   * @param {string} [mrUrl] - Optional merge request URL
   * @returns {Promise<Object>} - Code review results
   */
  static async reviewPatchCode(patchContent, language = 'English', mrId = null, mrUrl = null) {
    dbgLog('Sending patch for code review via OpenAI-compatible API');

    if (!patchContent) {
      dbgWarn('Cannot review code: Missing patch content');
      throw new Error('Missing patch content');
    }

    try {
      // Get OpenAI config from storage
      const config = await chrome.storage.local.get(['openaiConfig']);
      const {
        url = 'https://api.openai.com',
        apiKey = '',
        model = 'gpt-4o-mini',
        contextLength = 128000,
        temperature: temp,
        top_p: topP,
        top_k: topK
      } = config.openaiConfig || {};
      const { temperature: tempClamped, top_p: topPClamped, top_k: topKClamped } = clampOllamaOptions({ temperature: temp, top_p: topP, top_k: topK });

      if (!apiKey) {
        throw new Error('API key is not configured. Please enter your API key in ThinkReview settings.');
      }

      dbgLog(`Using OpenAI-compatible API at ${url} with model ${model}`);

      // Single prompt: instructions + patch (split so we can truncate patch by context length)
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

      // Truncate patch to fit model context when contextLength is configured
      const CHARS_PER_TOKEN = 2;
      const RESERVED_RESPONSE_TOKENS = 1024;
      let patchToUse = patchContent;
      const savedContextLength = contextLength;
      if (savedContextLength != null && savedContextLength > 0) {
        const promptTokens = Math.ceil((promptBeforePatch.length + promptAfterPatch.length) / CHARS_PER_TOKEN);
        const maxPatchTokens = Math.max(0, savedContextLength - RESERVED_RESPONSE_TOKENS - promptTokens);
        const maxPatchChars = maxPatchTokens * CHARS_PER_TOKEN;
        if (patchContent.length > maxPatchChars) {
          patchToUse = patchContent.substring(0, maxPatchChars) + '\n\n... (truncated for context limit)';
          dbgLog('Patch truncated to fit context:', { savedContextLength, maxPatchChars, originalLength: patchContent.length });
        }
      }

      const fullPrompt = promptBeforePatch + patchToUse + promptAfterPatch;

      // Metadata for integrated review panel (patch size, truncation, model)
      const patchSizeChars = patchContent.length;
      const patchSentChars = patchToUse.length;
      const wasTruncated = patchContent.length > patchToUse.length;
      const openaiMeta = { patchSizeChars, patchSentChars, wasTruncated, model };

      // Build request body for OpenAI Chat Completions API
      const requestBody = {
        model: model,
        messages: [
          { role: 'system', content: fullPrompt }
        ],
        temperature: tempClamped,
        top_p: topPClamped,
        top_k: topKClamped,
        stream: false,
        response_format: { type: 'json_object' }
      };

      let data = await this._chatCompletion(url, apiKey, requestBody);

      // If the endpoint returned a 400 about response_format, retry without it
      if (data._retryWithoutResponseFormat) {
        delete requestBody.response_format;
        data = await this._chatCompletion(url, apiKey, requestBody);
      }

      const reviewText = data.choices?.[0]?.message?.content ?? '';
      dbgLog('OpenAI raw response received:', {
        hasContent: !!reviewText,
        contentLength: reviewText.length
      });

      // Try to parse as JSON
      try {
        // Look for JSON content in the response (sometimes models wrap it in markdown)
        const jsonMatch = reviewText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsedReview = JSON.parse(jsonMatch[0]);
          dbgLog('Successfully parsed JSON review:', parsedReview);

          // Map response to match the UI's expected format (supports structured-output shape and legacy shape)
          const suggestions = [];
          if (parsedReview.suggestions && Array.isArray(parsedReview.suggestions)) {
            parsedReview.suggestions.forEach(s => {
              if (typeof s === 'string') suggestions.push(s);
              else if (s && typeof s === 'object' && s.description) suggestions.push(`[${s.type?.toUpperCase() || 'TIP'}] ${s.description} (${s.file || ''}:${s.line || ''})`);
            });
          }
          if (suggestions.length === 0 && parsedReview.issues && Array.isArray(parsedReview.issues)) {
            parsedReview.issues.forEach(issue => {
              suggestions.push(`[${issue.severity?.toUpperCase() || 'INFO'}] ${issue.description} (${issue.file}:${issue.line})`);
            });
          }

          const securityIssues = [];
          if (parsedReview.securityIssues && Array.isArray(parsedReview.securityIssues)) {
            parsedReview.securityIssues.forEach(s => securityIssues.push(String(s)));
          }
          if (securityIssues.length === 0 && parsedReview.security && Array.isArray(parsedReview.security)) {
            parsedReview.security.forEach(sec => {
              securityIssues.push(`[${sec.severity?.toUpperCase() || 'WARNING'}] ${sec.description}\n**Recommendation:** ${sec.recommendation || 'Review and address this concern.'}`);
            });
          }

          const bestPractices = Array.isArray(parsedReview.positives) ? parsedReview.positives : (Array.isArray(parsedReview.bestPractices) ? parsedReview.bestPractices : []);

          // Get metrics (with fallback to reasonable defaults matching Gemini format)
          const metrics = parsedReview.metrics || {
            overallScore: 75,
            codeQuality: 75,
            securityScore: 85,
            bestPracticesScore: 75
          };

          // Get suggested questions (with fallback)
          const suggestedQuestions = parsedReview.suggestedQuestions || [
            "How does this change affect existing functionality?",
            "Are there any edge cases we should consider?",
            "What testing strategy would you recommend?"
          ];

          // Return in the format expected by content.js (matching Cloud API format)
          return {
            status: 'success',
            review: {
              summary: parsedReview.summary || 'Code review completed',
              suggestions: suggestions,
              securityIssues: securityIssues,
              bestPractices: bestPractices,
              metrics: metrics,
              suggestedQuestions: suggestedQuestions,
              provider: 'openai',
              model: model
            },
            raw: parsedReview,
            openaiMeta
          };
        } else {
          throw new Error('No JSON found in response');
        }
      } catch (parseError) {
        dbgWarn('Failed to parse JSON response, using fallback structure:', parseError);

        // Fallback: Structure the text response manually (matching Cloud API format)
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
              "Can you explain this change in more detail?",
              "What are the potential risks?",
              "How should this be tested?"
            ],
            provider: 'openai',
            model: model,
            note: 'Model did not return structured JSON. See raw response below.'
          },
          rawResponse: reviewText,
          openaiMeta
        };
      }
    } catch (error) {
      dbgWarn('Error reviewing code with OpenAI-compatible API:', error);

      if (error.message.includes('API key')) {
        throw error; // Already a user-friendly message
      } else if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
        throw new Error('Cannot connect to the API endpoint. Please verify the base URL in ThinkReview settings and ensure the service is reachable.');
      } else if (error.message.includes('401') || error.message.includes('Unauthorized')) {
        throw new Error('Invalid API key. Please check your API key in ThinkReview settings.');
      } else if (error.message.includes('429') || error.message.includes('Rate limit')) {
        throw new Error('Rate limit exceeded. Please wait a moment and try again.');
      } else if (error.message.includes('404')) {
        throw new Error('API endpoint not found. Please verify the base URL in ThinkReview settings. The URL should be the base (e.g., https://api.openai.com), not the full path.');
      } else if (error.message.includes('model')) {
        throw new Error(`Model error: ${error.message}\n\nVerify the model name in ThinkReview settings.`);
      } else {
        throw new Error(`OpenAI-compatible API error: ${error.message}`);
      }
    }
  }

  /**
   * Get conversational response for follow-up questions
   * @param {string} patchContent - The patch content in git diff format
   * @param {Array<Object>} conversationHistory - The history of the conversation
   * @param {string} [language] - Optional language preference for the response
   * @param {string} [mrId] - Optional merge request ID for tracking
   * @param {string} [mrUrl] - Optional merge request URL
   * @returns {Promise<Object>} - Conversational response
   */
  static async getConversationalResponse(patchContent, conversationHistory, language = 'English', mrId = null, mrUrl = null) {
    dbgLog('Getting conversational response from OpenAI-compatible API');

    if (!patchContent || !conversationHistory || conversationHistory.length === 0) {
      throw new Error('Missing patch content or conversation history');
    }

    try {
      // Get OpenAI config from storage
      const config = await chrome.storage.local.get(['openaiConfig']);
      const {
        url = 'https://api.openai.com',
        apiKey = '',
        model = 'gpt-4o-mini',
        temperature: temp,
        top_p: topP,
        top_k: topK
      } = config.openaiConfig || {};
      const { temperature: tempClamped, top_p: topPClamped, top_k: topKClamped } = clampOllamaOptions({ temperature: temp, top_p: topP, top_k: topK });

      if (!apiKey) {
        throw new Error('API key is not configured. Please enter your API key in ThinkReview settings.');
      }

      dbgLog(`Using OpenAI-compatible API at ${url} with model ${model} for conversation`);

      // Truncate patch content if extremely large
      const truncatedPatch = patchContent.length > 40000
        ? patchContent.substring(0, 20000) + '\n... (truncated for brevity)'
        : patchContent;

      // Build the conversation context
      const systemContext = `You are an expert code reviewer. The following code patch is being discussed:

CODE PATCH (Git Diff Format):
\`\`\`
${truncatedPatch}
\`\`\`

Your role is to answer questions about this code review in a helpful, concise manner using Markdown formatting.`;

      // Build language instruction if not English
      const languageInstruction = language && language !== 'English'
        ? `\n\nIMPORTANT: You MUST respond entirely in ${language}. Your entire response must be written in ${language}.`
        : '';

      // Keep only the most recent messages to prevent token overflow
      const MAX_HISTORY_MESSAGES = 11; // 1 initial + 10 recent
      let truncatedHistory = conversationHistory;

      if (conversationHistory.length > MAX_HISTORY_MESSAGES) {
        truncatedHistory = [
          conversationHistory[0], // Initial review
          ...conversationHistory.slice(-(MAX_HISTORY_MESSAGES - 1)) // Most recent messages
        ];
        dbgLog(`Truncated conversation history from ${conversationHistory.length} to ${truncatedHistory.length} messages`);
      }

      // Get the last user message
      const lastUserMessage = truncatedHistory[truncatedHistory.length - 1];
      if (!lastUserMessage || lastUserMessage.role !== 'user') {
        throw new Error('The last message in the history must be from the user');
      }

      // Build messages array for chat completions
      const messages = [
        { role: 'system', content: systemContext },
        ...truncatedHistory.slice(0, -1).map(msg => ({
          role: msg.role === 'user' ? 'user' : 'assistant',
          content: msg.content
        })),
        {
          role: 'user',
          content: lastUserMessage.content + (languageInstruction ? `\n\n${languageInstruction}` : '') + '\n\nKeep your response concise and well-formatted using Markdown.'
        }
      ];

      const requestBody = {
        model: model,
        messages,
        temperature: tempClamped,
        top_p: topPClamped,
        top_k: topKClamped,
        stream: false
      };

      const data = await this._chatCompletion(url, apiKey, requestBody);
      dbgLog('OpenAI conversational response received');

      const responseContent = data.choices?.[0]?.message?.content ?? '';
      return {
        response: responseContent || 'No response generated',
        provider: 'openai',
        model: model
      };

    } catch (error) {
      dbgWarn('Error getting conversational response from OpenAI-compatible API:', error);

      if (error.message.includes('API key')) {
        throw error;
      } else if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
        throw new Error('Cannot connect to the API endpoint. Please verify the base URL and ensure the service is reachable.');
      } else {
        throw new Error(`OpenAI-compatible API error: ${error.message}`);
      }
    }
  }

  /**
   * Normalize a base URL for OpenAI-compatible endpoints.
   * If the URL already contains a versioned path segment (/v1, /v1beta, etc.)
   * it is returned as-is; otherwise /v1 is appended.
   * @param {string} url
   * @returns {string}
   */
  static _normalizeBaseUrl(url) {
    const base = url.replace(/\/+$/, '');
    // URLs that already carry a versioned path (e.g. /v1, /v1beta/openai)
    if (/\/v\d/i.test(base)) {
      return base;
    }
    return `${base}/v1`;
  }

  /**
   * Internal: Call the chat completions endpoint.
   * Returns the parsed JSON body, or an object with _retryWithoutResponseFormat if
   * the endpoint rejected response_format.
   * @param {string} baseUrl
   * @param {string} apiKey
   * @param {Object} requestBody
   * @returns {Promise<Object>}
   */
  static async _chatCompletion(baseUrl, apiKey, requestBody) {
    const endpoint = `${OpenAIService._normalizeBaseUrl(baseUrl)}/chat/completions`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();

      // If 400 and mentions response_format, signal caller to retry without it
      if (response.status === 400 && requestBody.response_format && errorText.toLowerCase().includes('response_format')) {
        dbgWarn('Endpoint does not support response_format, retrying without it');
        return { _retryWithoutResponseFormat: true };
      }

      throw new Error(`API error (${response.status}): ${errorText}`);
    }

    return response.json();
  }

  /**
   * Check if the OpenAI-compatible endpoint is accessible
   * @param {string} url - Base URL to check
   * @param {string} apiKey - API key for authentication
   * @returns {Promise<{connected: boolean, error: string|null}>}
   */
  static async checkConnection(url = 'https://api.openai.com', apiKey = '') {
    try {
      dbgLog(`Checking connection to OpenAI-compatible API at ${url}`);
      const endpoint = `${OpenAIService._normalizeBaseUrl(url)}/models`;
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`
        },
        signal: AbortSignal.timeout(5000)
      });

      if (response.status === 401 || response.status === 403) {
        return { connected: false, error: 'Invalid API key. Please check your key.' };
      }

      const isOk = response.ok;
      dbgLog(`Connection check result: ${isOk ? 'Success' : 'Failed'}`);
      return { connected: isOk, error: isOk ? null : `Server returned ${response.status}` };
    } catch (error) {
      dbgWarn('Connection check failed:', error);
      return {
        connected: false,
        error: error.message || 'Connection failed'
      };
    }
  }

  /**
   * Get list of available models from the endpoint
   * @param {string} url - Base URL
   * @param {string} apiKey - API key
   * @returns {Promise<{models: Array, error: string|null}>}
   */
  static async getAvailableModels(url = 'https://api.openai.com', apiKey = '') {
    try {
      dbgLog(`Fetching available models from ${url}`);
      const endpoint = `${OpenAIService._normalizeBaseUrl(url)}/models`;
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`
        },
        signal: AbortSignal.timeout(5000)
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.status}`);
      }

      const data = await response.json();
      const models = data.data || [];
      dbgLog(`Found ${models.length} models`);
      return { models, error: null };
    } catch (error) {
      dbgWarn('Error fetching models:', error);
      return {
        models: [],
        error: error.message || 'Failed to fetch models'
      };
    }
  }

  /**
   * Validate OpenAI configuration
   * @param {Object} config - Configuration to validate
   * @returns {Object} - Validation result with isValid and error message
   */
  static validateConfig(config) {
    if (!config || !config.url) {
      return { isValid: false, error: 'Base URL is required' };
    }

    try {
      new URL(config.url);
    } catch (e) {
      return { isValid: false, error: 'Invalid URL format' };
    }

    if (!config.apiKey || config.apiKey.trim() === '') {
      return { isValid: false, error: 'API key is required' };
    }

    if (!config.model || config.model.trim() === '') {
      return { isValid: false, error: 'Model name is required' };
    }

    return { isValid: true };
  }
}
