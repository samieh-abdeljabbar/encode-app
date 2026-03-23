import { useEffect, useState } from "react";
import { useAppStore } from "../stores/app";
import { rebuildIndex, getVaultPath, checkOllama, listOllamaModels } from "../lib/tauri";

const POPULAR_MODELS = [
  { id: "llama3.1:8b", name: "Llama 3.1 8B", size: "4.7 GB", desc: "Best general-purpose local model" },
  { id: "deepseek-r1:8b", name: "DeepSeek R1 8B", size: "4.9 GB", desc: "Strong reasoning, great for study Q&A" },
  { id: "deepseek-coder-v2:16b", name: "DeepSeek Coder V2 16B", size: "8.9 GB", desc: "Code + reasoning, needs 16GB RAM" },
  { id: "mistral:7b", name: "Mistral 7B", size: "4.1 GB", desc: "Fast and capable, low resource usage" },
  { id: "phi3:latest", name: "Phi-3 Mini", size: "2.2 GB", desc: "Smallest, runs on any machine" },
  { id: "gemma2:9b", name: "Gemma 2 9B", size: "5.4 GB", desc: "Google's open model, strong at tasks" },
  { id: "qwen2.5:7b", name: "Qwen 2.5 7B", size: "4.4 GB", desc: "Excellent multilingual, good at math" },
];

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

      {/* AI Provider */}
      <section className="space-y-4">
        <h3 className="text-sm font-medium uppercase tracking-wider text-text-muted">AI Provider</h3>

        <div className="grid grid-cols-2 gap-2">
          {(["none", "ollama", "claude", "gemini"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setProvider(p)}
              className={`px-4 py-3 rounded-lg border text-left transition-colors ${
                provider === p
                  ? "border-purple bg-purple/10 text-text"
                  : "border-border bg-surface text-text-muted hover:border-purple/50"
              }`}
            >
              <span className="text-sm font-medium capitalize block">
                {p === "none" ? "No AI" : p}
              </span>
              <span className="text-xs text-text-muted">
                {p === "none" && "Study without AI feedback"}
                {p === "ollama" && "Local models (free, private)"}
                {p === "claude" && "Anthropic API (best quality)"}
                {p === "gemini" && "Google API (fast, free tier)"}
              </span>
              {p === "ollama" && (
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

              {showGuide && (
                <div className="mt-3 p-4 bg-[#0f0f0f] rounded border border-border space-y-3 text-xs">
                  <div>
                    <p className="text-text font-medium mb-1">1. Install Ollama</p>
                    <p className="text-text-muted">
                      Download from{" "}
                      <button
                        onClick={() => window.open("https://ollama.com", "_blank")}
                        className="text-purple hover:underline"
                      >
                        ollama.com
                      </button>
                      {" "}and install. It runs as a background service.
                    </p>
                  </div>

                  <div>
                    <p className="text-text font-medium mb-1">2. Download a model</p>
                    <p className="text-text-muted mb-2">Open Terminal and run one of these:</p>
                    <div className="space-y-1.5">
                      {POPULAR_MODELS.map((m) => (
                        <div key={m.id} className="flex items-center justify-between bg-surface-2 rounded px-3 py-1.5">
                          <code className="text-coral font-mono text-[11px]">ollama pull {m.id}</code>
                          <span className="text-text-muted text-[10px]">{m.size}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-text font-medium mb-1">3. Start using</p>
                    <p className="text-text-muted">
                      Once downloaded, select the model above and Encode will connect automatically.
                      Models run 100% locally — your data never leaves your machine.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Claude / Gemini API Key */}
        {(provider === "claude" || provider === "gemini") && (
          <div className="p-4 bg-surface rounded-lg border border-border">
            <label className="block text-xs text-text-muted mb-2">
              {provider === "claude" ? "Claude (Anthropic)" : "Gemini (Google)"} API Key
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
            </p>
          </div>
        )}
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
        <p className="text-sm text-text-muted bg-surface rounded px-3 py-2 border border-border font-mono text-xs">
          {vaultPath}
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
