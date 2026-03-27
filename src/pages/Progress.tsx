import { useEffect, useState } from "react";
import { listSubjects, getSubjectMastery } from "../lib/tauri";
import type { Subject, SubjectMastery } from "../lib/types";

export default function ProgressPage() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [mastery, setMastery] = useState<Map<string, SubjectMastery>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const subs = await listSubjects();
      setSubjects(subs);

      const m = new Map<string, SubjectMastery>();
      for (const s of subs) {
        try {
          const data = await getSubjectMastery(s.name);
          m.set(s.slug, data);
        } catch { /* */ }
      }
      setMastery(m);
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-6 h-6 border-2 border-purple/30 border-t-purple rounded-full animate-spin mx-auto mb-2" />
          <p className="text-text-muted text-sm">Loading progress...</p>
        </div>
      </div>
    );
  }

  if (subjects.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-text-muted mb-2">No subjects yet.</p>
          <p className="text-text-muted text-sm">Import content to start tracking progress.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-6">
      <h1 className="text-lg font-semibold text-text mb-1">Study Progress</h1>
      <p className="text-xs text-text-muted mb-6">Track your mastery across subjects and chapters</p>

      <div className="space-y-6">
        {subjects.map((subject) => {
          const data = mastery.get(subject.slug);
          if (!data) return null;

          // Calculate overall mastery score (weighted: 40% chapters, 40% quiz, 20% card retention)
          const chapterProgress = data.chapters_total > 0 ? data.chapters_read / data.chapters_total : 0;
          const quizScore = data.avg_quiz_score / 100;
          const cardRetention = data.cards_total > 0 ? 1 - data.cards_due / data.cards_total : 0;
          const overallMastery = Math.round((chapterProgress * 0.4 + quizScore * 0.4 + cardRetention * 0.2) * 100);

          const masteryColor = overallMastery >= 80 ? "#1D9E75" : overallMastery >= 50 ? "#BA7517" : "#D85A30";
          const chaptersRemaining = data.chapters_total - data.chapters_read;

          // Test readiness: green when mastery > 80% and all chapters read
          const testReady = overallMastery >= 80 && chaptersRemaining === 0;
          const testReadyColor = testReady ? "#1D9E75" : overallMastery >= 60 ? "#BA7517" : "#D85A30";

          return (
            <div key={subject.slug} className="bg-surface rounded-xl border border-border overflow-hidden">
              <div className="p-5">
                <div className="flex items-start gap-4">
                  {/* Mastery ring */}
                  <div className="relative w-20 h-20 shrink-0">
                    <svg viewBox="0 0 36 36" className="w-20 h-20 -rotate-90">
                      <circle cx="18" cy="18" r="15" fill="none" stroke="var(--color-surface-2, #252525)" strokeWidth="2.5" />
                      <circle cx="18" cy="18" r="15" fill="none" stroke={masteryColor} strokeWidth="2.5"
                        strokeDasharray={`${overallMastery * 0.942} 94.2`} strokeLinecap="round" />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-lg font-bold" style={{ color: masteryColor }}>{overallMastery}%</span>
                      <span className="text-[8px] text-text-muted">mastery</span>
                    </div>
                  </div>

                  {/* Subject info */}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-semibold text-text">{subject.name}</h3>

                    {/* Stats grid */}
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 mt-3 text-xs">
                      <div className="flex justify-between">
                        <span className="text-text-muted">Chapters</span>
                        <span className="text-text">{data.chapters_read} / {data.chapters_total}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-text-muted">Remaining</span>
                        <span className={chaptersRemaining > 0 ? "text-amber" : "text-teal"}>{chaptersRemaining} chapters</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-text-muted">Quiz Score</span>
                        <span className="text-text">{Math.round(data.avg_quiz_score)}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-text-muted">Cards</span>
                        <span className="text-text">{data.cards_total} total{data.cards_due > 0 ? `, ${data.cards_due} due` : ""}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Test Readiness Bar */}
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-medium text-text-muted uppercase tracking-wider">Test Readiness</span>
                    <span className="text-[10px] font-medium" style={{ color: testReadyColor }}>
                      {testReady ? "Ready" : overallMastery >= 60 ? "Getting There" : "Keep Studying"}
                    </span>
                  </div>
                  <div className="h-2 bg-surface-2 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${overallMastery}%`, backgroundColor: testReadyColor }}
                    />
                  </div>
                  {chaptersRemaining > 0 && (
                    <p className="text-[10px] text-text-muted mt-1.5">
                      {chaptersRemaining} chapter{chaptersRemaining !== 1 ? "s" : ""} left to read
                      {data.avg_quiz_score > 0 && data.avg_quiz_score < 80 && " · quiz scores need work"}
                    </p>
                  )}
                  {chaptersRemaining === 0 && overallMastery < 80 && (
                    <p className="text-[10px] text-text-muted mt-1.5">
                      All chapters read — focus on quizzes and card review to build mastery
                    </p>
                  )}
                  {testReady && (
                    <p className="text-[10px] text-teal mt-1.5">
                      Strong mastery across reading, quizzes, and retention. You're ready.
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
