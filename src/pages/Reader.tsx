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
import { EmptyState, InputShell, MetaChip, PageHeader, Panel, PrimaryButton, SecondaryButton } from "../components/ui/primitives";

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
        "reader_manual_flashcard_suggest",
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
      <SecondaryButton
        onClick={() => setOpen(true)}
        className="px-3 py-1 text-xs"
      >
        + Card
      </SecondaryButton>
    );
  }

  return (
    <Panel
      className="mt-6 border-accent/30"
      title={<span className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">New Flashcard</span>}
      headerActions={
        <div className="flex gap-2">
          <SecondaryButton
            onClick={handleAiSuggest}
            disabled={generating}
            className="px-2 py-1 text-xs text-amber"
          >
            {generating ? "Generating..." : "AI Suggest"}
          </SecondaryButton>
          <button
            onClick={() => { setOpen(false); setSuggestions([]); }}
            className="px-2 py-1 text-xs text-text-muted hover:text-text"
          >
            Close
          </button>
        </div>
      }
      variant="alt"
    >
      {/* AI Suggestions */}
      {suggestions.length > 0 && (
        <div className="mb-4 space-y-2">
          <p className="text-xs text-amber">AI Suggestions:</p>
          {suggestions.map((s, i) => (
            <div key={i} className="rounded-xl border border-border-subtle bg-panel p-3">
              <p className="text-xs text-text mb-1"><strong>Q:</strong> {s.question}</p>
              <p className="text-xs text-text-muted mb-2"><strong>A:</strong> {s.answer}</p>
              <div className="flex gap-2">
                <PrimaryButton onClick={() => handleAcceptSuggestion(s)} className="border-teal bg-teal px-2 py-1 text-xs">Save</PrimaryButton>
                <SecondaryButton onClick={() => handleEditSuggestion(s)} className="px-2 py-1 text-xs">Edit</SecondaryButton>
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
      <InputShell className="mb-2 px-0 py-0">
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Question..."
          rows={2}
          className="input-reset w-full resize-none bg-transparent px-3 py-3 text-sm text-text"
        />
      </InputShell>
      <InputShell className="mb-3 px-0 py-0">
        <textarea
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="Answer..."
          rows={3}
          className="input-reset w-full resize-none bg-transparent px-3 py-3 text-sm text-text"
        />
      </InputShell>
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          <span className="text-xs text-text-muted mr-1">Bloom:</span>
          {[1, 2, 3, 4, 5, 6].map((b) => (
            <button
              key={b}
              onClick={() => setBloom(b)}
              className={`h-7 w-7 rounded-lg text-xs ${bloom === b ? "bg-accent text-white" : "border border-border-subtle bg-panel text-text-muted hover:border-border-strong hover:text-text"}`}
            >
              {b}
            </button>
          ))}
        </div>
        <PrimaryButton
          onClick={handleCreate}
          disabled={!question.trim() || !answer.trim()}
          className="px-4 py-1.5 text-xs"
        >
          Save Card
        </PrimaryButton>
      </div>
      {saved && <p className="text-xs text-teal mt-2">Card saved!</p>}
    </Panel>
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
  const [synthesisDraft, setSynthesisDraft] = useState("");
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
    synthesisSaving,
    synthesisResponse,
    synthesisEvaluation,
    synthesisComplete,
    submitSynthesis,
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

  useEffect(() => {
    setSynthesisDraft(synthesisResponse);
  }, [filePath, synthesisResponse]);

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
      <div className="flex h-full items-center justify-center px-4">
        <EmptyState
          title="No file selected for reading"
          action={<SecondaryButton onClick={() => navigate("/vault")}>Go to Vault</SecondaryButton>}
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center px-4">
        <Panel className="w-full max-w-md text-center">
          <p className="text-text-muted">Loading reader...</p>
        </Panel>
      </div>
    );
  }

  // Pre-reading schema activation
  if (showSchemaActivation) {
    return (
      <div className="flex h-full items-center justify-center px-6 py-10">
        <div className="w-full max-w-3xl">
          <PageHeader
            title="What do you already know?"
            subtitle={
              <span className="mx-auto block max-w-xl text-sm leading-6 text-text-muted">
              Take 30 seconds to write what you already know about <span className="text-text font-medium">{schemaActivationTopic}</span>. A quick recall pass makes the chapter easier to organize once you start reading.
              </span>
            }
            meta={<MetaChip variant="accent">Before You Read</MetaChip>}
            className="rounded-t-2xl border border-border-subtle text-center"
          />
          <Panel className="rounded-t-none border-t-0">
            <InputShell className="px-0 py-0">
              <textarea
                autoFocus
                placeholder="I know that..."
                rows={4}
                className="input-reset w-full resize-none bg-transparent px-4 py-4 text-sm text-text placeholder:text-text-muted"
                style={{ fontFamily: "var(--font-serif)" }}
              />
            </InputShell>
            <div className="mx-auto mt-5 flex max-w-xl gap-3">
              <SecondaryButton
                onClick={dismissSchemaActivation}
                className="flex-1 py-3"
              >
                Skip
              </SecondaryButton>
              <PrimaryButton
                onClick={dismissSchemaActivation}
                className="flex-1 py-3"
              >
                I'm Ready to Read
              </PrimaryButton>
            </div>
          </Panel>
        </div>
      </div>
    );
  }

  const isLastSection = currentSectionIndex >= sections.length - 1;
  const currentSectionHeading = sections[currentSectionIndex]?.heading ?? null;
  const currentGateQ = gateQuestions[gatePhase];
  const isChapter = Boolean(filePath?.includes("/chapters/"));
  const showSynthesisStep = isChapter && isLastSection && !synthesisComplete;

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title={rawContent ? parseFrontmatter(rawContent).frontmatter.topic || filePath?.split("/").pop()?.replace(".md", "") || "Reader" : "Reader"}
        subtitle={
          <div className="flex items-center gap-1 truncate text-sm">
            {rawContent && (() => {
              const fm = parseFrontmatter(rawContent).frontmatter;
              const subject = fm.subject ? String(fm.subject) : "";
              const fileName = filePath?.split("/").pop()?.replace(".md", "") || "";
              const sectionName = sections[currentSectionIndex]?.heading;
              return (
                <>
                  {subject && (
                    <>
                      <button onClick={handleBack} className="max-w-[160px] truncate text-text-muted transition-colors hover:text-accent">{subject}</button>
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
        }
        meta={<MetaChip>Section {currentSectionIndex + 1} of {sections.length}</MetaChip>}
        actions={<SecondaryButton onClick={handleBack}>Back</SecondaryButton>}
        className="no-select"
      />

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
                className={`mb-6 rounded-2xl border px-5 py-5 transition-colors ${
                  i === currentSectionIndex
                    ? "border-accent/30 bg-panel-active shadow-[var(--shadow-panel)]"
                    : "border-border-subtle bg-panel/40 opacity-75"
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
                    className={`mb-8 rounded-2xl border border-border-subtle bg-panel-alt p-4 shadow-[var(--shadow-panel)] space-y-3 ${
                      i < currentSectionIndex ? "opacity-75" : ""
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
                <div className="w-full">
                  {showSynthesisStep ? (
                    <Panel
                      title="Chapter Synthesis"
                      variant="active"
                      className="mx-auto max-w-2xl border-accent/25"
                      footer={
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-xs text-text-muted">
                            Synthesis is required before Quiz and Teach Back unlock.
                          </p>
                          <PrimaryButton
                            onClick={() => submitSynthesis(synthesisDraft)}
                            disabled={synthesisSaving || !synthesisDraft.trim()}
                          >
                            {synthesisSaving ? "Saving..." : "Save Synthesis"}
                          </PrimaryButton>
                        </div>
                      }
                    >
                      <p className="mb-3 text-sm text-text">
                        You&apos;ve reached the end of the chapter. Write the throughline in your own words: what mattered most, how the parts fit together, and what you should remember going forward.
                      </p>
                      <InputShell className="px-0 py-0">
                        <textarea
                          value={synthesisDraft}
                          onChange={(e) => setSynthesisDraft(e.target.value)}
                          placeholder="Connect the chapter in your own words..."
                          rows={7}
                          className="input-reset w-full resize-none bg-transparent px-4 py-4 text-sm leading-6 text-text placeholder:text-text-muted"
                          style={{ fontFamily: "var(--font-serif)" }}
                        />
                      </InputShell>
                    </Panel>
                  ) : (
                    <div className="mx-auto max-w-2xl text-center">
                      <Panel
                        title={isChapter ? "Reading Complete" : "Reader Complete"}
                        variant={isChapter ? "active" : "default"}
                        className={isChapter ? "border-teal/25" : ""}
                        bodyClassName="space-y-4"
                      >
                        <p className="text-sm text-text-muted">
                          {isChapter
                            ? "Chapter synthesis saved. The next step is to test and explain what you now understand."
                            : "This document is fully revealed. Choose the next action that fits what you want to do with it."}
                        </p>
                        {synthesisEvaluation && (
                          <div className="rounded-xl border border-border-subtle bg-panel-alt px-4 py-3 text-left text-sm text-text">
                            {synthesisEvaluation}
                          </div>
                        )}
                        <div className="flex flex-wrap justify-center gap-2">
                          <PrimaryButton
                            onClick={() => {
                              if (!rawContent) return;
                              const { content, frontmatter } = parseFrontmatter(rawContent);
                              useQuizStore.getState().generateQuiz(
                                String(frontmatter.subject || ""),
                                String(frontmatter.topic || ""),
                                content,
                                undefined,
                                filePath || undefined,
                              );
                              navigate("/quiz");
                            }}
                          >
                            Quiz This Chapter
                          </PrimaryButton>
                          <SecondaryButton
                            onClick={() => {
                              if (!rawContent) return;
                              const fm = parseFrontmatter(rawContent).frontmatter;
                              useTeachBackStore.getState().startTeachBack(
                                String(fm.subject || ""),
                                String(fm.topic || ""),
                                filePath || undefined,
                              );
                              navigate("/teach-back");
                            }}
                          >
                            Teach Back
                          </SecondaryButton>
                          <SecondaryButton onClick={handleBack}>
                            Back to Vault
                          </SecondaryButton>
                        </div>
                      </Panel>
                    </div>
                  )}
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
