import {
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Eye,
  EyeOff,
  GraduationCap,
  Sparkles,
  User,
  XCircle,
} from "lucide-react";
import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  checkAiStatus,
  createSubject,
  getConfig,
  saveConfig,
} from "../lib/tauri";

const PROVIDERS = [
  { value: "claude", label: "Claude (Anthropic)", needsKey: true },
  { value: "openai", label: "OpenAI", needsKey: true },
  { value: "gemini", label: "Gemini (Google)", needsKey: true },
  { value: "deepseek", label: "Deepseek", needsKey: true },
  { value: "ollama", label: "Ollama (Local)", needsKey: false },
  { value: "cli", label: "CLI Tool", needsKey: false },
  { value: "none", label: "Skip for now", needsKey: false },
];

type Step = "welcome" | "ai" | "profile" | "content" | "done";

export function Onboarding({
  onComplete,
}: {
  onComplete: () => void;
}) {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("welcome");

  // AI state
  const [provider, setProvider] = useState("claude");
  const [apiKey, setApiKey] = useState("");
  const [ollamaUrl, setOllamaUrl] = useState("http://localhost:11434");
  const [cliCommand, setCliCommand] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [testResult, setTestResult] = useState<"ok" | "fail" | null>(null);
  const [testing, setTesting] = useState(false);

  // Profile state
  const [role, setRole] = useState("");
  const [domain, setDomain] = useState("");
  const [context, setContext] = useState("");

  // Content state
  const [subjectName, setSubjectName] = useState("");
  const [creating, setCreating] = useState(false);

  const [saving, setSaving] = useState(false);

  const saveAiConfig = useCallback(async () => {
    setSaving(true);
    try {
      const cfg = await getConfig();
      const ai = { ...cfg.ai, provider };

      const keyMap: Record<string, string> = {
        claude: "claude_api_key",
        openai: "openai_api_key",
        gemini: "gemini_api_key",
        deepseek: "deepseek_api_key",
      };
      if (keyMap[provider]) {
        (ai as Record<string, unknown>)[keyMap[provider]] = apiKey;
      }
      if (provider === "ollama") ai.ollama_url = ollamaUrl;
      if (provider === "cli") ai.cli_command = cliCommand;

      await saveConfig({ ...cfg, ai });
    } catch {
      // non-critical
    } finally {
      setSaving(false);
    }
  }, [provider, apiKey, ollamaUrl, cliCommand]);

  const saveProfile = useCallback(async () => {
    setSaving(true);
    try {
      const cfg = await getConfig();
      await saveConfig({
        ...cfg,
        profile: { role, domain, learning_context: context },
      });
    } catch {
      // non-critical
    } finally {
      setSaving(false);
    }
  }, [role, domain, context]);

  const handleTestConnection = useCallback(async () => {
    setTesting(true);
    setTestResult(null);
    try {
      await saveAiConfig();
      const status = await checkAiStatus();
      setTestResult(status.configured && status.has_api_key ? "ok" : "fail");
    } catch {
      setTestResult("fail");
    } finally {
      setTesting(false);
    }
  }, [saveAiConfig]);

  const handleCreateSubject = useCallback(async () => {
    if (!subjectName.trim()) return;
    setCreating(true);
    try {
      await createSubject(subjectName.trim());
    } catch {
      // non-critical
    } finally {
      setCreating(false);
    }
  }, [subjectName]);

  const handleFinish = useCallback(async () => {
    // Save profile if filled
    if (role || domain || context) await saveProfile();
    onComplete();
    navigate("/workspace");
  }, [role, domain, context, saveProfile, onComplete, navigate]);

  const inputClass =
    "h-11 w-full rounded-xl border border-border bg-surface px-4 text-sm text-text placeholder:text-text-muted/50 focus:border-accent/40 focus:outline-none";

  const needsKey = ["claude", "openai", "gemini", "deepseek"].includes(
    provider,
  );

  return (
    <div className="flex h-screen items-center justify-center bg-bg">
      <div className="w-full max-w-lg px-6">
        {/* Welcome */}
        {step === "welcome" && (
          <div className="text-center">
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-accent/10">
              <GraduationCap size={36} className="text-accent" />
            </div>
            <h1 className="mb-2 text-2xl font-bold tracking-tight text-text">
              Welcome to Encode
            </h1>
            <p className="mb-8 text-sm leading-relaxed text-text-muted">
              Your local-first study engine. Import notes, read in chunks, test
              your understanding, and master material through spaced repetition.
            </p>
            <button
              type="button"
              onClick={() => setStep("ai")}
              className="inline-flex h-12 items-center gap-2 rounded-xl bg-accent px-8 text-sm font-semibold text-white shadow-sm transition-all hover:bg-accent/90"
            >
              Get Started
              <ChevronRight size={16} />
            </button>
          </div>
        )}

        {/* AI Setup */}
        {step === "ai" && (
          <div>
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10">
                <Sparkles size={18} className="text-accent" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-text">AI Provider</h2>
                <p className="text-xs text-text-muted">
                  Powers quiz generation and answer evaluation
                </p>
              </div>
            </div>

            <div className="space-y-4 rounded-xl border border-border bg-panel p-5">
              <div>
                <label
                  htmlFor="ob-provider"
                  className="mb-1.5 block text-xs font-medium text-text-muted"
                >
                  Provider
                </label>
                <select
                  id="ob-provider"
                  value={provider}
                  onChange={(e) => {
                    setProvider(e.target.value);
                    setApiKey("");
                    setTestResult(null);
                  }}
                  className={`${inputClass} appearance-none`}
                >
                  {PROVIDERS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>

              {needsKey && (
                <div>
                  <label
                    htmlFor="ob-key"
                    className="mb-1.5 block text-xs font-medium text-text-muted"
                  >
                    API Key
                  </label>
                  <div className="relative">
                    <input
                      id="ob-key"
                      type={showKey ? "text" : "password"}
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder={`Enter your ${provider} API key`}
                      className={`${inputClass} pr-10`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey(!showKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted/50 hover:text-text-muted"
                    >
                      {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>
              )}

              {provider === "ollama" && (
                <div>
                  <label
                    htmlFor="ob-ollama"
                    className="mb-1.5 block text-xs font-medium text-text-muted"
                  >
                    Ollama URL
                  </label>
                  <input
                    id="ob-ollama"
                    type="text"
                    value={ollamaUrl}
                    onChange={(e) => setOllamaUrl(e.target.value)}
                    placeholder="http://localhost:11434"
                    className={inputClass}
                  />
                </div>
              )}

              {provider === "cli" && (
                <div>
                  <label
                    htmlFor="ob-cli"
                    className="mb-1.5 block text-xs font-medium text-text-muted"
                  >
                    CLI Command
                  </label>
                  <input
                    id="ob-cli"
                    type="text"
                    value={cliCommand}
                    onChange={(e) => setCliCommand(e.target.value)}
                    placeholder="e.g., claude, encode-claude.sh"
                    className={inputClass}
                  />
                </div>
              )}

              {provider !== "none" && (
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={testing}
                    className="h-9 rounded-lg border border-border bg-panel-alt px-4 text-xs font-medium text-text-muted transition-all hover:bg-panel-active disabled:opacity-40"
                  >
                    {testing ? "Testing..." : "Test Connection"}
                  </button>
                  {testResult === "ok" && (
                    <span className="flex items-center gap-1.5 text-xs text-teal">
                      <CheckCircle2 size={12} /> Connected
                    </span>
                  )}
                  {testResult === "fail" && (
                    <span className="flex items-center gap-1.5 text-xs text-coral">
                      <XCircle size={12} /> Check your key
                    </span>
                  )}
                </div>
              )}

              {provider === "none" && (
                <p className="text-xs text-text-muted/60">
                  You can configure AI later in Settings. Quizzes require an AI
                  provider.
                </p>
              )}
            </div>

            <div className="mt-6 flex justify-between">
              <button
                type="button"
                onClick={() => setStep("welcome")}
                className="text-xs text-text-muted hover:text-text"
              >
                Back
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (provider !== "none") await saveAiConfig();
                  setStep("profile");
                }}
                disabled={saving}
                className="h-10 rounded-xl bg-accent px-6 text-xs font-semibold text-white transition-all hover:bg-accent/90 disabled:opacity-40"
              >
                {provider === "none" ? "Skip" : "Next"}
              </button>
            </div>
          </div>
        )}

        {/* Profile */}
        {step === "profile" && (
          <div>
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10">
                <User size={18} className="text-accent" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-text">About You</h2>
                <p className="text-xs text-text-muted">
                  Helps AI tailor responses to your background
                </p>
              </div>
            </div>

            <div className="space-y-4 rounded-xl border border-border bg-panel p-5">
              <div>
                <label
                  htmlFor="ob-role"
                  className="mb-1.5 block text-xs font-medium text-text-muted"
                >
                  Your Role
                </label>
                <input
                  id="ob-role"
                  type="text"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  placeholder="e.g., Computer Science student, DevOps engineer"
                  className={inputClass}
                />
              </div>

              <div>
                <label
                  htmlFor="ob-domain"
                  className="mb-1.5 block text-xs font-medium text-text-muted"
                >
                  Study Domain
                </label>
                <input
                  id="ob-domain"
                  type="text"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  placeholder="e.g., cloud infrastructure, data science"
                  className={inputClass}
                />
              </div>

              <div>
                <label
                  htmlFor="ob-context"
                  className="mb-1.5 block text-xs font-medium text-text-muted"
                >
                  Learning Context
                </label>
                <textarea
                  id="ob-context"
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                  placeholder="e.g., Preparing for AWS Solutions Architect cert"
                  rows={2}
                  className="w-full resize-none rounded-xl border border-border bg-surface px-4 py-3 text-sm text-text placeholder:text-text-muted/50 focus:border-accent/40 focus:outline-none"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-between">
              <button
                type="button"
                onClick={() => setStep("ai")}
                className="text-xs text-text-muted hover:text-text"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => setStep("content")}
                className="h-10 rounded-xl bg-accent px-6 text-xs font-semibold text-white transition-all hover:bg-accent/90"
              >
                {role || domain || context ? "Next" : "Skip"}
              </button>
            </div>
          </div>
        )}

        {/* First Content */}
        {step === "content" && (
          <div>
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10">
                <BookOpen size={18} className="text-accent" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-text">
                  Create Your First Subject
                </h2>
                <p className="text-xs text-text-muted">
                  A subject groups your chapters and study material
                </p>
              </div>
            </div>

            <div className="space-y-4 rounded-xl border border-border bg-panel p-5">
              <div>
                <label
                  htmlFor="ob-subject"
                  className="mb-1.5 block text-xs font-medium text-text-muted"
                >
                  Subject Name
                </label>
                <input
                  id="ob-subject"
                  type="text"
                  value={subjectName}
                  onChange={(e) => setSubjectName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreateSubject();
                  }}
                  placeholder="e.g., AWS Solutions Architect, Python, Docker"
                  className={inputClass}
                />
              </div>

              {subjectName.trim() && (
                <button
                  type="button"
                  onClick={handleCreateSubject}
                  disabled={creating}
                  className="h-9 rounded-lg bg-accent px-4 text-xs font-medium text-white transition-all hover:bg-accent/90 disabled:opacity-40"
                >
                  {creating ? "Creating..." : "Create Subject"}
                </button>
              )}
            </div>

            <div className="mt-6 flex justify-between">
              <button
                type="button"
                onClick={() => setStep("profile")}
                className="text-xs text-text-muted hover:text-text"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleFinish}
                disabled={saving}
                className="h-10 rounded-xl bg-accent px-6 text-xs font-semibold text-white transition-all hover:bg-accent/90 disabled:opacity-40"
              >
                {subjectName.trim() ? "Finish" : "Skip & Finish"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
