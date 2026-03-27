import { create } from "zustand";
import type { SubjectStudyTime } from "../lib/types";
import * as tauri from "../lib/tauri";

interface TrackingState {
  studyTimes: SubjectStudyTime[];
  todayTotal: number;
  loading: boolean;

  loadStudyTimes: () => Promise<void>;
  loadTodayTotal: () => Promise<void>;
  recordSession: (
    subjectName: string,
    subjectSlug: string,
    durationSecs: number,
    startedAt: string,
  ) => Promise<void>;
}

export const useTrackingStore = create<TrackingState>((set, get) => ({
  studyTimes: [],
  todayTotal: 0,
  loading: false,

  loadStudyTimes: async () => {
    const studyTimes = await tauri.getStudyTimeBySubject();
    set({ studyTimes });
  },

  loadTodayTotal: async () => {
    const todayTotal = await tauri.getTodaysStudyTime();
    set({ todayTotal });
  },

  recordSession: async (subjectName, subjectSlug, durationSecs, startedAt) => {
    const id = `sess-${Date.now()}`;
    const completedAt = new Date().toISOString().slice(0, 19);
    await tauri.recordPomodoroSession(
      id,
      subjectName,
      subjectSlug,
      durationSecs,
      startedAt,
      completedAt,
    );
    // Refresh aggregated data
    await get().loadStudyTimes();
    await get().loadTodayTotal();
  },
}));
