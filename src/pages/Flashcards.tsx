import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useFlashcardStore } from "../stores/flashcard";
import type { ReviewRating, Subject } from "../lib/types";
import { fsrs, fsrsRatingFromButton, type FSRSCard } from "../lib/sr";
import { listSubjects } from "../lib/tauri";
import { localDateString } from "../lib/dates";
import MarkdownRenderer from "../components/shared/MarkdownRenderer";
import { EmptyState, LoadingState, MetaChip, PageHeader, Panel, PrimaryButton, SecondaryButton, SegmentedTabs } from "../components/ui/primitives";

const RATING_BUTTONS: { label: string; rating: ReviewRating; color: string }[] =
  [
    { label: "Again", rating: "again", color: "bg-coral" },
    { label: "Hard", rating: "hard", color: "bg-amber" },
    { label: "Good", rating: "good", color: "bg-teal" },
    { label: "Easy", rating: "easy", color: "bg-teal/80" },
  ];

function normalizeSubjectKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function NewCardForm() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subject, setSubject] = useState("");
  const [topic, setTopic] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [bloom, setBloom] = useState(2);
  const [cardType, setCardType] = useState<"basic" | "cloze" | "reversed">("basic");
  const [saved, setSaved] = useState(false);
  const [open, setOpen] = useState(false);
  const { createCard } = useFlashcardStore();

  useEffect(() => {
    listSubjects().then(setSubjects).catch(() => {});
  }, []);

  if (!open) {
    return (
      <SecondaryButton onClick={() => setOpen(true)} className="w-full border-dashed py-3">
        + New Card
      </SecondaryButton>
    );
  }

  const handleSave = async () => {
    if (!subject) return;
    if (cardType === "cloze") {
      if (!question.trim() || !question.includes("{{")) return;
      // Extract answer from {{brackets}}
      const match = question.match(/\{\{(.+?)\}\}/);
      const clozeAnswer = match ? match[1] : "";
      await createCard(subject, topic || "General", question.trim(), clozeAnswer, bloom, "cloze");
    } else {
      if (!question.trim() || !answer.trim()) return;
      await createCard(subject, topic || "General", question.trim(), answer.trim(), bloom, cardType);
    }
    setQuestion("");
    setAnswer("");
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  // Cloze preview
  const clozePreview = cardType === "cloze" && question.includes("{{")
    ? question.replace(/\{\{.+?\}\}/g, "___")
    : null;

  return (
    <Panel title="New Flashcard" headerActions={<button onClick={() => setOpen(false)} className="text-xs text-text-muted hover:text-text">Close</button>} className="bg-panel">
      {/* Card type picker */}
      <div className="mb-4 grid grid-cols-3 gap-2">
        {([
          { id: "basic" as const, label: "Basic Q&A", desc: "Free recall" },
          { id: "cloze" as const, label: "Cloze", desc: "Fill-in-blank" },
          { id: "reversed" as const, label: "Reversed", desc: "Creates both directions" },
        ]).map((t) => (
          <button
            key={t.id}
            onClick={() => setCardType(t.id)}
            className={`rounded-xl border px-2 py-2.5 text-xs transition-colors ${
              cardType === t.id
                ? "border-accent/40 bg-accent-soft text-text"
                : "border-border-subtle bg-panel-alt text-text-muted hover:border-border-strong hover:text-text"
            }`}
          >
            <span className="font-medium">{t.label}</span>
            <span className="block text-[10px] opacity-60">{t.desc}</span>
          </button>
        ))}
      </div>

      <select
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        className="mb-3 w-full rounded-xl border border-border-subtle bg-panel-alt px-3 py-3 text-sm text-text focus:outline-none focus:border-accent/50"
      >
        <option value="">Select subject...</option>
        {subjects.map((s) => (
          <option key={s.slug} value={s.name}>{s.name}</option>
        ))}
      </select>
      <input
        type="text"
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
        placeholder="Topic (e.g. Normalization)..."
        className="mb-3 w-full rounded-xl border border-border-subtle bg-panel-alt px-3 py-3 text-sm text-text focus:outline-none focus:border-accent/50"
      />

      {cardType === "cloze" ? (
        <>
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Type sentence with {{key term}} in double braces..."
            rows={3}
            className="mb-1 w-full rounded-xl border border-border-subtle bg-panel-alt px-3 py-3 text-sm text-text resize-none focus:outline-none focus:border-accent/50"
          />
          {clozePreview && (
            <p className="text-xs text-text-muted mb-3 px-1">Preview: {clozePreview}</p>
          )}
        </>
      ) : (
        <>
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={cardType === "reversed" ? "Term or concept..." : "Question..."}
            rows={2}
            className="mb-3 w-full rounded-xl border border-border-subtle bg-panel-alt px-3 py-3 text-sm text-text resize-none focus:outline-none focus:border-accent/50"
          />
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder={cardType === "reversed" ? "Definition or explanation..." : "Answer..."}
            rows={3}
            className="mb-4 w-full rounded-xl border border-border-subtle bg-panel-alt px-3 py-3 text-sm text-text resize-none focus:outline-none focus:border-accent/50"
          />
        </>
      )}

      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          <span className="text-xs text-text-muted mr-1">Bloom:</span>
          {[1, 2, 3, 4, 5, 6].map((b) => (
            <button
              key={b}
              onClick={() => setBloom(b)}
              className={`h-8 w-8 rounded-lg text-xs ${bloom === b ? "bg-accent text-white" : "border border-border-subtle bg-panel-alt text-text-muted hover:border-border-strong hover:text-text"}`}
            >
              {b}
            </button>
          ))}
        </div>
        <PrimaryButton
          onClick={handleSave}
          disabled={!subject || !question.trim() || (cardType !== "cloze" && !answer.trim())}
          className="px-4 py-2 text-xs"
        >
          {cardType === "reversed" ? "Save Both Cards" : "Save Card"}
        </PrimaryButton>
      </div>
      {saved && <p className="text-xs text-teal mt-2">Card saved!</p>}
    </Panel>
  );
}

