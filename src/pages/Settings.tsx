import { useEffect, useState } from "react";
import { useAppStore } from "../stores/app";
import { rebuildIndex, getVaultPath, checkOllama, listOllamaModels, testAiConnection, getCliPresetPaths } from "../lib/tauri";
import { MONO_FONT_OPTIONS, READING_FONT_OPTIONS, UI_FONT_OPTIONS, getStoredFontId, persistFontPreference, type FontOption } from "../lib/fonts";
import type { AppConfig } from "../lib/types";
import { themes, applyTheme, getCurrentTheme } from "../lib/themes";
import { MetaChip, PageHeader, Panel, PrimaryButton, SecondaryButton } from "../components/ui/primitives";

// CLI preset paths are resolved dynamically in Phase 2 via get_cli_preset_paths Tauri command.
// Preset buttons are disabled until dynamic resolution is wired up.

const POPULAR_MODELS = [
  { id: "llama3.1:8b", name: "Llama 3.1 8B", size: "4.7 GB", desc: "Best general-purpose local model" },
  { id: "deepseek-r1:8b", name: "DeepSeek R1 8B", size: "4.9 GB", desc: "Strong reasoning, great for study Q&A" },
  { id: "deepseek-coder-v2:16b", name: "DeepSeek Coder V2 16B", size: "8.9 GB", desc: "Code + reasoning, needs 16GB RAM" },
  { id: "mistral:7b", name: "Mistral 7B", size: "4.1 GB", desc: "Fast and capable, low resource usage" },
  { id: "phi3:latest", name: "Phi-3 Mini", size: "2.2 GB", desc: "Smallest, runs on any machine" },
  { id: "gemma2:9b", name: "Gemma 2 9B", size: "5.4 GB", desc: "Google's open model, strong at tasks" },
  { id: "qwen2.5:7b", name: "Qwen 2.5 7B", size: "4.4 GB", desc: "Excellent multilingual, good at math" },
];

