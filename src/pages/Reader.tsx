import { useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useReaderStore } from "../stores/reader";
import { useVaultStore } from "../stores/vault";
import MarkdownRenderer from "../components/shared/MarkdownRenderer";
import DigestionGate from "../components/reader/DigestionGate";
import ProgressBar from "../components/reader/ProgressBar";
import { getGatePrompt } from "../lib/gates";

export default function ReaderPage() {
  const navigate = useNavigate();
  const selectedFile = useVaultStore((s) => s.selectedFile);
  const {
    filePath,
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
    closeReader,
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

  const isLastSection = currentSectionIndex >= sections.length - 1;
  const currentGatePrompt = !isLastSection
    ? getGatePrompt(currentSectionIndex + 1)
    : null;
  const currentSectionHeading = sections[currentSectionIndex]?.heading ?? null;

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
          <span className="text-sm font-medium truncate max-w-md">
            {filePath?.split("/").pop()?.replace(".md", "")}
          </span>
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
        <div className="max-w-[720px] mx-auto px-8 py-8">
          {error && (
            <div className="mx-auto max-w-[720px] mb-4 p-3 bg-[#3a1a1a] border border-[#D85A30] rounded text-[#D85A30] flex justify-between items-center">
              <span>{error}</span>
              <button onClick={clearError} className="ml-4 text-[#D85A30] hover:text-white">&times;</button>
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
                  />
                )}
                {section.content && (
                  <MarkdownRenderer content={section.content} />
                )}
              </div>
              {/* Show gate response for this section (if completed) */}
              {gateResponses
                .filter((r) => r.sectionIndex === i + 1)
                .map((r, j) => (
                  <div
                    key={`gate-${j}`}
                    className={`mb-8 p-4 bg-surface-2 rounded border border-border ${
                      i < currentSectionIndex ? "opacity-60" : ""
                    }`}
                  >
                    <p className="text-xs text-purple font-medium mb-1">
                      {r.promptType.charAt(0).toUpperCase() + r.promptType.slice(1)} gate
                    </p>
                    <p className="text-sm text-text-muted italic mb-2">
                      &ldquo;{r.response}&rdquo;
                    </p>
                    {r.feedback && (
                      <div className="mt-2 pt-2 border-t border-border">
                        <p className="text-xs text-teal font-medium mb-1">
                          AI Feedback
                        </p>
                        <p className="text-sm text-text">{r.feedback}</p>
                      </div>
                    )}
                  </div>
                ))}
            </div>
          ))}

          {/* Gate or navigation */}
          {gateOpen && currentGatePrompt ? (
            <DigestionGate
              promptType={currentGatePrompt.type}
              prompt={currentGatePrompt.prompt}
              sectionHeading={currentSectionHeading}
              onSubmit={submitGateResponse}
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

              {isLastSection ? (
                <div className="text-center">
                  <p className="text-teal text-sm font-medium mb-2">
                    Reading complete
                  </p>
                  <button
                    onClick={handleBack}
                    className="px-4 py-2 text-sm text-purple border border-purple rounded hover:bg-purple/10"
                  >
                    Back to Vault
                  </button>
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
        </div>
      </div>
    </div>
  );
}
