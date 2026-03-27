import { useEffect, useMemo, useState } from "react";
import { Pause, Play, RotateCcw, SlidersHorizontal, Volume2, Bell, ChevronDown, ChevronUp } from "lucide-react";
import { useAppStore } from "../../stores/app";
import { usePomodoroStore } from "../../stores/pomodoro";
import { useTrackingStore } from "../../stores/tracking";
import { useVaultStore } from "../../stores/vault";
import { MetaChip, PrimaryButton, SecondaryButton } from "../ui/primitives";

function formatClock(totalSecs: number): string {
  const safe = Math.max(0, totalSecs);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

function formatSummaryTime(totalSeconds: number): string {
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const hours = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function minutesFromSecs(totalSecs: number): number {
  return Math.max(1, Math.round(totalSecs / 60));
}

function progressPercent(remainingSecs: number, durationSecs: number): number {
  if (durationSecs <= 0) return 0;
  return Math.min(100, Math.max(0, ((durationSecs - remainingSecs) / durationSecs) * 100));
}

export default function PomodoroTimer() {
  const config = useAppStore((s) => s.config);
  const saveConfig = useAppStore((s) => s.saveConfig);
  const subjects = useVaultStore((s) => s.subjects);
  const loadSubjects = useVaultStore((s) => s.loadSubjects);

  const { studyTimes, todayTotal, loadStudyTimes, loadTodayTotal } = useTrackingStore();

  const phase = usePomodoroStore((s) => s.phase);
  const status = usePomodoroStore((s) => s.status);
  const durationSecs = usePomodoroStore((s) => s.durationSecs);
  const remainingSecs = usePomodoroStore((s) => s.remainingSecs);
  const completedStudySessions = usePomodoroStore((s) => s.completedStudySessions);
  const selectedSubjectSlug = usePomodoroStore((s) => s.selectedSubjectSlug);
  const start = usePomodoroStore((s) => s.start);
  const pause = usePomodoroStore((s) => s.pause);
  const reset = usePomodoroStore((s) => s.reset);
  const chooseStudyDuration = usePomodoroStore((s) => s.chooseStudyDuration);
  const setSelectedSubject = usePomodoroStore((s) => s.setSelectedSubject);

  const studySecs = config?.pomodoro_study_secs ?? 1500;
  const breakSecs = config?.pomodoro_break_secs ?? 300;
  const longBreakSecs = config?.pomodoro_long_break_secs ?? 900;
  const quickTimers = config?.quick_timers ?? [1500, 1800, 2700, 3600];
  const soundEnabled = config?.pomodoro_sound_enabled ?? true;
  const notificationsEnabled = config?.pomodoro_notifications_enabled ?? true;

  const [showDetails, setShowDetails] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [studyMinutes, setStudyMinutes] = useState(String(minutesFromSecs(studySecs)));
  const [breakMinutes, setBreakMinutes] = useState(String(minutesFromSecs(breakSecs)));
  const [longBreakMinutes, setLongBreakMinutes] = useState(String(minutesFromSecs(longBreakSecs)));
  const [quickPresetMinutes, setQuickPresetMinutes] = useState(quickTimers.map((secs) => String(minutesFromSecs(secs))));
  const [soundPreference, setSoundPreference] = useState(soundEnabled);
  const [notificationPreference, setNotificationPreference] = useState(notificationsEnabled);

  useEffect(() => {
    if (subjects.length === 0) {
      void loadSubjects();
    }
  }, [subjects.length, loadSubjects]);

  useEffect(() => {
    setStudyMinutes(String(minutesFromSecs(studySecs)));
    setBreakMinutes(String(minutesFromSecs(breakSecs)));
    setLongBreakMinutes(String(minutesFromSecs(longBreakSecs)));
    setQuickPresetMinutes(quickTimers.map((secs) => String(minutesFromSecs(secs))));
    setSoundPreference(soundEnabled);
    setNotificationPreference(notificationsEnabled);
  }, [studySecs, breakSecs, longBreakSecs, quickTimers, soundEnabled, notificationsEnabled]);

  useEffect(() => {
    if (!showDetails) return;
    void loadStudyTimes();
    void loadTodayTotal();
  }, [showDetails, loadStudyTimes, loadTodayTotal]);

  const phaseLabel = phase === "study" ? "Study" : phase === "break" ? "Break" : "Long Break";
  const phaseChipVariant = phase === "study" ? "accent" : phase === "break" ? "success" : "warning";
  const nextLabel = phase === "study"
    ? `Next: ${completedStudySessions > 0 && (completedStudySessions + 1) % 4 === 0 ? `Long break ${minutesFromSecs(longBreakSecs)}m` : `Break ${minutesFromSecs(breakSecs)}m`}`
    : `Next: Study ${minutesFromSecs(studySecs)}m`;
  const progress = progressPercent(remainingSecs, durationSecs);

  const helperCopy = selectedSubjectSlug
    ? "Completed study sessions will be logged to the selected subject."
    : "No Subject = timer runs, session is not logged.";

  const selectedPreset = useMemo(() => {
    if (phase !== "study" || status === "running") return null;
    return quickTimers.find((secs) => secs === durationSecs) ?? null;
  }, [phase, status, quickTimers, durationSecs]);

  const compactTone = phase === "study" ? "bg-accent" : phase === "break" ? "bg-teal" : "bg-amber";

  const handleSubjectChange = (slug: string) => {
    const subject = subjects.find((entry) => entry.slug === slug);
    setSelectedSubject(slug, subject?.name ?? "");
  };

  const handleSaveDetails = async () => {
    if (!config) return;
    const parseMinutes = (value: string, fallback: number) => Math.max(1, parseInt(value, 10) || fallback);
    const nextStudyMinutes = parseMinutes(studyMinutes, 25);
    const nextBreakMinutes = parseMinutes(breakMinutes, 5);
    const nextLongBreakMinutes = parseMinutes(longBreakMinutes, 15);
    const nextQuickTimers = quickPresetMinutes.map((value) => parseMinutes(value, 25) * 60);

    await saveConfig({
      ...config,
      pomodoro_study_secs: nextStudyMinutes * 60,
      pomodoro_break_secs: nextBreakMinutes * 60,
      pomodoro_long_break_secs: nextLongBreakMinutes * 60,
      quick_timers: nextQuickTimers,
      pomodoro_sound_enabled: soundPreference,
      pomodoro_notifications_enabled: notificationPreference,
    });
    setShowDetails(false);
  };

  return (
    <div className="border-t border-border-subtle bg-panel px-3 py-3">
      <div className="overflow-hidden rounded-2xl border border-border-subtle bg-panel-alt shadow-[var(--shadow-panel)]">
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="w-full px-3 py-2 text-left transition-colors hover:bg-panel-active/60"
        >
          <div className="flex items-center gap-3">
            <div className={`h-2.5 w-2.5 shrink-0 rounded-full ${compactTone}`} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-text-muted">Pomodoro</p>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="app-font-mono text-sm font-semibold tabular-nums text-text">{formatClock(remainingSecs)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!expanded && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (status === "running") pause();
                        else start();
                      }}
                      className={`inline-flex h-7 w-7 items-center justify-center rounded-lg border transition-colors ${
                        status === "running"
                          ? "border-amber/30 bg-amber/10 text-amber"
                          : "border-accent/30 bg-accent-soft text-accent"
                      }`}
                      title={status === "running" ? "Pause timer" : "Start timer"}
                    >
                      {status === "running" ? <Pause size={14} /> : <Play size={14} />}
                    </button>
                  )}
                  {expanded ? (
                    <ChevronUp size={16} className="text-text-muted" />
                  ) : (
                    <ChevronDown size={16} className="text-text-muted" />
                  )}
                </div>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-panel">
                <div
                  className={`h-full rounded-full transition-[width] duration-700 ${compactTone}`}
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="mt-1 flex items-center justify-between text-[10px] text-text-muted">
                <span>{Math.ceil(remainingSecs / 60)}m left</span>
                <span className="uppercase tracking-[0.14em]">{phaseLabel}</span>
              </div>
            </div>
          </div>
        </button>

        {expanded && (
          <>
            <div className="border-t border-border-subtle px-3 py-3.5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <MetaChip variant={phaseChipVariant}>{phaseLabel}</MetaChip>
                    {completedStudySessions > 0 && (
                      <span className="text-[11px] text-text-muted">{completedStudySessions} study session{completedStudySessions === 1 ? "" : "s"} completed</span>
                    )}
                  </div>
                  <p className="mt-1.5 text-xs text-text-muted">{nextLabel}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowDetails((value) => !value)}
                  className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border transition-colors ${
                    showDetails
                      ? "border-accent/40 bg-accent-soft text-accent"
                      : "border-border-subtle text-text-muted hover:border-border-strong hover:bg-panel-active hover:text-text"
                  }`}
                  title="Timer details"
                >
                  <SlidersHorizontal size={15} />
                </button>
              </div>

              <div className="mt-3 text-center">
                <div className="app-font-mono text-[44px] font-semibold tabular-nums leading-none tracking-tight text-text">
                  {formatClock(remainingSecs)}
                </div>
              </div>

              <div className="mt-3">
                <div className="mb-1.5 flex items-center justify-between text-[11px] text-text-muted">
                  <span>{Math.round(progress)}% complete</span>
                  <span>{Math.ceil(remainingSecs / 60)}m left</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-panel">
                  <div
                    className={`h-full rounded-full transition-[width] duration-700 ${compactTone}`}
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2">
                <SecondaryButton
                  onClick={() => reset(studySecs)}
                  className="w-full px-0 py-1.5 text-xs"
                  icon={<RotateCcw size={14} />}
                >
                  Reset
                </SecondaryButton>
                {status === "running" ? (
                  <PrimaryButton
                    onClick={pause}
                    className="col-span-2 w-full px-0 py-1.5 text-xs"
                    icon={<Pause size={14} />}
                  >
                    Pause
                  </PrimaryButton>
                ) : (
                  <PrimaryButton
                    onClick={start}
                    className="col-span-2 w-full px-0 py-1.5 text-xs"
                    icon={<Play size={14} />}
                  >
                    {status === "paused" ? "Resume" : "Start"}
                  </PrimaryButton>
                )}
              </div>

              <div className="mt-3">
                <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.14em] text-text-muted">
                  Track Subject
                </label>
                <select
                  value={selectedSubjectSlug}
                  onChange={(e) => handleSubjectChange(e.target.value)}
                  className="w-full rounded-xl border border-border-subtle bg-panel px-3 py-2 text-sm text-text focus:border-accent/50 focus:outline-none"
                >
                  <option value="">No Subject</option>
                  {subjects.map((subject) => (
                    <option key={subject.slug} value={subject.slug}>
                      {subject.name}
                    </option>
                  ))}
                </select>
                <p className="mt-1.5 text-[11px] text-text-muted">{helperCopy}</p>
              </div>

              {status !== "running" && (
                <div className="mt-3">
                  <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-text-muted">Quick Presets</p>
                  <div className="grid grid-cols-4 gap-2">
                    {quickTimers.map((secs, index) => {
                      const active = selectedPreset === secs;
                      return (
                        <button
                          key={`${secs}-${index}`}
                          type="button"
                          onClick={() => chooseStudyDuration(secs)}
                          className={`rounded-xl border px-0 py-2 text-xs font-medium transition-colors ${
                            active
                              ? "border-accent bg-accent text-white"
                              : "border-border-subtle bg-panel text-text-muted hover:border-border-strong hover:text-text"
                          }`}
                        >
                          {minutesFromSecs(secs)}m
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {showDetails && (
              <div className="border-t border-border-subtle bg-panel px-3 py-3">
                <div className="space-y-3.5">
                  <div>
                    <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-text-muted">Durations (minutes)</p>
                    <div className="grid grid-cols-3 gap-2">
                      <label className="space-y-1">
                        <span className="text-[11px] text-text-muted">Study</span>
                        <input
                          type="number"
                          min="1"
                          value={studyMinutes}
                          onChange={(e) => setStudyMinutes(e.target.value.replace(/\D/g, "").slice(0, 3))}
                          className="w-full rounded-xl border border-border-subtle bg-panel-alt px-3 py-2 text-sm text-text focus:border-accent/50 focus:outline-none"
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="text-[11px] text-text-muted">Break</span>
                        <input
                          type="number"
                          min="1"
                          value={breakMinutes}
                          onChange={(e) => setBreakMinutes(e.target.value.replace(/\D/g, "").slice(0, 3))}
                          className="w-full rounded-xl border border-border-subtle bg-panel-alt px-3 py-2 text-sm text-text focus:border-accent/50 focus:outline-none"
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="text-[11px] text-text-muted">Long</span>
                        <input
                          type="number"
                          min="1"
                          value={longBreakMinutes}
                          onChange={(e) => setLongBreakMinutes(e.target.value.replace(/\D/g, "").slice(0, 3))}
                          className="w-full rounded-xl border border-border-subtle bg-panel-alt px-3 py-2 text-sm text-text focus:border-accent/50 focus:outline-none"
                        />
                      </label>
                    </div>
                  </div>

                  <div>
                    <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-text-muted">Quick Presets (minutes)</p>
                    <div className="grid grid-cols-4 gap-2">
                      {quickPresetMinutes.map((value, index) => (
                        <input
                          key={index}
                          type="number"
                          min="1"
                          value={value}
                          onChange={(e) => {
                            const next = [...quickPresetMinutes];
                            next[index] = e.target.value.replace(/\D/g, "").slice(0, 3);
                            setQuickPresetMinutes(next);
                          }}
                          className="w-full rounded-xl border border-border-subtle bg-panel-alt px-3 py-2 text-center text-sm text-text focus:border-accent/50 focus:outline-none"
                        />
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-text-muted">Completion Feedback</p>
                    <div className="space-y-2 rounded-xl border border-border-subtle bg-panel-alt p-3">
                      <label className="flex items-center justify-between gap-3 text-sm text-text">
                        <span className="inline-flex items-center gap-2">
                          <Volume2 size={14} className="text-text-muted" />
                          Sound
                        </span>
                        <input
                          type="checkbox"
                          checked={soundPreference}
                          onChange={(e) => setSoundPreference(e.target.checked)}
                          className="h-4 w-4 rounded border-border-subtle bg-panel-alt accent-[var(--color-accent)]"
                        />
                      </label>
                      <label className="flex items-center justify-between gap-3 text-sm text-text">
                        <span className="inline-flex items-center gap-2">
                          <Bell size={14} className="text-text-muted" />
                          Completion alerts
                        </span>
                        <input
                          type="checkbox"
                          checked={notificationPreference}
                          onChange={(e) => setNotificationPreference(e.target.checked)}
                          className="h-4 w-4 rounded border-border-subtle bg-panel-alt accent-[var(--color-accent)]"
                        />
                      </label>
                    </div>
                  </div>

                  <div>
                    <div className="mb-1.5 flex items-center justify-between">
                      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-text-muted">Tracking Summary</p>
                      <span className="text-[11px] text-text-muted">{formatSummaryTime(todayTotal)} today</span>
                    </div>
                    <div className="rounded-xl border border-border-subtle bg-panel-alt p-3">
                      {studyTimes.length === 0 ? (
                        <p className="text-xs text-text-muted">No study sessions recorded yet.</p>
                      ) : (
                        <div className="space-y-2">
                          {studyTimes.map((studyTime) => (
                            <div key={studyTime.subject_slug} className="flex items-center justify-between gap-3 text-xs">
                              <span className="truncate text-text">{studyTime.subject_name}</span>
                              <span className="shrink-0 text-text-muted">
                                {formatSummaryTime(studyTime.total_seconds)} ({studyTime.session_count})
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <PrimaryButton onClick={handleSaveDetails} className="w-full">
                    Save Timer Settings
                  </PrimaryButton>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
