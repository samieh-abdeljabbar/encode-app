import { Inbox, Sparkles } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { QueueItemRow } from "../components/queue/QueueItemRow";
import { QueueStats } from "../components/queue/QueueStats";
import type { QueueDashboard } from "../lib/tauri";
import { getQueueDashboard } from "../lib/tauri";

export function Queue() {
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState<QueueDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await getQueueDashboard();
      setDashboard(data);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-coral">{error}</p>
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-text-muted">Loading...</p>
      </div>
    );
  }

  const [nextItem, ...remainingItems] = dashboard.items;

  return (
    <div className="mx-auto max-w-6xl px-8 py-8">
      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <div className="section-kicker">Today</div>
          <h1 className="serif-heading mt-2 text-4xl font-semibold text-text">
            Your next step is already lined up.
          </h1>
          <p className="mt-3 text-base leading-relaxed text-text-muted">
            Keep moving with one focused action at a time. Queue blends reading,
            repair, review, and quizzes into one calm place.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate("/pathway")}
          className="soft-panel flex items-center gap-3 self-start rounded-2xl px-4 py-3 text-left hover:-translate-y-0.5 hover:border-accent/25"
        >
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent/10">
            <Sparkles size={18} className="text-accent" />
          </div>
          <div>
            <div className="text-sm font-semibold text-text">
              Start something new
            </div>
            <div className="text-xs text-text-muted">
              Build a guided learning path for a fresh topic.
            </div>
          </div>
        </button>
      </div>

      <QueueStats summary={dashboard.summary} />

      <div className="mt-8">
        {nextItem ? (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.9fr)]">
            <div>
              <div className="mb-3 section-kicker">Start Here</div>
              <QueueItemRow item={nextItem} featured />
            </div>

            <div className="soft-panel rounded-[28px] p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <div className="section-kicker">After That</div>
                  <div className="mt-1 text-sm text-text-muted">
                    The rest of your queue stays ready when you are.
                  </div>
                </div>
                <div className="rounded-full bg-panel px-3 py-1 text-xs text-text-muted">
                  {dashboard.items.length} total items
                </div>
              </div>

              {remainingItems.length > 0 ? (
                <div className="flex flex-col gap-3">
                  {remainingItems.map((item, i) => (
                    <QueueItemRow
                      key={`${item.item_type}-${item.target_id}-${i + 1}`}
                      item={item}
                    />
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-border bg-panel/70 px-5 py-8 text-center">
                  <p className="text-sm font-medium text-text">
                    Just one task left in the queue.
                  </p>
                  <p className="mt-1 text-xs text-text-muted">
                    Finish it and you will be caught up for now.
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="soft-panel flex flex-col items-center justify-center rounded-[28px] py-20 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-accent/6">
              <Inbox size={20} className="text-accent/40" />
            </div>
            <p className="text-base font-medium text-text">All caught up!</p>
            <p className="mt-2 max-w-sm text-sm text-text-muted">
              Import content, open your library, or start a guided pathway when
              you are ready for something new.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={() => navigate("/workspace")}
                className="rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-accent/90"
              >
                Open Library
              </button>
              <button
                type="button"
                onClick={() => navigate("/pathway")}
                className="rounded-2xl border border-border bg-panel px-5 py-3 text-sm font-semibold text-text hover:border-accent/30"
              >
                Create Learning Path
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
