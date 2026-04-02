import { ClipboardCheck, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  deleteQuiz,
  listChapters,
  listQuizzes,
  listSubjects,
} from "../lib/tauri";
import type { Chapter, QuizListItem, Subject } from "../lib/tauri";

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) return "Just now";
  if (diffMinutes < 60)
    return `${diffMinutes} minute${diffMinutes === 1 ? "" : "s"} ago`;
  if (diffHours < 24)
    return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;

  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function scoreColorClass(score: number | null): string {
  if (score == null) return "bg-surface text-text-muted";
  if (score >= 0.8) return "bg-teal/10 text-teal";
  if (score >= 0.5) return "bg-amber/10 text-amber";
  return "bg-coral/10 text-coral";
}

function QuizRow({
  quiz,
  onClick,
  onDelete,
}: { quiz: QuizListItem; onClick: () => void; onDelete: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-4 rounded-xl border border-border-subtle bg-panel px-4 py-3 text-left transition-all hover:border-accent/30 hover:bg-panel-active"
    >
      {/* Score badge */}
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-bold ${scoreColorClass(quiz.score)}`}
      >
        {quiz.score != null ? `${Math.round(quiz.score * 100)}%` : "\u2014"}
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-text">
          {quiz.chapter_title}
        </p>
        <p className="text-xs text-text-muted">
          {quiz.subject_name} &middot; {quiz.question_count} question
          {quiz.question_count === 1 ? "" : "s"}
        </p>
      </div>

      {/* Date + Actions */}
      <div className="flex shrink-0 items-center gap-2">
        <p className="text-xs text-text-muted">
          {formatRelativeDate(quiz.generated_at)}
        </p>
        {quiz.score != null && quiz.chapter_id != null && (
          <span className="text-[10px] font-medium text-accent">
            Retake &rarr;
          </span>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="ml-1 flex h-7 w-7 items-center justify-center rounded-md text-text-muted/40 opacity-0 transition-all hover:bg-coral/10 hover:text-coral group-hover:opacity-100"
          aria-label="Delete quiz"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </button>
  );
}

export function Quizzes() {
  const navigate = useNavigate();
  const [quizzes, setQuizzes] = useState<QuizListItem[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [filterSubjectId, setFilterSubjectId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showChapterPicker, setShowChapterPicker] = useState(false);
  const [availableChapters, setAvailableChapters] = useState<Chapter[]>([]);

  const loadQuizzes = useCallback(async () => {
    try {
      const data = await listQuizzes(filterSubjectId ?? undefined);
      setQuizzes(data);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [filterSubjectId]);

  useEffect(() => {
    listSubjects()
      .then(setSubjects)
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    loadQuizzes();
  }, [loadQuizzes]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Page header */}
      <div className="shrink-0 border-b border-border-subtle px-7 py-5">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10">
              <ClipboardCheck size={15} className="text-accent" />
            </div>
            <h1 className="text-base font-semibold tracking-tight text-text">
              Quizzes
            </h1>
            {!loading && (
              <span className="rounded-md bg-panel-active px-2 py-0.5 text-[11px] font-medium text-text-muted">
                {quizzes.length}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <select
              value={filterSubjectId ?? ""}
              onChange={(e) =>
                setFilterSubjectId(
                  e.target.value === "" ? null : Number(e.target.value),
                )
              }
              className="h-11 rounded-xl border border-border bg-panel px-4 text-sm text-text focus:border-accent/40 focus:outline-none"
            >
              <option value="">All subjects</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={async () => {
                // Load chapters that are ready for quiz
                try {
                  const chapterLists = await Promise.all(
                    subjects.map((s) => listChapters(s.id)),
                  );
                  const allChapters = subjects.flatMap((s, i) =>
                    chapterLists[i]
                      .filter((c) =>
                        ["ready_for_quiz", "mastering", "stable"].includes(
                          c.status,
                        ),
                      )
                      .map((c) => ({ ...c, subjectName: s.name })),
                  );
                  setAvailableChapters(allChapters);
                  setShowChapterPicker(true);
                } catch {
                  setError("Failed to load chapters");
                }
              }}
              className="flex h-11 items-center gap-1.5 rounded-xl bg-accent px-4 text-xs font-semibold text-white shadow-sm transition-all hover:bg-accent/90"
            >
              <Plus size={14} />
              New Quiz
            </button>
          </div>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-auto">
        <div className="mx-auto max-w-3xl px-7 py-7">
          {/* Chapter picker for new quiz */}
          {showChapterPicker && (
            <div className="mb-6 rounded-xl border border-border bg-panel p-5">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-medium text-text">
                  Select a chapter to quiz
                </h3>
                <button
                  type="button"
                  onClick={() => setShowChapterPicker(false)}
                  className="text-xs text-text-muted hover:text-text"
                >
                  Cancel
                </button>
              </div>
              {availableChapters.length === 0 ? (
                <p className="py-4 text-center text-xs text-text-muted">
                  No chapters are ready for quiz yet. Complete reading and
                  synthesis first.
                </p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {availableChapters.map((ch) => (
                    <button
                      type="button"
                      key={ch.id}
                      onClick={() => navigate(`/quiz?chapter=${ch.id}`)}
                      className="flex items-center justify-between rounded-lg border border-border-subtle px-4 py-3 text-left transition-all hover:border-accent/30 hover:bg-panel-alt"
                    >
                      <div>
                        <p className="text-sm font-medium text-text">
                          {ch.title}
                        </p>
                        <p className="text-[10px] text-text-muted">
                          {ch.status} &middot; {ch.section_count} sections
                        </p>
                      </div>
                      <span className="text-xs text-accent">Start &rarr;</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mb-5 rounded-xl border border-coral/20 bg-coral/5 px-4 py-3 text-sm text-coral">
              {error}
              <button
                type="button"
                onClick={() => setError(null)}
                className="ml-2 text-coral/50 hover:text-coral"
              >
                dismiss
              </button>
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="flex justify-center py-16">
              <p className="text-sm text-text-muted">Loading...</p>
            </div>
          )}

          {/* Quiz list */}
          {!loading && quizzes.length > 0 && (
            <div className="flex flex-col gap-2">
              {quizzes.map((quiz) => (
                <QuizRow
                  key={quiz.id}
                  quiz={quiz}
                  onClick={() => {
                    if (quiz.score != null && quiz.chapter_id != null) {
                      navigate(`/quiz?chapter=${quiz.chapter_id}`);
                    } else {
                      navigate(`/quiz?id=${quiz.id}`);
                    }
                  }}
                  onDelete={async () => {
                    try {
                      await deleteQuiz(quiz.id);
                      loadQuizzes();
                    } catch {
                      setError("Failed to delete quiz");
                    }
                  }}
                />
              ))}
            </div>
          )}

          {/* Empty state */}
          {!loading && quizzes.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-panel/50 py-20 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-accent/6">
                <ClipboardCheck size={20} className="text-accent/40" />
              </div>
              <p className="text-sm font-medium text-text-muted">
                {filterSubjectId
                  ? "No quizzes match your filter"
                  : "No quizzes yet"}
              </p>
              <p className="mt-1 text-xs text-text-muted/60">
                {filterSubjectId
                  ? "Try selecting a different subject"
                  : "Complete reading a chapter to unlock quizzes"}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
