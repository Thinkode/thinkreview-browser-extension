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

**We recommend [Gemma 4](https://ollama.com/library/gemma4)** — Google DeepMind’s multimodal family with strong coding and reasoning, native function calling, and a **128K** context window on the default and edge variants (larger variants offer **256K**). For ThinkReview, start with the default tag or pick a size that fits your RAM:

- **`gemma4`** (latest, ~9.6GB) — default choice for strong overall quality  
- **`gemma4:e4b`** / **`gemma4:e2b`** — smaller “effective” models for laptops and limited VRAM  
- **`gemma4:26b`** / **`gemma4:31b`** — workstation-class local models (larger download)  
- **`gemma4:31b-cloud`** — runs via Ollama’s cloud when you prefer not to host the full 31B locally  

**Sampling (optional):** For Gemma 4, Ollama’s docs suggest `temperature=1.0`, `top_p=0.95`, and `top_k=64` as a standardized setup; you can set these in the extension’s Ollama settings.

**Also worth trying:** [Codestral](https://ollama.com/library/codestral:latest), [gpt-oss](https://ollama.com/library/gpt-oss), and coder-focused models below.

**Tested / common alternatives:**
- `gemma4` — **Recommended** — best default for ThinkReview with Ollama  
- `codestral` — Strong code model (Mistral, 32k context)  
- `qwen2.5-coder:30b` / `qwen3-coder:30b` — Widely used for code  
- `qwen2.5:8b` — Lighter option  

```bash
# Recommended (best results with Ollama + ThinkReview)
ollama pull gemma4

# Smaller or larger Gemma 4 variants (pick one that fits your machine)
ollama pull gemma4:e4b
ollama pull gemma4:e2b
ollama pull gemma4:26b
ollama pull gemma4:31b

# Other strong options
ollama pull codestral
ollama pull qwen2.5-coder:30b
ollama pull gpt-oss:20b            # OpenAI open-weight, 128K context
ollama pull codellama              # Fast, smaller footprint
ollama pull qwen2.5-coder:7b
ollama pull deepseek-coder:6.7b
```

### 3. Start Ollama Server with CORS Enabled

**Important:** **Ollama** runs on your computer while the extension runs in the browser. The steps below restart Ollama with settings that let extensions connect (including CORS), which fixes many Ollama-related errors.

**Where to run these commands:** use a real shell on your computer — **Terminal** (macOS), your terminal app (**Linux**), **Windows PowerShell**, or **Command Prompt**. Do not paste them into the browser’s developer console; the extension talks to Ollama from your machine, and Ollama must be started with the right environment on that same machine.

**Firefox browser (Mozilla):** in the commands below, replace `chrome-extension://*` with `moz-extension://*` in `OLLAMA_ORIGINS`.

**Note:** The `killall` / `OLLAMA_ORIGINS="..." ollama serve` style commands below are for **macOS and Linux**. **Windows** uses different commands (`taskkill`, `set` / `$env:`) — see **Option A — Windows** below.

**Option A — Quick start (one-time), macOS & Linux:**
```bash
# Step 1: Stop Ollama
killall ollama 2>/dev/null || true; killall Ollama 2>/dev/null || true; sleep 2

# Step 2: Start Ollama with CORS enabled for browser extensions
OLLAMA_ORIGINS="chrome-extension://*" ollama serve
```

**Option A — Quick start (one-time), Windows:**

Stop the Ollama app if it is running (system tray **Quit**, or use the commands below), then start the server from a terminal with `OLLAMA_ORIGINS` set.

**PowerShell (recommended on Windows):**
```powershell
# Step 1: Stop Ollama
Stop-Process -Name ollama -ErrorAction SilentlyContinue; Start-Sleep -Seconds 2

# Step 2: Start Ollama with CORS enabled for browser extensions
$env:OLLAMA_ORIGINS='chrome-extension://*'; ollama serve
```

**Command Prompt:**
```cmd
REM Step 1: Stop Ollama
taskkill /IM ollama.exe /F 2>nul & timeout /t 2 /nobreak >nul

REM Step 2: Start Ollama with CORS enabled for browser extensions
set OLLAMA_ORIGINS=chrome-extension://* && ollama serve
```

If `taskkill` reports the process was not found, Ollama may already be stopped — continue with step 2.

**Option B — Make it permanent (recommended):**

Set `OLLAMA_ORIGINS` permanently so you don't need to set it every time you run `ollama serve`:

**macOS & Linux:**
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
| [gemma4](https://ollama.com/library/gemma4) (default / e2b / e4b / 26b / 31b) | ~7GB–20GB+ | ✅ **Recommended** — best default with Ollama |
| [codestral](https://ollama.com/library/codestral:latest) | ~13GB | ✅ Strong code reviews |
| [gpt-oss](https://ollama.com/library/gpt-oss) (20b / 120b) | 14GB / 65GB | ✅ Strong reasoning, 128K context |
| qwen2.5-coder:30b / qwen3-coder:30b | ~20GB | ✅ Common coder picks |
| qwen2.5:8b | ~5GB | ✅ Lighter option |

Other models may work but are not officially tested.

## Troubleshooting

### Connection Failed (403 Forbidden)
CORS / allowed origins are not set correctly. Use **Option A** above to restart Ollama with `OLLAMA_ORIGINS` (pick the block for **macOS/Linux** or **Windows**).

### Connection Failed (Cannot Connect)
1. Verify Ollama is running: `ollama list`
2. Check URL: `http://localhost:11434`
3. Restart with CORS (Option A above)

### Model Not Found
1. List models: `ollama list`
2. Pull the model: `ollama pull gemma4` (or the tag you use, e.g. `gemma4:e4b`)
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

