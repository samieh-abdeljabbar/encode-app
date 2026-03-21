import { create } from "zustand";
import type { AppConfig, DailyCommitment, StreakInfo } from "../lib/types";
import * as tauri from "../lib/tauri";

interface AppState {
  config: AppConfig | null;
  dailyCommitment: DailyCommitment | null;
  streak: StreakInfo | null;
  loading: boolean;

  loadConfig: () => Promise<void>;
  saveConfig: (config: AppConfig) => Promise<void>;
  loadToday: () => Promise<void>;
  saveDailyCommitment: (commitment: DailyCommitment) => Promise<void>;
  loadStreak: () => Promise<void>;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export const useAppStore = create<AppState>((set) => ({
  config: null,
  dailyCommitment: null,
  streak: null,
  loading: false,

  loadConfig: async () => {
    try {
      const config = await tauri.getConfig();
      set({ config });
    } catch (e) {
      console.error("Failed to load config:", e);
    }
  },

  saveConfig: async (config) => {
    await tauri.saveConfig(config);
    set({ config });
  },

  loadToday: async () => {
    set({ loading: true });
    try {
      const commitment = await tauri.getDailyCommitment(todayStr());
      set({ dailyCommitment: commitment, loading: false });
    } catch (e) {
      console.error("Failed to load daily:", e);
      set({ loading: false });
    }
  },

  saveDailyCommitment: async (commitment) => {
    await tauri.saveDailyCommitment(commitment);
    set({ dailyCommitment: commitment });
  },

  loadStreak: async () => {
    try {
      const streak = await tauri.getStreak();
      set({ streak });
    } catch (e) {
      console.error("Failed to load streak:", e);
    }
  },
}));
