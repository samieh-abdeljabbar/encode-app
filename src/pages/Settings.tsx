import {
  Archive,
  Bot,
  CheckCircle2,
  Clock,
  Code,
  Database,
  Download,
  Eye,
  EyeOff,
  HardDrive,
  Palette,
  RefreshCw,
  Shield,
  User,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTheme } from "../components/layout/ThemeProvider";
import {
  checkAiStatus,
  createSnapshot,
  exportAll,
  getConfig,
  getExportStatus,
  listSnapshots,
  saveConfig,
} from "../lib/tauri";
import type { AppConfig, ExportStatus, SnapshotInfo } from "../lib/tauri";
import { THEMES } from "../lib/themes";

function StatusDot({ status }: { status: "ok" | "stale" | "none" }) {
  const color = {
    ok: "bg-teal",
    stale: "bg-amber",
    none: "bg-text-muted/20",
  }[status];

  return (
    <span className="relative flex h-2 w-2">
      {status === "ok" && (
        <span
          className={`absolute inline-flex h-full w-full animate-ping rounded-full ${color} opacity-40`}
        />
      )}
      <span className={`relative inline-flex h-2 w-2 rounded-full ${color}`} />
    </span>
  );
}

function getTimeDelta(timestamp: string | null | undefined): string {
  if (!timestamp) return "Never";
  const date = new Date(`${timestamp.replace(" ", "T")}Z`);
  const now = Date.now();
  const diffMs = now - date.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function getStatus(
  timestamp: string | null | undefined,
): "ok" | "stale" | "none" {
  if (!timestamp) return "none";
  const date = new Date(`${timestamp.replace(" ", "T")}Z`);
  const hoursSince = (Date.now() - date.getTime()) / 3600000;
  if (hoursSince < 1) return "ok";
  return "stale";
}

export function Settings() {
  const [exportStatus, setExportStatus] = useState<ExportStatus | null>(null);
  const [snapshots, setSnapshots] = useState<SnapshotInfo[]>([]);
  const [exporting, setExporting] = useState(false);
  const [snapshotting, setSnapshotting] = useState(false);
  const [exportCount, setExportCount] = useState<number | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const [status, snaps] = await Promise.all([
        getExportStatus(),
        listSnapshots(),
      ]);
      setExportStatus(status);
      setSnapshots(snaps);
    } catch {
      // Non-critical
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const handleExportAll = async () => {
    setExporting(true);
    setExportCount(null);
    try {
      const count = await exportAll();
      setExportCount(count);
      await loadStatus();
    } catch {
      // handled by status refresh
    } finally {
      setExporting(false);
    }
  };

  const handleSnapshot = async () => {
    setSnapshotting(true);
    try {
      await createSnapshot();
      await loadStatus();
    } catch {
      // handled by status refresh
    } finally {
      setSnapshotting(false);
    }
  };

  const exportDot = getStatus(exportStatus?.last_export_at);
  const snapshotDot = getStatus(exportStatus?.last_snapshot_at);

  return (
    <div className="mx-auto max-w-5xl px-7 py-7">
      <h1 className="mb-8 text-2xl font-semibold tracking-tight text-text">
        Settings
      </h1>

      {/* Data Safety */}
      <section className="mb-10">
        <div className="mb-4 flex items-center gap-2.5">
          <Shield size={14} className="text-accent" />
          <h2 className="text-sm font-semibold text-text">Data Safety</h2>
        </div>
        <p className="mb-8 max-w-2xl text-sm leading-relaxed text-text-muted">
          Your study data is automatically backed up. Exports save markdown
          files, snapshots copy the database.
        </p>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Export */}
          <div className="rounded-xl border border-border bg-panel p-7 shadow-[0_12px_32px_rgba(30,42,34,0.06)]">
            <div className="mb-5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <StatusDot status={exportDot} />
                <span className="text-xs font-semibold text-text">Export</span>
              </div>
              <Download size={13} className="text-text-muted/30" />
            </div>
            <div className="mb-2 font-mono text-3xl tabular-nums tracking-tight text-text">
              {getTimeDelta(exportStatus?.last_export_at)}
            </div>
            <div className="mb-7 text-xs text-text-muted/60">
              {exportStatus?.last_export_at
                ? `Last: ${exportStatus.last_export_at}`
                : "No exports yet"}
            </div>
            <button
              type="button"
              onClick={handleExportAll}
              disabled={exporting}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-border bg-panel-alt px-4 text-sm font-medium text-text-muted transition-all hover:border-accent/30 hover:text-accent disabled:opacity-40"
            >
              <RefreshCw
                size={11}
                className={exporting ? "animate-spin" : ""}
              />
              {exporting ? "Exporting..." : "Export All Now"}
            </button>
            {exportCount !== null && (
              <div className="mt-3 flex items-center gap-1.5 text-[11px] text-teal">
                <CheckCircle2 size={10} />
                {exportCount} subject{exportCount !== 1 ? "s" : ""} exported
              </div>
            )}
          </div>

          {/* Snapshot */}
          <div className="rounded-xl border border-border bg-panel p-7 shadow-[0_12px_32px_rgba(30,42,34,0.06)]">
            <div className="mb-5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <StatusDot status={snapshotDot} />
                <span className="text-xs font-semibold text-text">
                  Snapshot
                </span>
              </div>
              <Database size={13} className="text-text-muted/30" />
            </div>
            <div className="mb-2 font-mono text-3xl tabular-nums tracking-tight text-text">
              {getTimeDelta(exportStatus?.last_snapshot_at)}
            </div>
            <div className="mb-7 text-xs text-text-muted/60">
              {exportStatus?.last_snapshot_at
                ? `Last: ${exportStatus.last_snapshot_at}`
                : "No snapshots yet"}
            </div>
            <button
              type="button"
              onClick={handleSnapshot}
              disabled={snapshotting}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-border bg-panel-alt px-4 text-sm font-medium text-text-muted transition-all hover:border-accent/30 hover:text-accent disabled:opacity-40"
            >
              <HardDrive
                size={11}
                className={snapshotting ? "animate-spin" : ""}
              />
              {snapshotting ? "Creating..." : "Snapshot Now"}
            </button>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-2.5 rounded-2xl bg-accent-soft/30 px-4 py-3.5 text-sm text-text-muted">
          <Clock size={10} className="shrink-0 text-accent/50" />
          Exports run every 15 min, snapshots every hour — automatically
        </div>
      </section>

      {/* Snapshots list */}
      {snapshots.length > 0 && (
        <section className="mb-10">
          <div className="mb-4 flex items-center gap-2.5">
            <Archive size={14} className="text-text-muted" />
            <h2 className="text-sm font-semibold text-text">
              Available Snapshots
            </h2>
          </div>
          <div className="rounded-xl border border-border bg-panel p-4">
            <div className="space-y-1">
              {snapshots.map((snap) => (
                <div
                  key={snap.name}
                  className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm text-text-muted transition-colors hover:bg-panel-alt"
                >
                  <HardDrive size={11} className="shrink-0 opacity-30" />
                  <span className="font-mono text-[11px]">{snap.name}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Theme */}
      <ThemeSection />

      {/* AI & Profile */}
      <AiConfigSection />
    </div>
  );
}

function ThemeSection() {
  const { theme, setTheme, customCSS, setCustomCSS } = useTheme();

  return (
    <section className="mb-10">
      <div className="mb-4 flex items-center gap-2.5">
        <Palette size={14} className="text-accent" />
        <h2 className="text-sm font-semibold text-text">Theme</h2>
      </div>
      <p className="mb-6 max-w-2xl text-sm leading-relaxed text-text-muted">
        Choose a built-in theme or add custom CSS overrides.
      </p>

      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5">
        {THEMES.map((t) => {
          const active = t.name === theme.name;
          return (
            <button
              key={t.name}
              type="button"
              onClick={() => setTheme(t.name)}
              className={`group rounded-xl border-2 p-3 text-left transition-all ${
                active
                  ? "border-accent shadow-[0_0_0_1px_var(--color-accent)]"
                  : "border-border hover:border-border-strong"
              }`}
            >
              <div className="mb-2.5 flex gap-1">
                <span
                  className="h-4 w-4 rounded-full"
                  style={{ backgroundColor: t.colors["--color-bg"] }}
                />
                <span
                  className="h-4 w-4 rounded-full"
                  style={{ backgroundColor: t.colors["--color-accent"] }}
                />
                <span
                  className="h-4 w-4 rounded-full"
                  style={{ backgroundColor: t.colors["--color-text"] }}
                />
                <span
                  className="h-4 w-4 rounded-full"
                  style={{ backgroundColor: t.colors["--color-panel"] }}
                />
              </div>
              <span
                className={`text-xs font-medium ${active ? "text-accent" : "text-text-muted group-hover:text-text"}`}
              >
                {t.label}
              </span>
            </button>
          );
        })}
      </div>

      <div>
        <div className="mb-3 flex items-center gap-2">
          <Code size={13} className="text-text-muted" />
          <span className="text-xs font-semibold text-text">Custom CSS</span>
        </div>
        <textarea
          value={customCSS}
          onChange={(e) => setCustomCSS(e.target.value)}
          placeholder={
            "/* Override any CSS variable or add custom styles */\n:root {\n  --color-accent: #e06c75;\n}"
          }
          spellCheck={false}
          className="h-36 w-full resize-y rounded-xl border border-border bg-panel p-4 font-mono text-xs leading-relaxed text-text placeholder:text-text-muted/40 focus:border-accent focus:outline-none"
        />
        <p className="mt-2 text-[11px] text-text-muted/60">
          Paste CSS snippets to customize colors, fonts, or spacing. Changes
          apply immediately.
        </p>
      </div>
    </section>
  );
}

const PROVIDERS = [
  { value: "none", label: "None" },
  { value: "claude", label: "Claude" },
  { value: "openai", label: "OpenAI" },
  { value: "gemini", label: "Gemini" },
  { value: "deepseek", label: "Deepseek" },
  { value: "ollama", label: "Ollama" },
  { value: "cli", label: "CLI" },
] as const;

const DEFAULT_MODELS: Record<string, string> = {
  claude: "claude-sonnet-4-20250514",
  openai: "gpt-4o-mini",
  gemini: "gemini-2.0-flash",
  deepseek: "deepseek-chat",
  ollama: "llama3.1:8b",
};

function AiConfigSection() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [provider, setProvider] = useState("none");
  const [apiKey, setApiKey] = useState("");
  const [ollamaUrl, setOllamaUrl] = useState("http://localhost:11434");
  const [cliCommand, setCliCommand] = useState("");
  const [modelOverride, setModelOverride] = useState("");
  const [role, setRole] = useState("");
  const [domain, setDomain] = useState("");
  const [learningContext, setLearningContext] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"ok" | "fail" | null>(null);

  const loadConfig = useCallback(async () => {
    try {
      const cfg = await getConfig();
      setConfig(cfg);
      setProvider(cfg.ai.provider);
      setOllamaUrl(cfg.ai.ollama_url || "http://localhost:11434");
      setCliCommand(cfg.ai.cli_command);
      setRole(cfg.profile.role);
      setDomain(cfg.profile.domain);
      setLearningContext(cfg.profile.learning_context);

      // Set the API key for the current provider
      switch (cfg.ai.provider) {
        case "claude":
          setApiKey(cfg.ai.claude_api_key);
          break;
        case "openai":
          setApiKey(cfg.ai.openai_api_key);
          break;
        case "gemini":
          setApiKey(cfg.ai.gemini_api_key);
          break;
        case "deepseek":
          setApiKey(cfg.ai.deepseek_api_key);
          break;
        default:
          setApiKey("");
      }

      // Set model override for current provider
      const modelMap: Record<string, string> = {
        claude: cfg.ai.claude_model,
        openai: cfg.ai.openai_model,
        gemini: cfg.ai.gemini_model,
        deepseek: cfg.ai.deepseek_model,
        ollama: cfg.ai.ollama_model,
      };
      setModelOverride(modelMap[cfg.ai.provider] || "");
    } catch {
      // Non-critical
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const handleProviderChange = (newProvider: string) => {
    setProvider(newProvider);
    setApiKey("");
    setShowKey(false);
    setTestResult(null);
    setModelOverride("");

    // Restore stored key/model for the selected provider if we have config
    if (config) {
      const keyMap: Record<string, string> = {
        claude: config.ai.claude_api_key,
        openai: config.ai.openai_api_key,
        gemini: config.ai.gemini_api_key,
        deepseek: config.ai.deepseek_api_key,
      };
      const modelMap: Record<string, string> = {
        claude: config.ai.claude_model,
        openai: config.ai.openai_model,
        gemini: config.ai.gemini_model,
        deepseek: config.ai.deepseek_model,
        ollama: config.ai.ollama_model,
      };
      setApiKey(keyMap[newProvider] || "");
      setModelOverride(modelMap[newProvider] || "");
      if (newProvider === "ollama") {
        setOllamaUrl(config.ai.ollama_url || "http://localhost:11434");
      }
      if (newProvider === "cli") {
        setCliCommand(config.ai.cli_command);
      }
    }
  };

  const buildConfig = (): AppConfig => {
    const base = config ?? {
      ai: {
        provider: "none",
        ollama_model: "",
        ollama_url: "http://localhost:11434",
        claude_api_key: "",
        gemini_api_key: "",
        openai_api_key: "",
        deepseek_api_key: "",
        claude_model: "",
        gemini_model: "",
        openai_model: "",
        deepseek_model: "",
        cli_command: "",
        cli_args: [],
      },
      profile: { role: "", domain: "", learning_context: "" },
    };

    const ai = { ...base.ai, provider };

    // Set the API key on the right field
    const keyMap: Record<string, keyof typeof ai> = {
      claude: "claude_api_key",
      openai: "openai_api_key",
      gemini: "gemini_api_key",
      deepseek: "deepseek_api_key",
    };
    const keyField = keyMap[provider];
    if (keyField) {
      (ai as Record<string, unknown>)[keyField] = apiKey;
    }

    // Set model override on the right field
    const modelMap: Record<string, keyof typeof ai> = {
      claude: "claude_model",
      openai: "openai_model",
      gemini: "gemini_model",
      deepseek: "deepseek_model",
      ollama: "ollama_model",
    };
    const modelField = modelMap[provider];
    if (modelField) {
      (ai as Record<string, unknown>)[modelField] = modelOverride;
    }

    ai.ollama_url = ollamaUrl;
    ai.cli_command = cliCommand;

    return {
      ai,
      profile: {
        role,
        domain,
        learning_context: learningContext,
      },
    };
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const newConfig = buildConfig();
      await saveConfig(newConfig);
      setConfig(newConfig);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // Error handling
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      // Save first so the backend picks up the new config
      const newConfig = buildConfig();
      await saveConfig(newConfig);
      setConfig(newConfig);

      const status = await checkAiStatus();
      setTestResult(status.configured && status.has_api_key ? "ok" : "fail");
    } catch {
      setTestResult("fail");
    } finally {
      setTesting(false);
    }
  };

  const needsApiKey = ["claude", "openai", "gemini", "deepseek"].includes(
    provider,
  );

  const inputClass =
    "h-11 w-full rounded-xl border border-border bg-surface px-4 text-sm text-text placeholder:text-text-muted/50 focus:border-accent/40 focus:outline-none";

  return (
    <>
      {/* AI Provider */}
      <section className="mb-10">
        <div className="mb-4 flex items-center gap-2.5">
          <Bot size={14} className="text-accent" />
          <h2 className="text-sm font-semibold text-text">AI Provider</h2>
        </div>
        <p className="mb-6 max-w-2xl text-sm leading-relaxed text-text-muted">
          Configure which AI provider to use for section checks, synthesis
          evaluation, and quiz generation.
        </p>

        <div className="rounded-xl border border-border bg-panel p-6">
          <div className="space-y-5">
            {/* Provider select */}
            <div>
              <label
                htmlFor="ai-provider"
                className="mb-1.5 block text-xs font-medium text-text-muted"
              >
                Provider
              </label>
              <div className="relative">
                <select
                  id="ai-provider"
                  value={provider}
                  onChange={(e) => handleProviderChange(e.target.value)}
                  className={`${inputClass} appearance-none pr-10`}
                >
                  {PROVIDERS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-muted/50">
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    fill="none"
                    role="img"
                    aria-label="Dropdown arrow"
                  >
                    <path
                      d="M3 4.5L6 7.5L9 4.5"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
              </div>
            </div>

            {/* API Key */}
            {needsApiKey && (
              <div>
                <label
                  htmlFor="ai-api-key"
                  className="mb-1.5 block text-xs font-medium text-text-muted"
                >
                  API Key
                </label>
                <div className="relative">
                  <input
                    id="ai-api-key"
                    type={showKey ? "text" : "password"}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={`Enter your ${provider} API key`}
                    className={`${inputClass} pr-10`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted/50 transition-colors hover:text-text-muted"
                  >
                    {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
            )}

            {/* Ollama URL */}
            {provider === "ollama" && (
              <div>
                <label
                  htmlFor="ai-ollama-url"
                  className="mb-1.5 block text-xs font-medium text-text-muted"
                >
                  Ollama URL
                </label>
                <input
                  id="ai-ollama-url"
                  type="text"
                  value={ollamaUrl}
                  onChange={(e) => setOllamaUrl(e.target.value)}
                  placeholder="http://localhost:11434"
                  className={inputClass}
                />
              </div>
            )}

            {/* CLI Command */}
            {provider === "cli" && (
              <div>
                <label
                  htmlFor="ai-cli-command"
                  className="mb-1.5 block text-xs font-medium text-text-muted"
                >
                  CLI Command
                </label>
                <input
                  id="ai-cli-command"
                  type="text"
                  value={cliCommand}
                  onChange={(e) => setCliCommand(e.target.value)}
                  placeholder="e.g., claude, gemini, ollama"
                  className={inputClass}
                />
                <p className="mt-1.5 text-[11px] text-text-muted/60">
                  Any CLI tool or script that accepts a prompt and returns text.
                  Common: claude, gemini, ollama, sgpt, aichat, llm
                </p>
              </div>
            )}

            {/* Model override */}
            {provider !== "none" && provider !== "cli" && (
              <div>
                <label
                  htmlFor="ai-model-override"
                  className="mb-1.5 block text-xs font-medium text-text-muted"
                >
                  Model Override
                </label>
                <input
                  id="ai-model-override"
                  type="text"
                  value={modelOverride}
                  onChange={(e) => setModelOverride(e.target.value)}
                  placeholder={DEFAULT_MODELS[provider] ?? "default model"}
                  className={inputClass}
                />
                <p className="mt-1.5 text-[11px] text-text-muted/60">
                  Leave empty to use the default model for each policy tier
                </p>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={provider === "none" || testing}
                className="h-10 rounded-xl border border-border bg-panel px-4 text-xs font-medium text-text transition-all hover:bg-panel-active disabled:opacity-40"
              >
                {testing ? "Testing..." : "Test Connection"}
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="h-10 rounded-xl bg-accent px-4 text-xs font-semibold text-white transition-all hover:bg-accent/90 disabled:opacity-40"
              >
                {saving ? "Saving..." : "Save"}
              </button>

              {testResult === "ok" && (
                <span className="flex items-center gap-1.5 text-xs text-teal">
                  <CheckCircle2 size={12} />
                  Connected
                </span>
              )}
              {testResult === "fail" && (
                <span className="flex items-center gap-1.5 text-xs text-coral">
                  <XCircle size={12} />
                  Not configured
                </span>
              )}
              {saved && (
                <span className="flex items-center gap-1.5 text-xs text-teal">
                  <CheckCircle2 size={12} />
                  Saved
                </span>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Profile */}
      <section className="mb-10">
        <div className="mb-4 flex items-center gap-2.5">
          <User size={14} className="text-accent" />
          <h2 className="text-sm font-semibold text-text">Profile</h2>
        </div>
        <p className="mb-6 max-w-2xl text-sm leading-relaxed text-text-muted">
          Tell the AI about yourself so it can tailor responses to your
          background.
        </p>

        <div className="rounded-xl border border-border bg-panel p-6">
          <div className="space-y-5">
            <div>
              <label
                htmlFor="profile-role"
                className="mb-1.5 block text-xs font-medium text-text-muted"
              >
                Role
              </label>
              <input
                id="profile-role"
                type="text"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="e.g., Computer Science student"
                className={inputClass}
              />
            </div>

            <div>
              <label
                htmlFor="profile-domain"
                className="mb-1.5 block text-xs font-medium text-text-muted"
              >
                Domain
              </label>
              <input
                id="profile-domain"
                type="text"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="e.g., cloud infrastructure"
                className={inputClass}
              />
            </div>

            <div>
              <label
                htmlFor="profile-context"
                className="mb-1.5 block text-xs font-medium text-text-muted"
              >
                Learning Context
              </label>
              <textarea
                id="profile-context"
                value={learningContext}
                onChange={(e) => setLearningContext(e.target.value)}
                placeholder="e.g., Preparing for AWS cert exam"
                rows={3}
                className="w-full resize-y rounded-xl border border-border bg-surface px-4 py-3 text-sm text-text placeholder:text-text-muted/50 focus:border-accent/40 focus:outline-none"
              />
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="h-10 rounded-xl bg-accent px-4 text-xs font-semibold text-white transition-all hover:bg-accent/90 disabled:opacity-40"
              >
                {saving ? "Saving..." : "Save Profile"}
              </button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
