import { Flame, Layers, Sparkles, TrendingUp, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getPracticeBucketCounts } from "../../lib/tauri";
import type { PracticeBucketCounts, Subject } from "../../lib/tauri";

interface Props {
  open: boolean;
  onClose: () => void;
  subjects: Subject[];
  initialSubjectId: number | null;
}

const MODES = [
  {
    key: "new",
    label: "New",
    description: "Cards you haven't seen yet",
    icon: Sparkles,
    accentClass: "text-accent",
    bgClass: "bg-accent/6",
    borderClass: "border-accent/20 hover:border-accent/40",
    countKey: "new_cards" as const,
  },
  {
    key: "struggling",
    label: "Struggling",
    description: "Cards you've missed recently",
    icon: Flame,
    accentClass: "text-coral",
    bgClass: "bg-coral/6",
    borderClass: "border-coral/20 hover:border-coral/40",
    countKey: "struggling" as const,
  },
  {
    key: "building",
    label: "Building",
    description: "Cards you're getting better at",
    icon: TrendingUp,
    accentClass: "text-amber",
    bgClass: "bg-amber/6",
    borderClass: "border-amber/20 hover:border-amber/40",
    countKey: "building" as const,
  },
  {
    key: "all",
    label: "All",
    description: "Every card in this subject",
    icon: Layers,
    accentClass: "text-teal",
    bgClass: "bg-teal/6",
    borderClass: "border-teal/20 hover:border-teal/40",
    countKey: "all" as const,
  },
];

export function PracticeSetup({
  open,
  onClose,
  subjects,
  initialSubjectId,
}: Props) {
  const navigate = useNavigate();
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | null>(
    initialSubjectId,
  );
  const [counts, setCounts] = useState<PracticeBucketCounts | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync initial subject when overlay opens
  useEffect(() => {
    if (open) {
      setSelectedSubjectId(initialSubjectId);
    }
  }, [open, initialSubjectId]);

  // Fetch counts when subject changes
  const loadCounts = useCallback(async (subjectId: number | null) => {
    if (subjectId === null) {
      setCounts(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await getPracticeBucketCounts(subjectId);
      setCounts(data);
    } catch (e) {
      console.error("Failed to load practice bucket counts", e);
      setCounts(null);
      setError("Couldn't load card stats for this subject.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      loadCounts(selectedSubjectId);
    }
  }, [open, selectedSubjectId, loadCounts]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  const startPractice = (mode: string) => {
    if (!selectedSubjectId) return;
    navigate(`/review?practice=${mode}&subject=${selectedSubjectId}`);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-text/10 backdrop-blur-[2px]"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-md rounded-2xl border border-border bg-panel p-6 shadow-xl shadow-text/5"
        onClick={(e) => e.stopPropagation()}
        aria-label="Practice Setup"
      >
        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-tight text-text">
            Practice
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close practice setup"
            className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-panel-alt hover:text-text"
          >
            <X size={15} />
          </button>
        </div>

        {/* Subject picker */}
        <div className="mb-5">
          <label
            htmlFor="practice-subject"
            className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.1em] text-text-muted"
          >
            Subject
          </label>
          <select
            id="practice-subject"
            value={selectedSubjectId ?? ""}
            onChange={(e) =>
              setSelectedSubjectId(
                e.target.value === "" ? null : Number(e.target.value),
              )
            }
            className="h-10 w-full rounded-xl border border-border bg-panel px-3 text-sm text-text focus:border-accent/40 focus:outline-none"
          >
            <option value="">Pick a subject...</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        {/* No subject selected */}
        {selectedSubjectId === null && (
          <div className="rounded-xl border border-dashed border-border bg-panel-alt/50 px-4 py-8 text-center">
            <p className="text-sm text-text-muted">
              Pick a subject to get started.
            </p>
          </div>
        )}

        {/* Loading */}
        {selectedSubjectId !== null && loading && (
          <div className="flex justify-center py-8">
            <p className="text-sm text-text-muted">Loading...</p>
          </div>
        )}

        {/* Error */}
        {selectedSubjectId !== null && !loading && error && (
          <div className="rounded-xl border border-coral/20 bg-coral/5 px-4 py-4 text-center">
            <p className="text-sm text-coral">{error}</p>
            <button
              type="button"
              onClick={() => loadCounts(selectedSubjectId)}
              className="mt-3 rounded-lg border border-coral/20 px-3 py-1.5 text-xs font-medium text-coral transition-all hover:bg-coral/10"
            >
              Try again
            </button>
          </div>
        )}

        {/* Mode cards */}
        {selectedSubjectId !== null &&
          !loading &&
          !error &&
          counts &&
          (counts.all === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-panel-alt/50 px-4 py-8 text-center">
              <p className="text-sm font-medium text-text-muted">
                No active cards in this subject
              </p>
              <p className="mt-1 text-xs text-text-muted/60">
                Create some cards or import a chapter first.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {MODES.map((mode) => {
                const count = counts[mode.countKey];
                const disabled = count === 0;
                const Icon = mode.icon;

                return (
                  <button
                    key={mode.key}
                    type="button"
                    disabled={disabled}
                    onClick={() => startPractice(mode.key)}
                    className={`flex flex-col items-start rounded-xl border p-4 text-left transition-all ${
                      disabled
                        ? "cursor-not-allowed border-border/50 opacity-40"
                        : `${mode.borderClass} ${mode.bgClass} hover:-translate-y-0.5 hover:shadow-sm`
                    }`}
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <Icon
                        size={14}
                        className={
                          disabled ? "text-text-muted/40" : mode.accentClass
                        }
                      />
                      <span className="text-xs font-semibold text-text">
                        {mode.label}
                      </span>
                    </div>
                    <p className="mb-3 text-[11px] leading-snug text-text-muted">
                      {mode.description}
                    </p>
                    <span className="text-lg font-semibold text-text">
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
      </div>
    </div>
  );
}
