import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type PomodoroPhase = "study" | "break" | "longBreak";
export type PomodoroStatus = "idle" | "running" | "paused";

export interface PomodoroNotice {
  id: number;
  title: string;
  detail: string;
  phase: PomodoroPhase;
}

interface PomodoroState {
  phase: PomodoroPhase;
  status: PomodoroStatus;
  durationSecs: number;
  remainingSecs: number;
  startedAt: string | null;
  pausedAt: string | null;
  endsAt: number | null;
  completedStudySessions: number;
  selectedSubjectSlug: string;
  selectedSubjectName: string;
  isCustomStudyDuration: boolean;
  notice: PomodoroNotice | null;

  start: () => void;
  pause: () => void;
  chooseStudyDuration: (durationSecs: number) => void;
  setSelectedSubject: (slug: string, name?: string) => void;
  syncDefaults: (studySecs: number, breakSecs: number, longBreakSecs: number) => void;
  tick: (nowMs?: number) => boolean;
  advanceAfterCompletion: (studySecs: number, breakSecs: number, longBreakSecs: number) => void;
  reset: (studySecs: number) => void;
  showNotice: (notice: PomodoroNotice) => void;
  dismissNotice: () => void;
}

const DEFAULT_STUDY_SECS = 1500;

export const usePomodoroStore = create<PomodoroState>()(
  persist(
    (set) => ({
      phase: "study",
      status: "idle",
      durationSecs: DEFAULT_STUDY_SECS,
      remainingSecs: DEFAULT_STUDY_SECS,
      startedAt: null,
      pausedAt: null,
      endsAt: null,
      completedStudySessions: 0,
      selectedSubjectSlug: "",
      selectedSubjectName: "",
      isCustomStudyDuration: false,
      notice: null,

      start: () => {
        const now = Date.now();
        set((state) => {
          if (state.status === "running") return state;
          return {
            ...state,
            status: "running",
            startedAt: state.startedAt ?? new Date(now).toISOString(),
            pausedAt: null,
            endsAt: now + state.remainingSecs * 1000,
          };
        });
      },

      pause: () => {
        const now = Date.now();
        set((state) => {
          if (state.status !== "running" || state.endsAt === null) return state;
          const remainingSecs = Math.max(0, Math.ceil((state.endsAt - now) / 1000));
          return {
            ...state,
            status: "paused",
            remainingSecs,
            endsAt: null,
            pausedAt: new Date(now).toISOString(),
          };
        });
      },

      chooseStudyDuration: (durationSecs) =>
        set((state) => ({
          ...state,
          phase: "study",
          status: "idle",
          durationSecs,
          remainingSecs: durationSecs,
          startedAt: null,
          pausedAt: null,
          endsAt: null,
          isCustomStudyDuration: true,
        })),

      setSelectedSubject: (slug, name = "") =>
        set((state) => ({
          ...state,
          selectedSubjectSlug: slug,
          selectedSubjectName: slug ? name : "",
        })),

      syncDefaults: (studySecs, breakSecs, longBreakSecs) =>
        set((state) => {
          if (state.status !== "idle") return state;
          if (state.phase === "study" && state.isCustomStudyDuration) return state;
          const durationSecs =
            state.phase === "study" ? studySecs : state.phase === "break" ? breakSecs : longBreakSecs;
          return {
            ...state,
            durationSecs,
            remainingSecs: durationSecs,
          };
        }),

      tick: (nowMs = Date.now()) => {
        let completed = false;
        set((state) => {
          if (state.status !== "running" || state.endsAt === null) return state;
          const remainingSecs = Math.max(0, Math.ceil((state.endsAt - nowMs) / 1000));
          completed = remainingSecs <= 0;
          return {
            ...state,
            remainingSecs,
          };
        });
        return completed;
      },

      advanceAfterCompletion: (studySecs, breakSecs, longBreakSecs) =>
        set((state) => {
          if (state.phase === "study") {
            const completedStudySessions = state.completedStudySessions + 1;
            const nextPhase: PomodoroPhase = completedStudySessions % 4 === 0 ? "longBreak" : "break";
            const nextDuration = nextPhase === "longBreak" ? longBreakSecs : breakSecs;
            return {
              ...state,
              phase: nextPhase,
              status: "idle",
              durationSecs: nextDuration,
              remainingSecs: nextDuration,
              startedAt: null,
              pausedAt: null,
              endsAt: null,
              completedStudySessions,
              isCustomStudyDuration: false,
            };
          }

          return {
            ...state,
            phase: "study",
            status: "idle",
            durationSecs: studySecs,
            remainingSecs: studySecs,
            startedAt: null,
            pausedAt: null,
            endsAt: null,
            isCustomStudyDuration: false,
          };
        }),

      reset: (studySecs) =>
        set((state) => ({
          ...state,
          phase: "study",
          status: "idle",
          durationSecs: studySecs,
          remainingSecs: studySecs,
          startedAt: null,
          pausedAt: null,
          endsAt: null,
          completedStudySessions: 0,
          isCustomStudyDuration: false,
        })),

      showNotice: (notice) => set({ notice }),
      dismissNotice: () => set({ notice: null }),
    }),
    {
      name: "encode-pomodoro",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        phase: state.phase,
        status: state.status,
        durationSecs: state.durationSecs,
        remainingSecs: state.remainingSecs,
        startedAt: state.startedAt,
        pausedAt: state.pausedAt,
        endsAt: state.endsAt,
        completedStudySessions: state.completedStudySessions,
        selectedSubjectSlug: state.selectedSubjectSlug,
        selectedSubjectName: state.selectedSubjectName,
        isCustomStudyDuration: state.isCustomStudyDuration,
      }),
    },
  ),
);
