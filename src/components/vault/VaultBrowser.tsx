import { useEffect, useState } from "react";
import { useVaultStore } from "../../stores/vault";

export default function VaultBrowser() {
  const {
    subjects,
    files,
    loading,
    error,
    loadSubjects,
    loadFiles,
    selectFile,
    selectedFile,
  } = useVaultStore();
  const [expandedSubject, setExpandedSubject] = useState<string | null>(null);

  useEffect(() => {
    loadSubjects();
  }, [loadSubjects]);

  const handleSubjectClick = (slug: string) => {
    if (expandedSubject === slug) {
      setExpandedSubject(null);
    } else {
      setExpandedSubject(slug);
      loadFiles(slug);
    }
  };

  if (error) {
    return <p className="text-coral text-sm">{error}</p>;
  }

  return (
    <div>
      {subjects.length === 0 && !loading && (
        <p className="text-text-muted text-sm">
          No subjects yet. Import content or create a subject folder in
          ~/Encode/subjects/
        </p>
      )}

      {subjects.map((subject) => (
        <div key={subject.slug} className="mb-1">
          <button
            onClick={() => handleSubjectClick(subject.slug)}
            className="w-full text-left px-3 py-2 text-sm hover:bg-surface-2 rounded flex items-center justify-between"
          >
            <span
              className={
                expandedSubject === subject.slug
                  ? "text-text"
                  : "text-text-muted"
              }
            >
              {subject.name}
            </span>
            <span className="text-xs text-text-muted">
              {subject.chapter_count}ch
            </span>
          </button>

          {expandedSubject === subject.slug && (
            <div className="ml-4 border-l border-border pl-2">
              {loading ? (
                <p className="text-xs text-text-muted py-1 px-2">Loading...</p>
              ) : files.length === 0 ? (
                <p className="text-xs text-text-muted py-1 px-2">No files</p>
              ) : (
                files.map((file) => (
                  <button
                    key={file.file_path}
                    onClick={() => selectFile(file.file_path)}
                    className={`w-full text-left px-2 py-1 text-xs rounded truncate ${
                      selectedFile === file.file_path
                        ? "bg-surface-2 text-purple"
                        : "text-text-muted hover:text-text hover:bg-surface-2"
                    }`}
                    title={file.file_path}
                  >
                    {file.file_path.split("/").pop()?.replace(".md", "") ??
                      file.file_path}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
