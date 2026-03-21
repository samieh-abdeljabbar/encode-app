# LOCAL-AI-SETUP.md — Setting Up Local AI for Encode

## Overview

Encode uses **Ollama** as its default AI engine. Ollama runs large language models locally on your machine — completely free, completely private, no API keys needed, works offline.

This guide walks you through installation, model selection, and verification.

---

## Step 1: Install Ollama

### macOS
```bash
# Option A: Download from website
# Go to https://ollama.com/download and download the macOS app

# Option B: Homebrew
brew install ollama
```

### Windows
```bash
# Download the installer from https://ollama.com/download
# Run the .exe installer
# Ollama runs as a system service automatically
```

### Linux
```bash
# One-line install script
curl -fsSL https://ollama.com/install.sh | sh

# Or if you prefer manual:
# Download from https://ollama.com/download/linux
```

After installation, Ollama runs as a background service. You can verify it's running:
```bash
ollama --version
# Should output something like: ollama version 0.6.x
```

---

## Step 2: Download a Model

Ollama needs at least one model downloaded. Here are the recommended models for Encode, ranked by quality vs. resource usage:

### Recommended: Llama 3.1 8B (Best balance)
```bash
ollama pull llama3.1:8b
```
- **Size:** ~4.7 GB download
- **RAM needed:** ~8 GB
- **Quality:** Good for Bloom's levels 1-4 quizzes, flashcard generation, digestion gate evaluation
- **Speed:** Fast on most modern machines
- **Best for:** Most users. If you only download one model, this is it.

### Alternative: Mistral 7B (Lighter, faster)
```bash
ollama pull mistral:7b
```
- **Size:** ~4.1 GB download
- **RAM needed:** ~6 GB
- **Quality:** Slightly less nuanced than Llama 3.1 but still solid for quiz generation
- **Speed:** Very fast
- **Best for:** Older machines or if you want faster responses

### Alternative: Phi-3 Mini 3.8B (Lightest)
```bash
ollama pull phi3:mini
```
- **Size:** ~2.3 GB download
- **RAM needed:** ~4 GB
- **Quality:** Good enough for basic flashcard generation and simple gate evaluation
- **Speed:** Fastest option
- **Best for:** Machines with limited RAM (8 GB total or less)

### Premium: Llama 3.1 70B (Best local quality)
```bash
ollama pull llama3.1:70b
```
- **Size:** ~40 GB download
- **RAM needed:** ~48 GB (or GPU with 40+ GB VRAM)
- **Quality:** Approaches Claude/GPT quality. Excellent for Bloom's levels 5-6
- **Speed:** Slow without a powerful GPU
- **Best for:** Users with high-end hardware (64 GB+ RAM or RTX 4090+)

### For your machine specifically
Check your available RAM:
```bash
# macOS
sysctl hw.memsize | awk '{print $2/1073741824 " GB"}'

# Linux
free -h | grep Mem | awk '{print $2}'

# Windows (PowerShell)
(Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1GB
```

| Your RAM | Recommended Model | Command |
|----------|------------------|---------|
| 8 GB | phi3:mini | `ollama pull phi3:mini` |
| 16 GB | llama3.1:8b | `ollama pull llama3.1:8b` |
| 32 GB | llama3.1:8b (comfortable headroom) | `ollama pull llama3.1:8b` |
| 64 GB+ | llama3.1:70b (if you want the best) | `ollama pull llama3.1:70b` |

---

## Step 3: Test That It Works

### Quick test from terminal
```bash
ollama run llama3.1:8b "Generate 2 flashcard questions about database normalization. Respond in JSON format."
```

You should see a JSON response with questions. If you do, Ollama is working.

### Test the API (this is how Encode talks to Ollama)
```bash
curl http://localhost:11434/api/generate -d '{
  "model": "llama3.1:8b",
  "prompt": "What is second normal form in databases? Explain in 2 sentences.",
  "stream": false
}'
```

You should get a JSON response with a `response` field containing the answer.

### Test that Ollama is discoverable
```bash
curl http://localhost:11434/api/tags
```

This returns a list of downloaded models. Encode checks this endpoint on startup to detect Ollama.

---

## Step 4: Configure Encode to Use Ollama

Once Ollama is running with a model downloaded, Encode auto-detects it. On app startup:

