import { useCallback, useEffect, useMemo } from "react";
import { useAppStore } from "../../stores/app";
import { useTrackingStore } from "../../stores/tracking";
import { usePomodoroStore } from "../../stores/pomodoro";
import { localDateTimeString } from "../../lib/dates";

const COMPLETION_SOUND_SRC =
  "data:audio/wav;base64,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";

function playCompletionSound() {
  const audio = new Audio(COMPLETION_SOUND_SRC);
  audio.volume = 0.55;
  void audio.play().catch(() => {});
}

export default function PomodoroRuntime() {
  const config = useAppStore((s) => s.config);
  const recordSession = useTrackingStore((s) => s.recordSession);
  const status = usePomodoroStore((s) => s.status);
  const notice = usePomodoroStore((s) => s.notice);
  const syncDefaults = usePomodoroStore((s) => s.syncDefaults);
  const tick = usePomodoroStore((s) => s.tick);
  const dismissNotice = usePomodoroStore((s) => s.dismissNotice);

  useEffect(() => {
    if (!config) return;
    syncDefaults(
      config.pomodoro_study_secs,
      config.pomodoro_break_secs,
      config.pomodoro_long_break_secs,
    );
  }, [
    config?.pomodoro_study_secs,
    config?.pomodoro_break_secs,
    config?.pomodoro_long_break_secs,
    config,
    syncDefaults,
  ]);

  const handleCompletion = useCallback(() => {
    const state = usePomodoroStore.getState();
    const currentConfig = useAppStore.getState().config;
    if (!currentConfig || state.status !== "running") return;

    const completedPhase = state.phase;
    const completedDuration = state.durationSecs;
    const startedAt = state.startedAt ?? localDateTimeString();
    const selectedSubjectSlug = state.selectedSubjectSlug;
    const selectedSubjectName = state.selectedSubjectName;

    if (completedPhase === "study" && selectedSubjectSlug && selectedSubjectName) {
      void recordSession(
        selectedSubjectName,
        selectedSubjectSlug,
        completedDuration,
        startedAt,
      ).catch(() => {});
    }

    if (currentConfig.pomodoro_sound_enabled) {
      playCompletionSound();
    }

    if (currentConfig.pomodoro_notifications_enabled) {
      const detail =
        completedPhase === "study"
          ? "Study session complete. Start your break when ready."
          : "Break complete. Return to study when ready.";
      usePomodoroStore.getState().showNotice({
        id: Date.now(),
        title: completedPhase === "study" ? "Study Complete" : "Break Complete",
        detail,
        phase: completedPhase,
      });
    }

    usePomodoroStore
      .getState()
      .advanceAfterCompletion(
        currentConfig.pomodoro_study_secs,
        currentConfig.pomodoro_break_secs,
        currentConfig.pomodoro_long_break_secs,
      );
  }, [recordSession]);

  const syncTimer = useCallback(() => {
    if (tick()) {
      handleCompletion();
    }
  }, [handleCompletion, tick]);

  useEffect(() => {
    syncTimer();
  }, [syncTimer]);

  useEffect(() => {
    if (status !== "running") return;
    const intervalId = window.setInterval(syncTimer, 1000);
    return () => window.clearInterval(intervalId);
  }, [status, syncTimer]);

  useEffect(() => {
    const handleFocus = () => syncTimer();
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        syncTimer();
      }
    };
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [syncTimer]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => dismissNotice(), 5000);
    return () => window.clearTimeout(timeout);
  }, [notice, dismissNotice]);

  const noticeTone = useMemo(() => {
    if (!notice) return "";
    return notice.phase === "study" ? "border-accent/30 bg-accent-soft text-text" : "border-teal/30 bg-teal/10 text-text";
  }, [notice]);

  if (!notice) return null;

  return (
    <div className="pointer-events-none fixed right-5 top-5 z-[70]">
      <div className={`pointer-events-auto min-w-[280px] rounded-2xl border px-4 py-3 shadow-[var(--shadow-overlay)] ${noticeTone}`}>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-text">{notice.title}</p>
            <p className="mt-1 text-xs text-text-muted">{notice.detail}</p>
          </div>
          <button
            type="button"
            onClick={dismissNotice}
            className="rounded-lg border border-border-subtle px-2 py-1 text-[11px] text-text-muted transition-colors hover:border-border-strong hover:text-text"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
