import { useEffect, useState } from "react";
import { Clock, ChevronRight, ChevronDown } from "lucide-react";
import { useTrackingStore } from "../../stores/tracking";

function formatTime(totalSeconds: number): string {
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const hours = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export default function TrackingSection() {
  const { studyTimes, todayTotal, loadStudyTimes, loadTodayTotal } =
    useTrackingStore();
  const [collapsed, setCollapsed] = useState(true);

  useEffect(() => {
    loadStudyTimes();
    loadTodayTotal();
  }, [loadStudyTimes, loadTodayTotal]);

  return (
    <div className="border-t border-border">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center gap-1.5 px-3 py-2 text-left hover:bg-surface-2 transition-colors"
      >
        {collapsed ? (
          <ChevronRight size={12} className="text-text-muted shrink-0" />
        ) : (
          <ChevronDown size={12} className="text-text-muted shrink-0" />
        )}
        <Clock size={12} className="text-teal shrink-0" />
        <span className="text-[11px] font-medium text-text">Tracking</span>
        {todayTotal > 0 && (
          <span className="ml-auto text-[10px] text-teal tabular-nums">
            {formatTime(todayTotal)} today
          </span>
        )}
      </button>

      {!collapsed && (
        <div className="px-3 pb-2">
          {studyTimes.length === 0 ? (
            <p className="text-[10px] text-text-muted px-1 py-1">
              No sessions yet
            </p>
          ) : (
            <div className="space-y-0.5">
              {studyTimes.map((st) => (
                <div
                  key={st.subject_slug}
                  className="flex items-center justify-between px-1 py-0.5"
                >
                  <span className="text-[11px] text-text truncate mr-2">
                    {st.subject_name}
                  </span>
                  <span className="text-[10px] text-text-muted tabular-nums shrink-0">
                    {formatTime(st.total_seconds)}
                    <span className="ml-1 text-text-muted/60">
                      ({st.session_count})
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