1. Encode pings `http://localhost:11434/api/tags`
2. If Ollama responds, it reads the list of available models
3. The first available model becomes the default
4. You can change the model in Settings → AI Provider

If you want to use a specific model, you can set it in Encode's settings or in the config file:

```toml
# ~/Encode/.encode/config.toml

[ai]
provider = "ollama"           # "ollama", "claude", "gemini", or "none"
ollama_model = "llama3.1:8b"  # which model to use
ollama_url = "http://localhost:11434"  # default, change if running remotely

# Optional: Claude API (for premium encoding coaching)
# claude_api_key is stored in system keychain, not here

# Optional: Gemini API
# gemini_api_key is stored in system keychain, not here
```

---

## Troubleshooting

### "Ollama not detected" in Encode
```bash
# Check if Ollama is running
curl http://localhost:11434/api/tags

# If connection refused, start the service:
# macOS: Open the Ollama app, or:
ollama serve

# Linux:
sudo systemctl start ollama
# Or:
ollama serve

# Windows: Ollama should be running as a service.
# Check system tray for the Ollama icon.
# If not there, launch Ollama from Start menu.
```

### "Model not found" errors
```bash
# List downloaded models
ollama list

# If empty, you need to download one:
ollama pull llama3.1:8b

# If the model name in Encode config doesn't match:
# Check exact names with `ollama list` and update config.toml
```

### Responses are very slow
```bash
# Check if model fits in RAM (watch memory usage while generating)
# macOS:
top -l 1 | grep PhysMem

# If RAM is maxed out, switch to a smaller model:
ollama pull phi3:mini
# Then update config.toml: ollama_model = "phi3:mini"
```

### Responses are low quality
The 7-8B models are good for Bloom's levels 1-4 but struggle with levels 5-6 (evaluate, create). Options:

1. Use Ollama for quizzes/flashcards (levels 1-4) and add a Claude API key for encoding coach (levels 5-6). Encode's AI router can be configured to use different providers for different features.

2. Download a larger model if your hardware supports it:
```bash
ollama pull llama3.1:70b  # Needs ~48 GB RAM
```

3. Accept that local models have limits. For most studying, levels 1-4 quizzes and basic feedback are perfectly useful.

### Want to run Ollama on a different machine?
If you have a powerful desktop but study on a laptop, you can run Ollama on the desktop and point Encode to it:

```bash
# On the powerful machine, start Ollama with network access:
OLLAMA_HOST=0.0.0.0 ollama serve

# In Encode's config.toml on your laptop:
# ollama_url = "http://192.168.1.100:11434"  # your desktop's IP
```

---

## Optional: Adding Claude API for Premium Features

If you want higher quality encoding coaching alongside free local AI:

1. Go to https://console.anthropic.com/
2. Create an account and add billing
3. Generate an API key
4. In Encode: Settings → AI Provider → Add Claude API Key
5. The key is stored in your system's secure keychain (not in a config file)

**Cost:** With Ollama handling quizzes and flashcards, and Claude only used for encoding coach and Feynman evaluation, expect ~$2-5/month with regular use.

**Recommended hybrid setup:**
```toml
[ai]
provider = "hybrid"
ollama_model = "llama3.1:8b"

[ai.routing]
digestion_gates = "ollama"      # frequent, keep free
flashcard_generation = "ollama"  # frequent, keep free
quiz_generation_l1_l4 = "ollama" # good enough locally
quiz_generation_l5_l6 = "claude" # needs nuance
encoding_coach = "claude"        # highest value from cloud AI
feynman_evaluation = "claude"    # needs detailed feedback
answer_evaluation = "claude"     # needs nuanced assessment
```

---

## Model Comparison at a Glance

| Model | Size | RAM | Quiz L1-3 | Quiz L4-6 | Flashcards | Coach | Speed |
|-------|------|-----|-----------|-----------|------------|-------|-------|
| phi3:mini | 2.3 GB | 4 GB | Good | Weak | Good | Weak | Fastest |
| mistral:7b | 4.1 GB | 6 GB | Good | Decent | Good | Decent | Fast |
| llama3.1:8b | 4.7 GB | 8 GB | Good | Decent | Good | Decent | Fast |
| llama3.1:70b | 40 GB | 48 GB | Great | Good | Great | Good | Slow |
| Claude API | Cloud | N/A | Great | Great | Great | Great | Medium |
