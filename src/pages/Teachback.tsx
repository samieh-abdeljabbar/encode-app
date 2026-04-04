import { ArrowLeft, Loader2, MessageSquare } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  startTeachback,
  submitTeachback,
  submitTeachbackSelfRating,
} from "../lib/tauri";
import type {
  RubricScores,
  TeachbackResult,
  TeachbackStart,
} from "../lib/tauri";

type Phase = "loading" | "writing" | "evaluating" | "selfrating" | "result";

const RUBRIC_CRITERIA = [
  {
    key: "accuracy" as const,
    label: "Accuracy",
    desc: "Factual correctness",
  },
  {
    key: "clarity" as const,
    label: "Clarity",
    desc: "Organization and flow",
  },
  {
    key: "completeness" as const,
    label: "Completeness",
    desc: "Covers key concepts",
  },
  {
    key: "example" as const,
    label: "Concrete Example",
    desc: "Includes a real example",
  },
  {
    key: "jargon" as const,
    label: "Jargon",
    desc: "Terms explained, not just dropped",
  },
] as const;

const MASTERY_COLORS: Record<
  string,
  { bg: string; text: string; label: string }
> = {
  weak: { bg: "bg-coral/10", text: "text-coral", label: "Weak" },
  developing: {
    bg: "bg-amber-500/10",
    text: "text-amber-400",
    label: "Developing",
  },
  solid: {
    bg: "bg-accent/10",
    text: "text-accent",
    label: "Solid",
  },
  ready: { bg: "bg-teal/10", text: "text-teal", label: "Ready" },
};

