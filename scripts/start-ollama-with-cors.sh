#!/bin/bash
# Start Ollama with CORS enabled for browser extensions
# This script is required for ThinkReview browser extension to work with local Ollama

set -e

echo "🚀 Starting Ollama with CORS enabled for ThinkReview extension..."
echo ""

# Stop any existing Ollama processes (including the GUI app)
echo "Stopping existing Ollama processes..."
killall ollama 2>/dev/null || true
killall Ollama 2>/dev/null || true
sleep 2

# Get the extension ID from manifest.json if available
EXTENSION_ID=""
if [ -f "manifest.json" ]; then
  EXTENSION_ID=$(grep -o '"key"[[:space:]]*:[[:space:]]*"[^"]*"' manifest.json | cut -d'"' -f4 | head -1)
fi

# Set CORS origins for browser extensions
# Note: Replace jmkdjjcbdpjohlgbifmiacploikmpien with your actual extension ID
export OLLAMA_ORIGINS="chrome-extension://jmkdjjcbdpjohlgbifmiacploikmpien,chrome-extension://*"
export OLLAMA_HOST="127.0.0.1:11434"

echo "✅ CORS enabled for ThinkReview extension"
echo "   Extension patterns: chrome-extension://*"
echo "   Host: 127.0.0.1:11434"
echo ""
echo "📝 To make this permanent, add to your ~/.zshrc or ~/.bashrc:"
echo '   export OLLAMA_ORIGINS="chrome-extension://*"'
echo ""
echo "🎯 Starting Ollama server..."
echo "   Press Ctrl+C to stop"
echo ""

# Start Ollama
ollama serve

