import { isMacOS, useUpdaterStore } from "../../lib/updater";

export function UpdatePrompt() {
  const {
    status,
    version,
    downloadedBytes,
    contentLength,
    error,
    dismissed,
    downloadAndInstall,
    restart,
    dismiss,
  } = useUpdaterStore();

  if (dismissed && status !== "ready" && status !== "error") return null;
  if (status === "idle" || status === "checking") return null;

  const progressPct =
    contentLength && contentLength > 0
      ? Math.min(100, Math.round((downloadedBytes / contentLength) * 100))
      : null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
      <div className="pointer-events-auto w-full max-w-md rounded-2xl border border-border-subtle bg-panel p-4 shadow-[0_20px_48px_rgba(43,32,24,0.22)]">
        {status === "available" && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-accent">
              Update Available
            </p>
            <h3 className="mt-1 text-sm font-semibold text-text">
              Encode {version}
            </h3>
            <p className="mt-1 text-xs text-text-muted">
              A new version is ready to install.
            </p>
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={dismiss}
                className="h-8 rounded-lg border border-border px-3 text-xs font-medium text-text-muted transition-all hover:text-text"
              >
                Later
              </button>
              <button
                type="button"
                onClick={downloadAndInstall}
                className="h-8 rounded-lg bg-accent px-3 text-xs font-semibold text-white transition-all hover:bg-accent/90"
              >
                Install Update
              </button>
            </div>
          </div>
        )}

        {status === "downloading" && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-accent">
              Downloading
            </p>
            <h3 className="mt-1 text-sm font-semibold text-text">
              Encode {version}
            </h3>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-border-subtle">
              <div
                className="h-full bg-accent transition-all"
                style={{ width: `${progressPct ?? 0}%` }}
              />
            </div>
            <p className="mt-2 text-[10px] text-text-muted">
              {progressPct !== null
                ? `${progressPct}%`
                : `${Math.round(downloadedBytes / 1024)} KB`}
            </p>
          </div>
        )}

        {status === "ready" && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-teal">
              Ready to Install
            </p>
            <h3 className="mt-1 text-sm font-semibold text-text">
              Restart to finish updating
            </h3>
            {isMacOS() && (
              <div className="mt-3 rounded-lg border border-amber/30 bg-amber/5 p-3">
                <p className="text-[11px] font-medium text-amber">
                  macOS Gatekeeper notice
                </p>
                <p className="mt-1 text-[11px] text-text-muted">
                  If macOS shows "Encode is damaged" after restart, open
                  Terminal and run:
                </p>
                <code className="mt-1 block rounded bg-bg/60 px-2 py-1 text-[10px] text-text">
                  xattr -cr /Applications/Encode.app
                </code>
              </div>
            )}
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={dismiss}
                className="h-8 rounded-lg border border-border px-3 text-xs font-medium text-text-muted transition-all hover:text-text"
              >
                Later
              </button>
              <button
                type="button"
                onClick={restart}
                className="h-8 rounded-lg bg-accent px-3 text-xs font-semibold text-white transition-all hover:bg-accent/90"
              >
                Restart Now
              </button>
            </div>
          </div>
        )}

        {status === "error" && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-coral">
              Update Failed
            </p>
            <p className="mt-1 text-xs text-text-muted">
              {error ?? "An unknown error occurred."}
            </p>
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={dismiss}
                className="h-8 rounded-lg border border-border px-3 text-xs font-medium text-text-muted transition-all hover:text-text"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
