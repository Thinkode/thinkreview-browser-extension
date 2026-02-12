import { dbgLog, dbgWarn, dbgError } from '../utils/logger.js';
import { clampOllamaOptions } from '../utils/ollama-options.js';


/**
 * Ollama Service for ThinkReview
 * Handles local AI code reviews using Ollama
 */
export class OllamaService {
  /**
   * Review patch code using local Ollama instance
   * @param {string} patchContent - The patch content in git diff format
   * @param {string} [language] - Optional language preference for the review
   * @param {string} [mrId] - Optional merge request ID for tracking
   * @param {string} [mrUrl] - Optional merge request URL
   * @returns {Promise<Object>} - Code review results
   */
  static async reviewPatchCode(patchContent, language = 'English', mrId = null, mrUrl = null) {
    dbgLog('Sending patch for code review');
    
    if (!patchContent) {
      dbgWarn('Cannot review code: Missing patch content');
      throw new Error('Missing patch content');
    }
    
    try {
      // Get Ollama config from storage
      const config = await chrome.storage.local.get(['ollamaConfig']);
      const { url = 'http://localhost:11434', model = 'codellama', OllamaModelcontextLength: savedContextLength, temperature: temp, top_p: topP, top_k: topK } = config.ollamaConfig || {};
      const { temperature: tempClamped, top_p: topPClamped, top_k: topKClamped } = clampOllamaOptions({ temperature: temp, top_p: topP, top_k: topK });
      
      dbgLog(`Using Ollama at ${url} with model ${model}`);
      
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

      // Truncate patch to fit model context when OllamaModelcontextLength is saved (Ollama only)
      const CHARS_PER_TOKEN = 4;
      const RESERVED_RESPONSE_TOKENS = 1024;
      let patchToUse = patchContent;
      if (savedContextLength != null && savedContextLength > 0) {
        const promptTokens = Math.ceil((promptBeforePatch.length + promptAfterPatch.length) / CHARS_PER_TOKEN);
        const maxPatchTokens = Math.max(0, savedContextLength - RESERVED_RESPONSE_TOKENS - promptTokens);
        const maxPatchChars = maxPatchTokens * CHARS_PER_TOKEN;
        if (patchContent.length > maxPatchChars) {
          patchToUse = patchContent.substring(0, maxPatchChars) + '\n\n... (truncated for context limit)';
          dbgLog('Patch truncated to fit context:', { savedContextLength, maxPatchChars, originalLength: patchContent.length });
        }
      }

      const prompt = promptBeforePatch + patchToUse + promptAfterPatch;

      // Structured output schema so Ollama returns valid JSON matching our review format
      const reviewFormatSchema = {
        type: 'object',
        properties: {
          summary: { type: 'string' },
          suggestions: {
            type: 'array',
            items: { type: 'string' }
          },
          securityIssues: {
            type: 'array',
            items: { type: 'string' }
          },
          suggestedQuestions: {
            type: 'array',
            items: { type: 'string' }
          },
          metrics: {
            type: 'object',
            properties: {
              overallScore: { type: 'integer' , min :'0' , max:'100' },
              codeQuality: { type: 'integer' },
              securityScore: { type: 'integer' },
              bestPracticesScore: { type: 'integer' }
            },
            required: ['overallScore', 'codeQuality', 'securityScore', 'bestPracticesScore']
          }
        },
        required: ['summary', 'suggestions', 'securityIssues', 'suggestedQuestions', 'metrics']
      };

      // Initial review: single-shot → use /api/generate (system + prompt)
      const response = await fetch(`${url}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: model,
          prompt: prompt,
          stream: false,
          format: reviewFormatSchema,
          options: {
            temperature: tempClamped,
            top_p: topPClamped,
            top_k: topKClamped,
          }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ollama API error (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      dbgLog('Ollama raw response received:', {
        hasResponse: !!data?.response,
        responseLength: data?.response?.length || 0
      });

      const reviewText = data.response ?? '';
      
      // Try to parse as JSON
      try {
        // Look for JSON content in the response (sometimes models wrap it in markdown)
        const jsonMatch = reviewText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsedReview = JSON.parse(jsonMatch[0]);
          dbgLog('Successfully parsed JSON review:', parsedReview);
          
          // Map Ollama response to match the UI's expected format (supports structured-output shape and legacy shape)
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
          
          // Return in the format expected by the content.js (matching Cloud API format)
          return {
            status: 'success',
            review: {
              summary: parsedReview.summary || 'Code review completed',
              suggestions: suggestions,
              securityIssues: securityIssues,
              bestPractices: bestPractices,
              metrics: metrics,
              suggestedQuestions: suggestedQuestions,
              provider: 'ollama',
              model: model
            },
            raw: parsedReview // Keep original for debugging
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
            provider: 'ollama',
            model: model,
            note: 'Model did not return structured JSON. See raw response below.'
          },
          rawResponse: reviewText
        };
      }
    } catch (error) {
      dbgWarn('Error reviewing code with Ollama:', error);
      
      // Provide helpful error messages
      if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
        throw new Error(`Cannot connect to Ollama at the configured URL. Please ensure Ollama is running and accessible.\n\nTroubleshooting:\n1. Check if Ollama is running: 'ollama serve'\n2. Verify the URL in settings\n3. Try accessing ${error.url || 'http://localhost:11434'} in your browser`);
      } else if (error.message.includes('model')) {
        throw new Error(`Model error: ${error.message}\n\nMake sure the selected model is installed.\nRun: ollama pull ${error.model || 'codellama'}`);
      } else {
        throw new Error(`Ollama error: ${error.message}`);
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
    dbgLog('Getting conversational response from Ollama');
    
    if (!patchContent || !conversationHistory || conversationHistory.length === 0) {
      throw new Error('Missing patch content or conversation history');
    }
    
    try {
      // Get Ollama config from storage
      const config = await chrome.storage.local.get(['ollamaConfig']);
      const { url = 'http://localhost:11434', model = 'codellama', temperature: temp, top_p: topP, top_k: topK } = config.ollamaConfig || {};
      const { temperature: tempClamped, top_p: topPClamped, top_k: topKClamped } = clampOllamaOptions({ temperature: temp, top_p: topP, top_k: topK });
      
      dbgLog(`Using Ollama at ${url} with model ${model} for conversation`);
      
      // Truncate patch content if extremely large
      const truncatedPatch = patchContent.length > 40000 
        ? patchContent.substring(0, 20000) + '\n... (truncated for brevity)' 
        : patchContent;
      
      // Build the conversation context for Ollama
      // System context with the patch
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
      
      // Conversational: multi-turn → use /api/chat with messages (system + history + user)
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

      const response = await fetch(`${url}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: model,
          messages,
          stream: false,
          think: false,
          options: {
            temperature: tempClamped,
            top_p: topPClamped,
            top_k: topKClamped
          }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ollama API error (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      dbgLog('Ollama conversational response received');

      const responseContent = data.message?.content ?? data.response ?? '';
      return {
        response: responseContent || 'No response generated',
        provider: 'ollama',
        model: model
      };
      
    } catch (error) {
      dbgWarn('Error getting conversational response from Ollama:', error);
      
      // Provide helpful error messages
      if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
        throw new Error(`Cannot connect to Ollama. Please ensure Ollama is running and accessible.\n\nTroubleshooting:\n1. Check if Ollama is running: 'ollama serve'\n2. Verify the URL in settings`);
      } else {
        throw new Error(`Ollama error: ${error.message}`);
      }
    }
  }

  /**
   * Get model context length (max tokens) from Ollama POST /api/show.
   * Parses model_info for *context_length or parameters for num_ctx.
   * When url or model are omitted, reads from stored ollamaConfig (popup settings).
   * @param {string} [url] - Ollama base URL (defaults to stored config or http://localhost:11434)
   * @param {string} [model] - Model name (e.g. qwen3-coder:30b); defaults to stored config
   * @returns {Promise<{contextLength: number|null, error: string|null}>}
   */
  static async getModelContextLength(url, model) {
    if (url == null || url === '' || model == null || model === '') {
      const config = await chrome.storage.local.get(['ollamaConfig']);
      const stored = config.ollamaConfig || {};
      url = url != null && url !== '' ? url : (stored.url || 'http://localhost:11434');
      model = model != null && model !== '' ? model : (stored.model || '');
    }
    if (!model || !url) {
      return { contextLength: null, error: 'URL and model are required' };
    }
    try {
      const res = await fetch(`${url}/api/show`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model }),
        signal: AbortSignal.timeout(10000)
      });
      if (!res.ok) {
        return { contextLength: null, error: `Ollama show failed: ${res.status}` };
      }
      const data = await res.json();
      let contextLength = null;
      if (data.model_info && typeof data.model_info === 'object') {
        const key = Object.keys(data.model_info).find(k => k.endsWith('context_length'));
        if (key && typeof data.model_info[key] === 'number') {
          contextLength = data.model_info[key];
        }
      }
      if (contextLength == null && data.parameters && typeof data.parameters === 'string') {
        const numCtxMatch = data.parameters.match(/\bnum_ctx\s+(\d+)/);
        if (numCtxMatch) {
          contextLength = parseInt(numCtxMatch[1], 10);
        }
      }
      dbgLog('Ollama model context length:', { model, contextLength });
      return { contextLength, error: null };
    } catch (err) {
      dbgWarn('Error fetching model context length:', err);
      return { contextLength: null, error: err?.message || String(err) };
    }
  }

  /**
   * Check if Ollama is accessible at the given URL
   * @param {string} [url] - Ollama URL to check
   * @returns {Promise<{connected: boolean, error: string|null, isCorsError: boolean}>}
   */
  static async checkConnection(url = 'http://localhost:11434') {
    try {
      dbgLog(`Checking connection to Ollama at ${url}`);
      const response = await fetch(`${url}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000) // 5 second timeout
      });
      const isOk = response.ok;
      dbgLog(`Connection check result: ${isOk ? 'Success' : 'Failed'}`);
      return { connected: isOk, error: null, isCorsError: false };
    } catch (error) {
      dbgWarn('Connection check failed:', error);
      
      // Detect CORS errors
      const errorMessage = error.message || error.toString();
      const isCorsError = errorMessage.includes('CORS') || 
                         errorMessage.includes('Access-Control-Allow-Origin') ||
                         (error.name === 'TypeError' && errorMessage.includes('fetch'));
      
      return { 
        connected: false, 
        error: errorMessage,
        isCorsError: isCorsError
      };
    }
  }

  /**
   * Get list of available models from Ollama
   * @param {string} [url] - Ollama URL
   * @returns {Promise<{models: Array, error: string|null, isCorsError: boolean}>}
   */
  static async getAvailableModels(url = 'http://localhost:11434') {
    try {
      dbgLog(`Fetching available models from ${url}`);
      const response = await fetch(`${url}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.status}`);
      }
      
      const data = await response.json();
      const models = data.models || [];
      dbgLog(`Found ${models.length} models:`, models.map(m => m.name));
      return { models, error: null, isCorsError: false };
    } catch (error) {
      dbgWarn('Error fetching models:', error);
      
      // Detect CORS errors
      const errorMessage = error.message || error.toString();
      const isCorsError = errorMessage.includes('CORS') || 
                         errorMessage.includes('Access-Control-Allow-Origin') ||
                         (error.name === 'TypeError' && errorMessage.includes('fetch'));
      
      return { 
        models: [], 
        error: errorMessage,
        isCorsError: isCorsError
      };
    }
  }

  /**
   * Get recommended models for code review
   * @returns {Array} - List of recommended model names
   */
  static getRecommendedModels() {
    return [
      { name: 'codellama:latest', description: 'Meta\'s Code Llama - Good all-around code model' },
      { name: 'codellama:13b', description: 'Code Llama 13B - Better quality, slower' },
      { name: 'deepseek-coder:6.7b', description: 'DeepSeek Coder - Excellent for code understanding' },
      { name: 'qwen2.5-coder:7b', description: 'Qwen2.5 Coder - Strong code analysis' },
      { name: 'starcoder2:15b', description: 'StarCoder2 - Great multi-language support' },
      { name: 'codegemma:7b', description: 'Google\'s CodeGemma - Fast and capable' }
    ];
  }

  /**
   * Validate Ollama configuration
   * @param {Object} config - Configuration to validate
   * @returns {Object} - Validation result with isValid and error message
   */
  static validateConfig(config) {
    if (!config || !config.url) {
      return { isValid: false, error: 'URL is required' };
    }

    // Check if URL is valid
    try {
      new URL(config.url);
    } catch (e) {
      return { isValid: false, error: 'Invalid URL format' };
    }

    if (!config.model || config.model.trim() === '') {
      return { isValid: false, error: 'Model name is required' };
    }

    return { isValid: true };
  }
}

