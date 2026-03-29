import {
  Archive,
  CheckCircle2,
  Clock,
  Database,
  Download,
  HardDrive,
  RefreshCw,
  Shield,
  User,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  createSnapshot,
  exportAll,
  getExportStatus,
  listSnapshots,
} from "../lib/tauri";
import type { ExportStatus, SnapshotInfo } from "../lib/tauri";

function StatusDot({ status }: { status: "ok" | "stale" | "none" }) {
  const color = {
    ok: "bg-teal",
    stale: "bg-amber",
    none: "bg-text-muted/20",
  }[status];

  return (
    <span className="relative flex h-2 w-2">
      {status === "ok" && (
        <span
          className={`absolute inline-flex h-full w-full animate-ping rounded-full ${color} opacity-40`}
        />
      )}
      <span className={`relative inline-flex h-2 w-2 rounded-full ${color}`} />
    </span>
  );
}

function getTimeDelta(timestamp: string | null | undefined): string {
  if (!timestamp) return "Never";
  const date = new Date(`${timestamp.replace(" ", "T")}Z`);
  const now = Date.now();
  const diffMs = now - date.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function getStatus(
  timestamp: string | null | undefined,
): "ok" | "stale" | "none" {
  if (!timestamp) return "none";
  const date = new Date(`${timestamp.replace(" ", "T")}Z`);
  const hoursSince = (Date.now() - date.getTime()) / 3600000;
  if (hoursSince < 1) return "ok";
  return "stale";
}

export function Settings() {
  const [exportStatus, setExportStatus] = useState<ExportStatus | null>(null);
  const [snapshots, setSnapshots] = useState<SnapshotInfo[]>([]);
  const [exporting, setExporting] = useState(false);
  const [snapshotting, setSnapshotting] = useState(false);
  const [exportCount, setExportCount] = useState<number | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const [status, snaps] = await Promise.all([
        getExportStatus(),
        listSnapshots(),
      ]);
      setExportStatus(status);
      setSnapshots(snaps);
    } catch {
      // Non-critical
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const handleExportAll = async () => {
    setExporting(true);
    setExportCount(null);
    try {
      const count = await exportAll();
      setExportCount(count);
      await loadStatus();
    } catch {
      // handled by status refresh
    } finally {
      setExporting(false);
    }
  };

  const handleSnapshot = async () => {
    setSnapshotting(true);
    try {
      await createSnapshot();
      await loadStatus();
    } catch {
      // handled by status refresh
    } finally {
      setSnapshotting(false);
    }
  };

  const exportDot = getStatus(exportStatus?.last_export_at);
  const snapshotDot = getStatus(exportStatus?.last_snapshot_at);

  return (
    <div className="mx-auto max-w-5xl px-7 py-7">
      <h1 className="mb-8 text-2xl font-semibold tracking-tight text-text">
        Settings
      </h1>

      {/* Data Safety */}
      <section className="mb-10">
        <div className="mb-4 flex items-center gap-2.5">
          <Shield size={14} className="text-accent" />
          <h2 className="text-sm font-semibold text-text">Data Safety</h2>
        </div>
        <p className="mb-8 max-w-2xl text-sm leading-relaxed text-text-muted">
          Your study data is automatically backed up. Exports save markdown
          files, snapshots copy the database.
        </p>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Export */}
          <div className="rounded-xl border border-border bg-panel p-7 shadow-[0_12px_32px_rgba(30,42,34,0.06)]">
            <div className="mb-5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <StatusDot status={exportDot} />
                <span className="text-xs font-semibold text-text">Export</span>
              </div>
              <Download size={13} className="text-text-muted/30" />
            </div>
            <div className="mb-2 font-mono text-3xl tabular-nums tracking-tight text-text">
              {getTimeDelta(exportStatus?.last_export_at)}
            </div>
            <div className="mb-7 text-xs text-text-muted/60">
              {exportStatus?.last_export_at
                ? `Last: ${exportStatus.last_export_at}`
                : "No exports yet"}
            </div>
            <button
              type="button"
              onClick={handleExportAll}
              disabled={exporting}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-border bg-panel-alt px-4 text-sm font-medium text-text-muted transition-all hover:border-accent/30 hover:text-accent disabled:opacity-40"
            >
              <RefreshCw
                size={11}
                className={exporting ? "animate-spin" : ""}
              />
              {exporting ? "Exporting..." : "Export All Now"}
            </button>
            {exportCount !== null && (
              <div className="mt-3 flex items-center gap-1.5 text-[11px] text-teal">
                <CheckCircle2 size={10} />
                {exportCount} subject{exportCount !== 1 ? "s" : ""} exported
              </div>
            )}
          </div>

          {/* Snapshot */}
          <div className="rounded-xl border border-border bg-panel p-7 shadow-[0_12px_32px_rgba(30,42,34,0.06)]">
            <div className="mb-5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <StatusDot status={snapshotDot} />
                <span className="text-xs font-semibold text-text">
                  Snapshot
                </span>
              </div>
              <Database size={13} className="text-text-muted/30" />
            </div>
            <div className="mb-2 font-mono text-3xl tabular-nums tracking-tight text-text">
              {getTimeDelta(exportStatus?.last_snapshot_at)}
            </div>
            <div className="mb-7 text-xs text-text-muted/60">
              {exportStatus?.last_snapshot_at
                ? `Last: ${exportStatus.last_snapshot_at}`
                : "No snapshots yet"}
            </div>
            <button
              type="button"
              onClick={handleSnapshot}
              disabled={snapshotting}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-border bg-panel-alt px-4 text-sm font-medium text-text-muted transition-all hover:border-accent/30 hover:text-accent disabled:opacity-40"
            >
              <HardDrive
                size={11}
                className={snapshotting ? "animate-spin" : ""}
              />
              {snapshotting ? "Creating..." : "Snapshot Now"}
            </button>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-2.5 rounded-2xl bg-accent-soft/30 px-4 py-3.5 text-sm text-text-muted">
          <Clock size={10} className="shrink-0 text-accent/50" />
          Exports run every 15 min, snapshots every hour — automatically
        </div>
      </section>

      {/* Snapshots list */}
      {snapshots.length > 0 && (
        <section className="mb-10">
          <div className="mb-4 flex items-center gap-2.5">
            <Archive size={14} className="text-text-muted" />
            <h2 className="text-sm font-semibold text-text">
              Available Snapshots
            </h2>
          </div>
          <div className="rounded-xl border border-border bg-panel p-4">
            <div className="space-y-1">
              {snapshots.map((snap) => (
                <div
                  key={snap.name}
                  className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm text-text-muted transition-colors hover:bg-panel-alt"
                >
                  <HardDrive size={11} className="shrink-0 opacity-30" />
                  <span className="font-mono text-[11px]">{snap.name}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Profile placeholder */}
      <section className="mb-10">
        <div className="mb-4 flex items-center gap-2.5">
          <User size={14} className="text-accent" />
          <h2 className="text-sm font-semibold text-text">Profile & AI</h2>
        </div>
        <div className="rounded-xl border border-dashed border-border bg-panel/40 px-8 py-12 text-center">
          <p className="text-sm text-text-muted/60">
            AI provider and profile configuration available in Phase 3
          </p>
        </div>
      </section>
    </div>
  );
}
