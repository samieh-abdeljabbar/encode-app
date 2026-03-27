import { invoke } from "@tauri-apps/api/core";
import type {
  AiActivityEntry,
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

export const deleteSubject = (slug: string) =>
  invoke<void>("delete_subject", { slug });

export const renameFile = (oldPath: string, newPath: string) =>
  invoke<void>("rename_vault_file", { oldPath, newPath });

// Directory operations
export const createDirectory = (path: string) =>
  invoke<void>("create_vault_directory", { path });

export const deleteDirectory = (path: string) =>
  invoke<void>("delete_vault_directory", { path });

export const renameDirectory = (oldPath: string, newPath: string) =>
  invoke<void>("rename_vault_directory", { oldPath, newPath });

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

export const getAtRiskCards = () => invoke<DueCard[]>("get_at_risk_cards").catch(() => []);

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

export const deleteCardSchedule = (cardId: string) =>
  invoke<void>("delete_card_schedule", { cardId });

// Quiz grades
export interface SubjectGrade {
  subject: string;
  total_quizzes: number;
  avg_score: number;
  last_quiz_date: string | null;
}

export const recordQuizResult = (subject: string, topic: string, bloomLevel: number, correct: boolean) =>
  invoke<void>("record_quiz_result", { subject, topic, bloomLevel, correct });

export const getSubjectGrades = () =>
  invoke<SubjectGrade[]>("get_subject_grades").catch(() => []);

// Subject mastery
import type { SubjectMastery } from "./types";

export const getSubjectMastery = (subject: string) =>
  invoke<SubjectMastery>("get_subject_mastery", { subject });

// Quiz analytics
import type { QuizHistoryPoint, WeakTopic, QueryResult } from "./types";

export const getQuizHistoryTimeline = (subject?: string) =>
  invoke<QuizHistoryPoint[]>("get_quiz_history_timeline", { subject: subject ?? null }).catch(() => []);

export const getWeakTopics = (subject?: string) =>
  invoke<WeakTopic[]>("get_weak_topics", { subject: subject ?? null }).catch(() => []);

// SQL sandbox
export const createSandbox = (setupSql: string) =>
  invoke<string>("create_sandbox", { setupSql });

export const executeSandboxQuery = (sandboxId: string, query: string) =>
  invoke<QueryResult>("execute_sandbox_query", { sandboxId, query });

export const destroySandbox = (sandboxId: string) =>
  invoke<void>("destroy_sandbox", { sandboxId });

// Study session tracking
import type { SubjectStudyTime } from "./types";

export const recordPomodoroSession = (
  id: string,
  subjectName: string,
  subjectSlug: string,
  durationSecs: number,
  startedAt: string,
  completedAt: string,
) =>
  invoke<void>("record_pomodoro_session", {
    id,
    subjectName,
    subjectSlug,
    durationSecs,
    startedAt,
    completedAt,
  });

export const getStudyTimeBySubject = () =>
  invoke<SubjectStudyTime[]>("get_study_time_by_subject").catch(() => []);

export const getTodaysStudyTime = () =>
  invoke<number>("get_todays_study_time").catch(() => 0);

// AI
export interface AiResponse {
  text: string;
  provider: string;
  model: string;
}

export const aiRequest = (feature: string, systemPrompt: string, userPrompt: string, maxTokens: number) =>
  invoke<AiResponse>("ai_request_cmd", { feature, systemPrompt, userPrompt, maxTokens });

export const getAiActivity = () =>
  invoke<AiActivityEntry[]>("get_ai_activity").catch(() => []);

export const checkOllama = (url: string) =>
  invoke<boolean>("check_ollama", { url });

export const listOllamaModels = (url: string) =>
  invoke<string[]>("list_ollama_models", { url }).catch(() => []);

export const testAiConnection = (
  provider: string,
  model: string,
  url: string,
  apiKey: string,
  cliCommand = "",
  cliArgs: string[] = [],
  cliWorkdir = "",
) =>
  invoke<string>("test_ai_connection", {
    provider,
    model,
    url,
    apiKey,
    cliCommand,
    cliArgs,
    cliWorkdir,
  });
