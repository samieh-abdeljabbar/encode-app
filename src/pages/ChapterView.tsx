import type { EditorView } from "@codemirror/view";
import { ArrowLeft, BookOpen } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { MarkdownEditor } from "../components/editor/MarkdownEditor";
import { OutlinePanel } from "../components/editor/OutlinePanel";
import { StatusBar } from "../components/editor/StatusBar";
import {
  getChapterWithSections,
  listSubjects,
  loadReaderSession,
  updateChapterContent,
} from "../lib/tauri";
import type { ReaderSession } from "../lib/tauri";

export function ChapterView() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const chapterId = Number(searchParams.get("id"));

  const [session, setSession] = useState<ReaderSession | null>(null);
  const [subjectName, setSubjectName] = useState<string | null>(null);
  const [subjectId, setSubjectId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editorContent, setEditorContent] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">(
    "idle",
  );
  const [editorView, setEditorView] = useState<EditorView | null>(null);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorViewRef = useRef<EditorView | null>(null);

  const handleNavigateLine = useCallback((line: number) => {
    const view = editorViewRef.current;
    if (!view) return;
    const lineInfo = view.state.doc.line(
      Math.max(1, Math.min(line, view.state.doc.lines)),
    );
    view.dispatch({
      selection: { anchor: lineInfo.from },
      scrollIntoView: true,
    });
    view.focus();
  }, []);

  const load = useCallback(async () => {
    if (!chapterId) return;
    try {
      const data = await loadReaderSession(chapterId);
      setSession(data);
      // Always prepare editor content when session loads
      const md = data.sections
        .map((s) => {
          const heading = s.heading ? `## ${s.heading}\n\n` : "";
          return heading + s.body_markdown;
        })
        .join("\n\n");
      setEditorContent(md);
    } catch (e) {
      setError(String(e));
    }
  }, [chapterId]);

  // Load subject name for breadcrumb
  useEffect(() => {
    if (!chapterId) return;
    (async () => {
      try {
        const [chapterData, subjects] = await Promise.all([
          getChapterWithSections(chapterId),
          listSubjects(),
        ]);
        const subject = subjects.find(
          (s) => s.id === chapterData.chapter.subject_id,
        );
        if (subject) {
          setSubjectName(subject.name);
          setSubjectId(subject.id);
        }
      } catch {
        // breadcrumb is non-critical; silently ignore
      }
    })();
  }, [chapterId]);

  useEffect(() => {
    load();
  }, [load]);

  // Cleanup debounced save timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  const handleEditorChange = (value: string) => {
    setEditorContent(value);
    setSaveStatus("saving");
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        await updateChapterContent(chapterId, value);
        setSaveStatus("saved");
      } catch {
        setSaveStatus("idle");
      }
    }, 2000);
  };

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

  const checkedCount = session.sections.filter(
    (s) =>
      s.status === "checked_correct" ||
      s.status === "checked_partial" ||
      s.status === "checked_off_track",
  ).length;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="shrink-0 border-b border-border-subtle px-7 py-5">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => navigate("/workspace")}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-panel-active hover:text-text"
            >
              <ArrowLeft size={16} />
            </button>
            <div className="min-w-0 flex-1">
              {/* Breadcrumb */}
              {subjectName && (
                <p className="mb-0.5 text-[11px] text-text-muted">
                  {subjectName}
                </p>
              )}
              <h1 className="truncate text-lg font-semibold tracking-tight text-text">
                {session.chapter.title}
              </h1>
              <p className="text-xs text-text-muted">
                {checkedCount}/{session.sections.length} sections studied
              </p>
            </div>
            {saveStatus !== "idle" && (
              <span className="text-[10px] text-text-muted">
                {saveStatus === "saving" ? "Saving..." : "Saved"}
              </span>
            )}
            <OutlinePanel
              content={editorContent}
              onNavigate={handleNavigateLine}
            />
            <button
              type="button"
              onClick={() => navigate(`/reader?chapter=${chapterId}`)}
              className="flex h-10 items-center gap-2 rounded-xl bg-accent px-5 text-xs font-medium text-white shadow-sm transition-all hover:bg-accent/90"
            >
              <BookOpen size={14} />
              Start Study
            </button>
          </div>
        </div>
      </div>

      {/* Editor — always active, Obsidian-style */}
      <div className="flex-1 overflow-hidden">
        <MarkdownEditor
          value={editorContent}
          onChange={handleEditorChange}
          onViewReady={(view) => {
            editorViewRef.current = view;
            setEditorView(view);
          }}
          subjectId={subjectId ?? undefined}
          chapterId={chapterId}
        />
      </div>

      {/* Status bar */}
      <StatusBar view={editorView} />
    </div>
  );
}
