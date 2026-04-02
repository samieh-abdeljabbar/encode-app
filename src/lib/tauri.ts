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

// AI status types
export interface AiStatus {
  provider: string;
  configured: boolean;
  has_api_key: boolean;
}

export interface AiRunInfo {
  id: number;
  feature: string;
  provider: string;
  model: string;
  status: string;
  latency_ms: number;
  error_summary: string | null;
  created_at: string;
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

// AI IPC
export const checkAiStatus = () => invoke<AiStatus>("check_ai_status");
export const listAiRuns = () => invoke<AiRunInfo[]>("list_ai_runs");

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
  chapters_completed: number;
  total_cards: number;
  quizzes_passed: number;
}

export interface QueueDashboard {
  summary: QueueSummary;
  items: QueueItem[];
}

// Queue IPC
export const getQueueDashboard = () =>
  invoke<QueueDashboard>("get_queue_dashboard");

// Progress types
export interface SubjectProgress {
  subject_id: number;
  subject_name: string;
  total_chapters: number;
  chapters_completed: number;
  total_cards: number;
  cards_mastered: number;
  quiz_average: number | null;
  quizzes_taken: number;
}

export interface ProgressReport {
  subjects: SubjectProgress[];
  overall_quiz_average: number | null;
  total_study_events: number;
  streak_days: number;
}

export const getProgressReport = () =>
  invoke<ProgressReport>("get_progress_report");

// Card management types
export interface CardInfo {
  id: number;
  subject_id: number;
  chapter_id: number | null;
  source_type: string;
  prompt: string;
  answer: string;
  card_type: string;
  status: string;
  created_at: string;
  next_review: string | null;
  stability: number | null;
  reps: number | null;
  lapses: number | null;
}

// Card management IPC
export const createCard = (
  subjectId: number,
  chapterId: number | null,
  prompt: string,
  answer: string,
  cardType: string,
) =>
  invoke<CardInfo>("create_card", {
    subjectId,
    chapterId,
    prompt,
    answer,
    cardType,
  });

export const listCards = (subjectId?: number, search?: string) =>
  invoke<CardInfo[]>("list_cards", {
    subjectId: subjectId ?? null,
    search: search ?? null,
  });

export const updateCard = (
  cardId: number,
  prompt?: string,
  answer?: string,
  status?: string,
) =>
  invoke<CardInfo>("update_card", {
    cardId,
    prompt: prompt ?? null,
    answer: answer ?? null,
    status: status ?? null,
  });

export const deleteCard = (cardId: number) =>
  invoke<void>("delete_card", { cardId });

export const getPracticeCards = (subjectId?: number, limit?: number) =>
  invoke<DueCard[]>("get_practice_cards", {
    subjectId: subjectId ?? null,
    limit: limit ?? 50,
  });

// Editor IPC
export const updateChapterContent = (chapterId: number, markdown: string) =>
  invoke<void>("update_chapter_content", { chapterId, markdown });

export const saveImage = (data: number[], extension: string) =>
  invoke<string>("save_image", { data, extension });

// Quiz types
export interface QuizQuestion {
  question_type: string;
  prompt: string;
  options: string[] | null;
  correct_answer: string;
  section_id: number;
  section_heading: string | null;
}

export interface QuestionResult {
  verdict: string;
  correct_answer: string;
  explanation: string | null;
  repair_card_id: number | null;
  needs_self_rating: boolean;
}

export interface QuizAttemptInfo {
  question_index: number;
  result: string;
}

export interface QuizState {
  id: number;
  chapter_id: number;
  chapter_title: string;
  questions: QuizQuestion[];
  attempts: QuizAttemptInfo[];
  score: number | null;
}

export interface QuizSummary {
  score: number;
  total: number;
  correct: number;
  partial: number;
  incorrect: number;
  repair_cards_created: number;
  retest_scheduled: boolean;
}

export interface QuizListItem {
  id: number;
  chapter_id: number | null;
  chapter_title: string;
  subject_name: string;
  score: number | null;
  question_count: number;
  generated_at: string;
}

// Quiz IPC
export const listQuizzes = (subjectId?: number) =>
  invoke<QuizListItem[]>("list_quizzes", { subjectId: subjectId ?? null });

export const deleteQuiz = (quizId: number) =>
  invoke<void>("delete_quiz", { quizId });

export const generateQuiz = (
  chapterId: number,
  difficulty: string,
  questionCount: number,
  questionType = "mixed",
) =>
  invoke<QuizState>("generate_quiz", {
    chapterId,
    difficulty,
    questionCount,
    questionType,
  });

