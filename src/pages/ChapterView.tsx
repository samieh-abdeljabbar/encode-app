import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Circle,
  Eye,
  Pencil,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { MarkdownEditor } from "../components/editor/MarkdownEditor";
import { ReaderContent } from "../components/reader/ReaderContent";
import { loadReaderSession, updateChapterContent } from "../lib/tauri";
import type { ReaderSession } from "../lib/tauri";

function StatusDot({ status }: { status: string }) {
  switch (status) {
    case "checked_correct":
      return <CheckCircle2 size={14} className="shrink-0 text-teal" />;
    case "checked_partial":
      return <Circle size={14} className="shrink-0 text-amber" />;
    case "checked_off_track":
      return <XCircle size={14} className="shrink-0 text-coral" />;
    case "seen":
      return <Circle size={14} className="shrink-0 text-text-muted/40" />;
    default:
      return <Circle size={14} className="shrink-0 text-text-muted/20" />;
  }
}

export function ChapterView() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const chapterId = Number(searchParams.get("id"));

  const [session, setSession] = useState<ReaderSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(searchParams.get("edit") === "true");
  const [editorContent, setEditorContent] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">(
    "idle",
  );

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    if (!chapterId) return;
    try {
      const data = await loadReaderSession(chapterId);
      setSession(data);
    } catch (e) {
      setError(String(e));
    }
  }, [chapterId]);

  useEffect(() => {
    load();
  }, [load]);

  const enterEditMode = useCallback((currentSession: ReaderSession) => {
    const markdown = currentSession.sections
      .map((s) => {
        const heading = s.heading ? `## ${s.heading}\n\n` : "";
        return heading + s.body_markdown;
      })
      .join("\n\n");
    setEditorContent(markdown);
    setEditMode(true);
  }, []);

  // Auto-enter edit mode when ?edit=true and session has loaded
  useEffect(() => {
    if (session && searchParams.get("edit") === "true" && !editMode) {
      enterEditMode(session);
    }
  }, [session, searchParams, editMode, enterEditMode]);

  const handleEditorChange = (value: string) => {
    setEditorContent(value);
    setSaveStatus("saving");
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        await updateChapterContent(chapterId, value);
        setSaveStatus("saved");
        // Reload session to update section list
        load();
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
              onClick={() => navigate("/library")}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-panel-active hover:text-text"
            >
              <ArrowLeft size={16} />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-lg font-semibold tracking-tight text-text">
                {session.chapter.title}
              </h1>
              <p className="text-xs text-text-muted">
                {checkedCount}/{session.sections.length} sections studied
              </p>
            </div>
            {editMode && saveStatus !== "idle" && (
              <span className="text-[10px] text-text-muted">
                {saveStatus === "saving" ? "Saving..." : "Saved"}
              </span>
            )}
            <button
              type="button"
              onClick={() =>
                editMode ? setEditMode(false) : enterEditMode(session)
              }
              className="flex h-9 w-9 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-panel-active hover:text-text"
            >
              {editMode ? <Eye size={16} /> : <Pencil size={16} />}
            </button>
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

      {/* Content area */}
      {editMode ? (
        <div className="h-full">
          <MarkdownEditor value={editorContent} onChange={handleEditorChange} />
        </div>
      ) : (
        /* Scrollable content — all sections */
        <div className="flex-1 overflow-auto">
          {session.sections.map((section) => (
            <div key={section.id} className="border-b border-border-subtle/40">
              {section.heading && (
                <div className="mx-auto flex max-w-3xl items-center gap-2.5 px-7 pt-7">
                  <StatusDot status={section.status} />
                  <h2 className="text-lg font-semibold tracking-tight text-text">
                    {section.heading}
                  </h2>
                </div>
              )}
              <ReaderContent
                heading={null}
                bodyMarkdown={section.body_markdown}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
