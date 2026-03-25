import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppStore } from "../stores/app";
import { listSubjects, getSubjectGrades, type SubjectGrade } from "../lib/tauri";
import { useFlashcardStore } from "../stores/flashcard";

export default function Home() {
  const navigate = useNavigate();
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
  const { allCards, loadAllCards } = useFlashcardStore();
  const [subjectCount, setSubjectCount] = useState(0);
  const [grades, setGrades] = useState<SubjectGrade[]>([]);

  const todayStr = new Date().toISOString().slice(0, 10);
  const dueCount = allCards.filter((c) => c.nextReview <= todayStr).length;
  const today = todayStr;
  const dayOfWeek = new Date().toLocaleDateString("en-US", {
    weekday: "long",
  });

  useEffect(() => {
    loadToday();
    loadStreak();
    loadAllCards();
    listSubjects()
      .then((s) => setSubjectCount(s.length))
      .catch(() => setSubjectCount(0));
    getSubjectGrades().then(setGrades);
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
    <div className="max-w-xl mx-auto py-12 px-8">
      {/* Study Dashboard */}
      <div className="mb-12">
        <p className="text-xs text-text-muted uppercase tracking-wider mb-4">
          Today&apos;s Study
        </p>
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-surface rounded border border-border p-4 text-center">
            <p className={`text-3xl font-bold ${dueCount > 0 ? "text-coral" : "text-text-muted"}`}>
              {dueCount}
            </p>
            <p className="text-xs text-text-muted mt-1">Cards Due</p>
          </div>
          <div className="bg-surface rounded border border-border p-4 text-center">
            <p className="text-3xl font-bold text-purple">{subjectCount}</p>
            <p className="text-xs text-text-muted mt-1">Subjects</p>
          </div>
          <div className="bg-surface rounded border border-border p-4 text-center">
            <p className="text-3xl font-bold text-teal">
              {streak?.current || 0}
            </p>
            <p className="text-xs text-text-muted mt-1">Day Streak</p>
          </div>
        </div>
        {dueCount > 0 && (
          <button
            onClick={() => navigate("/flashcards")}
            className="w-full py-3 bg-purple text-white rounded font-medium hover:opacity-90 transition-opacity"
          >
            Start Review ({dueCount} cards)
          </button>
        )}

        {/* Subject Grades */}
        {grades.length > 0 && (
          <div className="mt-6">
            <p className="text-xs text-text-muted uppercase tracking-wider mb-3">Quiz Grades</p>
            <div className="space-y-2">
              {grades.map((g) => (
                <div key={g.subject} className="flex items-center justify-between bg-surface rounded border border-border px-4 py-2.5">
                  <div>
                    <p className="text-sm text-text">{g.subject}</p>
                    <p className="text-[10px] text-text-muted">
                      {g.total_quizzes} quizzes
                      {g.last_quiz_date && ` · Last: ${g.last_quiz_date.split("T")[0]}`}
                    </p>
                  </div>
                  <span className={`text-lg font-bold ${
                    g.avg_score >= 80 ? "text-teal" : g.avg_score >= 60 ? "text-amber" : "text-coral"
                  }`}>
                    {Math.round(g.avg_score)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* One Thing */}
      <div className="mb-8 text-center">
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
