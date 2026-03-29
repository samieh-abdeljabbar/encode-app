import { Inbox } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { QueueItemRow } from "../components/queue/QueueItemRow";
import { QueueStats } from "../components/queue/QueueStats";
import type { QueueDashboard } from "../lib/tauri";
import { getQueueDashboard } from "../lib/tauri";

export function Queue() {
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

  return (
    <div className="mx-auto max-w-3xl px-7 py-7">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight text-text">
        Study Queue
      </h1>

      <QueueStats summary={dashboard.summary} />

      <div className="mt-8">
        {dashboard.items.length > 0 ? (
          <div className="flex flex-col gap-3">
            {dashboard.items.map((item, i) => (
              <QueueItemRow
                key={`${item.item_type}-${item.target_id}-${i}`}
                item={item}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-panel/50 py-16 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-accent/6">
              <Inbox size={20} className="text-accent/40" />
            </div>
            <p className="text-sm font-medium text-text-muted">
              All caught up!
            </p>
            <p className="mt-1 text-xs text-text-muted/60">
              Import content or start a new chapter to begin studying
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
