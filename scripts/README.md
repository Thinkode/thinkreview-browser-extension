# Scripts

Utility scripts for development and Ollama setup.

## Development Scripts

### `build.js`
Builds the extension for production deployment.

```bash
node scripts/build.js
```

### `lint-manifest.js`
Lints the manifest.json file for errors.

```bash
node scripts/lint-manifest.js
```

### `validate-manifest.js`
Validates the manifest.json structure.

```bash
node scripts/validate-manifest.js
```

## Ollama Setup Script

> 📖 **Full Setup Guide**: See [OLLAMA_SETUP.md on GitHub](https://github.com/Thinkode/thinkreview-browser-extension/blob/main/OLLAMA_SETUP.md) for comprehensive setup instructions including model recommendations, troubleshooting, and advanced configuration.

### `start-ollama-with-cors.sh`
Starts Ollama with CORS enabled for browser extension support.

**Why is this needed?**
Browser extensions have `chrome-extension://` origins that Ollama blocks by default. This script configures Ollama to accept requests from browser extensions.

**Usage:**
```bash
./scripts/start-ollama-with-cors.sh
```

**What it does:**
1. Stops any existing Ollama processes (including GUI app)
2. Sets `OLLAMA_ORIGINS="chrome-extension://*"` environment variable
3. Starts Ollama server with CORS enabled
4. Displays helpful configuration information

**Requirements:**
- Ollama must be installed ([ollama.ai](https://ollama.ai))
- macOS or Linux (for bash script)

**For permanent setup:**
Add to your `~/.zshrc` or `~/.bashrc`:
```bash
export OLLAMA_ORIGINS="chrome-extension://*"
```

**Need Help?**
- 📖 [Complete Setup Guide](https://github.com/Thinkode/thinkreview-browser-extension/blob/main/OLLAMA_SETUP.md) - Full instructions with model recommendations and troubleshooting
- 📁 Local: [OLLAMA_SETUP.md](../OLLAMA_SETUP.md)