export const submitQuizAnswer = (
  quizId: number,
  questionIndex: number,
  answer: string,
) =>
  invoke<QuestionResult>("submit_quiz_answer", {
    quizId,
    questionIndex,
    answer,
  });

export const submitQuizSelfRating = (
  quizId: number,
  questionIndex: number,
  selfRating: string,
) =>
  invoke<QuestionResult>("submit_quiz_self_rating", {
    quizId,
    questionIndex,
    selfRating,
  });

export const getQuiz = (quizId: number) =>
  invoke<QuizState>("get_quiz", { quizId });

export const completeQuiz = (quizId: number) =>
  invoke<QuizSummary>("complete_quiz", { quizId });

// Teach-back types
export interface TeachbackStart {
  id: number;
  prompt: string;
  chapter_title: string;
  subject_name: string;
}

export interface RubricScores {
  accuracy: number;
  clarity: number;
  completeness: number;
  example: number;
  jargon: number;
}

export interface TeachbackResult {
  mastery: string;
  scores: RubricScores;
  overall: number;
  strongest: string;
  biggest_gap: string;
  repair_card_id: number | null;
  needs_self_rating: boolean;
}

export interface TeachbackListItem {
  id: number;
  chapter_id: number | null;
  chapter_title: string;
  subject_name: string;
  mastery: string | null;
  created_at: string;
}

// Teach-back IPC
export const startTeachback = (chapterId: number) =>
  invoke<TeachbackStart>("start_teachback", { chapterId });

export const submitTeachback = (teachbackId: number, response: string) =>
  invoke<TeachbackResult>("submit_teachback", { teachbackId, response });

export const submitTeachbackSelfRating = (
  teachbackId: number,
  response: string,
  ratings: RubricScores,
) =>
  invoke<TeachbackResult>("submit_teachback_self_rating", {
    teachbackId,
    response,
    ratings,
  });

export const listTeachbacks = (subjectId?: number) =>
  invoke<TeachbackListItem[]>("list_teachbacks", {
    subjectId: subjectId ?? null,
  });

// Notes types
export interface NoteInfo {
  id: number;
  title: string;
  file_path: string;
  subject_id: number | null;
  subject_name: string | null;
  tags: string[];
  created_at: string;
  modified_at: string;
}

export interface NoteDetail {
  info: NoteInfo;
  content: string;
}

export interface NoteSearchResult {
  note_id: number;
  title: string;
  snippet: string;
  file_path: string;
}

export interface BacklinkInfo {
  note_id: number;
  title: string;
  context: string;
}

export interface LinkInfo {
  target_title: string;
  target_note_id: number | null;
  resolved: boolean;
}

export interface GraphNode {
  id: number;
  title: string;
  subject_id: number | null;
  link_count: number;
}

export interface GraphEdge {
  source: number;
  target: number;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// Notes IPC
export const createNote = (
  title: string,
  folder: string | null,
  subjectName: string | null,
  content: string,
) => invoke<NoteInfo>("create_note", { title, folder, subjectName, content });

export const getNote = (noteId: number) =>
  invoke<NoteDetail>("get_note", { noteId });

export const updateNote = (noteId: number, content: string) =>
  invoke<NoteInfo>("update_note", { noteId, content });

export const deleteNote = (noteId: number) =>
  invoke<void>("delete_note", { noteId });

export const listNotes = (folder?: string, subjectId?: number, tag?: string) =>
  invoke<NoteInfo[]>("list_notes", {
    folder: folder ?? null,
    subjectId: subjectId ?? null,
    tag: tag ?? null,
  });

export const renameNote = (noteId: number, newTitle: string) =>
  invoke<NoteInfo>("rename_note", { noteId, newTitle });

export const searchNotes = (query: string) =>
  invoke<NoteSearchResult[]>("search_notes", { query });

export const getBacklinks = (noteId: number) =>
  invoke<BacklinkInfo[]>("get_backlinks", { noteId });

export const getOutgoingLinks = (noteId: number) =>
  invoke<LinkInfo[]>("get_outgoing_links", { noteId });

export const getGraphData = () => invoke<GraphData>("get_graph_data");

export const getLocalGraph = (noteId: number, depth: number) =>
  invoke<GraphData>("get_local_graph", { noteId, depth });

export const listNoteFolders = () => invoke<string[]>("list_note_folders");

export const createNoteFolder = (path: string) =>
  invoke<void>("create_note_folder", { path });

export const getNoteTitles = () =>
  invoke<[number, string][]>("get_note_titles");
