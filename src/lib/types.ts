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
  ai_provider: "ollama" | "claude" | "gemini" | "openai" | "deepseek" | "cli" | "none";
  ollama_model: string;
  ollama_url: string;
  openai_model: string;
  deepseek_model: string;
  claude_model: string;
  gemini_model: string;
  api_key: string;
  claude_api_key: string;
  gemini_api_key: string;
  openai_api_key: string;
  deepseek_api_key: string;
  cli_command: string;
  cli_args: string[];
  cli_workdir: string;
  // User profile
  user_role: string;
  user_hobbies: string;
  user_learning_style: string;
  // Pomodoro timer settings (seconds)
  pomodoro_study_secs: number;
  pomodoro_break_secs: number;
  pomodoro_long_break_secs: number;
  // Quick timer presets (seconds)
  quick_timers: number[];
  pomodoro_sound_enabled: boolean;
  pomodoro_notifications_enabled: boolean;
}

/** Recent AI activity entry returned from the backend */
export interface AiActivityEntry {
  request_id: string;
  feature: string;
  provider: string;
  model_or_command: string;
  status: "start" | "success" | "failure" | string;
  started_at: string;
  duration_ms: number | null;
  error: string | null;
}

/** Aggregated study time per subject */
export interface SubjectStudyTime {
  subject_name: string;
  subject_slug: string;
  total_seconds: number;
  session_count: number;
}

/** Subject mastery data */
export interface SubjectMastery {
  subject: string;
  chapters_total: number;
  chapters_read: number;
  avg_quiz_score: number;
  cards_total: number;
  cards_due: number;
}

/** Quiz history data point for trend chart */
export interface QuizHistoryPoint {
  date: string;
  subject: string;
  total_questions: number;
  correct_count: number;
  score_pct: number;
}

/** Weak topic identified from quiz history */
export interface WeakTopic {
  subject: string;
  topic: string;
  bloom_level: number;
  total: number;
  correct: number;
  accuracy_pct: number;
}

/** SQL sandbox query result */
export interface QueryResult {
  columns: string[];
  rows: string[][];
  row_count: number;
}

/** Digestion gate prompt types */
export type GatePromptType = "recall" | "explain" | "apply" | "analyze";

/** A single sub-question within a multi-question gate */
export interface GateSubQuestion {
  promptType: GatePromptType;
  prompt: string;
  response: string;
  feedback: string | null;
  mastery: number | null;  // 1=weak, 2=partial, 3=solid
}

/** A completed gate for one section (contains 2-3 sub-questions) */
export interface GateResponse {
  sectionIndex: number;
  subQuestions: GateSubQuestion[];
  remember?: string;
  watchOut?: string;
  goDeeper?: string;
  timestamp: string;
}

/** Minimal persisted pre-reading artifact for a chapter */
export interface SchemaActivationEntry {
  prompt: string;
  response: string;
  completedAt: string;
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
