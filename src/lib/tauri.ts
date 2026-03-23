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

export const deleteFile = (path: string) =>
  invoke<void>("delete_vault_file", { path });

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

// Flashcards
import type { DueCard } from "./types";

export const getDueCards = () => invoke<DueCard[]>("get_due_cards");

export const getDueCount = () => invoke<number>("get_due_count").catch(() => 0);

export const updateCardSchedule = (
  cardId: string,
  filePath: string,
  nextReview: string,
  intervalDays: number,
  easeFactor: number,
  lastReviewed: string,
) =>
  invoke<void>("update_card_schedule", {
    cardId,
    filePath,
    nextReview,
    intervalDays,
    easeFactor,
    lastReviewed,
  });

// AI
export interface AiResponse {
  text: string;
  provider: string;
}

export const aiRequest = (systemPrompt: string, userPrompt: string, maxTokens: number) =>
  invoke<AiResponse>("ai_request_cmd", { systemPrompt, userPrompt, maxTokens });

export const checkOllama = (url: string) =>
  invoke<boolean>("check_ollama", { url });

export const listOllamaModels = (url: string) =>
  invoke<string[]>("list_ollama_models", { url }).catch(() => []);
