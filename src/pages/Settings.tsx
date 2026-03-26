import { useEffect, useState } from "react";
import { useAppStore } from "../stores/app";
import { rebuildIndex, getVaultPath, checkOllama, listOllamaModels, testAiConnection } from "../lib/tauri";
import { themes, applyTheme, getCurrentTheme } from "../lib/themes";

const POPULAR_MODELS = [
  { id: "llama3.1:8b", name: "Llama 3.1 8B", size: "4.7 GB", desc: "Best general-purpose local model" },
  { id: "deepseek-r1:8b", name: "DeepSeek R1 8B", size: "4.9 GB", desc: "Strong reasoning, great for study Q&A" },
  { id: "deepseek-coder-v2:16b", name: "DeepSeek Coder V2 16B", size: "8.9 GB", desc: "Code + reasoning, needs 16GB RAM" },
  { id: "mistral:7b", name: "Mistral 7B", size: "4.1 GB", desc: "Fast and capable, low resource usage" },
  { id: "phi3:latest", name: "Phi-3 Mini", size: "2.2 GB", desc: "Smallest, runs on any machine" },
  { id: "gemma2:9b", name: "Gemma 2 9B", size: "5.4 GB", desc: "Google's open model, strong at tasks" },
  { id: "qwen2.5:7b", name: "Qwen 2.5 7B", size: "4.4 GB", desc: "Excellent multilingual, good at math" },
];

function TestConnectionButton({ provider, model, url, apiKey }: { provider: string; model: string; url: string; apiKey: string }) {
  const [status, setStatus] = useState<"idle" | "testing" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const handleTest = async () => {
    setStatus("testing");
    setErrorMsg("");
    try {
      await testAiConnection(provider, model, url, apiKey);
      setStatus("success");
      setTimeout(() => setStatus("idle"), 3000);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  };

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={handleTest}
        disabled={status === "testing"}
        className="px-3 py-1.5 text-xs bg-purple text-white rounded hover:opacity-90 disabled:opacity-50"
      >
        {status === "testing" ? "Testing..." : "Test Connection"}
      </button>
      {status === "success" && <span className="text-xs text-teal">Connected</span>}
      {status === "error" && <span className="text-xs text-coral truncate max-w-[300px]">{errorMsg}</span>}
    </div>
  );
}