function SubjectDashboard({ onStartReview, onStudyAll }: {
  onStartReview: (subject?: string) => void;
  onStudyAll: (subject?: string) => void;
}) {
  const { allCards, loading, loadAllCards } = useFlashcardStore();
  const [vaultSubjects, setVaultSubjects] = useState<Subject[]>([]);

  useEffect(() => {
    loadAllCards();
    listSubjects().then(setVaultSubjects).catch(() => {});
  }, [loadAllCards]);

  if (loading) {
    return <LoadingState label="Loading flashcards" detail="Building your review queue and subject groups." />;
  }

  // Group by canonical subject key so minor punctuation differences do not split the same course.
  const subjects = new Map<string, { displayName: string; total: number; due: number; nextReview: string }>();
  const todayStr = localDateString();

  // Start with all vault subjects (so 0-card subjects show)
  for (const vs of vaultSubjects) {
    subjects.set(normalizeSubjectKey(vs.name), {
      displayName: vs.name,
      total: 0,
      due: 0,
      nextReview: "9999",
    });
  }

  for (const c of allCards) {
    const displayName = c.subject || "Unknown";
    const key = normalizeSubjectKey(displayName);
    const existing = subjects.get(key) || { displayName, total: 0, due: 0, nextReview: "9999" };
    existing.total++;
    if (c.nextReview <= todayStr) existing.due++;
    if (c.nextReview < existing.nextReview) existing.nextReview = c.nextReview;
    subjects.set(key, existing);
  }

  const totalDue = allCards.filter((c) => c.nextReview <= todayStr).length;

  return (
    <div className="space-y-4 pb-8">
      {subjects.size === 0 && (
        <EmptyState
          title="No flashcards yet"
          description="Create your first card below, or cards will be auto-created from quiz misses."
        />
      )}

      {Array.from(subjects.entries()).map(([subjectKey, data]) => (
        <Panel
          key={subjectKey}
          title={
            <div>
              <p className="text-base font-semibold text-text">{data.displayName}</p>
              <p className="mt-1 text-xs text-text-muted">
                {data.total} card{data.total !== 1 ? "s" : ""}
                {data.due > 0 && <span className="text-coral ml-2">{data.due} due</span>}
                {data.due === 0 && data.nextReview !== "9999" && (
                  <span className="ml-2">Next: {data.nextReview}</span>
                )}
              </p>
            </div>
          }
          headerActions={
            <div className="flex gap-2">
              <SecondaryButton
                onClick={() => onStudyAll(data.displayName)}
                className="px-3 py-2 text-xs"
              >
                Study All
              </SecondaryButton>
              {data.due > 0 && (
                <PrimaryButton
                  onClick={() => onStartReview(data.displayName)}
                  className="px-3 py-2 text-xs"
                >
                  Review ({data.due})
                </PrimaryButton>
              )}
            </div>
          }
        >
          <div className="flex flex-wrap gap-2">
            <MetaChip>{data.total} total</MetaChip>
            {data.due > 0 ? <MetaChip variant="danger">{data.due} due now</MetaChip> : <MetaChip>Next {data.nextReview === "9999" ? "—" : data.nextReview}</MetaChip>}
          </div>
        </Panel>
      ))}

      {/* Action buttons */}
      <div className="flex gap-2">
        {totalDue > 0 && (
          <PrimaryButton
            onClick={() => onStartReview()}
            className="flex-1 py-3"
          >
            Review Due ({totalDue})
          </PrimaryButton>
        )}
        {allCards.length > 0 && (
          <SecondaryButton
            onClick={() => onStudyAll()}
            className="flex-1 py-3"
          >
            Study All ({allCards.length})
          </SecondaryButton>
        )}
      </div>

      {/* New Card form */}
      <NewCardForm />
    </div>
  );
}

