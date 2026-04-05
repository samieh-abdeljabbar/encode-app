import { relaunch } from "@tauri-apps/plugin-process";
import { type Update, check } from "@tauri-apps/plugin-updater";
import { create } from "zustand";

export type UpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "ready"
  | "error";

interface UpdaterState {
  status: UpdateStatus;
  version: string | null;
  notes: string | null;
  error: string | null;
  downloadedBytes: number;
  contentLength: number | null;
  dismissed: boolean;
  checkForUpdates: () => Promise<void>;
  downloadAndInstall: () => Promise<void>;
  restart: () => Promise<void>;
  dismiss: () => void;
}

let pendingUpdate: Update | null = null;

export const useUpdaterStore = create<UpdaterState>((set, get) => ({
  status: "idle",
  version: null,
  notes: null,
  error: null,
  downloadedBytes: 0,
  contentLength: null,
  dismissed: false,

  checkForUpdates: async () => {
    if (get().status === "checking") return;
    set({ status: "checking", error: null });
    try {
      const update = await check();
      if (update) {
        pendingUpdate = update;
        set({
          status: "available",
          version: update.version,
          notes: update.body ?? null,
        });
      } else {
        set({ status: "idle" });
      }
    } catch (reason) {
      set({ status: "error", error: String(reason) });
    }
  },

  downloadAndInstall: async () => {
    if (!pendingUpdate || get().status === "downloading") return;
    set({ status: "downloading", downloadedBytes: 0, contentLength: null });
    try {
      await pendingUpdate.downloadAndInstall((event) => {
        if (event.event === "Started") {
          set({ contentLength: event.data.contentLength ?? null });
        } else if (event.event === "Progress") {
          set((s) => ({
            downloadedBytes: s.downloadedBytes + event.data.chunkLength,
          }));
        }
      });
      set({ status: "ready" });
    } catch (reason) {
      set({ status: "error", error: String(reason) });
    }
  },

  restart: async () => {
    await relaunch();
  },

  dismiss: () => {
    set({ dismissed: true });
  },
}));

export function isMacOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac/i.test(navigator.platform) || /Mac/i.test(navigator.userAgent);
}
