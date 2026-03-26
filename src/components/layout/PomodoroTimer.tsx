import { useEffect, useRef, useState, useCallback } from "react";
import { Play, Pause, RotateCcw } from "lucide-react";

type Phase = "study" | "break" | "longBreak";

const DURATIONS: Record<Phase, number> = {
  study: 25 * 60,
  break: 5 * 60,
  longBreak: 15 * 60,
};

export default function PomodoroTimer() {
  const [phase, setPhase] = useState<Phase>("study");
  const [timeLeft, setTimeLeft] = useState(DURATIONS.study);
  const [running, setRunning] = useState(false);
  const [sessions, setSessions] = useState(0);
  const completedRef = useRef(false);

  const playDing = useCallback(() => {
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 800;
      gain.gain.value = 0.3;
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
      setTimeout(() => ctx.close(), 500);
    } catch { /* audio unavailable */ }
  }, []);

  // Tick interval
  useEffect(() => {
    if (!running) return;
    completedRef.current = false;

    const id = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          completedRef.current = true;
          return 0;
        }
        return t - 1;
      });
    }, 1000);

    return () => clearInterval(id);
  }, [running]);

  // Handle phase transition when timer hits 0
  useEffect(() => {
    if (timeLeft > 0 || !completedRef.current) return;
    completedRef.current = false;

    playDing();
    setRunning(false);

    if (phase === "study") {
      const newSessions = sessions + 1;
      setSessions(newSessions);
      if (newSessions % 4 === 0) {
        setPhase("longBreak");
        setTimeLeft(DURATIONS.longBreak);
      } else {
        setPhase("break");
        setTimeLeft(DURATIONS.break);
      }
    } else {
      setPhase("study");
      setTimeLeft(DURATIONS.study);
    }
  }, [timeLeft, phase, sessions, playDing]);

  const reset = () => {
    setRunning(false);
    setPhase("study");
    setTimeLeft(DURATIONS.study);
    setSessions(0);
  };

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const phaseLabel = phase === "study" ? "Study" : phase === "break" ? "Break" : "Long Break";
  const phaseColor = phase === "study" ? "text-purple" : "text-teal";

  return (
    <div className="p-3 border-t border-border">
      <div className="flex items-center justify-between mb-2">
        <span className={`text-[10px] font-medium uppercase tracking-wider ${phaseColor}`}>
          {phaseLabel}
        </span>
        {sessions > 0 && (
          <span className="text-[10px] text-text-muted">{sessions} sessions</span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <span className="text-2xl font-mono text-text tabular-nums">
          {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
        </span>

        <div className="flex gap-1 ml-auto">
          <button
            onClick={() => setRunning(!running)}
            className={`p-1.5 rounded transition-colors ${
              running
                ? "text-amber hover:bg-amber/10"
                : "text-teal hover:bg-teal/10"
            }`}
            title={running ? "Pause" : "Start"}
          >
            {running ? <Pause size={14} /> : <Play size={14} />}
          </button>
          <button
            onClick={reset}
            className="p-1.5 text-text-muted hover:text-text rounded transition-colors"
            title="Reset"
          >
            <RotateCcw size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
