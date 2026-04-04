import {
  BookOpen,
  ChevronRight,
  CircleHelp,
  FolderOpen,
  StickyNote,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { DigestionGate } from "../components/reader/DigestionGate";
import {
  type ReaderCheckMode,
  ReaderCheckModePicker,
} from "../components/reader/ReaderCheckModePicker";
import { ReaderContent } from "../components/reader/ReaderContent";
import { ReaderHeader } from "../components/reader/ReaderHeader";
import { SynthesisPanel } from "../components/reader/SynthesisPanel";
import {
  checkAiStatus,
  createNote,
  generateSectionPrompt,
  listNavigationChapters,
  loadReaderSession,
  markSectionRead,
  submitSectionCheck,
  submitSynthesis,
} from "../lib/tauri";
import type {
  AiStatus,
  CheckResult,
  NavigationChapter,
  ReaderSession,
} from "../lib/tauri";

type GatePhase = "reading" | "gate" | "result" | "synthesis" | "done";

export function Reader() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const chapterId = Number(searchParams.get("chapter"));

  const [session, setSession] = useState<ReaderSession | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [gatePhase, setGatePhase] = useState<GatePhase>("reading");
  const [lastResult, setLastResult] = useState<CheckResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [creatingNote, setCreatingNote] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiPrompt, setAiPrompt] = useState<string | null>(null);
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);
  const [aiStatusLoaded, setAiStatusLoaded] = useState(false);
  const [availableChapters, setAvailableChapters] = useState<
    NavigationChapter[]
  >([]);
  const [checkMode, setCheckMode] = useState<ReaderCheckMode | null>(null);

  const aiEnabled =
    aiStatusLoaded &&
    aiStatus !== null &&
    aiStatus.provider !== "none" &&
    aiStatus.configured &&
    aiStatus.has_api_key;
  const needsCheckModeChoice =
    !!chapterId && !!session && aiEnabled && checkMode === null;

  const loadSession = useCallback(async () => {
    if (!chapterId) return;
    try {
      setCheckMode(null);
      setAiPrompt(null);
      const data = await loadReaderSession(chapterId);
      setSession(data);
      setCurrentIndex(data.current_index);
      const currentSection = data.sections[data.current_index];
      if (currentSection && currentSection.status !== "unseen") {
        setGatePhase("gate");
      }
    } catch (e) {
      setError(String(e));
    }
  }, [chapterId]);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  useEffect(() => {
    checkAiStatus()
      .then(setAiStatus)
      .catch(() => {})
      .finally(() => setAiStatusLoaded(true));
  }, []);

  useEffect(() => {
    if (chapterId) return;
    listNavigationChapters()
      .then((chapters) => {
        setAvailableChapters(
          chapters.filter((chapter) =>
            ["new", "reading", "awaiting_synthesis"].includes(chapter.status),
          ),
        );
      })
      .catch(() => {});
  }, [chapterId]);

  const section = session?.sections[currentIndex] ?? null;
  const isChapterComplete =
    session?.chapter.status === "awaiting_synthesis" ||
    gatePhase === "synthesis";

  useEffect(() => {
    if (!chapterId || !session || !aiStatusLoaded || checkMode !== null) return;
    if (!aiEnabled) {
      setCheckMode("self");
    }
  }, [aiEnabled, aiStatusLoaded, chapterId, checkMode, session]);

  useEffect(() => {
    if (!section || gatePhase !== "gate" || checkMode === null) return;
    setAiPrompt(null);
    generateSectionPrompt(
      section.heading,
      section.body_markdown,
      checkMode === "ai",
    )
      .then((prompt) => setAiPrompt(prompt))
      .catch(() => {});
  }, [checkMode, gatePhase, section]);

  if (!chapterId) {
    return (
      <div className="mx-auto flex h-full max-w-4xl items-center justify-center px-7 py-7">
        <div className="w-full max-w-3xl">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/10">
              <BookOpen size={26} className="text-accent" />
            </div>
            <h1 className="mb-2 text-2xl font-semibold tracking-tight text-text">
              Reader
            </h1>
            <p className="text-sm text-text-muted">
              Open a chapter from your library or continue reading from the
              queue.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <button
              type="button"
              onClick={() => navigate("/")}
              className="rounded-2xl border border-border bg-panel p-5 text-left transition-all hover:border-accent/30 hover:bg-panel-active"
            >
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10">
                <ChevronRight size={18} className="text-accent" />
              </div>
              <div className="text-sm font-medium text-text">Open Queue</div>
              <div className="mt-1 text-xs text-text-muted">
                Start the highest-priority next action.
              </div>
            </button>

            <button
              type="button"
              onClick={() => navigate("/workspace")}
              className="rounded-2xl border border-border bg-panel p-5 text-left transition-all hover:border-accent/30 hover:bg-panel-active"
            >
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10">
                <FolderOpen size={18} className="text-accent" />
              </div>
              <div className="text-sm font-medium text-text">Open Library</div>
              <div className="mt-1 text-xs text-text-muted">
                Browse subjects, chapters, imports, and notes.
              </div>
            </button>
          </div>

          {availableChapters.length > 0 && (
            <div className="mt-8">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">
                Continue Reading
              </h2>
              <div className="flex flex-col gap-3">
                {availableChapters.slice(0, 6).map((chapter) => (
                  <button
                    key={chapter.id}
                    type="button"
                    onClick={() => navigate(`/reader?chapter=${chapter.id}`)}
                    className="flex items-center justify-between rounded-xl border border-border bg-panel px-4 py-3 text-left transition-all hover:border-accent/30 hover:bg-panel-active"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-text">
                        {chapter.title}
                      </div>
                      <div className="mt-1 text-xs text-text-muted">
                        {chapter.subject_name}
                      </div>
                    </div>
                    <span className="ml-4 shrink-0 text-xs text-text-muted">
                      {chapter.status.split("_").join(" ")}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
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

  if (!session) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-text-muted">Loading...</p>
      </div>
    );
  }

  const handleMarkRead = async () => {
    if (!section) return;
    setLoading(true);
    try {
      await markSectionRead(chapterId, section.section_index);
      setGatePhase("gate");
      // Update local section status
      setSession((prev) => {
        if (!prev) return prev;
        const updated = { ...prev };
        updated.sections = updated.sections.map((s) =>
          s.section_index === section.section_index
            ? { ...s, status: "seen" }
            : s,
        );
        return updated;
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleCheckSubmit = async (response: string, rating?: string) => {
    if (!section) return;
    setLoading(true);
    try {
      const result = await submitSectionCheck(
        chapterId,
        section.section_index,
        response,
        rating ?? null,
        checkMode === "ai",
      );
      setLastResult(result);

      if (result.can_retry) {
        // Stay on gate phase for retry
        setGatePhase("gate");
      } else if (result.chapter_complete) {
        setGatePhase("synthesis");
      } else {
        setGatePhase("result");
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleNextSection = () => {
    const nextIndex = currentIndex + 1;
    if (nextIndex >= session.sections.length) {
      setGatePhase("synthesis");
      return;
    }
    setCurrentIndex(nextIndex);
    setGatePhase("reading");
    setLastResult(null);
  };

  const handleSynthesisSubmit = async (text: string) => {
    setLoading(true);
    try {
      await submitSynthesis(chapterId, text);
      setGatePhase("done");
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleCreateStudyNote = async (
    intent: "summary" | "question" | "confusion" = "summary",
  ) => {
    if (!session || !section) return;
    setCreatingNote(true);
    try {
      const sectionLabel =
        section.heading ?? `Section ${section.section_index + 1}`;
      const intentLabel = {
        summary: "Summary",
        question: "Question",
        confusion: "Confusion",
      }[intent];
      const starter = {
        summary: "- Key takeaway:\n- Why it matters:\n- What to review next:\n",
        question:
          "- My question:\n- What seems unclear:\n- What to check next:\n",
        confusion:
          "- What confused me:\n- What I expected instead:\n- What would fix this gap:\n",
      }[intent];

      const note = await createNote(
        `${intentLabel}: ${sectionLabel}`,
        null,
        session.chapter.subject_id,
        session.chapter.id,
        `## ${intentLabel}\n\nSubject: ${session.chapter.subject_name}\nChapter: ${session.chapter.title}\nSection: ${sectionLabel}\n\n${starter}`,
      );
      navigate(`/workspace?note=${note.id}`);
    } catch (e) {
      setError(String(e));
    } finally {
      setCreatingNote(false);
    }
  };

  // Synthesis view
  if (gatePhase === "synthesis" || isChapterComplete) {
    return (
      <div className="flex h-full flex-col">
        <ReaderHeader
          subjectName={session.chapter.subject_name}
          title={session.chapter.title}
          currentSection={session.sections.length - 1}
          totalSections={session.sections.length}
        />
        <div className="flex-1 overflow-auto">
          <SynthesisPanel
            chapterTitle={session.chapter.title}
            onSubmit={handleSynthesisSubmit}
            loading={loading}
          />
        </div>
      </div>
    );
  }

  // Done view
  if (gatePhase === "done") {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-xl bg-teal/10">
            <span className="text-2xl">&#10003;</span>
          </div>
          <p className="mb-2 text-base font-semibold text-text">
            Chapter Complete
          </p>
          <p className="mb-6 text-sm text-text-muted">
            &ldquo;{session.chapter.title}&rdquo; is ready for quiz.
          </p>
          <div className="flex justify-center gap-3">
            <button
              type="button"
              onClick={() => navigate("/workspace")}
              className="h-10 rounded-xl border border-border bg-panel px-5 text-sm font-medium text-text transition-all hover:bg-panel-active"
            >
              Back to Library
            </button>
            <button
              type="button"
              onClick={() => navigate(`/teachback?chapter=${chapterId}`)}
              className="h-10 rounded-xl bg-purple-600 px-5 text-sm font-medium text-white shadow-sm hover:bg-purple-500"
            >
              Teach Back
            </button>
            <button
              type="button"
              onClick={() => navigate(`/quiz?chapter=${chapterId}`)}
              className="h-10 rounded-xl bg-accent px-5 text-sm font-medium text-white shadow-sm hover:bg-accent/90"
            >
              Take Quiz
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!section) return null;

  return (
    <div className="flex h-full flex-col">
      <ReaderCheckModePicker
        open={needsCheckModeChoice}
        onClose={() => setCheckMode("self")}
        onSelect={setCheckMode}
      />
      <ReaderHeader
        subjectName={session.chapter.subject_name}
        title={session.chapter.title}
        currentSection={currentIndex}
        totalSections={session.sections.length}
        actions={
          <div className="flex items-center gap-2">
            {aiEnabled && (
              <button
                type="button"
                onClick={() =>
                  setCheckMode((current) => (current === "ai" ? "self" : "ai"))
                }
                className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition-all ${
                  checkMode === "ai"
                    ? "border-accent/30 bg-accent/8 text-accent hover:bg-accent/12"
                    : "border-border bg-panel text-text-muted hover:border-accent/30 hover:text-accent"
                }`}
              >
                {checkMode === "ai" ? "AI check" : "Self check"}
              </button>
            )}
            <button
              type="button"
              onClick={() => handleCreateStudyNote("summary")}
              disabled={creatingNote}
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-panel px-3 py-2 text-xs font-medium text-text-muted transition-all hover:border-accent/30 hover:text-accent disabled:opacity-40"
            >
              <StickyNote size={13} />
              {creatingNote ? "Opening..." : "Take Note"}
            </button>
          </div>
        }
      />

      <div className="flex-1 overflow-auto">
        <ReaderContent
          heading={section.heading}
          bodyMarkdown={section.body_markdown}
        />

        <div className="mx-auto mt-4 flex max-w-3xl flex-wrap gap-2 px-7 pb-4">
          <button
            type="button"
            onClick={() => handleCreateStudyNote("summary")}
            disabled={creatingNote}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-panel px-3 py-2 text-xs font-medium text-text-muted transition-all hover:border-accent/30 hover:text-accent disabled:opacity-40"
          >
            <StickyNote size={12} />
            Summary note
          </button>
          <button
            type="button"
            onClick={() => handleCreateStudyNote("question")}
            disabled={creatingNote}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-panel px-3 py-2 text-xs font-medium text-text-muted transition-all hover:border-accent/30 hover:text-accent disabled:opacity-40"
          >
            <CircleHelp size={12} />
            Save question
          </button>
          <button
            type="button"
            onClick={() => handleCreateStudyNote("confusion")}
            disabled={creatingNote}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-panel px-3 py-2 text-xs font-medium text-text-muted transition-all hover:border-accent/30 hover:text-accent disabled:opacity-40"
          >
            <CircleHelp size={12} />
            Mark confusion
          </button>
        </div>

        {gatePhase === "reading" && (
          <div className="mx-auto max-w-3xl px-7 pb-7">
            <button
              type="button"
              onClick={handleMarkRead}
              disabled={loading}
              className="h-11 w-full rounded-xl border border-border bg-panel text-sm font-medium text-text-muted transition-all hover:border-accent/30 hover:text-accent disabled:opacity-40"
            >
              {loading ? "..." : "I've read this section"}
            </button>
          </div>
        )}

        {gatePhase === "gate" && checkMode === null && (
          <div className="mx-auto max-w-3xl border-t border-border-subtle px-7 py-6">
            <div className="rounded-xl border border-dashed border-border bg-panel px-4 py-5 text-sm text-text-muted">
              Preparing your check mode...
            </div>
          </div>
        )}

        {gatePhase === "gate" && checkMode !== null && (
          <DigestionGate
            key={`${currentIndex}-${gatePhase}-${checkMode ?? "pending"}-${lastResult?.outcome ?? "fresh"}-${lastResult?.can_retry ? "retry" : "once"}`}
            prompt={aiPrompt ?? section.prompt}
            sectionHeading={section.heading}
            onSubmit={handleCheckSubmit}
            loading={loading}
            aiEnabled={checkMode === "ai"}
          />
        )}

        {gatePhase === "result" && (
          <div className="mx-auto max-w-3xl border-t border-border-subtle px-7 py-6">
            {lastResult?.feedback && (
              <div className="mb-3 rounded-xl border border-border-subtle bg-panel px-4 py-3 text-sm text-text-muted">
                <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.1em] text-accent">
                  {lastResult.evaluated_by_ai ? "AI check" : "Check feedback"}
                </p>
                {lastResult.feedback}
              </div>
            )}
            {lastResult?.repair_card_created && (
              <p className="mb-3 text-xs text-coral">
                A repair card has been created for later review.
              </p>
            )}
            <button
              type="button"
              onClick={handleNextSection}
              className="h-10 rounded-xl bg-accent px-5 text-xs font-medium text-white shadow-sm hover:bg-accent/90"
            >
              Next Section
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
