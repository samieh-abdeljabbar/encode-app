import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ProgressBar } from "./ProgressBar";

export function ReaderHeader({
  subjectName,
  title,
  currentSection,
  totalSections,
  actions,
}: {
  subjectName?: string;
  title: string;
  currentSection: number;
  totalSections: number;
  actions?: ReactNode;
}) {
  const navigate = useNavigate();

  return (
    <div className="shrink-0 border-b border-border-subtle px-7 py-4">
      <div className="mx-auto flex max-w-3xl items-center gap-4">
        <button
          type="button"
          onClick={() => navigate("/workspace")}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-panel-active hover:text-text"
        >
          <ArrowLeft size={16} />
        </button>
        <div className="min-w-0 flex-1">
          {subjectName && (
            <p className="mb-0.5 text-[11px] text-text-muted">{subjectName}</p>
          )}
          <h1 className="truncate text-sm font-semibold tracking-tight text-text">
            {title}
          </h1>
        </div>
        {actions}
        <div className="w-32">
          <ProgressBar current={currentSection + 1} total={totalSections} />
        </div>
      </div>
    </div>
  );
}
