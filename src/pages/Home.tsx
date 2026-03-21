import { useEffect, useState } from "react";
import { useAppStore } from "../stores/app";

export default function Home() {
  const {
    dailyCommitment,
    streak,
    loading,
    loadToday,
    loadStreak,
    saveDailyCommitment,
  } = useAppStore();

  const [cue, setCue] = useState("");
  const [action, setAction] = useState("");
  const [reflection, setReflection] = useState("");
  const [saving, setSaving] = useState(false);

  const today = new Date().toISOString().slice(0, 10);
  const dayOfWeek = new Date().toLocaleDateString("en-US", {
    weekday: "long",
  });

  useEffect(() => {
    loadToday();
    loadStreak();
  }, [loadToday, loadStreak]);

  useEffect(() => {
    if (dailyCommitment) {
      setCue(dailyCommitment.cue);
      setAction(dailyCommitment.action);
      setReflection(dailyCommitment.reflection ?? "");
    }
  }, [dailyCommitment]);

  const handleSave = async () => {
    if (!action.trim()) return;
    setSaving(true);
    await saveDailyCommitment({
      date: today,
      cue: cue.trim(),
      action: action.trim(),
      completed: dailyCommitment?.completed ?? false,
      completed_at: dailyCommitment?.completed_at ?? null,
      reflection: null,
    });
    await loadStreak();
    setSaving(false);
  };

  const handleComplete = async () => {
    if (!dailyCommitment) return;
    setSaving(true);
    const now = new Date().toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
    await saveDailyCommitment({
      ...dailyCommitment,
      completed: true,
      completed_at: now,
      reflection: reflection.trim() || null,
    });
    await loadStreak();
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-text-muted">Loading...</p>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto py-16 px-8">
      {/* Header */}
      <div className="mb-12 text-center">
        <p className="text-text-muted text-sm mb-1">{dayOfWeek}</p>
        <h2 className="text-2xl font-bold mb-2">One Thing</h2>
        {streak && streak.current > 0 && (
          <p className="text-teal text-sm">Day {streak.current}</p>
        )}
      </div>

      {/* If no commitment yet today */}
      {!dailyCommitment ? (
        <div className="space-y-6">
          <p className="text-text-muted text-center">
            What is the one encoding action you&apos;re committing to today?
          </p>

          <div>
            <label className="block text-xs text-text-muted mb-1">
              Cue (when will you do it?)
            </label>
            <input
              type="text"
              placeholder="After my morning coffee"
              value={cue}
              onChange={(e) => setCue(e.target.value)}
              className="w-full px-4 py-3 bg-surface border border-border rounded text-sm text-text placeholder:text-text-muted focus:outline-none focus:border-purple"
            />
          </div>

          <div>
            <label className="block text-xs text-text-muted mb-1">
              Action (one specific thing)
            </label>
            <input
              type="text"
              placeholder="Read and digest one section of D426 Chapter 3"
              value={action}
              onChange={(e) => setAction(e.target.value)}
              className="w-full px-4 py-3 bg-surface border border-border rounded text-sm text-text placeholder:text-text-muted focus:outline-none focus:border-purple"
            />
          </div>

          <button
            onClick={handleSave}
            disabled={!action.trim() || saving}
            className="w-full py-3 bg-purple text-white rounded font-medium text-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {saving ? "Saving..." : "Commit"}
          </button>
        </div>
      ) : !dailyCommitment.completed ? (
        /* Commitment set but not completed */
        <div className="space-y-6">
          <div className="bg-surface rounded-lg p-6 border border-border">
            <p className="text-xs text-text-muted mb-1">
              Today&apos;s commitment
            </p>
            <p className="text-text font-medium">{dailyCommitment.action}</p>
            {dailyCommitment.cue && (
              <p className="text-text-muted text-sm mt-2">
                Cue: {dailyCommitment.cue}
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs text-text-muted mb-1">
              Reflection (optional)
            </label>
            <textarea
              placeholder="What did you learn? What surprised you?"
              value={reflection}
              onChange={(e) => setReflection(e.target.value)}
              rows={3}
              className="w-full px-4 py-3 bg-surface border border-border rounded text-sm text-text placeholder:text-text-muted focus:outline-none focus:border-purple resize-none"
            />
          </div>

          <button
            onClick={handleComplete}
            disabled={saving}
            className="w-full py-3 bg-teal text-white rounded font-medium text-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {saving ? "Saving..." : "Mark Complete"}
          </button>
        </div>
      ) : (
        /* Completed */
        <div className="space-y-6 text-center">
          <div className="bg-surface rounded-lg p-6 border border-border">
            <p className="text-teal font-medium mb-2">Done</p>
            <p className="text-text">{dailyCommitment.action}</p>
            {dailyCommitment.completed_at && (
              <p className="text-text-muted text-sm mt-2">
                Completed at {dailyCommitment.completed_at}
              </p>
            )}
            {dailyCommitment.reflection && (
              <p className="text-text-muted text-sm mt-3 italic">
                {dailyCommitment.reflection}
              </p>
            )}
          </div>

          {streak && (
            <p className="text-text-muted text-sm">
              {streak.current} day streak
              {streak.longest > streak.current
                ? ` (best: ${streak.longest})`
                : ""}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
