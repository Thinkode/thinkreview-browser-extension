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

Choose and install one of these recommended models:

```bash
# Recommended for beginners (fastest, 4GB)
ollama pull codellama

# Better quality (8GB)
ollama pull codellama:13b

# Excellent for code understanding (4GB)
ollama pull deepseek-coder:6.7b

# Strong code analysis (5GB)
ollama pull qwen2.5-coder:7b

# Great multi-language support (9GB)
ollama pull starcoder2:15b

# Google's CodeGemma (5GB)
ollama pull codegemma:7b
```

### 3. Start Ollama Server with CORS Enabled

**Important:** Browser extensions require CORS to be enabled.

**Option A - Quick Start (Recommended):**
```bash
# Simply run from the extension directory
./scripts/start-ollama-with-cors.sh
```

**Option B - Manual Start:**
```bash
# Set CORS origins for browser extensions
export OLLAMA_ORIGINS="chrome-extension://*"
ollama serve
```

**Option C - Make it Permanent (macOS/Linux):**
Add to your `~/.zshrc` or `~/.bashrc`:
```bash
export OLLAMA_ORIGINS="chrome-extension://*"
```

Then run:
```bash
source ~/.zshrc  # or ~/.bashrc
ollama serve
```

**Note:** The startup script (`scripts/start-ollama-with-cors.sh`) automatically:
- Stops existing Ollama processes
- Sets CORS for browser extensions
- Starts Ollama with proper configuration

Keep this terminal running while using the extension.

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

## Model Comparison

| Model | Size | Speed | Quality | Best For |
|-------|------|-------|---------|----------|
| codellama | 4GB | ⚡⚡⚡ | ⭐⭐⭐ | General use, fast reviews |
| codellama:13b | 8GB | ⚡⚡ | ⭐⭐⭐⭐ | Better quality, slower |
| deepseek-coder:6.7b | 4GB | ⚡⚡⚡ | ⭐⭐⭐⭐ | Code understanding |
| qwen2.5-coder:7b | 5GB | ⚡⚡ | ⭐⭐⭐⭐⭐ | Comprehensive analysis |
| starcoder2:15b | 9GB | ⚡ | ⭐⭐⭐⭐⭐ | Multi-language projects |
| codegemma:7b | 5GB | ⚡⚡ | ⭐⭐⭐⭐ | Fast and capable |

## Troubleshooting

### Connection Failed (403 Forbidden)

**Problem**: Extension gets "403 Forbidden" error

**Cause**: CORS (Cross-Origin Resource Sharing) is not enabled for browser extensions

**Solution**:
```bash
# Stop Ollama
pkill ollama

# Restart with CORS enabled using the provided script
./scripts/start-ollama-with-cors.sh

# Or manually:
export OLLAMA_ORIGINS="chrome-extension://*"
ollama serve
```

**Permanent Fix**: Add to `~/.zshrc` or `~/.bashrc`:
```bash
export OLLAMA_ORIGINS="chrome-extension://*"
```

### Connection Failed (Cannot Connect)

**Problem**: Extension can't connect to Ollama

**Solutions**:
1. Verify Ollama is running: `ollama list`
2. Check the URL is correct: `http://localhost:11434`
3. Restart Ollama with CORS: `./scripts/start-ollama-with-cors.sh`
4. Check firewall settings

### Model Not Found

**Problem**: Selected model isn't available

**Solutions**:
1. List installed models: `ollama list`
2. Pull the model: `ollama pull codellama`
3. Refresh models in extension settings (🔄 button)

### Slow Performance

**Problem**: Reviews take too long

**Solutions**:
1. Use a smaller model (codellama instead of codellama:13b)
2. Ensure sufficient RAM is available
3. Close other applications
4. Consider using Cloud AI for faster results

### Poor Quality Reviews

**Problem**: Reviews aren't detailed enough

**Solutions**:
1. Try a larger model (codellama:13b or qwen2.5-coder:7b)
2. Ensure model is fully downloaded: `ollama list`
3. Consider switching to Cloud AI for more sophisticated analysis

## Advanced Configuration

### Custom Ollama URL

If running Ollama on a different machine or port:

1. Update the URL in extension settings
2. Example: `http://192.168.1.100:11434`
3. Ensure firewall allows connections

### Multiple Models

You can switch between models anytime:

1. Pull multiple models: `ollama pull model-name`
2. Select different model in extension settings
3. Click "Save Settings"

### Performance Tuning

Optimize Ollama for your hardware:

```bash
# Set number of GPU layers (if you have a GPU)
export OLLAMA_NUM_GPU=1

# Set number of CPU threads
export OLLAMA_NUM_THREAD=8

# Start Ollama with custom settings
ollama serve
```

## Cloud vs Local Comparison

| Feature | Cloud AI (Gemini) | Local Ollama |
|---------|------------------|--------------|
| Privacy | Code sent to Google | 100% local |
| Cost | Free tier limits | Completely free |
| Speed | Very fast | Depends on hardware |
| Quality | Excellent | Good to Excellent |
| Internet | Required | Not required |
| Setup | None | Install & configure |

## Tips for Best Results

1. **Start with codellama**: It's fast and effective for most use cases
2. **Keep Ollama running**: Less startup time for reviews
3. **Use larger models for critical reviews**: Switch to codellama:13b or qwen2.5-coder:7b
4. **Hybrid approach**: Use Ollama for routine reviews, Cloud AI for complex analysis
5. **Update models regularly**: `ollama pull model-name` to get latest versions

## Support

For issues or questions:
- Extension bugs: [thinkreview.dev/bug-report](https://thinkreview.dev/bug-report)
- Ollama issues: [github.com/ollama/ollama/issues](https://github.com/ollama/ollama/issues)
- Contact: [thinkreview.dev/contact](https://thinkreview.dev/contact)

## Resources

- [Ollama Documentation](https://github.com/ollama/ollama/blob/main/README.md)
- [Ollama Model Library](https://ollama.ai/library)
- [ThinkReview Website](https://thinkreview.dev)

