// Debug toggle: set to false to disable console logs in production
const DEBUG = false;
function dbgLog(...args) { if (DEBUG) console.log('[ClaudeService]', ...args); }
function dbgWarn(...args) { if (DEBUG) console.warn('[ClaudeService]', ...args); }

/**
 * Claude Service for ThinkReview
 * Handles AI code reviews using Anthropic's Claude API
 */
export class ClaudeService {
  static API_URL = 'https://api.anthropic.com/v1/messages';
  static API_VERSION = '2023-06-01';
  static DEFAULT_MODEL = 'claude-sonnet-4-5-20250929';

  /**
   * Review patch code using Claude API
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
      // Get Claude config from storage
      const config = await chrome.storage.local.get(['claudeConfig']);
      const { apiKey, model = ClaudeService.DEFAULT_MODEL } = config.claudeConfig || {};

      if (!apiKey) {
        throw new Error('Claude API key is not configured. Please add your API key in the extension settings.');
      }

      dbgLog(`Using Claude model ${model}`);

      // Construct the review prompt with metrics and questions
      const prompt = `You are an expert code reviewer. Analyze this git patch and provide a comprehensive code review in ${language}.

Please analyze the following git diff/patch and provide your review in this EXACT JSON format:

{
  "summary": "Brief overview of the changes",
  "issues": [
    {
      "severity": "high|medium|low",
      "description": "Description of the issue",
      "file": "filename",
      "line": "line number or range"
    }
  ],
  "security": [
    {
      "severity": "high|medium|low",
      "description": "Security concern description",
      "recommendation": "How to fix it"
    }
  ],
  "suggestions": [
    {
      "type": "performance|style|best-practice|maintainability",
      "description": "Suggestion description",
      "file": "filename",
      "line": "line number or range"
    }
  ],
  "positives": [
    "List of positive aspects of the code changes"
  ],
  "metrics": {
    "overallScore": 85,
    "codeQuality": 80,
    "securityScore": 90,
    "bestPracticesScore": 85
  },
  "suggestedQuestions": [
    "Question 1 about the changes",
    "Question 2 about implementation",
    "Question 3 about impact"
  ]
}

Note:
- All metric scores should be 0-100
- overallScore is a holistic score based on all other factors
- codeQuality: Assesses clarity, maintainability, and structure
- securityScore: A score of 100 means no issues found. Deduct points for each vulnerability based on severity
- bestPracticesScore: Assesses adherence to coding standards and language-specific idioms
- Provide exactly 3 relevant follow-up questions that are specific to this code review

Here is the patch to review:

${patchContent}

Important: Respond ONLY with valid JSON. Do not include any explanatory text before or after the JSON.`;

      // Send request to Claude API
      const response = await fetch(ClaudeService.API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': ClaudeService.API_VERSION,
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: model,
          max_tokens: 4096,
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.3
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (response.status === 401) {
          throw new Error('Invalid Claude API key. Please check your API key in the extension settings.');
        } else if (response.status === 429) {
          throw new Error('Claude API rate limit exceeded. Please try again later.');
        } else if (response.status === 400 && errorData.error?.message?.includes('credit')) {
          throw new Error('Insufficient Claude API credits. Please check your Anthropic account.');
        }
        throw new Error(`Claude API error (${response.status}): ${errorData.error?.message || 'Unknown error'}`);
      }

      const data = await response.json();
      dbgLog('Claude raw response:', data);

      // Parse the response (Claude returns content in content[0].text)
      const reviewText = data.content?.[0]?.text || '';

      // Try to parse as JSON
      try {
        // Look for JSON content in the response (sometimes models wrap it in markdown)
        const jsonMatch = reviewText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsedReview = JSON.parse(jsonMatch[0]);
          dbgLog('Successfully parsed JSON review:', parsedReview);

          // Map Claude response to match the UI's expected format
          // Convert issues array to suggestion strings
          const suggestions = [];
          if (parsedReview.issues && Array.isArray(parsedReview.issues)) {
            parsedReview.issues.forEach(issue => {
              suggestions.push(`[${issue.severity?.toUpperCase() || 'INFO'}] ${issue.description} (${issue.file}:${issue.line})`);
            });
          }
          if (parsedReview.suggestions && Array.isArray(parsedReview.suggestions)) {
            parsedReview.suggestions.forEach(suggestion => {
              suggestions.push(`[${suggestion.type?.toUpperCase() || 'TIP'}] ${suggestion.description} (${suggestion.file}:${suggestion.line})`);
            });
          }

          // Convert security array to security issue strings
          const securityIssues = [];
          if (parsedReview.security && Array.isArray(parsedReview.security)) {
            parsedReview.security.forEach(sec => {
              securityIssues.push(`[${sec.severity?.toUpperCase() || 'WARNING'}] ${sec.description}\n**Recommendation:** ${sec.recommendation || 'Review and address this concern.'}`);
            });
          }

          // Use positives as best practices
          const bestPractices = parsedReview.positives || [];

          // Get metrics (with fallback to reasonable defaults matching Cloud API format)
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
              provider: 'claude',
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
            provider: 'claude',
            model: model,
            note: 'Model did not return structured JSON. See raw response below.'
          },
          rawResponse: reviewText
        };
      }
    } catch (error) {
      dbgWarn('Error reviewing code with Claude:', error);

      // Provide helpful error messages
      if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
        throw new Error('Cannot connect to Claude API. Please check your internet connection.');
      } else {
        throw new Error(`Claude error: ${error.message}`);
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
    dbgLog('Getting conversational response from Claude');

    if (!patchContent || !conversationHistory || conversationHistory.length === 0) {
      throw new Error('Missing patch content or conversation history');
    }

    try {
      // Get Claude config from storage
      const config = await chrome.storage.local.get(['claudeConfig']);
      const { apiKey, model = ClaudeService.DEFAULT_MODEL } = config.claudeConfig || {};

      if (!apiKey) {
        throw new Error('Claude API key is not configured. Please add your API key in the extension settings.');
      }

      dbgLog(`Using Claude model ${model} for conversation`);

      // Truncate patch content if extremely large
      const truncatedPatch = patchContent.length > 40000
        ? patchContent.substring(0, 20000) + '\n... (truncated for brevity)'
        : patchContent;

      // Build the system context with the patch
      const systemContext = `You are an expert code reviewer. The following code patch is being discussed:

CODE PATCH (Git Diff Format):
\`\`\`
${truncatedPatch}
\`\`\`

Your role is to answer questions about this code review in a helpful, concise manner using Markdown formatting.${language && language !== 'English' ? `\n\nIMPORTANT: You MUST respond entirely in ${language}. Your entire response must be written in ${language}.` : ''}`;

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

      // Build Claude messages format
      const messages = truncatedHistory.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content
      }));

      // Send request to Claude API
      const response = await fetch(ClaudeService.API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': ClaudeService.API_VERSION,
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: model,
          max_tokens: 1024,
          system: systemContext,
          messages: messages,
          temperature: 0.2
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (response.status === 401) {
          throw new Error('Invalid Claude API key. Please check your API key in the extension settings.');
        } else if (response.status === 429) {
          throw new Error('Claude API rate limit exceeded. Please try again later.');
        }
        throw new Error(`Claude API error (${response.status}): ${errorData.error?.message || 'Unknown error'}`);
      }

      const data = await response.json();
      dbgLog('Claude conversational response received');

      // Return in the format expected by the UI (matching Cloud API format)
      return {
        response: data.content?.[0]?.text || 'No response generated',
        provider: 'claude',
        model: model
      };

    } catch (error) {
      dbgWarn('Error getting conversational response from Claude:', error);

      // Provide helpful error messages
      if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
        throw new Error('Cannot connect to Claude API. Please check your internet connection.');
      } else {
        throw new Error(`Claude error: ${error.message}`);
      }
    }
  }

  /**
   * Check if Claude API key is valid
   * @param {string} apiKey - API key to check
   * @returns {Promise<{valid: boolean, error: string|null}>}
   */
  static async checkConnection(apiKey) {
    if (!apiKey || apiKey.trim() === '') {
      return { valid: false, error: 'API key is required' };
    }

    try {
      dbgLog('Checking Claude API key validity');

      // Make a minimal API call to verify the key
      const response = await fetch(ClaudeService.API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': ClaudeService.API_VERSION,
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: 'claude-3-5-haiku-20241022', // Use cheapest model for validation
          max_tokens: 10,
          messages: [
            {
              role: 'user',
              content: 'Hi'
            }
          ]
        }),
        signal: AbortSignal.timeout(10000) // 10 second timeout
      });

      if (response.ok) {
        dbgLog('Claude API key is valid');
        return { valid: true, error: null };
      } else if (response.status === 401) {
        return { valid: false, error: 'Invalid API key' };
      } else if (response.status === 429) {
        // Rate limited but key is valid
        return { valid: true, error: null };
      } else {
        const errorData = await response.json().catch(() => ({}));
        return { valid: false, error: errorData.error?.message || `API error: ${response.status}` };
      }
    } catch (error) {
      dbgWarn('Connection check failed:', error);

      if (error.name === 'TimeoutError' || error.message.includes('timeout')) {
        return { valid: false, error: 'Connection timeout. Please try again.' };
      }

      return {
        valid: false,
        error: error.message || 'Connection failed'
      };
    }
  }

  /**
   * Get list of available Claude models
   * @returns {Array} - List of available models
   */
  static getAvailableModels() {
    return [
      { name: 'claude-sonnet-4-5-20250929', description: 'Claude Sonnet 4.5 - Best for coding (recommended)' },
      { name: 'claude-haiku-4-5-20251001', description: 'Claude Haiku 4.5 - Fast & cost-effective' },
      { name: 'claude-opus-4-1-20250805', description: 'Claude Opus 4 - Most capable' }
    ];
  }

  /**
   * Validate Claude configuration
   * @param {Object} config - Configuration to validate
   * @returns {Object} - Validation result with isValid and error message
   */
  static validateConfig(config) {
    if (!config || !config.apiKey) {
      return { isValid: false, error: 'API key is required' };
    }

    if (config.apiKey.trim() === '') {
      return { isValid: false, error: 'API key cannot be empty' };
    }

    // Basic format check for Anthropic API keys (they start with 'sk-ant-')
    if (!config.apiKey.startsWith('sk-ant-')) {
      return { isValid: false, error: 'Invalid API key format. Anthropic API keys start with "sk-ant-"' };
    }

    if (!config.model || config.model.trim() === '') {
      return { isValid: false, error: 'Model is required' };
    }

    return { isValid: true };
  }
}
