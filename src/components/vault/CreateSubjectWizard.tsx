import { useState } from "react";
import { Plus, X, ChevronRight, BookOpen } from "lucide-react";
import { useVaultStore } from "../../stores/vault";
import { writeFile } from "../../lib/tauri";

interface CreateSubjectWizardProps {
  open: boolean;
  onClose: () => void;
  onCreated: (slug: string) => void;
}

export default function CreateSubjectWizard({ open, onClose, onCreated }: CreateSubjectWizardProps) {
  const { createSubject } = useVaultStore();
  const [step, setStep] = useState<1 | 2>(1);
  const [subjectName, setSubjectName] = useState("");
  const [chapters, setChapters] = useState<string[]>([""]);
  const [creating, setCreating] = useState(false);

  const reset = () => {
    setStep(1);
    setSubjectName("");
    setChapters([""]);
    setCreating(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleNext = () => {
    if (!subjectName.trim()) return;
    setStep(2);
  };

  const addChapter = () => {
    setChapters([...chapters, ""]);
  };

  const removeChapter = (index: number) => {
    if (chapters.length <= 1) return;
    setChapters(chapters.filter((_, i) => i !== index));
  };

  const updateChapter = (index: number, value: string) => {
    const next = [...chapters];
    next[index] = value;
    setChapters(next);
  };

  const handleCreate = async () => {
    if (!subjectName.trim()) return;
    setCreating(true);

    try {
      // Create the subject directory structure
      const slug = await createSubject(subjectName.trim());

      // Create chapter files for each non-empty chapter name
      const validChapters = chapters.filter((c) => c.trim());
      const now = new Date().toISOString().slice(0, 19);

      for (const chapterName of validChapters) {
        const chapterSlug = chapterName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        const path = `subjects/${slug}/chapters/${chapterSlug}.md`;
        const content = `---\nsubject: ${subjectName.trim()}\ntopic: ${chapterName.trim()}\ntype: chapter\ncreated_at: ${now}\nstatus: unread\n---\n\n# ${chapterName.trim()}\n\n`;
        await writeFile(path, content);
      }

      reset();
      onCreated(slug);
    } catch {
      setCreating(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={handleClose}>
      <div className="relative bg-surface border border-border rounded-xl shadow-2xl w-[420px] max-h-[80vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h3 className="text-sm font-semibold text-text">New Subject</h3>
            <p className="text-[10px] text-text-muted mt-0.5">Step {step} of 2</p>
          </div>
          <button onClick={handleClose} className="p-1 text-text-muted hover:text-text rounded transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Step 1: Subject Name */}
        {step === 1 && (
          <div className="p-5">
            <label className="block text-xs text-text-muted mb-2">Course or Subject Name</label>
            <input
              autoFocus
              type="text"
              value={subjectName}
              onChange={(e) => setSubjectName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleNext(); }}
              placeholder="e.g., D426 Data Management"
              className="w-full px-3 py-2.5 bg-surface-2 border border-border rounded-lg text-sm text-text placeholder:text-text-muted focus:outline-none focus:border-purple"
            />
            <div className="flex justify-end mt-4">
              <button
                onClick={handleNext}
                disabled={!subjectName.trim()}
                className="flex items-center gap-1.5 px-4 py-2 bg-purple text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-30 transition-opacity"
              >
                Next
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Chapter Names */}
        {step === 2 && (
          <div className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-xs text-text-muted">Adding chapters for</p>
                <p className="text-sm text-text font-medium">{subjectName}</p>
              </div>
              <button onClick={() => setStep(1)} className="text-[10px] text-text-muted hover:text-purple">
                Edit Name
              </button>
            </div>

            <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
              {chapters.map((ch, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-[10px] text-text-muted w-5 text-right shrink-0">{i + 1}.</span>
                  <div className="flex-1 relative">
                    <BookOpen size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
                    <input
                      autoFocus={i === chapters.length - 1}
                      type="text"
                      value={ch}
                      onChange={(e) => updateChapter(i, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          if (i === chapters.length - 1) addChapter();
                          else (e.target as HTMLElement).parentElement?.parentElement?.nextElementSibling?.querySelector("input")?.focus();
                        }
                      }}
                      placeholder={`Chapter ${i + 1} name...`}
                      className="w-full pl-8 pr-3 py-2 bg-surface-2 border border-border rounded text-xs text-text placeholder:text-text-muted focus:outline-none focus:border-purple"
                    />
                  </div>
                  {chapters.length > 1 && (
                    <button onClick={() => removeChapter(i)} className="p-1 text-text-muted hover:text-coral shrink-0">
                      <X size={12} />
                    </button>
                  )}
                </div>
              ))}
            </div>

            <button
              onClick={addChapter}
              className="flex items-center gap-1.5 mt-2 text-[11px] text-purple hover:text-text transition-colors"
            >
              <Plus size={12} />
              Add Chapter
            </button>

            <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
              <p className="text-[10px] text-text-muted">
                {chapters.filter((c) => c.trim()).length} chapter{chapters.filter((c) => c.trim()).length !== 1 ? "s" : ""}
                {" "}(empty rows will be skipped)
              </p>
              <button
                onClick={handleCreate}
                disabled={creating}
                className="px-4 py-2 bg-purple text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-30 transition-opacity"
              >
                {creating ? "Creating..." : "Create Subject"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
