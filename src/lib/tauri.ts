import { invoke } from "@tauri-apps/api/core";

// --- Types matching Rust command responses ---

export interface Subject {
  id: number;
  slug: string;
  name: string;
  description: string;
  chapter_count: number;
  created_at: string;
}

export interface Chapter {
  id: number;
  subject_id: number;
  title: string;
  slug: string;
  status: string;
  estimated_minutes: number | null;
  created_at: string;
  section_count: number;
  checked_count: number;
}

export interface Section {
  id: number;
  section_index: number;
  heading: string | null;
  body_markdown: string;
  word_count: number;
}

export interface ChapterWithSections {
  chapter: Chapter;
  sections: Section[];
}

export interface SearchResult {
  chapter_id: number;
  chapter_title: string;
  subject_name: string;
  section_heading: string | null;
  snippet: string;
}

export interface AppConfig {
  ai: {
    provider: string;
    ollama_model: string;
    ollama_url: string;
    claude_api_key: string;
    gemini_api_key: string;
    openai_api_key: string;
    deepseek_api_key: string;
    claude_model: string;
    gemini_model: string;
    openai_model: string;
    deepseek_model: string;
    cli_command: string;
    cli_args: string[];
  };
  profile: {
    role: string;
    domain: string;
    learning_context: string;
  };
}

// --- Foundation commands ---

export const getConfig = () => invoke<AppConfig>("get_config");
export const saveConfig = (config: AppConfig) =>
  invoke<void>("save_config", { config });
export const getVaultPath = () => invoke<string>("get_vault_path");
export const getSchemaVersion = () => invoke<number>("get_schema_version");
export const readFile = (relativePath: string) =>
  invoke<string>("read_file", { relativePath });
export const writeFile = (relativePath: string, content: string) =>
  invoke<void>("write_file", { relativePath, content });

// --- Library commands ---

export const createSubject = (name: string) =>
  invoke<Subject>("create_subject", { name });
export const listSubjects = () => invoke<Subject[]>("list_subjects");
export const deleteSubject = (id: number) =>
  invoke<void>("delete_subject", { id });

export const createChapter = (
  subjectId: number,
  title: string,
  content: string,
) => invoke<Chapter>("create_chapter", { subjectId, title, content });

export const listChapters = (subjectId: number) =>
  invoke<Chapter[]>("list_chapters", { subjectId });

export const getChapterWithSections = (chapterId: number) =>
  invoke<ChapterWithSections>("get_chapter_with_sections", { chapterId });

export const importUrl = (url: string, subjectId: number) =>
  invoke<Chapter>("import_url", { url, subjectId });

export const searchContent = (query: string) =>
  invoke<SearchResult[]>("search", { query });

// --- Export/backup commands ---

export interface ExportStatus {
  last_export_at: string | null;
  last_snapshot_at: string | null;
}

export interface SnapshotInfo {
  name: string;
}

export const exportSubject = (subjectId: number) =>
  invoke<void>("export_subject_cmd", { subjectId });
export const exportAll = () => invoke<number>("export_all_cmd");
export const createSnapshot = () => invoke<string>("create_snapshot_cmd");
export const getExportStatus = () => invoke<ExportStatus>("get_export_status");
export const listSnapshots = () => invoke<SnapshotInfo[]>("list_snapshots_cmd");

// Reader types
export interface ReaderChapter {
  id: number;
  title: string;
  status: string;
  estimated_minutes: number | null;
}

export interface ReaderSection {
  id: number;
  section_index: number;
  heading: string | null;
  body_markdown: string;
  word_count: number;
  status: string;
  prompt: string;
}

export interface ReaderSession {
  chapter: ReaderChapter;
  sections: ReaderSection[];
  current_index: number;
}

export interface CheckResult {
  outcome: string;
  can_retry: boolean;
  repair_card_created: boolean;
  chapter_complete: boolean;
}

export interface SynthesisResult {
  success: boolean;
  new_status: string;
}

// Reader IPC
export const loadReaderSession = (chapterId: number) =>
  invoke<ReaderSession>("load_reader_session", { chapterId });

export const markSectionRead = (chapterId: number, sectionIndex: number) =>
  invoke<void>("mark_section_read", { chapterId, sectionIndex });

export const submitSectionCheck = (
  chapterId: number,
  sectionIndex: number,
  response: string,
  selfRating: string,
) =>
  invoke<CheckResult>("submit_section_check", {
    chapterId,
    sectionIndex,
    response,
    selfRating,
  });

export const submitSynthesis = (chapterId: number, synthesisText: string) =>
  invoke<SynthesisResult>("submit_synthesis", { chapterId, synthesisText });

// Review types
export interface DueCard {
  id: number;
  subject_id: number;
  chapter_id: number | null;
  source_type: string;
  prompt: string;
  answer: string;
  card_type: string;
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
}

export interface RatingResult {
  next_review_days: number;
  new_stability: number;
  cards_remaining: number;
}

// Review IPC
export const getDueCards = (limit: number) =>
  invoke<DueCard[]>("get_due_cards", { limit });

export const submitCardRating = (cardId: number, rating: number) =>
  invoke<RatingResult>("submit_card_rating", { cardId, rating });

// Queue types
export interface QueueItem {
  item_type: string;
  score: number;
  title: string;
  subtitle: string;
  reason: string;
  estimated_minutes: number;
  target_id: number;
  target_route: string;
}

export interface QueueSummary {
  due_cards: number;
  chapters_in_progress: number;
  sections_studied_today: number;
}

export interface QueueDashboard {
  summary: QueueSummary;
  items: QueueItem[];
}

// Queue IPC
export const getQueueDashboard = () =>
  invoke<QueueDashboard>("get_queue_dashboard");
