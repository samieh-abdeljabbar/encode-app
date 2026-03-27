import { create } from "zustand";
import type { FileEntry, SearchResult, Subject } from "../lib/types";
import * as tauri from "../lib/tauri";

interface VaultState {
  subjects: Subject[];
  files: FileEntry[];
  searchResults: SearchResult[];
  searchQuery: string;
  selectedFile: string | null;
  loading: boolean;
  error: string | null;

  loadSubjects: () => Promise<void>;
  loadFiles: (subject: string, fileType?: string) => Promise<void>;
  search: (query: string) => Promise<void>;
  selectFile: (path: string | null) => void;
  clearSearch: () => void;
  createSubject: (name: string) => Promise<string>;
}

export const useVaultStore = create<VaultState>((set) => ({
  subjects: [],
  files: [],
  searchResults: [],
  searchQuery: "",
  selectedFile: null,
  loading: false,
  error: null,

  loadSubjects: async () => {
    set({ loading: true, error: null });
    try {
      const subjects = await tauri.listSubjects();
      set({ subjects, loading: false });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  loadFiles: async (subject, fileType) => {
    set({ loading: true, error: null });
    try {
      const files = await tauri.listFiles(subject, fileType);
      set({ files, loading: false });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  search: async (query) => {
    set({ searchQuery: query });
    if (!query.trim()) {
      set({ searchResults: [] });
      return;
    }
    try {
      const searchResults = await tauri.searchVault(query);
      set({ searchResults });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  selectFile: (path) => set({ selectedFile: path }),

  clearSearch: () => set({ searchQuery: "", searchResults: [] }),

  createSubject: async (name) => {
    const slug = await tauri.createSubject(name);
    const subjects = await tauri.listSubjects();
    set({ subjects });
    return slug;
  },
}));
