// Debug toggle: set to false to disable console logs in production
const DEBUG = false;
function dbgLog(...args) { if (DEBUG) console.log('[OllamaService]', ...args); }
function dbgWarn(...args) { if (DEBUG) console.warn('[OllamaService]', ...args); }

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
      const { url = 'http://localhost:11434', model = 'codellama' } = config.ollamaConfig || {};
      
      dbgLog(`Using Ollama at ${url} with model ${model}`);
      
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
    "codeQuality": 85,
    "maintainability": 80,
    "security": 90,
    "performance": 75,
    "testCoverage": 70,
    "documentation": 65,
    "overallScore": 78
  },
  "suggestedQuestions": [
    "Question 1 about the changes",
    "Question 2 about implementation",
    "Question 3 about impact"
  ]
}

Note: 
- All metric scores should be 0-100
- overallScore is the weighted average of all metrics
- Provide 3-5 relevant follow-up questions
- Questions should be specific to this code review

Here is the patch to review:

${patchContent}

Important: Respond ONLY with valid JSON. Do not include any explanatory text before or after the JSON.`;

      // Send request to Ollama
      const response = await fetch(`${url}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: model,
          prompt: prompt,
          stream: false,
          options: {
            temperature: 0.3,
            num_predict: 4000,
            top_p: 0.9,
            top_k: 40
          }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ollama API error (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      dbgLog('Ollama raw response:', data);
      
      // Parse the response (Ollama returns text in 'response' field)
      const reviewText = data.response;
      
      // Try to parse as JSON
      try {
        // Look for JSON content in the response (sometimes models wrap it in markdown)
        const jsonMatch = reviewText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsedReview = JSON.parse(jsonMatch[0]);
          dbgLog('Successfully parsed JSON review:', parsedReview);
          
          // Map Ollama response to match the UI's expected format
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
          
          // Get metrics (with fallback to reasonable defaults)
          const metrics = parsedReview.metrics || {
            codeQuality: 75,
            maintainability: 75,
            security: 80,
            performance: 75,
            testCoverage: 70,
            documentation: 70,
            overallScore: 74
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
              codeQuality: 75,
              maintainability: 75,
              security: 80,
              performance: 75,
              testCoverage: 70,
              documentation: 70,
              overallScore: 74
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
   * Check if Ollama is accessible at the given URL
   * @param {string} [url] - Ollama URL to check
   * @returns {Promise<boolean>} - True if connection successful
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
      return isOk;
    } catch (error) {
      dbgWarn('Connection check failed:', error);
      return false;
    }
  }

  /**
   * Get list of available models from Ollama
   * @param {string} [url] - Ollama URL
   * @returns {Promise<Array>} - List of available models
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
      return models;
    } catch (error) {
      dbgWarn('Error fetching models:', error);
      return [];
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