export function Teachback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const chapterId = Number(searchParams.get("chapter"));

  const [phase, setPhase] = useState<Phase>("loading");
  const [tbStart, setTbStart] = useState<TeachbackStart | null>(null);
  const [response, setResponse] = useState("");
  const [result, setResult] = useState<TeachbackResult | null>(null);
  const [selfRatings, setSelfRatings] = useState<RubricScores>({
    accuracy: -1,
    clarity: -1,
    completeness: -1,
    example: -1,
    jargon: -1,
  });
  const [error, setError] = useState<string | null>(null);

  const loadTeachback = useCallback(async () => {
    if (!chapterId) return;
    try {
      const data = await startTeachback(chapterId);
      setTbStart(data);
      setPhase("writing");
    } catch (e) {
      setError(String(e));
    }
  }, [chapterId]);

  useEffect(() => {
    loadTeachback();
  }, [loadTeachback]);

  const handleSubmit = async () => {
    if (!tbStart || !response.trim()) return;
    setPhase("evaluating");
    try {
      const res = await submitTeachback(tbStart.id, response);
      if (res.needs_self_rating) {
        setPhase("selfrating");
      } else {
        setResult(res);
        setPhase("result");
      }
    } catch (e) {
      setError(String(e));
      setPhase("writing");
    }
  };

  const handleSelfRatingSubmit = async () => {
    if (!tbStart) return;
    const allRated = Object.values(selfRatings).every((v) => v >= 0);
    if (!allRated) return;
    setPhase("evaluating");
    try {
      const res = await submitTeachbackSelfRating(
        tbStart.id,
        response,
        selfRatings,
      );
      setResult(res);
      setPhase("result");
    } catch (e) {
      setError(String(e));
      setPhase("selfrating");
    }
  };

  const handleTryAgain = () => {
    setResponse("");
    setResult(null);
    setSelfRatings({
      accuracy: -1,
      clarity: -1,
      completeness: -1,
      example: -1,
      jargon: -1,
    });
    setPhase("loading");
    loadTeachback();
  };

  if (!chapterId) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-text-muted">No chapter specified.</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <p className="mb-2 text-sm text-coral">{error}</p>
          <button
            type="button"
            onClick={() => navigate("/workspace")}
            className="text-sm text-accent hover:underline"
          >
            Back to Library
          </button>
        </div>
      </div>
    );
  }

  if (phase === "loading") {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 size={24} className="animate-spin text-accent" />
      </div>
    );
  }

  if (phase === "evaluating") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <Loader2 size={24} className="animate-spin text-accent" />
        <p className="text-sm text-text-muted">
          Evaluating your explanation...
        </p>
      </div>
    );
  }

  // SELF-RATING PHASE
  if (phase === "selfrating") {
    return (
      <div className="mx-auto flex h-full max-w-2xl flex-col p-6">
        <div className="mb-6">
          <div className="mb-1 text-xs font-medium uppercase tracking-wider text-purple-400">
            Self-Review
          </div>
          <h2 className="text-lg font-semibold text-text">
            Rate Your Explanation
          </h2>
          <p className="text-sm text-text-muted">
            AI evaluation unavailable. Rate yourself on each criterion.
          </p>
        </div>

        <div className="flex-1 space-y-4 overflow-auto">
          {RUBRIC_CRITERIA.map((c) => (
            <div
              key={c.key}
              className="rounded-lg border border-border bg-panel p-4"
            >
              <div className="mb-2 font-medium text-text">{c.label}</div>
              <div className="mb-3 text-xs text-text-muted">{c.desc}</div>
              <div className="flex gap-2">
                {[
                  { label: "Missed", value: 0 },
                  { label: "Partial", value: 50 },
                  { label: "Strong", value: 100 },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() =>
                      setSelfRatings((prev) => ({
                        ...prev,
                        [c.key]: opt.value,
                      }))
                    }
                    className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-all ${
                      selfRatings[c.key] === opt.value
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-border bg-panel-active text-text-muted hover:text-text"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={handleSelfRatingSubmit}
            disabled={Object.values(selfRatings).some((v) => v < 0)}
            className="h-10 rounded-xl bg-purple-600 px-6 text-sm font-medium text-white shadow-sm transition-all hover:bg-purple-500 disabled:opacity-40"
          >
            See Results
          </button>
        </div>
      </div>
    );
  }

  // RESULT PHASE
  if (phase === "result" && result) {
    const m = MASTERY_COLORS[result.mastery] || MASTERY_COLORS.developing;
    return (
      <div className="mx-auto flex h-full max-w-2xl flex-col p-6">
        <div className="mb-6 text-center">
          <div
            className={`mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-xl ${m.bg}`}
          >
            <MessageSquare size={24} className={m.text} />
          </div>
          <div className={`text-xl font-bold ${m.text}`}>{m.label}</div>
          <div className="text-sm text-text-muted">
            Overall score: {result.overall}/100
          </div>
        </div>

        {result.strongest && (
          <div className="mb-3 rounded-lg border border-border bg-panel p-4">
            <div className="mb-1 text-xs font-medium uppercase tracking-wider text-accent">
              Strongest Part
            </div>
            <div className="text-sm text-text">{result.strongest}</div>
          </div>
        )}

        {result.biggest_gap && (
          <div className="mb-3 rounded-lg border border-border bg-panel p-4">
            <div className="mb-1 text-xs font-medium uppercase tracking-wider text-amber-400">
              Biggest Gap
            </div>
            <div className="text-sm text-text">{result.biggest_gap}</div>
          </div>
        )}

        <div className="mb-4 rounded-lg border border-border bg-panel p-4">
          <div className="space-y-3">
            {RUBRIC_CRITERIA.map((c) => (
              <div key={c.key}>
                <div className="mb-1 flex justify-between text-xs text-text-muted">
                  <span>{c.label}</span>
                  <span>{result.scores[c.key]}/100</span>
                </div>
                <div className="h-1.5 rounded-full bg-border">
                  <div
                    className={`h-1.5 rounded-full transition-all ${
                      result.scores[c.key] >= 60
                        ? "bg-accent"
                        : result.scores[c.key] >= 40
                          ? "bg-amber"
                          : "bg-coral"
                    }`}
                    style={{ width: `${result.scores[c.key]}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {result.repair_card_id && (
          <div className="mb-4 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs text-amber-300">
            Repair card created for: {result.biggest_gap}
          </div>
        )}

        <div className="flex justify-center gap-3">
          <button
            type="button"
            onClick={handleTryAgain}
            className="h-10 rounded-xl bg-purple-600 px-5 text-sm font-medium text-white shadow-sm hover:bg-purple-500"
          >
            Try Again
          </button>
          <button
            type="button"
            onClick={() => navigate("/workspace")}
            className="h-10 rounded-xl border border-border bg-panel px-5 text-sm font-medium text-text transition-all hover:bg-panel-active"
          >
            Back to Library
          </button>
        </div>
      </div>
    );
  }

  // WRITING PHASE (default)
  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col p-6">
      <button
        type="button"
        onClick={() => navigate("/workspace")}
        className="mb-4 flex items-center gap-1 text-xs text-text-muted hover:text-text"
      >
        <ArrowLeft size={12} />
        Back to Library
      </button>

      <div className="mb-4">
        <div className="mb-1 text-xs font-medium uppercase tracking-wider text-purple-400">
          Teach Back
        </div>
        <h2 className="text-lg font-semibold text-text">
          {tbStart?.chapter_title}
        </h2>
        <p className="text-xs text-text-muted">{tbStart?.subject_name}</p>
      </div>

      <div className="mb-4 rounded-lg border border-border bg-panel p-4">
        <div className="mb-2 text-xs font-medium uppercase tracking-wider text-text-muted">
          Your Prompt
        </div>
        <p className="text-sm leading-relaxed text-text">{tbStart?.prompt}</p>
      </div>

      <div className="mb-3">
        <label
          htmlFor="tb-response"
          className="mb-1 block text-xs text-text-muted"
        >
          Your explanation
        </label>
        <textarea
          id="tb-response"
          value={response}
          onChange={(e) => setResponse(e.target.value)}
          placeholder="Imagine you're teaching this to someone who hasn't read the chapter..."
          className="h-40 w-full resize-none rounded-lg border border-border bg-bg p-3 text-sm text-text placeholder:text-text-muted/50 focus:border-accent focus:outline-none"
        />
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-text-muted/50">No time limit</span>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!response.trim()}
          className="h-10 rounded-xl bg-purple-600 px-6 text-sm font-medium text-white shadow-sm transition-all hover:bg-purple-500 disabled:opacity-40"
        >
          Submit
        </button>
      </div>
    </div>
  );
}
