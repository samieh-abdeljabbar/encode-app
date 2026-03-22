import { invoke } from "@tauri-apps/api/core";
import type {
  AppConfig,
  DailyCommitment,
  FileEntry,
  SearchResult,
  StreakInfo,
  Subject,
} from "./types";

// Vault operations
export const initVault = () => invoke<string>("init_vault");

export const getVaultPath = () => invoke<string>("get_vault_path");

export const listSubjects = () => invoke<Subject[]>("list_subjects");

export const listFiles = (subject: string, fileType?: string) =>
  invoke<FileEntry[]>("list_files", { subject, fileType });

export const readFile = (path: string) =>
  invoke<string>("read_vault_file", { path });

export const writeFile = (path: string, content: string) =>
  invoke<void>("write_vault_file", { path, content });

export const createSubject = (name: string) =>
  invoke<string>("create_subject", { name });

// Import
export const importUrl = (url: string, subject: string, topic?: string) =>
  invoke<string>("import_url", { url, subject, topic });

// Search
export const searchVault = (query: string) =>
  invoke<SearchResult[]>("search_vault", { query });

// Daily commitment
export const getDailyCommitment = (date: string) =>
  invoke<DailyCommitment | null>("get_daily_commitment", { date });

export const saveDailyCommitment = (commitment: DailyCommitment) =>
  invoke<void>("save_daily_commitment", { commitment });

export const getStreak = () => invoke<StreakInfo>("get_streak");

// Settings
export const getConfig = () => invoke<AppConfig>("get_config");

export const saveConfig = (config: AppConfig) =>
  invoke<void>("save_config", { config });

// Indexer
export const rebuildIndex = () => invoke<number>("rebuild_index");
