# Ollama Integration Setup Guide

> 📖 **Latest Version**: Always refer to the [OLLAMA_SETUP.md on GitHub](https://github.com/Thinkode/thinkreview-browser-extension/blob/main/OLLAMA_SETUP.md) for the most up-to-date instructions.

ThinkReview now supports local AI code reviews using Ollama! This gives you complete privacy and offline capabilities.

## Why Use Ollama?

- **🔒 Privacy**: Your code never leaves your machine
- **💰 No API Costs**: Free local inference
- **⚡ Speed**: Can be faster with the right hardware
- **🌐 Offline**: Works without internet connection
- **🎯 Custom Models**: Use specialized code review models

## Prerequisites

1. **Install Ollama**: Download from [ollama.ai/download](https://ollama.ai/download)
2. **Sufficient RAM**: At least 8GB recommended (16GB+ for larger models)
3. **Disk Space**: 5-20GB depending on model size

## Quick Start

### 1. Install Ollama

**macOS/Linux:**
```bash
curl -fsSL https://ollama.ai/install.sh | sh
```

**Windows:**
Download the installer from [ollama.ai/download](https://ollama.ai/download)

### 2. Pull a Code Review Model

**Tested Models:**
- `qwen2.5-coder:30b` - Tested and recommended
- `qwen2.5:8b` - Tested and recommended

```bash
# Tested models (recommended)
ollama pull qwen2.5-coder:30b
ollama pull qwen2.5:8b

# Other popular models
ollama pull codellama              # Fast, 4GB
ollama pull qwen2.5-coder:7b       # Good balance, 5GB
ollama pull deepseek-coder:6.7b    # Code-focused, 4GB
```

### 3. Start Ollama Server with CORS Enabled

**Important:** Browser extensions require CORS to be enabled.

**Option A - Quick Start (One-time):**
```bash
# Step 1: Stop Ollama
killall ollama 2>/dev/null || true; killall Ollama 2>/dev/null || true; sleep 2

# Step 2: Start Ollama with CORS enabled for browser extensions
OLLAMA_ORIGINS="chrome-extension://*" ollama serve
```

**Option B - Make it Permanent (Recommended):**

Set `OLLAMA_ORIGINS` permanently so you don't need to set it every time you run `ollama serve`:

**macOS/Linux:**
1. Open your shell configuration file:
   ```bash
   # For Zsh
   nano ~/.zshrc
   
   # For Bash
   nano ~/.bashrc
   ```

2. Add this line at the end:
   ```bash
   export OLLAMA_ORIGINS="chrome-extension://*"
   ```

3. Save and reload:
   ```bash
   source ~/.zshrc  # or source ~/.bashrc
   ```

4. Now you can simply run `ollama serve` without setting the environment variable each time.

**Windows (PowerShell):**
1. Open PowerShell and run:
   ```powershell
   [System.Environment]::SetEnvironmentVariable('OLLAMA_ORIGINS', 'chrome-extension://*', [System.EnvironmentVariableTarget]::User)
   ```

2. Restart PowerShell or your terminal, then run `ollama serve`

**Windows (Command Prompt):**
1. Open Command Prompt as Administrator and run:
   ```cmd
   setx OLLAMA_ORIGINS "chrome-extension://*"
   ```

2. Restart Command Prompt, then run `ollama serve`

**Note:** After setting it permanently, you can simply run `ollama serve` and it will automatically use the CORS settings. Keep the terminal running while using the extension.

### 4. Configure Extension

1. Open the ThinkReview extension popup
2. Scroll to **"AI Provider"** section
3. Select **"🖥️ Local Ollama"**
4. Verify URL is `http://localhost:11434` (default)
5. Select your installed model from the dropdown
6. Click **"Test Connection"** to verify
7. Click **"Save Settings"**

## Usage

Once configured, ThinkReview will automatically use Ollama for all code reviews:

1. Navigate to a GitLab merge request or Azure DevOps pull request
2. Click the **"AI Review"** button
3. Your code will be analyzed locally using Ollama
4. Review results appear in the integrated panel

## Tested Models

| Model | Size | Status |
|-------|------|--------|
| qwen2.5-coder:30b | ~20GB | ✅ Tested & Recommended |
| qwen2.5:8b | ~5GB | ✅ Tested & Recommended |

Other models may work but are not officially tested.

## Troubleshooting

### Connection Failed (403 Forbidden)
CORS is not enabled. Use Option A above to restart Ollama with CORS enabled.

### Connection Failed (Cannot Connect)
1. Verify Ollama is running: `ollama list`
2. Check URL: `http://localhost:11434`
3. Restart with CORS (Option A above)

### Model Not Found
1. List models: `ollama list`
2. Pull the model: `ollama pull qwen2.5-coder:30b`
3. Refresh in extension settings (🔄 button)

## Advanced

### Custom Ollama URL
Update URL in extension settings (e.g., `http://192.168.1.100:11434`)

### Performance Tuning
```bash
export OLLAMA_NUM_GPU=1      # GPU layers
export OLLAMA_NUM_THREAD=8   # CPU threads
ollama serve
```

## Support

- Extension bugs: [thinkreview.dev/bug-report](https://thinkreview.dev/bug-report)
- Ollama issues: [github.com/ollama/ollama/issues](https://github.com/ollama/ollama/issues)
- Contact: [thinkreview.dev/contact](https://thinkreview.dev/contact)
- [Ollama Model Library](https://ollama.ai/library)