function CardEditForm({ card, onSave, onCancel }: {
  card: { id: string; filePath: string; question: string; answer: string; bloom: number };
  onSave: (q: string, a: string, b: number) => void;
  onCancel: () => void;
}) {
  const [q, setQ] = useState(card.question);
  const [a, setA] = useState(card.answer);
  const [b, setB] = useState(card.bloom);

  return (
    <div className="p-3 bg-surface-2 rounded space-y-2">
      <textarea
        value={q}
        onChange={(e) => setQ(e.target.value)}
        rows={2}
        className="w-full px-3 py-2 bg-bg border border-border rounded text-sm text-text resize-none focus:outline-none focus:border-purple"
        placeholder="Question..."
      />
      <textarea
        value={a}
        onChange={(e) => setA(e.target.value)}
        rows={3}
        className="w-full px-3 py-2 bg-bg border border-border rounded text-sm text-text resize-none focus:outline-none focus:border-purple"
        placeholder="Answer..."
      />
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          <span className="text-xs text-text-muted mr-1">Bloom:</span>
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <button
              key={n}
              onClick={() => setB(n)}
              className={`w-5 h-5 text-[10px] rounded ${b === n ? "bg-purple text-white" : "bg-surface text-text-muted border border-border"}`}
            >
              {n}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button onClick={onCancel} className="px-3 py-1 text-xs text-text-muted hover:text-text">Cancel</button>
          <button
            onClick={() => onSave(q.trim(), a.trim(), b)}
            disabled={!q.trim() || !a.trim()}
            className="px-3 py-1 text-xs bg-purple text-white rounded hover:opacity-90 disabled:opacity-30"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function AllCardsView() {
  const { allCards, loading, loadAllCards, deleteCard, editCard } = useFlashcardStore();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [statsId, setStatsId] = useState<string | null>(null);

  useEffect(() => {
    loadAllCards();
  }, [loadAllCards]);

  if (loading) {
    return <LoadingState label="Loading all cards" detail="Collecting cards across your vault." />;
  }

  if (allCards.length === 0) {
    return (
      <EmptyState
        title="No flashcards yet"
        description="Create cards from the Reader while studying, or add one manually below."
        action={<div className="mt-4"><NewCardForm /></div>}
      />
    );
  }

  // Group by subject + topic
  const grouped = new Map<string, typeof allCards>();
  for (const c of allCards) {
    const key = `${c.subject} — ${c.topic}`;
    const list = grouped.get(key) || [];
    list.push(c);
    grouped.set(key, list);
  }

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center justify-between">
        <p className="text-xs text-text-muted">{allCards.length} cards total</p>
      </div>
      {Array.from(grouped.entries()).map(([group, groupCards]) => (
        <Panel key={group} className="overflow-hidden" bodyClassName="p-0">
          <button
            onClick={() => setExpanded(expanded === group ? null : group)}
            className="w-full flex items-center justify-between px-5 py-4 text-left transition-colors hover:bg-panel-active"
          >
            <span className="text-sm font-medium text-text">{group}</span>
            <MetaChip>{groupCards.length} cards</MetaChip>
          </button>
          {expanded === group && (
            <div className="border-t border-border-subtle">
              {groupCards.map((c) => (
                <div key={c.id} className="border-b border-border-subtle px-5 py-4 last:border-0">
                  {editingId === c.id ? (
                    <CardEditForm
                      card={c}
                      onSave={async (q, a, b) => {
                        await editCard(c.id, c.filePath, q, a, b);
                        setEditingId(null);
                      }}
                      onCancel={() => setEditingId(null)}
                    />
                  ) : confirmDeleteId === c.id ? (
                    <div className="flex items-center justify-between py-2">
                      <p className="text-sm text-coral">Delete this card?</p>
                      <div className="flex gap-2">
                        <button onClick={() => setConfirmDeleteId(null)} className="px-3 py-1 text-xs text-text-muted hover:text-text">Cancel</button>
                        <button
                          onClick={async () => {
                            await deleteCard(c.id, c.filePath);
                            setConfirmDeleteId(null);
                          }}
                          className="px-3 py-1 text-xs bg-coral text-white rounded hover:opacity-90"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-text font-medium">{c.question}</p>
                        <div className="text-xs text-text-muted mt-1"><MarkdownRenderer content={c.answer} /></div>
                      </div>
                      <div className="shrink-0 flex items-start gap-2">
                        <div className="text-right">
                          <span className="text-xs px-1.5 py-0.5 bg-purple/20 text-purple rounded">B{c.bloom}</span>
                          <p className="text-xs text-text-muted mt-1">
                            {(() => {
                              const today = localDateString();
                              if (c.nextReview <= today) return <span className="text-coral">Due now</span>;
                              const diff = Math.round((new Date(c.nextReview).getTime() - Date.now()) / 86400000);
                              if (diff === 1) return "Tomorrow";
                              if (diff < 7) return `In ${diff}d`;
                              return c.nextReview;
                            })()}
                          </p>
                        </div>
                        <div className="flex gap-0.5 ml-2">
                          <button
                            onClick={() => setStatsId(statsId === c.id ? null : c.id)}
                            className={`p-2 rounded-md transition-colors ${statsId === c.id ? "text-purple bg-purple/10" : "text-text-muted hover:text-purple hover:bg-purple/10"}`}
                            title="Card stats"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="M7 16l4-8 4 4 4-6"/></svg>
                          </button>
                          <button
                            onClick={() => setEditingId(c.id)}
                            className="p-2 rounded-md text-text-muted hover:text-purple hover:bg-purple/10 transition-colors"
                            title="Edit card"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(c.id)}
                            className="p-2 rounded-md text-text-muted hover:text-coral hover:bg-coral/10 transition-colors"
                            title="Delete card"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                          </button>
                        </div>
                      </div>
                    </div>
                    {/* Card statistics */}
                    {statsId === c.id && (
                      <div className="mt-2 pt-2 border-t border-border grid grid-cols-3 gap-2 text-[10px]">
                        <div>
                          <span className="text-text-muted">Success</span>
                          <p className="text-text font-medium">{c.reps ? `${Math.round(((c.reps - (c.lapses ?? 0)) / c.reps) * 100)}%` : "—"}</p>
                        </div>
                        <div>
                          <span className="text-text-muted">Stability</span>
                          <p className="text-text font-medium">{c.stability ? `${Math.round(c.stability)}d` : "New"}</p>
                        </div>
                        <div>
                          <span className="text-text-muted">Reviews</span>
                          <p className="text-text font-medium">{c.reps ?? 0}</p>
                        </div>
                        <div>
                          <span className="text-text-muted">Lapses</span>
                          <p className="text-text font-medium">{c.lapses ?? 0}</p>
                        </div>
                        <div>
                          <span className="text-text-muted">Interval</span>
                          <p className="text-text font-medium">{c.interval ? `${c.interval}d` : "—"}</p>
                        </div>
                        <div>
                          <span className="text-text-muted">Status</span>
                          <p className={`font-medium ${(c.stability ?? 0) > 30 ? "text-teal" : (c.stability ?? 0) > 7 ? "text-amber" : "text-purple"}`}>
                            {(c.stability ?? 0) > 30 ? "Strong" : (c.stability ?? 0) > 7 ? "Learning" : "New"}
                          </p>
                        </div>
                      </div>
                    )}
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </Panel>
      ))}
      <NewCardForm />
    </div>
  );
}

export default function FlashcardsPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<"dashboard" | "review" | "browse">("dashboard");
  const [reviewEditingId, setReviewEditingId] = useState<string | null>(null);
  const [reviewConfirmDeleteId, setReviewConfirmDeleteId] = useState<string | null>(null);
  const {
    cards,
    currentIndex,
    showAnswer,
    loading,
    sessionComplete,
    dueCount,
    loadDueCards,
    loadDueCount,
    loadAllCardsForReview,
    revealAnswer,
    rateCard,
    deleteCard,
    editCard,
    resetSession,
  } = useFlashcardStore();

  useEffect(() => {
    loadDueCards();
    loadDueCount();
    return () => resetSession();
  }, [loadDueCards, loadDueCount, resetSession]);

  const tabs = [
    { value: "dashboard" as const, label: "Dashboard" },
    { value: "review" as const, label: `Review${dueCount > 0 ? ` (${dueCount})` : ""}` },
    { value: "browse" as const, label: "All Cards" },
  ];

  // Browse tab
  // Dashboard tab — subject picker
  if (tab === "dashboard") {
    return (
      <div className="flex flex-col h-full">
        <PageHeader
          title="Flashcards"
          subtitle="Build durable recall with a quieter review workflow."
          actions={(
            <SegmentedTabs
              items={tabs}
              value={tab}
              onChange={(next) => {
                setTab(next);
                if (next === "review") loadDueCards();
              }}
            />
          )}
        />
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <SubjectDashboard
            onStartReview={() => { setTab("review"); loadDueCards(); }}
            onStudyAll={(subject) => { setTab("review"); loadAllCardsForReview(subject); }}
          />
        </div>
      </div>
    );
  }

  if (tab === "browse") {
    return (
      <div className="flex flex-col h-full">
        <PageHeader
          title="Flashcards"
          subtitle="Browse and tune the cards already in your vault."
          actions={(
            <SegmentedTabs
              items={tabs}
              value={tab}
              onChange={(next) => {
                setTab(next);
                if (next === "review") loadDueCards();
              }}
            />
          )}
        />
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <AllCardsView />
        </div>
      </div>
    );
  }

  if (loading && tab === "review") {
    return (
      <div className="h-full px-6 py-6">
        <LoadingState label="Loading review session" detail="Preparing your due cards and review queue." />
      </div>
    );
  }

  if (sessionComplete) {
    const stats = useFlashcardStore.getState().sessionStats;
    const hasStats = stats.total > 0;

    return (
      <div className="flex flex-col h-full">
        <PageHeader
          title="Flashcard Review"
          subtitle={hasStats ? "Session complete." : "No cards are due right now."}
          actions={(
            <SegmentedTabs
              items={tabs}
              value={tab}
              onChange={(next) => {
                setTab(next);
                if (next === "review") loadDueCards();
              }}
            />
          )}
        />
        <div className="flex-1 flex items-center justify-center">
          <div className="max-w-2xl w-full px-8">
            <Panel className="text-center">
              <div className="mb-2">
              <p className="text-teal text-lg font-medium mb-2">
                {hasStats
                  ? `Review complete! ${stats.total} cards reviewed.`
                  : "No cards due for review."}
              </p>

              {/* Session stats breakdown */}
              {hasStats && (
                <div className="my-6">
                  {/* Stats bar */}
                  <div className="flex h-3 rounded overflow-hidden mb-3">
                    {stats.again > 0 && <div className="bg-coral" style={{ width: `${(stats.again / stats.total) * 100}%` }} />}
                    {stats.hard > 0 && <div className="bg-amber" style={{ width: `${(stats.hard / stats.total) * 100}%` }} />}
                    {stats.good > 0 && <div className="bg-teal" style={{ width: `${(stats.good / stats.total) * 100}%` }} />}
                    {stats.easy > 0 && <div className="bg-purple" style={{ width: `${(stats.easy / stats.total) * 100}%` }} />}
                  </div>
                  {/* Stats legend */}
                  <div className="flex justify-center gap-4 text-xs">
                    {stats.again > 0 && <span className="text-coral">Again: {stats.again}</span>}
                    {stats.hard > 0 && <span className="text-amber">Hard: {stats.hard}</span>}
                    {stats.good > 0 && <span className="text-teal">Good: {stats.good}</span>}
                    {stats.easy > 0 && <span className="text-purple">Easy: {stats.easy}</span>}
                  </div>
                </div>
              )}

              <p className="text-text-muted text-sm mb-4">
                {hasStats
                  ? "Great work — your memory traces are stronger now."
                  : "Browse your cards or create new ones in the All Cards tab."}
              </p>
              <div className="flex gap-2 justify-center">
                <SecondaryButton onClick={() => setTab("browse")} className="px-4 py-2 text-sm">
                  Browse All Cards
                </SecondaryButton>
                <SecondaryButton onClick={() => navigate("/")} className="px-4 py-2 text-sm">
                  Back to Home
                </SecondaryButton>
              </div>
              </div>
            </Panel>
          </div>
        </div>
      </div>
    );
  }

  const card = cards[currentIndex];
  if (!card) return null;

  // Preview next intervals using FSRS (matching actual review logic)
  const cardFSRS: FSRSCard = {
    stability: card.stability ?? Math.max(0.1, card.interval || 1),
    difficulty: card.difficulty ?? Math.min(10, Math.max(1, 10 - card.ease * 2)),
    reps: card.reps ?? (card.interval > 0 ? 1 : 0),
    lapses: card.lapses ?? 0,
  };
  const elapsed = card.lastReviewed
    ? Math.max(0, Math.round((Date.now() - new Date(card.lastReviewed).getTime()) / 86400000))
    : card.interval || 0;
  const intervals = RATING_BUTTONS.map((b) => {
    const r = fsrsRatingFromButton(b.rating);
    const { interval } = fsrs(cardFSRS, r, elapsed);
    return `${interval}d`;
  });

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Flashcard Review"
        subtitle={`Card ${currentIndex + 1} of ${cards.length}`}
        actions={(
          <SegmentedTabs
            items={tabs}
            value={tab}
            onChange={(next) => {
              setTab(next);
              if (next === "review") loadDueCards();
            }}
          />
        )}
        meta={(
          <>
            <MetaChip>{card.subject}</MetaChip>
            {card.topic && <MetaChip>{card.topic}</MetaChip>}
            <MetaChip variant="accent">Bloom {card.bloom}</MetaChip>
            {card.cardType && card.cardType !== "basic" && <MetaChip variant="success">{card.cardType}</MetaChip>}
          </>
        )}
      />

      {/* Progress bar */}
      <div className="h-1 bg-panel-alt">
        <div
          className="h-full bg-accent transition-all duration-300"
          style={{
            width: `${((currentIndex + 1) / cards.length) * 100}%`,
          }}
        />
      </div>

      {/* Card */}
      <div className="flex-1 flex items-center justify-center overflow-y-auto">
        <div className="max-w-[720px] w-full mx-auto px-8 py-8">

          {/* Edit/Delete inline form */}
          {reviewEditingId === card.id ? (
            <CardEditForm
              card={card}
              onSave={async (q, a, b) => {
                await editCard(card.id, card.filePath, q, a, b);
                setReviewEditingId(null);
              }}
              onCancel={() => setReviewEditingId(null)}
            />
          ) : reviewConfirmDeleteId === card.id ? (
            <div className="mb-4 flex items-center justify-between rounded-2xl border border-coral/30 bg-coral/10 px-4 py-4">
              <p className="text-sm text-coral">Delete this card permanently?</p>
              <div className="flex gap-2">
                <button onClick={() => setReviewConfirmDeleteId(null)} className="px-3 py-1 text-xs text-text-muted hover:text-text">Cancel</button>
                <button
                  onClick={async () => {
                    await deleteCard(card.id, card.filePath);
                    setReviewConfirmDeleteId(null);
                  }}
                  className="px-3 py-1 text-xs bg-coral text-white rounded hover:opacity-90"
                >
                  Delete
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Question display — varies by card type */}
              <div className="mb-8">
                {card.cardType === "cloze" ? (
                  <p className="text-lg leading-relaxed" style={{ fontFamily: "Georgia, serif" }}>
                    {card.question.replace(/\{\{.+?\}\}/g, "___")}
                  </p>
                ) : card.cardType === "reversed" ? (
                  <>
                    <p className="text-xs text-text-muted mb-2">What term or concept matches this?</p>
                    <p className="text-lg leading-relaxed" style={{ fontFamily: "Georgia, serif" }}>
                      {card.question}
                    </p>
                  </>
                ) : (
                  <p className="text-lg leading-relaxed" style={{ fontFamily: "Georgia, serif" }}>
                    {card.question}
                  </p>
                )}
              </div>

              {/* Card actions toolbar */}
              <div className="flex justify-end gap-1 mb-4">
                <button
                  onClick={() => setReviewEditingId(card.id)}
                  className="rounded-xl border border-transparent p-2 text-text-muted transition-colors hover:border-border-strong hover:bg-panel-active hover:text-text"
                  title="Edit card"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                </button>
                <button
                  onClick={() => setReviewConfirmDeleteId(card.id)}
                  className="rounded-xl border border-transparent p-2 text-text-muted transition-colors hover:border-coral/30 hover:bg-coral/10 hover:text-coral"
                  title="Delete card"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                </button>
              </div>

              {/* Answer area */}
              {!showAnswer ? (
                <PrimaryButton
                  onClick={revealAnswer}
                  className="w-full py-3 text-sm"
                >
                  {card.cardType === "cloze" ? "Reveal Answer" : "Show Answer"}
                </PrimaryButton>
              ) : (
                <Panel className="bg-panel" bodyClassName="space-y-6">
                  {/* Answer */}
                  <div className="rounded-2xl border border-border-subtle bg-panel-alt p-5" style={{ fontFamily: "Georgia, serif" }}>
                    <MarkdownRenderer content={card.answer} />
                  </div>

                  {/* Rating buttons */}
                  <p className="text-center text-xs text-text-muted">
                    How well did you recall this?
                  </p>
                  <div className="grid grid-cols-4 gap-2">
                    {RATING_BUTTONS.map((b, i) => (
                      <button
                        key={b.rating}
                        onClick={() => rateCard(b.rating)}
                        className={`${b.color} rounded-xl py-3 text-sm font-medium text-white shadow-[var(--shadow-panel)] transition-all hover:translate-y-[-1px] hover:opacity-95`}
                      >
                        <div>{b.label}</div>
                        <div className="text-xs opacity-75 mt-1">
                          {intervals[i]}
                        </div>
                      </button>
                    ))}
                  </div>
                </Panel>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
