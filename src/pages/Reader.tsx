import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useReaderStore } from "../stores/reader";
import { useVaultStore } from "../stores/vault";
import { useQuizStore } from "../stores/quiz";
import { useTeachBackStore } from "../stores/teachback";
import { useFlashcardStore } from "../stores/flashcard";
import { useAppStore } from "../stores/app";
import MarkdownRenderer from "../components/shared/MarkdownRenderer";
import DigestionGate from "../components/reader/DigestionGate";
import ProgressBar from "../components/reader/ProgressBar";
import HighlightAskAI from "../components/reader/HighlightAskAI";
import { parseFrontmatter } from "../lib/markdown";
import type { Section } from "../lib/markdown";

interface SuggestedCard {
  question: string;
  answer: string;
  bloom: number;
}

function CreateFlashcardPanel({
  rawContent,
  section,
}: {
  rawContent: string | null;
  section: Section | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [bloom, setBloom] = useState(2);
  const [suggestions, setSuggestions] = useState<SuggestedCard[]>([]);
  const [generating, setGenerating] = useState(false);
  const [saved, setSaved] = useState(false);
  const { createCard } = useFlashcardStore();

  if (!section || !rawContent) return null;

  const fm = parseFrontmatter(rawContent).frontmatter;
  const subject = (fm.subject as string) || "";
  const topic = (fm.topic as string) || "";

  const handleCreate = async () => {
    if (!question.trim() || !answer.trim()) return;
    await createCard(subject, topic, question.trim(), answer.trim(), bloom);
    setQuestion("");
    setAnswer("");
    setBloom(2);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleAiSuggest = async () => {
    setGenerating(true);
    try {
      const { aiRequest } = await import("../lib/tauri");
      const { text } = await aiRequest(
        `Generate 2-3 flashcard Q/A pairs from this study content. Each question should test genuine understanding, not just recall.

Output ONLY a JSON array: [{"q": "...", "a": "...", "bloom": 1-6}]
Bloom: 1=Remember, 2=Understand, 3=Apply. Target levels 1-3.`,
        `Section: ${section.heading || "Content"}\n\n${section.content.slice(0, 2000)}`,
        500,
      );
      const match = text.match(/\[[\s\S]*\]/);
      if (match) {
        const parsed = JSON.parse(match[0]) as { q: string; a: string; bloom: number }[];
        setSuggestions(parsed.map((p) => ({ question: p.q, answer: p.a, bloom: p.bloom || 2 })));
      }
    } catch {
      // AI unavailable
    }
    setGenerating(false);
  };

  const handleAcceptSuggestion = async (s: SuggestedCard) => {
    await createCard(subject, topic, s.question, s.answer, s.bloom);
    setSuggestions((prev) => prev.filter((x) => x !== s));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleEditSuggestion = (s: SuggestedCard) => {
    setQuestion(s.question);
    setAnswer(s.answer);
    setBloom(s.bloom);
    setSuggestions((prev) => prev.filter((x) => x !== s));
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="px-3 py-1 text-xs text-text-muted border border-border rounded hover:text-purple hover:border-purple transition-colors"
        title="Create flashcard from this section"
      >
        + Card
      </button>
    );
  }

  return (
    <div className="mt-6 p-4 bg-surface border border-purple/40 rounded-lg">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-purple font-medium">New Flashcard</p>
        <div className="flex gap-2">
          <button
            onClick={handleAiSuggest}
            disabled={generating}
            className="px-2 py-1 text-xs text-amber border border-amber/40 rounded hover:bg-amber/10 disabled:opacity-30"
          >
            {generating ? "Generating..." : "AI Suggest"}
          </button>
          <button
            onClick={() => { setOpen(false); setSuggestions([]); }}
            className="px-2 py-1 text-xs text-text-muted hover:text-text"
          >
            Close
          </button>
        </div>
      </div>

      {/* AI Suggestions */}
      {suggestions.length > 0 && (
        <div className="mb-4 space-y-2">
          <p className="text-xs text-amber">AI Suggestions:</p>
          {suggestions.map((s, i) => (
            <div key={i} className="p-2 bg-surface-2 rounded border border-border">
              <p className="text-xs text-text mb-1"><strong>Q:</strong> {s.question}</p>
              <p className="text-xs text-text-muted mb-2"><strong>A:</strong> {s.answer}</p>
              <div className="flex gap-2">
                <button onClick={() => handleAcceptSuggestion(s)} className="px-2 py-0.5 text-xs bg-teal text-white rounded hover:opacity-90">Save</button>
                <button onClick={() => handleEditSuggestion(s)} className="px-2 py-0.5 text-xs text-text-muted border border-border rounded hover:text-text">Edit</button>
                <button onClick={() => setSuggestions((p) => p.filter((x) => x !== s))} className="px-2 py-0.5 text-xs text-text-muted hover:text-coral">Dismiss</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Manual form */}
      <p className="text-xs text-text-muted mb-1">
        {section.heading || "Current section"}
      </p>
      <textarea
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder="Question..."
        rows={2}
        className="w-full mb-2 px-3 py-2 bg-surface-2 border border-border rounded text-sm text-text resize-none focus:outline-none focus:border-purple"
      />
      <textarea
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        placeholder="Answer..."
        rows={3}
        className="w-full mb-3 px-3 py-2 bg-surface-2 border border-border rounded text-sm text-text resize-none focus:outline-none focus:border-purple"
      />
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          <span className="text-xs text-text-muted mr-1">Bloom:</span>
          {[1, 2, 3, 4, 5, 6].map((b) => (
            <button
              key={b}
              onClick={() => setBloom(b)}
              className={`w-6 h-6 text-xs rounded ${bloom === b ? "bg-purple text-white" : "bg-surface-2 text-text-muted border border-border hover:border-purple"}`}
            >
              {b}
            </button>
          ))}
        </div>
        <button
          onClick={handleCreate}
          disabled={!question.trim() || !answer.trim()}
          className="px-4 py-1.5 text-xs bg-purple text-white rounded hover:opacity-90 disabled:opacity-30"
        >
          Save Card
        </button>
      </div>
      {saved && <p className="text-xs text-teal mt-2">Card saved!</p>}
    </div>
  );
}

export default function ReaderPage() {
  const navigate = useNavigate();
  const selectedFile = useVaultStore((s) => s.selectedFile);
  const selectFile = useVaultStore((s) => s.selectFile);
  const config = useAppStore((s) => s.config);
  const aiEnabled = config?.ai_provider !== "none";
  const contentRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<{ text: string; rect: DOMRect } | null>(null);
  const {
    filePath,
    rawContent,
    sections,
    currentSectionIndex,
    gateOpen,
    gateResponses,
    loading,
    error,
    loadFile,
    advanceSection,
    goToSection,
    submitGateResponse,
    clearError,
    dismissSuggestions,
    closeReader,
    suggestedCards,
    gateGenerating,
    gatePhase,
    gateQuestions,
    lastFeedback,
    lastMastery,
    gateSkipped,
    showSchemaActivation,
    schemaActivationTopic,
    dismissSchemaActivation,
  } = useReaderStore();

  const bottomRef = useRef<HTMLDivElement>(null);

  // Load file when entering the reader
  useEffect(() => {
    if (selectedFile && selectedFile !== filePath) {
      loadFile(selectedFile);
    }
  }, [selectedFile, filePath, loadFile]);

  // Scroll to bottom when new section is revealed
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [currentSectionIndex, gateOpen]);

  const handleBack = useCallback(() => {
    closeReader();
    navigate("/vault");
  }, [closeReader, navigate]);

  // Wiki-link navigation: search vault for matching file and open in Vault editor
  const handleWikilinkClick = useCallback(
    async (name: string) => {
      try {
        const results = await import("../lib/tauri").then((t) => t.searchVault(name));
        if (results.length > 0) {
          selectFile(results[0].file_path);
          navigate("/vault");
        }
      } catch {
        // Silently ignore — file not found
      }
    },
    [selectFile, navigate],
  );

  // Keyboard navigation
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (gateOpen) return; // Don't navigate while gate is open
      if (e.target instanceof HTMLTextAreaElement) return;

      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        advanceSection();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goToSection(currentSectionIndex - 1);
      } else if (e.key === "Escape") {
        handleBack();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [gateOpen, currentSectionIndex, advanceSection, goToSection, handleBack]);

  // Text selection detection for highlight-to-ask
  useEffect(() => {
    const el = contentRef.current;
    if (!el || !aiEnabled) return;

    const handleMouseUp = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.toString().trim()) {
        setTimeout(() => {
          const s = window.getSelection();
          if (!s || s.isCollapsed) setSelection(null);
        }, 200);
        return;
      }
      const text = sel.toString().trim();
      if (text.length < 5) return;
      const range = sel.getRangeAt(0);
      setSelection({ text, rect: range.getBoundingClientRect() });
    };

    el.addEventListener("mouseup", handleMouseUp);
    return () => el.removeEventListener("mouseup", handleMouseUp);
  }, [aiEnabled]);

  if (!selectedFile) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-text-muted mb-4">No file selected for reading.</p>
          <button
            onClick={() => navigate("/vault")}
            className="px-4 py-2 text-sm text-purple border border-purple rounded hover:bg-purple/10"
          >
            Go to Vault
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-text-muted">Loading...</p>
      </div>
    );
  }

  // Pre-reading schema activation
  if (showSchemaActivation) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="max-w-lg w-full px-8">
          <div className="text-center mb-6">
            <p className="text-xs text-purple uppercase tracking-wider mb-2">Before You Read</p>
            <h2 className="text-xl font-semibold text-text mb-2">What do you already know?</h2>
            <p className="text-sm text-text-muted">
              Take 30 seconds to write what you already know about <span className="text-text font-medium">{schemaActivationTopic}</span>.
              This activates your existing knowledge and helps new information stick.
            </p>
          </div>
          <textarea
            autoFocus
            placeholder="I know that..."
            rows={4}
            className="w-full p-4 bg-surface border border-border rounded-lg text-sm text-text placeholder:text-text-muted focus:outline-none focus:border-purple resize-none"
            style={{ fontFamily: "Georgia, serif" }}
          />
          <div className="flex gap-3 mt-4">
            <button
              onClick={dismissSchemaActivation}
              className="flex-1 py-3 text-sm text-text-muted border border-border rounded-lg hover:text-text hover:border-purple/50 transition-colors"
            >
              Skip
            </button>
            <button
              onClick={dismissSchemaActivation}
              className="flex-1 py-3 text-sm bg-purple text-white rounded-lg font-medium hover:opacity-90 transition-opacity"
            >
              I'm Ready to Read
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isLastSection = currentSectionIndex >= sections.length - 1;
  const currentSectionHeading = sections[currentSectionIndex]?.heading ?? null;
  const currentGateQ = gateQuestions[gatePhase];

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border shrink-0 no-select">
        <div className="flex items-center gap-3">
          <button
            onClick={handleBack}
            className="text-sm text-text-muted hover:text-text transition-colors"
          >
            &larr; Back
          </button>
          {/* Breadcrumbs */}
          <div className="flex items-center gap-1 text-sm truncate max-w-md">
            {rawContent && (() => {
              const fm = parseFrontmatter(rawContent).frontmatter;
              const subject = fm.subject ? String(fm.subject) : "";
              const fileName = filePath?.split("/").pop()?.replace(".md", "") || "";
              const sectionName = sections[currentSectionIndex]?.heading;
              return (
                <>
                  {subject && (
                    <>
                      <button onClick={handleBack} className="text-text-muted hover:text-purple transition-colors truncate max-w-[160px]">{subject}</button>
                      <span className="text-text-muted">/</span>
                    </>
                  )}
                  <span className="font-medium truncate">{fileName}</span>
                  {sectionName && (
                    <>
                      <span className="text-text-muted">/</span>
                      <span className="text-text-muted truncate max-w-[180px]">{sectionName}</span>
                    </>
                  )}
                </>
              );
            })()}
          </div>
        </div>
        <span className="text-xs text-text-muted">
          Section {currentSectionIndex + 1} of {sections.length}
        </span>
      </div>

      {/* Progress bar */}
      <ProgressBar
        sectionsRevealed={currentSectionIndex + 1}
        totalSections={sections.length}
        gatesCompleted={gateResponses.length}
      />

      {/* Content area */}
      <div className="flex-1 overflow-y-auto">
        <div ref={contentRef} className="max-w-[720px] mx-auto px-8 py-8 relative">
          {error && (
            <div className="mx-auto max-w-[720px] mb-4 p-3 bg-coral/10 border border-coral rounded text-coral flex justify-between items-center">
              <span>{error}</span>
              <button onClick={clearError} className="ml-4 text-coral hover:text-text">&times;</button>
            </div>
          )}
          {/* Render all revealed sections with gate responses */}
          {sections.slice(0, currentSectionIndex + 1).map((section, i) => (
            <div key={i}>
              <div
                className={`mb-4 ${
                  i < currentSectionIndex ? "opacity-60" : ""
                }`}
              >
                {section.heading && (
                  <MarkdownRenderer
                    content={`${"#".repeat(section.level)} ${section.heading}`}
                    onWikilinkClick={handleWikilinkClick}
                  />
                )}
                {section.content && (
                  <MarkdownRenderer content={section.content} onWikilinkClick={handleWikilinkClick} />
                )}
              </div>
              {/* Show gate response for this section (if completed) */}
              {gateResponses
                .filter((r) => r.sectionIndex === i + 1)
                .map((r, j) => (
                  <div
                    key={`gate-${j}`}
                    className={`mb-8 p-4 bg-surface-2 rounded border border-border space-y-3 ${
                      i < currentSectionIndex ? "opacity-60" : ""
                    }`}
                  >
                    {r.subQuestions.map((sq, k) => (
                      <div key={k} className={k > 0 ? "pt-3 border-t border-border" : ""}>
                        <p className="text-xs text-purple font-medium mb-1">
                          Q{k + 1} — {sq.promptType.charAt(0).toUpperCase() + sq.promptType.slice(1)}
                        </p>
                        <p className="text-xs text-text-muted mb-1">{sq.prompt}</p>
                        <p className="text-sm text-text italic mb-1">
                          &ldquo;{sq.response}&rdquo;
                        </p>
                        {sq.feedback && (
                          <p className="text-sm text-teal">{sq.feedback}</p>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
            </div>
          ))}

          {/* Auto-suggested flashcards from AI */}
          {suggestedCards.length > 0 && (
            <div className="mb-6 p-4 bg-surface border border-amber/30 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-amber font-medium">Suggested Flashcards</p>
                <button onClick={dismissSuggestions} className="text-xs text-text-muted hover:text-text">Dismiss all</button>
              </div>
              <div className="space-y-2">
                {suggestedCards.map((s, i) => (
                  <div key={i} className="p-2 bg-surface-2 rounded border border-border">
                    <p className="text-xs text-text"><strong>Q:</strong> {s.question}</p>
                    <p className="text-xs text-text-muted"><strong>A:</strong> {s.answer}</p>
                    <div className="flex gap-2 mt-1">
                      <button
                        onClick={async () => {
                          if (!rawContent) return;
                          const fm = parseFrontmatter(rawContent).frontmatter;
                          await useFlashcardStore.getState().createCard(
                            (fm.subject as string) || "", (fm.topic as string) || "",
                            s.question, s.answer, s.bloom,
                          );
                          dismissSuggestions();
                        }}
                        className="px-2 py-0.5 text-xs bg-teal text-white rounded hover:opacity-90"
                      >Save</button>
                      <button
                        onClick={() => {
                          const remaining = suggestedCards.filter((_, j) => j !== i);
                          if (remaining.length === 0) dismissSuggestions();
                          else useReaderStore.setState({ suggestedCards: remaining });
                        }}
                        className="px-2 py-0.5 text-xs text-text-muted hover:text-coral"
                      >Dismiss</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Gate or navigation */}
          {gateOpen ? (
            <DigestionGate
              promptType={currentGateQ?.type || "recall"}
              prompt={currentGateQ?.question || "What is the main idea of this section?"}
              sectionHeading={currentSectionHeading}
              onSubmit={submitGateResponse}
              generating={gateGenerating}
              currentPhase={gatePhase}
              totalQuestions={gateQuestions.length || 2}
              lastFeedback={lastFeedback}
              lastMastery={lastMastery}
              skipped={gateSkipped}
            />
          ) : (
            <div className="flex items-center justify-between py-6 border-t border-border mt-8">
              <button
                onClick={() => goToSection(currentSectionIndex - 1)}
                disabled={currentSectionIndex === 0}
                className="px-4 py-2 text-sm text-text-muted border border-border rounded hover:text-text disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                &larr; Previous
              </button>

              {/* Create flashcard from current section */}
              <CreateFlashcardPanel
                rawContent={rawContent}
                section={sections[currentSectionIndex]}
              />

              {isLastSection ? (
                <div className="text-center">
                  <p className="text-teal text-sm font-medium mb-2">
                    Reading complete
                  </p>
                  <div className="flex gap-2 flex-wrap justify-center">
                    <button
                      onClick={() => {
                        if (!rawContent) return;
                        const { content } = parseFrontmatter(rawContent);
                        const fm = parseFrontmatter(rawContent).frontmatter;
                        useQuizStore.getState().generateQuiz(
                          fm.subject as string || "", fm.topic as string || "", content,
                        );
                        navigate("/quiz");
                      }}
                      className="px-4 py-2 text-sm bg-purple text-white rounded hover:opacity-90"
                    >
                      Quiz This Chapter
                    </button>
                    <button
                      onClick={() => {
                        if (!rawContent) return;
                        const fm = parseFrontmatter(rawContent).frontmatter;
                        useTeachBackStore.getState().startTeachBack(
                          fm.subject as string || "", fm.topic as string || "",
                        );
                        navigate("/teach-back");
                      }}
                      className="px-4 py-2 text-sm text-teal border border-teal rounded hover:bg-teal/10"
                    >
                      Teach Back
                    </button>
                    <button
                      onClick={handleBack}
                      className="px-4 py-2 text-sm text-text-muted border border-border rounded hover:text-text"
                    >
                      Back to Vault
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={advanceSection}
                  className="px-6 py-2 text-sm bg-purple text-white rounded font-medium hover:opacity-90 transition-opacity"
                >
                  Next Section &rarr;
                </button>
              )}
            </div>
          )}

          <div ref={bottomRef} />

          {/* Highlight-to-Ask AI overlay */}
          {aiEnabled && selection && (
            <HighlightAskAI
              selectedText={selection.text}
              selectionRect={selection.rect}
              containerRef={contentRef}
              sectionContent={sections[currentSectionIndex]?.content || ""}
              sectionHeading={sections[currentSectionIndex]?.heading || null}
              onDismiss={() => setSelection(null)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