function FontSelector({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: FontOption[];
  value: string;
  onChange: (fontId: string) => void;
}) {
  return (
    <div>
      <label className="block text-xs text-text-muted mb-2">{label}</label>
      <div className="flex gap-2 flex-wrap">
        {options.map((font) => {
          const isActive = value === font.id;
          return (
            <button
              key={font.id}
              onClick={() => onChange(font.id)}
              className={`px-3 py-2 text-xs rounded border transition-colors ${
                isActive
                  ? "border-accent/40 bg-accent-soft text-text"
                  : "border-border bg-surface text-text-muted hover:border-border-strong"
              }`}
              style={{ fontFamily: font.css }}
            >
              {font.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TestConnectionButton({
  provider,
  model,
  url,
  apiKey,
  cliCommand,
  cliArgs,
  cliWorkdir,
}: {
  provider: string;
  model: string;
  url: string;
  apiKey: string;
  cliCommand: string;
  cliArgs: string[];
  cliWorkdir: string;
}) {
  const [status, setStatus] = useState<"idle" | "testing" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const handleTest = async () => {
    setStatus("testing");
    setErrorMsg("");
    try {
      await testAiConnection(provider, model, url, apiKey, cliCommand, cliArgs, cliWorkdir);
      setStatus("success");
      setTimeout(() => setStatus("idle"), 3000);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  };

  return (
    <div className="flex items-center gap-3">
      <PrimaryButton
        onClick={handleTest}
        disabled={status === "testing"}
        className="px-3 py-1.5 text-xs"
      >
        {status === "testing" ? "Testing..." : "Test Connection"}
      </PrimaryButton>
      {status === "success" && <span className="text-xs text-teal">Connected</span>}
      {status === "error" && <span className="text-xs text-coral truncate max-w-[300px]">{errorMsg}</span>}
    </div>
  );
}

export default function Settings() {
  const { config, loadConfig, saveConfig } = useAppStore();
  const [vaultPath, setVaultPath] = useState("");
  const [provider, setProvider] = useState<AppConfig["ai_provider"]>("none");
  const [ollamaModel, setOllamaModel] = useState("llama3.1:8b");
  const [ollamaUrl, setOllamaUrl] = useState("http://localhost:11434");
  const [openaiModel, setOpenaiModel] = useState("gpt-4o-mini");
  const [deepseekModel, setDeepseekModel] = useState("deepseek-chat");
  const [claudeModel, setClaudeModel] = useState("claude-sonnet-4-20250514");
  const [geminiModel, setGeminiModel] = useState("gemini-2.0-flash");
  const [claudeApiKey, setClaudeApiKey] = useState("");
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [deepseekApiKey, setDeepseekApiKey] = useState("");
  const [cliCommand, setCliCommand] = useState("");
  const [cliArgsText, setCliArgsText] = useState("");
  const [cliWorkdir, setCliWorkdir] = useState("");
  const [presetPaths, setPresetPaths] = useState<Record<string, string>>({});
  const [ollamaStatus, setOllamaStatus] = useState<"checking" | "available" | "unavailable">("checking");
  const [indexCount, setIndexCount] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [installedModels, setInstalledModels] = useState<string[]>([]);
  const [activeTheme, setActiveTheme] = useState(() => getCurrentTheme());
  const [fontSize, setFontSize] = useState(() => localStorage.getItem("encode-font-size") || "16");
  const [uiFont, setUiFont] = useState(() => getStoredFontId("ui"));
  const [readingFont, setReadingFont] = useState(() => getStoredFontId("reading"));
  const [monoFont, setMonoFont] = useState(() => getStoredFontId("mono"));
  const [contentWidth, setContentWidth] = useState(() => localStorage.getItem("encode-content-width") || "medium");
  // User profile
  const [userRole, setUserRole] = useState("");
  const [userHobbies, setUserHobbies] = useState("");
  const [userLearningStyle, setUserLearningStyle] = useState("");

  useEffect(() => {
    loadConfig();
    getVaultPath().then(setVaultPath).catch(() => {});
    getCliPresetPaths().then(setPresetPaths).catch(() => {});
  }, [loadConfig]);

  useEffect(() => {
    if (config) {
      setProvider(config.ai_provider);
      setOllamaModel(config.ollama_model);
      setOllamaUrl(config.ollama_url);
      setOpenaiModel(config.openai_model);
      setDeepseekModel(config.deepseek_model);
      setClaudeModel(config.claude_model);
      setGeminiModel(config.gemini_model);
      // Per-provider API keys with legacy migration
      const legacyKey = config.api_key || "";
      setClaudeApiKey(config.claude_api_key || (config.ai_provider === "claude" ? legacyKey : ""));
      setGeminiApiKey(config.gemini_api_key || (config.ai_provider === "gemini" ? legacyKey : ""));
      setOpenaiApiKey(config.openai_api_key || (config.ai_provider === "openai" ? legacyKey : ""));
      setDeepseekApiKey(config.deepseek_api_key || (config.ai_provider === "deepseek" ? legacyKey : ""));
      setCliCommand(config.cli_command || "");
      setCliArgsText((config.cli_args || []).join("\n"));
      setCliWorkdir(config.cli_workdir || "");
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
    const cliArgs = cliArgsText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    setSaving(true);
    await saveConfig({
      vault_path: vaultPath,
      ai_provider: provider,
      ollama_model: ollamaModel,
      ollama_url: ollamaUrl,
      openai_model: openaiModel,
      deepseek_model: deepseekModel,
      claude_model: claudeModel,
      gemini_model: geminiModel,
      api_key: "",
      claude_api_key: claudeApiKey,
      gemini_api_key: geminiApiKey,
      openai_api_key: openaiApiKey,
      deepseek_api_key: deepseekApiKey,
      cli_command: cliCommand,
      cli_args: cliArgs,
      cli_workdir: cliWorkdir,
      user_role: userRole,
      user_hobbies: userHobbies,
      user_learning_style: userLearningStyle,
      pomodoro_study_secs: config?.pomodoro_study_secs ?? 1500,
      pomodoro_break_secs: config?.pomodoro_break_secs ?? 300,
      pomodoro_long_break_secs: config?.pomodoro_long_break_secs ?? 900,
      quick_timers: config?.quick_timers ?? [1500, 1800, 2700, 3600],
      pomodoro_sound_enabled: config?.pomodoro_sound_enabled ?? true,
      pomodoro_notifications_enabled: config?.pomodoro_notifications_enabled ?? true,
    });
    setSaving(false);
  };

  const handleRebuild = async () => {
    const count = await rebuildIndex();
    setIndexCount(count);
  };

  const currentProviderModel =
    provider === "openai" ? openaiModel
      : provider === "deepseek" ? deepseekModel
        : provider === "claude" ? claudeModel
          : provider === "gemini" ? geminiModel
            : provider === "cli" ? cliCommand
              : ollamaModel;

  const currentCliArgs = cliArgsText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const activeApiKey =
    provider === "claude" ? claudeApiKey
      : provider === "gemini" ? geminiApiKey
        : provider === "openai" ? openaiApiKey
          : provider === "deepseek" ? deepseekApiKey
            : "";

  const setActiveApiKey = (value: string) => {
    if (provider === "claude") setClaudeApiKey(value);
    else if (provider === "gemini") setGeminiApiKey(value);
    else if (provider === "openai") setOpenaiApiKey(value);
    else if (provider === "deepseek") setDeepseekApiKey(value);
  };

  const applyCliPreset = (preset: "codex" | "claude") => {
    const path = presetPaths[preset];
    if (!path) return;
    setProvider("cli");
    setCliCommand(path);
    if (preset === "codex") {
      setCliArgsText(["--model", "gpt-5.4"].join("\n"));
    } else {
      setCliArgsText(["--output-format", "text", "--model", "sonnet"].join("\n"));
    }
    setCliWorkdir(vaultPath);
  };

  return (
    <div className="mx-auto max-w-5xl px-6 py-8 space-y-8">
      <PageHeader
        title="Settings"
        subtitle="Configure providers, appearance, and vault behavior without changing the study workflow."
        meta={
          <>
            <MetaChip>{provider === "none" ? "AI disabled" : `Provider: ${provider}`}</MetaChip>
            <MetaChip>{vaultPath || "Vault loading..."}</MetaChip>
          </>
        }
        className="rounded-2xl border border-border-subtle"
      />

      {/* About You — User Profile */}
      <Panel title="About You">
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
      </Panel>

      {/* Theme */}
      <Panel title="Theme">
        <h3 className="text-sm font-medium text-text mb-3">Theme</h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {themes.map((t) => {
            const isActive = activeTheme === t.id;
            return (
              <button
                key={t.id}
                onClick={() => {
                  applyTheme(t.id);
                  setActiveTheme(t.id);
                }}
                className={`flex items-center gap-3 p-3 rounded-lg border transition-colors text-left ${
                  isActive
                    ? "border-accent/40 bg-accent-soft"
                    : "border-border-subtle bg-panel-alt hover:border-border-strong"
                }`}
              >
                <div
                  className="w-8 h-8 rounded-full border-2 shrink-0"
                  style={{
                    backgroundColor: t.preview,
                    borderColor: isActive ? "var(--color-accent)" : t.colors.border,
                  }}
                />
                <div>
                  <p className={`text-sm font-medium ${isActive ? "text-accent" : "text-text"}`}>{t.name}</p>
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
      </Panel>

      {/* AI Provider */}
      <Panel title="AI Provider">
        <h3 className="text-sm font-medium uppercase tracking-wider text-text-muted">AI Provider</h3>

        <div className="grid grid-cols-2 gap-2">
          {(["none", "ollama", "claude", "gemini", "openai", "deepseek", "cli"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setProvider(p)}
              className={`px-4 py-3 rounded-lg border text-left transition-colors ${
                provider === p
                  ? "border-accent/40 bg-accent-soft text-text"
                  : "border-border-subtle bg-panel-alt text-text-muted hover:border-border-strong"
              }`}
            >
              <span className="text-sm font-medium block">
                {p === "none" ? "No AI" : p === "ollama" ? "Ollama" : p === "claude" ? "Claude" : p === "gemini" ? "Gemini" : p === "openai" ? "OpenAI" : p === "deepseek" ? "DeepSeek" : "CLI Agent"}
              </span>
              <span className="text-xs text-text-muted">
                {p === "none" && "Study without AI feedback"}
                {p === "ollama" && "Local models (free, private)"}
                {p === "claude" && "Anthropic API (best quality)"}
                {p === "gemini" && "Google API (fast, free tier)"}
                {p === "openai" && "GPT-4o, GPT-4o-mini"}
                {p === "deepseek" && "DeepSeek API (affordable)"}
                {p === "cli" && "Use a local non-interactive AI CLI"}
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
          <div className="space-y-4 rounded-2xl border border-border-subtle bg-panel-alt p-4">
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
                        <div className="bg-surface-2 rounded px-3 py-1.5"><code className="app-font-mono text-coral text-[11px]">brew install ollama</code></div>
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
                        <div className="bg-surface-2 rounded px-3 py-1.5"><code className="app-font-mono text-coral text-[11px]">curl -fsSL https://ollama.com/install.sh | sh</code></div>
                        <p className="text-text-muted mt-1">Then start the service:</p>
                        <div className="bg-surface-2 rounded px-3 py-1.5"><code className="app-font-mono text-coral text-[11px]">systemctl start ollama</code></div>
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
                          <code className="app-font-mono text-coral text-[11px]">ollama pull {m.id}</code>
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
          <div className="space-y-3 rounded-2xl border border-border-subtle bg-panel-alt p-4">
            <div>
              <label className="block text-xs text-text-muted mb-2">
                {provider === "claude" ? "Claude (Anthropic)" : provider === "gemini" ? "Gemini (Google)" : provider === "openai" ? "OpenAI" : "DeepSeek"} API Key
              </label>
              <div className="relative">
                <input
                  type={showApiKey ? "text" : "password"}
                  value={activeApiKey}
                  onChange={(e) => setActiveApiKey(e.target.value)}
                  placeholder="Enter API key..."
                  className="w-full px-3 py-2 pr-16 bg-surface-2 border border-border rounded text-sm text-text focus:outline-none focus:border-purple"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-text-muted hover:text-text px-1.5 py-0.5 rounded bg-surface hover:bg-surface-2 transition-colors"
                >
                  {showApiKey ? "Hide" : "Show"}
                </button>
              </div>
              <p className="text-xs text-text-muted mt-2">
                {provider === "claude" && "Get your key at console.anthropic.com"}
                {provider === "gemini" && "Get your key at aistudio.google.com"}
                {provider === "openai" && "Get your key at platform.openai.com/api-keys"}
                {provider === "deepseek" && "Get your key at platform.deepseek.com"}
              </p>
            </div>
            <div>
              <div>
                <label className="block text-xs text-text-muted mb-1">Model</label>
                <select
                  value={currentProviderModel}
                  onChange={(e) => {
                    const next = e.target.value;
                    if (provider === "openai") setOpenaiModel(next);
                    else if (provider === "deepseek") setDeepseekModel(next);
                    else if (provider === "claude") setClaudeModel(next);
                    else if (provider === "gemini") setGeminiModel(next);
                  }}
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
                  {provider === "claude" && (
                    <>
                      <option value="claude-sonnet-4-20250514">Claude Sonnet 4</option>
                      <option value="claude-3-7-sonnet-latest">Claude 3.7 Sonnet</option>
                    </>
                  )}
                  {provider === "gemini" && (
                    <>
                      <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
                      <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                      <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
                    </>
                  )}
                </select>
              </div>
            </div>
            {activeApiKey && (
              <TestConnectionButton
                provider={provider}
                model={currentProviderModel}
                url={ollamaUrl}
                apiKey={activeApiKey}
                cliCommand={cliCommand}
                cliArgs={currentCliArgs}
                cliWorkdir={cliWorkdir}
              />
            )}
          </div>
        )}

        {provider === "cli" && (
          <div className="space-y-3 rounded-2xl border border-border-subtle bg-panel-alt p-4">
            <div>
              <label className="block text-xs text-text-muted mb-2">Common Presets</label>
              <div className="flex gap-2 flex-wrap">
                <button
                  type="button"
                  disabled={!presetPaths.codex}
                  onClick={() => applyCliPreset("codex")}
                  className={`rounded-xl border border-border-subtle bg-panel px-3 py-2 text-xs transition-colors ${
                    presetPaths.codex ? "text-text hover:border-border-strong" : "text-text-muted opacity-50 cursor-not-allowed"
                  }`}
                  title={presetPaths.codex || "Codex CLI preset not found"}
                >
                  Use Codex CLI
                </button>
                <button
                  type="button"
                  disabled={!presetPaths.claude}
                  onClick={() => applyCliPreset("claude")}
                  className={`rounded-xl border border-border-subtle bg-panel px-3 py-2 text-xs transition-colors ${
                    presetPaths.claude ? "text-text hover:border-border-strong" : "text-text-muted opacity-50 cursor-not-allowed"
                  }`}
                  title={presetPaths.claude || "Claude CLI preset not found"}
                >
                  Use Claude Code
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs text-text-muted mb-1">CLI Command</label>
              <input
                type="text"
                value={cliCommand}
                onChange={(e) => setCliCommand(e.target.value)}
                placeholder="e.g., codex, llm, /usr/local/bin/my-ai-cli"
                className="w-full px-3 py-2 bg-surface-2 border border-border rounded text-sm text-text focus:outline-none focus:border-purple"
              />
              <p className="text-[10px] text-text-muted mt-1.5">
                Encode will run this command in the background and pipe prompts through stdin.
              </p>
            </div>

            <div>
              <label className="block text-xs text-text-muted mb-1">CLI Args</label>
              <textarea
                value={cliArgsText}
                onChange={(e) => setCliArgsText(e.target.value)}
                rows={4}
                placeholder={"One argument per line\nExample:\n--stdio\n--model\nsonnet"}
                className="w-full px-3 py-2 bg-surface-2 border border-border rounded text-sm text-text resize-none focus:outline-none focus:border-purple"
              />
            </div>

            <div>
              <label className="block text-xs text-text-muted mb-1">Working Directory</label>
              <input
                type="text"
                value={cliWorkdir}
                onChange={(e) => setCliWorkdir(e.target.value)}
                placeholder={vaultPath || "Leave blank to use the vault root"}
                className="w-full px-3 py-2 bg-surface-2 border border-border rounded text-sm text-text focus:outline-none focus:border-purple"
              />
            </div>

            <div className="p-3 bg-bg rounded border border-border text-xs text-text-muted space-y-1">
              <p>Use a non-interactive CLI that reads from stdin and writes its final answer to stdout.</p>
              <p>API keys are not used for CLI providers. Your CLI tool handles its own authentication.</p>
              <p>The preset scripts in this repo normalize Codex CLI and Claude Code for Encode.</p>
            </div>

            {cliCommand.trim() && (
              <TestConnectionButton
                provider={provider}
                model={currentProviderModel}
                url={ollamaUrl}
                apiKey=""
                cliCommand={cliCommand}
                cliArgs={currentCliArgs}
                cliWorkdir={cliWorkdir || vaultPath}
              />
            )}
          </div>
        )}
      </Panel>

      {/* Appearance */}
      <Panel title="Appearance">
        <h3 className="text-sm font-medium uppercase tracking-wider text-text-muted">Appearance</h3>
        <div className="space-y-5">
          <div>
            <label className="block text-xs text-text-muted mb-2">
              Font Size <span className="text-text ml-1">{fontSize}px</span>
            </label>
            <div className="flex gap-2 items-center">
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
                        ? "border-accent/40 bg-accent-soft text-text"
                        : "border-border bg-surface text-text-muted hover:border-border-strong"
                    }`}
                  >
                    {size} ({px}px)
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-text-muted mt-1">Use Cmd+= / Cmd+- for fine control (10-24px)</p>
          </div>

          <FontSelector
            label="UI Font"
            options={UI_FONT_OPTIONS}
            value={uiFont}
            onChange={(fontId) => {
              persistFontPreference("ui", fontId);
              setUiFont(fontId);
            }}
          />

          <FontSelector
            label="Reading Font"
            options={READING_FONT_OPTIONS}
            value={readingFont}
            onChange={(fontId) => {
              persistFontPreference("reading", fontId);
              setReadingFont(fontId);
            }}
          />

          <FontSelector
            label="Mono Font"
            options={MONO_FONT_OPTIONS}
            value={monoFont}
            onChange={(fontId) => {
              persistFontPreference("mono", fontId);
              setMonoFont(fontId);
            }}
          />

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
                        ? "border-accent/40 bg-accent-soft text-text"
                        : "border-border bg-surface text-text-muted hover:border-border-strong"
                    }`}
                  >
                    {w.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </Panel>

      {/* Save */}
      <PrimaryButton
        onClick={handleSave}
        disabled={saving}
        className="px-6 py-2 text-sm"
      >
        {saving ? "Saving..." : "Save Settings"}
      </PrimaryButton>

      {/* Vault */}
      <Panel title="Vault">
        <h3 className="text-sm font-medium uppercase tracking-wider text-text-muted mb-3">Vault</h3>
        <div className="flex items-center gap-2">
          <p className="app-font-mono flex-1 rounded-xl border border-border-subtle bg-panel-alt px-3 py-2 text-xs text-text-muted">
            {vaultPath}
          </p>
          <SecondaryButton
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
            className="shrink-0 px-3 py-2 text-xs"
          >
            Open Folder
          </SecondaryButton>
        </div>
        <p className="text-[10px] text-text-muted mt-1.5">
          All your notes, flashcards, and quizzes are stored here as markdown files. Not hardcoded — each user gets their own vault.
        </p>
      </Panel>

      {/* Search Index */}
      <Panel title="Search Index">
        <h3 className="text-sm font-medium uppercase tracking-wider text-text-muted mb-3">Search Index</h3>
        <SecondaryButton
          onClick={handleRebuild}
          className="px-4 py-2 text-sm"
        >
          Rebuild Index
        </SecondaryButton>
        {indexCount !== null && (
          <p className="text-xs text-teal mt-2">Indexed {indexCount} files</p>
        )}
      </Panel>
    </div>
  );
}
