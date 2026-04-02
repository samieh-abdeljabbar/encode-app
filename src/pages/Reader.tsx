import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { DigestionGate } from "../components/reader/DigestionGate";
import { ReaderContent } from "../components/reader/ReaderContent";
import { ReaderHeader } from "../components/reader/ReaderHeader";
import { SynthesisPanel } from "../components/reader/SynthesisPanel";
import {
  generateSectionPrompt,
  loadReaderSession,
  markSectionRead,
  submitSectionCheck,
  submitSynthesis,
} from "../lib/tauri";
import type { CheckResult, ReaderSession } from "../lib/tauri";

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
  const [error, setError] = useState<string | null>(null);
  const [aiPrompt, setAiPrompt] = useState<string | null>(null);

  const loadSession = useCallback(async () => {
    if (!chapterId) return;
    try {
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

  if (!chapterId) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-text-muted">No chapter selected</p>
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
            onClick={() => navigate("/library")}
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

  const section = session.sections[currentIndex];
  const isChapterComplete =
    session.chapter.status === "awaiting_synthesis" ||
    gatePhase === "synthesis";

  const handleMarkRead = async () => {
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
      // Generate AI-enhanced prompt (non-blocking — falls back to deterministic)
      setAiPrompt(null);
      generateSectionPrompt(section.heading, section.body_markdown)
        .then((prompt) => setAiPrompt(prompt))
        .catch(() => {}); // Fallback handled server-side
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleCheckSubmit = async (response: string, rating: string) => {
    setLoading(true);
    try {
      const result = await submitSectionCheck(
        chapterId,
        section.section_index,
        response,
        rating,
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

  // Synthesis view
  if (gatePhase === "synthesis" || isChapterComplete) {
    return (
      <div className="flex h-full flex-col">
        <ReaderHeader
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
              onClick={() => navigate("/library")}
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
      <ReaderHeader
        title={session.chapter.title}
        currentSection={currentIndex}
        totalSections={session.sections.length}
      />

      <div className="flex-1 overflow-auto">
        <ReaderContent
          heading={section.heading}
          bodyMarkdown={section.body_markdown}
        />

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

        {gatePhase === "gate" && (
          <DigestionGate
            prompt={aiPrompt ?? section.prompt}
            sectionHeading={section.heading}
            onSubmit={handleCheckSubmit}
            loading={loading}
          />
        )}

        {gatePhase === "result" && (
          <div className="mx-auto max-w-3xl border-t border-border-subtle px-7 py-6">
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
