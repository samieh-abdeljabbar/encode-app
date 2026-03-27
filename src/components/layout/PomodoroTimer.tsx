import { useEffect, useRef, useState, useCallback } from "react";
import { Play, Pause, RotateCcw, SlidersHorizontal, Check } from "lucide-react";
import { useAppStore } from "../../stores/app";
import { useVaultStore } from "../../stores/vault";
import { useTrackingStore } from "../../stores/tracking";
import { localDateTimeString } from "../../lib/dates";

type Phase = "study" | "break" | "longBreak";

function splitHMS(totalSecs: number): { h: number; m: number; s: number } {
  return {
    h: Math.floor(totalSecs / 3600),
    m: Math.floor((totalSecs % 3600) / 60),
    s: totalSecs % 60,
  };
}

function hmsToSecs(h: string, m: string, s: string): number {
  return Math.max(1, (parseInt(h, 10) || 0) * 3600 + (parseInt(m, 10) || 0) * 60 + (parseInt(s, 10) || 0));
}

function formatTime(totalSecs: number): string {
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function shortLabel(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0 && m > 0) return `${h}h${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

/** Compact H:M:S inline input */
function HMSInline({ h, m, s, onH, onM, onS }: {
  h: string; m: string; s: string;
  onH: (v: string) => void; onM: (v: string) => void; onS: (v: string) => void;
}) {
  const cls = "w-6 px-0 py-0 bg-transparent border-b border-border text-text text-center text-[11px] focus:outline-none focus:border-purple";
  return (
    <span className="inline-flex items-center gap-0 text-[11px] font-mono">
      <input type="text" inputMode="numeric" value={h}
        onChange={(e) => onH(e.target.value.replace(/\D/g, "").slice(0, 2))}
        onFocus={(e) => e.target.select()}
        onBlur={(e) => { if (!e.target.value) onH("0"); }}
        className={cls} />
      <span className="text-text-muted">:</span>
      <input type="text" inputMode="numeric" value={m}
        onChange={(e) => onM(e.target.value.replace(/\D/g, "").slice(0, 2))}
        onFocus={(e) => e.target.select()}
        onBlur={(e) => { if (!e.target.value) onM("0"); }}
        className={cls} />
      <span className="text-text-muted">:</span>
      <input type="text" inputMode="numeric" value={s}
        onChange={(e) => onS(e.target.value.replace(/\D/g, "").slice(0, 2))}
        onFocus={(e) => e.target.select()}
        onBlur={(e) => { if (!e.target.value) onS("0"); }}
        className={cls} />
    </span>
  );
}

export default function PomodoroTimer() {
  const config = useAppStore((s) => s.config);
  const saveConfig = useAppStore((s) => s.saveConfig);
  const subjects = useVaultStore((s) => s.subjects);
  const recordSession = useTrackingStore((s) => s.recordSession);

  const studySecs = config?.pomodoro_study_secs ?? 1500;
  const breakSecs = config?.pomodoro_break_secs ?? 300;
  const longBreakSecs = config?.pomodoro_long_break_secs ?? 900;
  const quickTimers = config?.quick_timers ?? [1500, 1800, 2700, 3600];

  const durations: Record<Phase, number> = { study: studySecs, break: breakSecs, longBreak: longBreakSecs };

  const [phase, setPhase] = useState<Phase>("study");
  const [timeLeft, setTimeLeft] = useState(durations.study);
  const [running, setRunning] = useState(false);
  const [sessions, setSessions] = useState(0);
  const [selectedSubject, setSelectedSubject] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const completedRef = useRef(false);
  const sessionStartRef = useRef<string | null>(null);

  // Quick timer edit state
  const [editQT, setEditQT] = useState<string[]>(quickTimers.map((t) => String(Math.round(t / 60))));
  useEffect(() => {
    setEditQT(quickTimers.map((t) => String(Math.round(t / 60))));
  }, [quickTimers.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  // H:M:S edit state
  const initS = splitHMS(studySecs), initB = splitHMS(breakSecs), initL = splitHMS(longBreakSecs);
  const [sH, setSH] = useState(String(initS.h)); const [sM, setSM] = useState(String(initS.m)); const [sS, setSS] = useState(String(initS.s));
  const [bH, setBH] = useState(String(initB.h)); const [bM, setBM] = useState(String(initB.m)); const [bS, setBS] = useState(String(initB.s));
  const [lH, setLH] = useState(String(initL.h)); const [lM, setLM] = useState(String(initL.m)); const [lS, setLS] = useState(String(initL.s));

  useEffect(() => {
    const s = splitHMS(studySecs), b = splitHMS(breakSecs), l = splitHMS(longBreakSecs);
    setSH(String(s.h)); setSM(String(s.m)); setSS(String(s.s));
    setBH(String(b.h)); setBM(String(b.m)); setBS(String(b.s));
    setLH(String(l.h)); setLM(String(l.m)); setLS(String(l.s));
  }, [studySecs, breakSecs, longBreakSecs]);

  useEffect(() => { if (!running) setTimeLeft(durations[phase]); }, [studySecs, breakSecs, longBreakSecs]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!showSettings || running) return;
    if (phase === "study") setTimeLeft(hmsToSecs(sH, sM, sS));
    else if (phase === "break") setTimeLeft(hmsToSecs(bH, bM, bS));
    else if (phase === "longBreak") setTimeLeft(hmsToSecs(lH, lM, lS));
  }, [sH, sM, sS, bH, bM, bS, lH, lM, lS, showSettings, running, phase]);

  const playDing = useCallback(() => {
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = 800; gain.gain.value = 0.3;
      osc.start(); osc.stop(ctx.currentTime + 0.3);
      setTimeout(() => ctx.close(), 500);
    } catch { /* */ }
  }, []);

  const handlePlayPause = () => {
    if (!running && phase === "study" && !sessionStartRef.current) {
      sessionStartRef.current = localDateTimeString();
    }
    setRunning(!running);
  };

  const handleQuickTimer = (secs: number) => {
    if (running) return;
    setPhase("study");
    setTimeLeft(secs);
    sessionStartRef.current = null;
  };

  useEffect(() => {
    if (!running) return;
    completedRef.current = false;
    const id = setInterval(() => {
      setTimeLeft((t) => { if (t <= 1) { completedRef.current = true; return 0; } return t - 1; });
    }, 1000);
    return () => clearInterval(id);
  }, [running]);

  useEffect(() => {
    if (timeLeft > 0 || !completedRef.current) return;
    completedRef.current = false;
    playDing(); setRunning(false);
    if (phase === "study") {
      if (selectedSubject && sessionStartRef.current) {
        const subj = subjects.find((s) => s.slug === selectedSubject);
        if (subj) recordSession(subj.name, subj.slug, durations.study, sessionStartRef.current);
      }
      sessionStartRef.current = null;
      const n = sessions + 1; setSessions(n);
      if (n % 4 === 0) { setPhase("longBreak"); setTimeLeft(durations.longBreak); }
      else { setPhase("break"); setTimeLeft(durations.break); }
    } else { setPhase("study"); setTimeLeft(durations.study); }
  }, [timeLeft]); // eslint-disable-line react-hooks/exhaustive-deps

  const reset = () => { setRunning(false); setPhase("study"); setTimeLeft(durations.study); setSessions(0); sessionStartRef.current = null; };

  const handleSaveSettings = () => {
    if (!config) return;
    const qtSecs = editQT.map((v) => Math.max(1, parseInt(v, 10) || 1) * 60);
    saveConfig({
      ...config,
      pomodoro_study_secs: hmsToSecs(sH, sM, sS),
      pomodoro_break_secs: hmsToSecs(bH, bM, bS),
      pomodoro_long_break_secs: hmsToSecs(lH, lM, lS),
      quick_timers: qtSecs,
    });
    setShowSettings(false); setRunning(false); setPhase("study");
    setTimeLeft(hmsToSecs(sH, sM, sS)); setSessions(0); sessionStartRef.current = null;
  };

  const phaseLabel = phase === "study" ? "STUDY" : phase === "break" ? "BREAK" : "LONG BREAK";
  const phaseColor = phase === "study" ? "text-purple" : phase === "break" ? "text-teal" : "text-amber";

  // Progress fraction for the ring
  const totalDuration = durations[phase] || 1;
  const progress = 1 - timeLeft / totalDuration;
  const circumference = 2 * Math.PI * 40;
  const strokeOffset = circumference * (1 - progress);
  const ringColor = phase === "study" ? "#7F77DD" : phase === "break" ? "#1D9E75" : "#BA7517";

  return (
    <div className="p-3 border-t border-border">
      {/* Subject selector */}
      <select
        value={selectedSubject}
        onChange={(e) => setSelectedSubject(e.target.value)}
        className="w-full mb-3 px-2 py-1 bg-surface-2 border border-border rounded text-xs text-text focus:outline-none focus:border-purple"
      >
        <option value="">No Subject</option>
        {subjects.map((s) => (
          <option key={s.slug} value={s.slug}>{s.name}</option>
        ))}
      </select>

      {/* Timer ring + display */}
      <div className="flex flex-col items-center mb-3">
        <div className="relative w-28 h-28 mb-2">
          <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
            <circle cx="50" cy="50" r="40" fill="none" stroke="var(--color-surface-2, #252525)" strokeWidth="4" />
            <circle cx="50" cy="50" r="40" fill="none" stroke={ringColor} strokeWidth="4"
              strokeDasharray={circumference} strokeDashoffset={strokeOffset}
              strokeLinecap="round" className="transition-all duration-1000 ease-linear" />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xl font-mono text-text tabular-nums leading-none">
              {formatTime(timeLeft)}
            </span>
            <span className={`text-[8px] font-semibold tracking-widest mt-1 ${phaseColor}`}>
              {phaseLabel}
            </span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          <button onClick={reset}
            className="p-1.5 text-text-muted hover:text-text rounded-full hover:bg-surface-2 transition-colors" title="Reset">
            <RotateCcw size={14} />
          </button>
          <button onClick={handlePlayPause}
            className={`p-2.5 rounded-full transition-colors ${running ? "bg-amber/15 text-amber hover:bg-amber/25" : "bg-purple/15 text-purple hover:bg-purple/25"}`}
            title={running ? "Pause" : "Start"}>
            {running ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <button onClick={() => setShowSettings(!showSettings)}
            className={`p-1.5 rounded-full transition-colors ${showSettings ? "text-purple bg-purple/10" : "text-text-muted hover:text-text hover:bg-surface-2"}`}
            title="Settings">
            <SlidersHorizontal size={14} />
          </button>
        </div>
        {sessions > 0 && (
          <span className="text-[9px] text-text-muted mt-1.5">{sessions} session{sessions !== 1 ? "s" : ""} completed</span>
        )}
      </div>

      {/* Quick timer presets — always visible when not running */}
      {!running && (
        <div className="flex gap-1.5 mb-3">
          {quickTimers.map((secs, i) => (
            <button
              key={i}
              onClick={() => handleQuickTimer(secs)}
              className={`flex-1 py-1.5 text-[11px] font-medium rounded-md transition-all ${
                timeLeft === secs && phase === "study"
                  ? "bg-purple text-white shadow-sm"
                  : "bg-surface-2 text-text-muted hover:text-text hover:bg-surface-2/80 border border-border"
              }`}
            >
              {shortLabel(secs)}
            </button>
          ))}
        </div>
      )}

      {/* Settings panel */}
      {showSettings && (
        <div className="bg-surface rounded-lg border border-border p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-medium text-text-muted uppercase tracking-wide">Durations</span>
            <span className="text-[9px] text-text-muted">h : m : s</span>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-text">Study</span>
              <HMSInline h={sH} m={sM} s={sS} onH={setSH} onM={setSM} onS={setSS} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-text">Break</span>
              <HMSInline h={bH} m={bM} s={bS} onH={setBH} onM={setBM} onS={setBS} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-text">Long</span>
              <HMSInline h={lH} m={lM} s={lS} onH={setLH} onM={setLM} onS={setLS} />
            </div>
          </div>

          <div className="pt-2 border-t border-border">
            <span className="text-[10px] font-medium text-text-muted uppercase tracking-wide">Quick Presets (min)</span>
            <div className="flex gap-1.5 mt-1.5">
              {editQT.map((val, i) => (
                <input
                  key={i}
                  type="text"
                  inputMode="numeric"
                  value={val}
                  onChange={(e) => { const n = [...editQT]; n[i] = e.target.value.replace(/\D/g, "").slice(0, 3); setEditQT(n); }}
                  onFocus={(e) => e.target.select()}
                  onBlur={(e) => { if (!e.target.value) { const n = [...editQT]; n[i] = "1"; setEditQT(n); } }}
                  className="flex-1 w-0 py-1 bg-surface-2 border border-border rounded text-text text-center text-[11px] focus:outline-none focus:border-purple"
                />
              ))}
            </div>
          </div>

          <button
            onClick={handleSaveSettings}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-purple text-white text-[11px] font-medium rounded-md hover:opacity-90 transition-opacity"
          >
            <Check size={12} />
            Save
          </button>
        </div>
      )}
    </div>
  );
}
