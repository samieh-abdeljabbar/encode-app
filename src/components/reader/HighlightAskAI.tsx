import { useState, useEffect, useCallback, useRef } from "react";
import { aiRequest } from "../../lib/tauri";
import MarkdownRenderer from "../shared/MarkdownRenderer";

type Phase = "tooltip" | "input" | "loading" | "response";

interface HighlightAskAIProps {
  selectedText: string;
  selectionRect: DOMRect;
  containerRef: React.RefObject<HTMLDivElement | null>;
  sectionContent: string;
  sectionHeading: string | null;
  onDismiss: () => void;
}

export default function HighlightAskAI({
  selectedText,
  selectionRect,
  containerRef,
  sectionContent,
  sectionHeading,
  onDismiss,
}: HighlightAskAIProps) {
  const [phase, setPhase] = useState<Phase>("tooltip");
  const [question, setQuestion] = useState("Explain this in simple terms");
  const [answer, setAnswer] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);

  // Position relative to container
  const container = containerRef.current;
  const containerRect = container?.getBoundingClientRect();

  const top = containerRect
    ? selectionRect.bottom - containerRect.top + (container?.scrollTop ?? 0) + 8
    : 0;
  const left = containerRect
    ? selectionRect.left - containerRect.left + selectionRect.width / 2
    : 0;

  // Dismiss on scroll (any phase)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handleScroll = () => onDismiss();
    el.addEventListener("scroll", handleScroll);
    return () => el.removeEventListener("scroll", handleScroll);
  }, [containerRef, onDismiss]);

  // Dismiss on click outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onDismiss();
      }
    };
    // Delay to avoid catching the mouseup that created the selection
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClick);
    }, 100);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [onDismiss]);

  const handleAsk = useCallback(async () => {
    setPhase("loading");
    try {
      const { text } = await aiRequest(
        `You are a study assistant. The student highlighted some text and has a question. Answer clearly and concisely in under 150 words. Use simple language.`,
        `Selected text: "${selectedText.slice(0, 500)}"\n\nSection: ${sectionHeading || ""}\n${sectionContent.slice(0, 1000)}\n\nQuestion: ${question}`,
        300,
      );
      const cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
      setAnswer(cleaned);
      setPhase("response");
    } catch {
      setAnswer("AI is unavailable. Check your AI provider in Settings.");
      setPhase("response");
    }
  }, [selectedText, sectionContent, sectionHeading, question]);

  // Tooltip phase
  if (phase === "tooltip") {
    return (
      <div
        ref={panelRef}
        className="absolute z-50"
        style={{ top, left, transform: "translateX(-50%)" }}
      >
        <button
          onClick={() => setPhase("input")}
          className="px-3 py-1.5 bg-purple text-white text-xs font-medium rounded-full shadow-lg hover:opacity-90 transition-opacity whitespace-nowrap"
        >
          Ask AI
        </button>
      </div>
    );
  }

  // Input / Loading / Response phase
  return (
    <div
      ref={panelRef}
      className="absolute z-50 w-[400px]"
      style={{ top, left: Math.max(0, left - 200) }}
    >
      <div className="bg-surface border border-border rounded-lg shadow-xl overflow-hidden">
        {/* Selected text preview */}
        <div className="px-4 pt-3 pb-2 border-b border-border">
          <p className="text-[10px] text-text-muted uppercase tracking-wider mb-1">Selected text</p>
          <p className="text-xs text-text italic line-clamp-2">
            &ldquo;{selectedText.slice(0, 200)}{selectedText.length > 200 ? "..." : ""}&rdquo;
          </p>
        </div>

        {phase === "input" && (
          <div className="p-4 space-y-3">
            <input
              autoFocus
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAsk();
                if (e.key === "Escape") onDismiss();
              }}
              className="w-full px-3 py-2 bg-surface-2 border border-border rounded text-sm text-text placeholder:text-text-muted focus:outline-none focus:border-purple"
              placeholder="Ask a question..."
            />
            <div className="flex justify-between items-center">
              <button onClick={onDismiss} className="text-xs text-text-muted hover:text-text">
                Cancel
              </button>
              <button
                onClick={handleAsk}
                disabled={!question.trim()}
                className="px-4 py-1.5 bg-purple text-white text-xs font-medium rounded hover:opacity-90 disabled:opacity-50"
              >
                Ask
              </button>
            </div>
          </div>
        )}

        {phase === "loading" && (
          <div className="p-4">
            <p className="text-sm text-purple animate-pulse">Thinking...</p>
          </div>
        )}

        {phase === "response" && (
          <div className="p-4 space-y-3">
            <div className="text-sm max-h-[300px] overflow-y-auto">
              <MarkdownRenderer content={answer} />
            </div>
            <div className="flex justify-end">
              <button
                onClick={onDismiss}
                className="px-4 py-1.5 bg-surface-2 text-text text-xs rounded border border-border hover:border-purple"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
