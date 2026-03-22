import { useState } from "react";
import { useVaultStore } from "../../stores/vault";
import { importUrl } from "../../lib/tauri";

interface ImportDialogProps {
  onClose: () => void;
  onImported: (filePath: string) => void;
}

export default function ImportDialog({ onClose, onImported }: ImportDialogProps) {
  const { subjects } = useVaultStore();
  const [url, setUrl] = useState("");
  const [subject, setSubject] = useState(subjects[0]?.slug ?? "");
  const [topic, setTopic] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleImport = async () => {
    if (!url.trim() || !subject) return;
    setLoading(true);
    setError(null);
    try {
      const filePath = await importUrl(
        url.trim(),
        subject,
        topic.trim() || undefined,
      );
      onImported(filePath);
    } catch (e) {
      setError(String(e));
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-surface border border-border rounded-lg p-6 w-[480px] max-w-[90vw] space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Import from URL</h3>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text text-lg"
          >
            &times;
          </button>
        </div>

        <div>
          <label className="block text-xs text-text-muted mb-1">URL</label>
          <input
            type="url"
            autoFocus
            placeholder="https://..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="w-full px-3 py-2 bg-surface-2 border border-border rounded text-sm text-text placeholder:text-text-muted focus:outline-none focus:border-purple"
          />
        </div>

        <div>
          <label className="block text-xs text-text-muted mb-1">Subject</label>
          <select
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full px-3 py-2 bg-surface-2 border border-border rounded text-sm text-text focus:outline-none focus:border-purple"
          >
            {subjects.map((s) => (
              <option key={s.slug} value={s.slug}>
                {s.name}
              </option>
            ))}
          </select>
          {subjects.length === 0 && (
            <p className="text-xs text-coral mt-1">
              Create a subject first in the vault browser.
            </p>
          )}
        </div>

        <div>
          <label className="block text-xs text-text-muted mb-1">
            Topic (optional — auto-detected from page title)
          </label>
          <input
            type="text"
            placeholder="e.g. Normalization - 2NF"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            className="w-full px-3 py-2 bg-surface-2 border border-border rounded text-sm text-text placeholder:text-text-muted focus:outline-none focus:border-purple"
          />
        </div>

        {error && (
          <p className="text-sm text-coral bg-coral/10 rounded px-3 py-2">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-text-muted border border-border rounded hover:text-text transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={!url.trim() || !subject || loading}
            className="px-6 py-2 text-sm bg-purple text-white rounded font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {loading ? "Importing..." : "Import"}
          </button>
        </div>
      </div>
    </div>
  );
}
