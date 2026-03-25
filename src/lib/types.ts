/** YAML frontmatter fields present on every vault file */
export interface Frontmatter {
  subject?: string;
  topic?: string;
  type?:
    | "chapter"
    | "flashcard"
    | "quiz"
    | "teach-back"
    | "map"
    | "daily"
    | "capture";
  created_at?: string;
  source_url?: string;
  imported_at?: string;
  word_count?: number;
  estimated_read_minutes?: number;
  status?: "unread" | "reading" | "digested";
  date?: string;
  [key: string]: unknown;
}

/** A parsed vault file with frontmatter separated from content */
export interface VaultFile {
  path: string;
  filename: string;
  frontmatter: Frontmatter;
  content: string;
}

/** A subject folder in the vault */
export interface Subject {
  slug: string;
  name: string;
  path: string;
  chapter_count: number;
  flashcard_count: number;
  quiz_count: number;
}

/** An entry from the file_index table */
export interface FileEntry {
  file_path: string;
  subject: string | null;
  topic: string | null;
  file_type: string | null;
  word_count: number | null;
  updated_at: string | null;
}

/** FTS5 search result */
export interface SearchResult {
  file_path: string;
  subject: string;
  topic: string;
  excerpt: string;
}

/** Daily commitment entry */
export interface DailyCommitment {
  date: string;
  cue: string;
  action: string;
  completed: boolean;
  completed_at: string | null;
  reflection: string | null;
}

/** Streak info returned from backend */
export interface StreakInfo {
  current: number;
  longest: number;
  today_completed: boolean;
}

/** App-wide settings stored in config.toml */
export interface AppConfig {
  vault_path: string;
  ai_provider: "ollama" | "claude" | "gemini" | "openai" | "deepseek" | "none";
  ollama_model: string;
  ollama_url: string;
  api_key: string;
  // User profile
  user_role: string;
  user_hobbies: string;
  user_learning_style: string;
}

/** Digestion gate prompt types — rotate after each section */
export type GatePromptType = "summarize" | "connect" | "predict" | "apply";

/** A completed gate response for one section */
export interface GateResponse {
  sectionIndex: number;
  promptType: GatePromptType;
  prompt: string;
  response: string;
  feedback: string | null;
  mastery: number | null;           // 1=weak, 2=partial, 3=solid
  followUp: string | null;          // Follow-up question if mastery low
  followUpResponse: string | null;  // User's answer to follow-up
  timestamp: string;
}

/** A single flashcard parsed from a markdown file */
export interface Flashcard {
  id: string;
  filePath: string;
  subject: string;
  topic: string;
  question: string;
  answer: string;
  bloom: number;
  ease: number;
  interval: number;
  nextReview: string;
  lastReviewed: string | null;
  cardType?: "basic" | "cloze" | "reversed"; // default "basic"
  // FSRS fields (optional for backward compat with SM-2 cards)
  stability?: number;
  difficulty?: number;
  reps?: number;
  lapses?: number;
}

/** Review rating for a flashcard */
export type ReviewRating = "again" | "hard" | "good" | "easy";

/** Due card from the SR schedule table */
export interface DueCard {
  card_id: string;
  file_path: string;
  interval_days: number;
  ease_factor: number;
  next_review: string;
  last_reviewed: string | null;
}

/** Navigation routes */
export type Route =
  | "home"
  | "vault"
  | "reader"
  | "coach"
  | "quiz"
  | "flashcards"
  | "settings";
