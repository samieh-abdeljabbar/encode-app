import {
  BarChart3,
  BookOpen,
  ClipboardCheck,
  Flame,
  Layers,
  Trophy,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { getProgressReport } from "../lib/tauri";
import type { ProgressReport, SubjectProgress } from "../lib/tauri";

function ScoreBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-border">
        <div
          className="h-full rounded-full bg-accent transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[10px] tabular-nums text-text-muted">{pct}%</span>
    </div>
  );
}

function QuizGrade({ average }: { average: number | null }) {
  if (average == null) return <span className="text-text-muted/40">--</span>;
  const pct = Math.round(average * 100);
  const color =
    pct >= 80 ? "text-teal" : pct >= 60 ? "text-amber" : "text-coral";
  return <span className={`font-mono text-lg font-bold ${color}`}>{pct}%</span>;
}

function SubjectCard({ subject }: { subject: SubjectProgress }) {
  return (
    <div className="rounded-xl border border-border bg-panel p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text">
          {subject.subject_name}
        </h3>
        <QuizGrade average={subject.quiz_average} />
      </div>

      <div className="space-y-3">
        <div>
          <div className="mb-1 flex items-center justify-between text-[10px] text-text-muted">
            <span className="flex items-center gap-1">
              <BookOpen size={10} /> Chapters
            </span>
            <span>
              {subject.chapters_completed}/{subject.total_chapters}
            </span>
          </div>
          <ScoreBar
            value={subject.chapters_completed}
            max={subject.total_chapters}
          />
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between text-[10px] text-text-muted">
            <span className="flex items-center gap-1">
              <Layers size={10} /> Cards Mastered
            </span>
            <span>
              {subject.cards_mastered}/{subject.total_cards}
            </span>
          </div>
          <ScoreBar value={subject.cards_mastered} max={subject.total_cards} />
        </div>

        <div className="flex items-center justify-between pt-1 text-[10px] text-text-muted">
          <span className="flex items-center gap-1">
            <ClipboardCheck size={10} /> Quizzes taken
          </span>
          <span>{subject.quizzes_taken}</span>
        </div>
      </div>
    </div>
  );
}

export function Progress() {
  const [report, setReport] = useState<ProgressReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await getProgressReport();
      setReport(data);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-coral">{error}</p>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-text-muted">Loading...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-7 py-7">
      <h1 className="mb-8 text-2xl font-semibold tracking-tight text-text">
        Progress
      </h1>

      {/* Overview stats */}
      <div className="mb-8 grid grid-cols-4 gap-4">
        <div className="rounded-xl border border-border bg-panel p-5 text-center">
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10">
            <Trophy size={18} className="text-accent" />
          </div>
          <div className="font-mono text-2xl font-bold text-text">
            <QuizGrade average={report.overall_quiz_average} />
          </div>
          <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-text-muted">
            Quiz Average
          </p>
        </div>

        <div className="rounded-xl border border-border bg-panel p-5 text-center">
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-teal/10">
            <Flame size={18} className="text-teal" />
          </div>
          <div className="font-mono text-2xl font-bold text-text">
            {report.streak_days}
          </div>
          <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-text-muted">
            Day Streak
          </p>
        </div>

        <div className="rounded-xl border border-border bg-panel p-5 text-center">
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-amber/10">
            <BarChart3 size={18} className="text-amber" />
          </div>
          <div className="font-mono text-2xl font-bold text-text">
            {report.total_study_events}
          </div>
          <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-text-muted">
            Study Actions
          </p>
        </div>

        <div className="rounded-xl border border-border bg-panel p-5 text-center">
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10">
            <BookOpen size={18} className="text-accent" />
          </div>
          <div className="font-mono text-2xl font-bold text-text">
            {report.subjects.length}
          </div>
          <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-text-muted">
            Subjects
          </p>
        </div>
      </div>

      {/* Per-subject progress */}
      <h2 className="mb-4 text-sm font-semibold text-text">By Subject</h2>

      {report.subjects.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          {report.subjects.map((s) => (
            <SubjectCard key={s.subject_id} subject={s} />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border bg-panel/50 py-16 text-center">
          <p className="text-sm text-text-muted">No subjects yet</p>
          <p className="mt-1 text-xs text-text-muted/60">
            Create a subject and start studying to see progress
          </p>
        </div>
      )}
    </div>
  );
}