export default function Settings() {
  const { config, loadConfig, saveConfig } = useAppStore();
  const [vaultPath, setVaultPath] = useState("");
  const [provider, setProvider] = useState("none");
  const [ollamaModel, setOllamaModel] = useState("llama3.1:8b");
  const [ollamaUrl, setOllamaUrl] = useState("http://localhost:11434");
  const [apiKey, setApiKey] = useState("");
  const [ollamaStatus, setOllamaStatus] = useState<"checking" | "available" | "unavailable">("checking");
  const [indexCount, setIndexCount] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [installedModels, setInstalledModels] = useState<string[]>([]);
  const [fontSize, setFontSize] = useState(() => localStorage.getItem("encode-font-size") || "16");
  const [fontFamily, setFontFamily] = useState(() => localStorage.getItem("encode-font-family") || "georgia");
  const [contentWidth, setContentWidth] = useState(() => localStorage.getItem("encode-content-width") || "medium");
  // User profile
  const [userRole, setUserRole] = useState("");
  const [userHobbies, setUserHobbies] = useState("");
  const [userLearningStyle, setUserLearningStyle] = useState("");

  useEffect(() => {
    loadConfig();
    getVaultPath().then(setVaultPath).catch(() => {});
  }, [loadConfig]);

  useEffect(() => {
    if (config) {
      setProvider(config.ai_provider);
      setOllamaModel(config.ollama_model);
      setOllamaUrl(config.ollama_url);
      setApiKey(config.api_key || "");
      setUserRole(config.user_role || "");
      setUserHobbies(config.user_hobbies || "");
      setUserLearningStyle(config.user_learning_style || "");
    }
  }, [config]);

  useEffect(() => {
    setOllamaStatus("checking");
    checkOllama(ollamaUrl).then((available) => {
      setOllamaStatus(available ? "available" : "unavailable");
      if (available) {
        listOllamaModels(ollamaUrl).then(setInstalledModels);
      } else {
        setInstalledModels([]);
      }
    });
  }, [ollamaUrl]);

  const handleSave = async () => {
    setSaving(true);
    await saveConfig({
      vault_path: vaultPath,
      ai_provider: provider as "ollama" | "claude" | "gemini" | "none",
      ollama_model: ollamaModel,
      ollama_url: ollamaUrl,
      api_key: apiKey,
      user_role: userRole,
      user_hobbies: userHobbies,
      user_learning_style: userLearningStyle,
    });
    setSaving(false);
  };

  const handleRebuild = async () => {
    const count = await rebuildIndex();
    setIndexCount(count);
  };

  return (
    <div className="max-w-xl mx-auto py-8 px-8 space-y-8">
      <h2 className="text-xl font-semibold">Settings</h2>

      {/* About You — User Profile */}
      <div>
        <h3 className="text-sm font-medium text-text mb-3">About You</h3>
        <p className="text-xs text-text-muted mb-4">
          Help the AI personalize questions and examples to your background. All fields are optional.
        </p>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-text-muted mb-1">What do you do?</label>
            <input
              type="text"
              value={userRole}
              onChange={(e) => setUserRole(e.target.value)}
              placeholder="e.g., Software engineer, nurse, manage retail stores, student"
              className="w-full px-3 py-2 bg-surface-2 border border-border rounded text-sm text-text placeholder:text-text-muted/50 focus:outline-none focus:border-purple"
            />
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">What are your hobbies?</label>
            <input
              type="text"
              value={userHobbies}
              onChange={(e) => setUserHobbies(e.target.value)}
              placeholder="e.g., Gaming, basketball, cooking, working on cars"
              className="w-full px-3 py-2 bg-surface-2 border border-border rounded text-sm text-text placeholder:text-text-muted/50 focus:outline-none focus:border-purple"
            />
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">How do you learn best?</label>
            <input
              type="text"
              value={userLearningStyle}
              onChange={(e) => setUserLearningStyle(e.target.value)}
              placeholder="e.g., Real-world examples, hands-on practice, teach-then-quiz"
              className="w-full px-3 py-2 bg-surface-2 border border-border rounded text-sm text-text placeholder:text-text-muted/50 focus:outline-none focus:border-purple"
            />
          </div>
        </div>
      </div>

      {/* Theme */}
      <div>
        <h3 className="text-sm font-medium text-text mb-3">Theme</h3>
        <div className="grid grid-cols-2 gap-2">
          {themes.map((t) => {
            const isActive = getCurrentTheme() === t.id;
            return (
              <button
                key={t.id}
                onClick={() => { applyTheme(t.id); /* force re-render */ setFontSize(fontSize); }}
                className={`flex items-center gap-3 p-3 rounded-lg border transition-colors text-left ${
                  isActive
                    ? "border-purple bg-purple/10"
                    : "border-border bg-surface hover:border-purple/30"
                }`}
              >
                <div
                  className="w-8 h-8 rounded-full border-2 shrink-0"
                  style={{
                    backgroundColor: t.preview,
                    borderColor: isActive ? "var(--color-purple)" : t.colors.border,
                  }}
                />
                <div>
                  <p className={`text-sm font-medium ${isActive ? "text-purple" : "text-text"}`}>{t.name}</p>
                  <div className="flex gap-1 mt-1">
                    {[t.colors.purple, t.colors.teal, t.colors.coral, t.colors.amber].map((c, i) => (
                      <div key={i} className="w-3 h-3 rounded-full" style={{ backgroundColor: c }} />
                    ))}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* AI Provider */}
      <section className="space-y-4">
        <h3 className="text-sm font-medium uppercase tracking-wider text-text-muted">AI Provider</h3>

        <div className="grid grid-cols-2 gap-2">
          {(["none", "ollama", "claude", "gemini", "openai", "deepseek"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setProvider(p)}
              className={`px-4 py-3 rounded-lg border text-left transition-colors ${
                provider === p
                  ? "border-purple bg-purple/10 text-text"
                  : "border-border bg-surface text-text-muted hover:border-purple/50"
              }`}
            >
              <span className="text-sm font-medium block">
                {p === "none" ? "No AI" : p === "ollama" ? "Ollama" : p === "claude" ? "Claude" : p === "gemini" ? "Gemini" : p === "openai" ? "OpenAI" : "DeepSeek"}
              </span>
              <span className="text-xs text-text-muted">
                {p === "none" && "Study without AI feedback"}
                {p === "ollama" && "Local models (free, private)"}
                {p === "claude" && "Anthropic API (best quality)"}
                {p === "gemini" && "Google API (fast, free tier)"}
                {p === "openai" && "GPT-4o, GPT-4o-mini"}
                {p === "deepseek" && "DeepSeek API (affordable)"}
              </span>
              {p === "ollama" && provider === "ollama" && (
                <span className={`text-[10px] mt-1 block ${
                  ollamaStatus === "available" ? "text-teal" : ollamaStatus === "unavailable" ? "text-coral" : "text-amber"
                }`}>
                  {ollamaStatus === "available" ? "Connected" : ollamaStatus === "unavailable" ? "Not running" : "Checking..."}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Ollama settings */}
        {provider === "ollama" && (
          <div className="space-y-4 p-4 bg-surface rounded-lg border border-border">
            <div>
              <label className="block text-xs text-text-muted mb-2">Model</label>
              {installedModels.length === 0 && ollamaStatus === "available" ? (
                <div className="p-3 bg-amber/10 border border-amber/30 rounded text-xs text-amber mb-2">
                  No models installed. Open Terminal and run: <code className="bg-surface-2 px-1 rounded">ollama pull llama3.1:8b</code>
                </div>
              ) : null}
              <select
                value={ollamaModel}
                onChange={(e) => setOllamaModel(e.target.value)}
                className="w-full px-3 py-2 bg-surface-2 border border-border rounded text-sm text-text focus:outline-none focus:border-purple"
              >
                {installedModels.length > 0 && (
                  <optgroup label="Installed">
                    {installedModels.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </optgroup>
                )}
                <optgroup label="Popular Models">
                  {POPULAR_MODELS
                    .filter((m) => !installedModels.includes(m.id))
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.size})
                      </option>
                    ))}
                </optgroup>
              </select>
              {POPULAR_MODELS.find((m) => m.id === ollamaModel) && (
                <p className="text-xs text-text-muted mt-1">
                  {POPULAR_MODELS.find((m) => m.id === ollamaModel)?.desc}
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs text-text-muted mb-1">Ollama URL</label>
              <input
                type="text"
                value={ollamaUrl}
                onChange={(e) => setOllamaUrl(e.target.value)}
                className="w-full px-3 py-2 bg-surface-2 border border-border rounded text-sm text-text focus:outline-none focus:border-purple"
              />
            </div>

            {/* Download guide */}
            <div>
              <button
                onClick={() => setShowGuide(!showGuide)}
                className="text-xs text-purple hover:underline"
              >
                {showGuide ? "Hide setup guide" : "How to install Ollama + download models"}
              </button>

              {showGuide && (() => {
                const isMac = navigator.platform.toLowerCase().includes("mac");
                const isWin = navigator.platform.toLowerCase().includes("win");
                const platform = isMac ? "mac" : isWin ? "windows" : "linux";
                return (
                <div className="mt-3 p-4 bg-bg rounded border border-border space-y-4 text-xs">
                  {/* Platform tabs */}
                  <div className="flex gap-1">
                    {(["mac", "windows", "linux"] as const).map((p) => (
                      <span key={p} className={`px-2 py-0.5 rounded text-[10px] ${p === platform ? "bg-purple/20 text-purple font-medium" : "text-text-muted"}`}>
                        {p === "mac" ? "macOS" : p === "windows" ? "Windows" : "Linux"}
                        {p === platform && " (detected)"}
                      </span>
                    ))}
                  </div>

                  <div>
                    <p className="text-text font-medium mb-1">1. Install Ollama</p>
                    {isMac && (
                      <div className="space-y-1">
                        <p className="text-text-muted">Option A: Download the .dmg from <button onClick={() => window.open("https://ollama.com", "_blank")} className="text-purple hover:underline">ollama.com</button></p>
                        <p className="text-text-muted">Option B: Install via Homebrew:</p>
                        <div className="bg-surface-2 rounded px-3 py-1.5"><code className="text-coral font-mono text-[11px]">brew install ollama</code></div>
                        <p className="text-text-muted mt-1">Apple Silicon (M1/M2/M3/M4) is GPU-accelerated automatically.</p>
                      </div>
                    )}
                    {isWin && (
                      <div className="space-y-1">
                        <p className="text-text-muted">Download the installer from <button onClick={() => window.open("https://ollama.com", "_blank")} className="text-purple hover:underline">ollama.com</button> and run it.</p>
                        <p className="text-text-muted">It installs as a Windows service and starts automatically.</p>
                        <p className="text-text-muted">NVIDIA GPUs: Install CUDA drivers for GPU acceleration.</p>
                      </div>
                    )}
                    {!isMac && !isWin && (
                      <div className="space-y-1">
                        <p className="text-text-muted">Run this in your terminal:</p>
                        <div className="bg-surface-2 rounded px-3 py-1.5"><code className="text-coral font-mono text-[11px]">curl -fsSL https://ollama.com/install.sh | sh</code></div>
                        <p className="text-text-muted mt-1">Then start the service:</p>
                        <div className="bg-surface-2 rounded px-3 py-1.5"><code className="text-coral font-mono text-[11px]">systemctl start ollama</code></div>
                        <p className="text-text-muted mt-1">NVIDIA GPUs: Install CUDA drivers for GPU acceleration.</p>
                      </div>
                    )}
                  </div>

                  <div>
                    <p className="text-text font-medium mb-1">2. Download a model</p>
                    <p className="text-text-muted mb-1">Open {isMac ? "Terminal" : isWin ? "PowerShell" : "a terminal"} and run one of these:</p>
                    <div className="space-y-1.5">
                      {POPULAR_MODELS.map((m) => (
                        <div key={m.id} className="flex items-center justify-between bg-surface-2 rounded px-3 py-1.5">
                          <code className="text-coral font-mono text-[11px]">ollama pull {m.id}</code>
                          <span className="text-text-muted text-[10px]">{m.size}</span>
                        </div>
                      ))}
                    </div>
                    <p className="text-text-muted mt-2">
                      <span className="text-amber font-medium">RAM guide:</span> 8B models need 8GB RAM. 16B models need 16GB RAM.
                    </p>
                  </div>

                  <div>
                    <p className="text-text font-medium mb-1">3. Start using</p>
                    <p className="text-text-muted">
                      Once downloaded, select the model above and Encode will connect automatically.
                      Models run 100% locally — your data never leaves your machine.
                    </p>
                  </div>
                </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* API Key for cloud providers */}
        {(provider === "claude" || provider === "gemini" || provider === "openai" || provider === "deepseek") && (
          <div className="p-4 bg-surface rounded-lg border border-border space-y-3">
            <div>
              <label className="block text-xs text-text-muted mb-2">
                {provider === "claude" ? "Claude (Anthropic)" : provider === "gemini" ? "Gemini (Google)" : provider === "openai" ? "OpenAI" : "DeepSeek"} API Key
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Enter API key..."
                className="w-full px-3 py-2 bg-surface-2 border border-border rounded text-sm text-text focus:outline-none focus:border-purple"
              />
              <p className="text-xs text-text-muted mt-2">
                {provider === "claude" && "Get your key at console.anthropic.com"}
                {provider === "gemini" && "Get your key at aistudio.google.com"}
                {provider === "openai" && "Get your key at platform.openai.com/api-keys"}
                {provider === "deepseek" && "Get your key at platform.deepseek.com"}
              </p>
            </div>
            {(provider === "openai" || provider === "deepseek") && (
              <div>
                <label className="block text-xs text-text-muted mb-1">Model</label>
                <select
                  value={ollamaModel}
                  onChange={(e) => setOllamaModel(e.target.value)}
                  className="w-full px-3 py-2 bg-surface-2 border border-border rounded text-sm text-text focus:outline-none focus:border-purple"
                >
                  {provider === "openai" && (
                    <>
                      <option value="gpt-4o-mini">GPT-4o Mini (fast, cheap)</option>
                      <option value="gpt-4o">GPT-4o (best quality)</option>
                      <option value="gpt-4.1-mini">GPT-4.1 Mini</option>
                      <option value="gpt-4.1">GPT-4.1</option>
                      <option value="o3-mini">o3-mini (reasoning)</option>
                    </>
                  )}
                  {provider === "deepseek" && (
                    <>
                      <option value="deepseek-chat">DeepSeek Chat (general)</option>
                      <option value="deepseek-reasoner">DeepSeek Reasoner (R1)</option>
                    </>
                  )}
                </select>
              </div>
            )}
            {apiKey && (
              <TestConnectionButton provider={provider} model={ollamaModel} url={ollamaUrl} apiKey={apiKey} />
            )}
          </div>
        )}
      </section>

      {/* Appearance */}
      <section className="space-y-4">
        <h3 className="text-sm font-medium uppercase tracking-wider text-text-muted">Appearance</h3>
        <div>
          <label className="block text-xs text-text-muted mb-2">Font Size</label>
          <div className="flex gap-2">
            {(["small", "medium", "large"] as const).map((size) => {
              const px = size === "small" ? "14" : size === "medium" ? "16" : "18";
              const isActive = fontSize === px;
              return (
                <button
                  key={size}
                  onClick={() => {
                    document.documentElement.style.setProperty("--editor-font-size", `${px}px`);
                    localStorage.setItem("encode-font-size", px);
                    setFontSize(px);
                  }}
                  className={`px-4 py-2 text-xs rounded border capitalize transition-colors ${
                    isActive
                      ? "border-purple bg-purple/10 text-text"
                      : "border-border bg-surface text-text-muted hover:border-purple/50"
                  }`}
                >
                  {size} ({px}px)
                </button>
              );
            })}
          </div>
        </div>

        {/* Font Family */}
        <div>
          <label className="block text-xs text-text-muted mb-2">Font Family</label>
          <div className="flex gap-2 flex-wrap">
            {[
              { id: "inter", label: "Inter", css: "'Inter', system-ui, sans-serif" },
              { id: "georgia", label: "Georgia", css: "Georgia, Merriweather, serif" },
              { id: "system", label: "System", css: "system-ui, -apple-system, sans-serif" },
              { id: "mono", label: "Monospace", css: "'JetBrains Mono', monospace" },
            ].map((font) => {
              const isActive = fontFamily === font.id;
              return (
                <button
                  key={font.id}
                  onClick={() => {
                    document.documentElement.style.setProperty("--editor-font-family", font.css);
                    localStorage.setItem("encode-font-family", font.id);
                    setFontFamily(font.id);
                  }}
                  className={`px-3 py-2 text-xs rounded border transition-colors ${
                    isActive
                      ? "border-purple bg-purple/10 text-text"
                      : "border-border bg-surface text-text-muted hover:border-purple/50"
                  }`}
                  style={{ fontFamily: font.css }}
                >
                  {font.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Content Width */}
        <div>
          <label className="block text-xs text-text-muted mb-2">Content Width</label>
          <div className="flex gap-2">
            {[
              { id: "narrow", label: "Narrow", px: "640px" },
              { id: "medium", label: "Medium", px: "800px" },
              { id: "wide", label: "Wide", px: "100%" },
            ].map((w) => {
              const isActive = contentWidth === w.id;
              return (
                <button
                  key={w.id}
                  onClick={() => {
                    document.documentElement.style.setProperty("--editor-max-width", w.px);
                    localStorage.setItem("encode-content-width", w.id);
                    setContentWidth(w.id);
                  }}
                  className={`px-4 py-2 text-xs rounded border capitalize transition-colors ${
                    isActive
                      ? "border-purple bg-purple/10 text-text"
                      : "border-border bg-surface text-text-muted hover:border-purple/50"
                  }`}
                >
                  {w.label}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Save */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="px-6 py-2 bg-purple text-white rounded text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {saving ? "Saving..." : "Save Settings"}
      </button>

      {/* Vault */}
      <section className="border-t border-border pt-6">
        <h3 className="text-sm font-medium uppercase tracking-wider text-text-muted mb-3">Vault</h3>
        <div className="flex items-center gap-2">
          <p className="flex-1 text-sm text-text-muted bg-surface rounded px-3 py-2 border border-border font-mono text-xs">
            {vaultPath}
          </p>
          <button
            onClick={() => {
              import("@tauri-apps/plugin-opener").then(({ revealItemInDir }) => {
                revealItemInDir(vaultPath);
              }).catch(() => {
                // Fallback: try openPath
                import("@tauri-apps/plugin-opener").then(({ openPath }) => {
                  openPath(vaultPath);
                }).catch(() => {});
              });
            }}
            className="px-3 py-2 text-xs text-text-muted border border-border rounded hover:text-purple hover:border-purple transition-colors shrink-0"
          >
            Open Folder
          </button>
        </div>
        <p className="text-[10px] text-text-muted mt-1.5">
          All your notes, flashcards, and quizzes are stored here as markdown files. Not hardcoded — each user gets their own vault.
        </p>
      </section>

      {/* Search Index */}
      <section className="border-t border-border pt-6">
        <h3 className="text-sm font-medium uppercase tracking-wider text-text-muted mb-3">Search Index</h3>
        <button
          onClick={handleRebuild}
          className="px-4 py-2 bg-surface border border-border rounded text-sm text-text-muted hover:text-text hover:border-purple transition-colors"
        >
          Rebuild Index
        </button>
        {indexCount !== null && (
          <p className="text-xs text-teal mt-2">Indexed {indexCount} files</p>
        )}
      </section>
    </div>
  );
}
