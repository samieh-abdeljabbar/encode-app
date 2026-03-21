import { useEffect, useState } from "react";
import { useAppStore } from "../stores/app";
import { rebuildIndex, getVaultPath } from "../lib/tauri";

export default function Settings() {
  const { config, loadConfig, saveConfig } = useAppStore();
  const [vaultPath, setVaultPath] = useState("");
  const [provider, setProvider] = useState("none");
  const [ollamaModel, setOllamaModel] = useState("llama3.1:8b");
  const [ollamaUrl, setOllamaUrl] = useState("http://localhost:11434");
  const [ollamaStatus, setOllamaStatus] = useState<
    "checking" | "available" | "unavailable"
  >("checking");
  const [indexCount, setIndexCount] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadConfig();
    getVaultPath()
      .then(setVaultPath)
      .catch(() => {});
  }, [loadConfig]);

  useEffect(() => {
    if (config) {
      setProvider(config.ai_provider);
      setOllamaModel(config.ollama_model);
      setOllamaUrl(config.ollama_url);
    }
  }, [config]);

  // Check Ollama availability
  useEffect(() => {
    setOllamaStatus("checking");
    fetch(`${ollamaUrl}/api/tags`)
      .then((res) => {
        setOllamaStatus(res.ok ? "available" : "unavailable");
      })
      .catch(() => setOllamaStatus("unavailable"));
  }, [ollamaUrl]);

  const handleSave = async () => {
    setSaving(true);
    await saveConfig({
      vault_path: vaultPath,
      ai_provider: provider as "ollama" | "claude" | "gemini" | "none",
      ollama_model: ollamaModel,
      ollama_url: ollamaUrl,
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

      {/* Vault Path */}
      <section>
        <h3 className="text-sm font-medium mb-2">Vault Location</h3>
        <p className="text-sm text-text-muted bg-surface rounded px-3 py-2 border border-border font-mono">
          {vaultPath}
        </p>
      </section>

      {/* AI Provider */}
      <section className="space-y-4">
        <h3 className="text-sm font-medium">AI Provider</h3>

        <div className="space-y-2">
          {(["none", "ollama", "claude", "gemini"] as const).map((p) => (
            <label key={p} className="flex items-center gap-3 cursor-pointer">
              <input
                type="radio"
                name="provider"
                value={p}
                checked={provider === p}
                onChange={() => setProvider(p)}
                className="accent-purple"
              />
              <span className="text-sm capitalize">
                {p === "none" ? "None (no AI)" : p}
              </span>
              {p === "ollama" && (
                <span
                  className={`text-xs px-2 py-0.5 rounded ${
                    ollamaStatus === "available"
                      ? "bg-teal/20 text-teal"
                      : ollamaStatus === "unavailable"
                        ? "bg-coral/20 text-coral"
                        : "bg-amber/20 text-amber"
                  }`}
                >
                  {ollamaStatus}
                </span>
              )}
            </label>
          ))}
        </div>

        {provider === "ollama" && (
          <div className="ml-6 space-y-3">
            <div>
              <label className="block text-xs text-text-muted mb-1">
                Model
              </label>
              <input
                type="text"
                value={ollamaModel}
                onChange={(e) => setOllamaModel(e.target.value)}
                className="w-full px-3 py-2 bg-surface border border-border rounded text-sm text-text focus:outline-none focus:border-purple"
              />
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">URL</label>
              <input
                type="text"
                value={ollamaUrl}
                onChange={(e) => setOllamaUrl(e.target.value)}
                className="w-full px-3 py-2 bg-surface border border-border rounded text-sm text-text focus:outline-none focus:border-purple"
              />
            </div>
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

      {/* Index Management */}
      <section className="border-t border-border pt-6">
        <h3 className="text-sm font-medium mb-2">Search Index</h3>
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
