import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useFlashcardStore } from "../stores/flashcard";
import type { ReviewRating, Subject } from "../lib/types";
import { fsrs, fsrsRatingFromButton, type FSRSCard } from "../lib/sr";
import { listSubjects } from "../lib/tauri";

const RATING_BUTTONS: { label: string; rating: ReviewRating; color: string }[] =
  [
    { label: "Again", rating: "again", color: "bg-[#D85A30]" },
    { label: "Hard", rating: "hard", color: "bg-[#BA7517]" },
    { label: "Good", rating: "good", color: "bg-[#1D9E75]" },
    { label: "Easy", rating: "easy", color: "bg-[#1D9E75]/80" },
  ];

function NewCardForm() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subject, setSubject] = useState("");
  const [topic, setTopic] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [bloom, setBloom] = useState(2);
  const [saved, setSaved] = useState(false);
  const [open, setOpen] = useState(false);
  const { createCard } = useFlashcardStore();

  useEffect(() => {
    listSubjects().then(setSubjects).catch(() => {});
  }, []);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full py-2 text-sm text-text-muted border border-border border-dashed rounded hover:text-purple hover:border-purple transition-colors"
      >
        + New Card
      </button>
    );
  }

  const handleSave = async () => {
    if (!subject || !question.trim() || !answer.trim()) return;
    await createCard(subject, topic || "General", question.trim(), answer.trim(), bloom);
    setQuestion("");
    setAnswer("");
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="p-4 bg-surface border border-purple/40 rounded-lg">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-purple font-medium">New Flashcard</p>
        <button onClick={() => setOpen(false)} className="text-xs text-text-muted hover:text-text">Close</button>
      </div>
      <select
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        className="w-full mb-2 px-3 py-2 bg-surface-2 border border-border rounded text-sm text-text focus:outline-none focus:border-purple"
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
        className="w-full mb-2 px-3 py-2 bg-surface-2 border border-border rounded text-sm text-text focus:outline-none focus:border-purple"
      />
      <textarea
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder="Question..."
        rows={2}
        className="w-full mb-2 px-3 py-2 bg-surface-2 border border-border rounded text-sm text-text resize-none focus:outline-none focus:border-purple"
      />
      <textarea
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        placeholder="Answer..."
        rows={3}
        className="w-full mb-3 px-3 py-2 bg-surface-2 border border-border rounded text-sm text-text resize-none focus:outline-none focus:border-purple"
      />
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          <span className="text-xs text-text-muted mr-1">Bloom:</span>
          {[1, 2, 3, 4, 5, 6].map((b) => (
            <button
              key={b}
              onClick={() => setBloom(b)}
              className={`w-6 h-6 text-xs rounded ${bloom === b ? "bg-purple text-white" : "bg-surface-2 text-text-muted border border-border hover:border-purple"}`}
            >
              {b}
            </button>
          ))}
        </div>
        <button
          onClick={handleSave}
          disabled={!subject || !question.trim() || !answer.trim()}
          className="px-4 py-1.5 text-xs bg-purple text-white rounded hover:opacity-90 disabled:opacity-30"
        >
          Save Card
        </button>
      </div>
      {saved && <p className="text-xs text-teal mt-2">Card saved!</p>}
    </div>
  );
}

function AllCardsView() {
  const { allCards, loading, loadAllCards } = useFlashcardStore();
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    loadAllCards();
  }, [loadAllCards]);

  if (loading) {
    return <p className="text-text-muted text-center py-8">Loading cards...</p>;
  }

  if (allCards.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-text-muted mb-4">No flashcards yet.</p>
        <p className="text-text-muted text-sm">Create cards from the Reader while studying, or use the form below.</p>
        <div className="mt-6">
          <NewCardForm />
        </div>
      </div>
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
        <div key={group} className="bg-surface rounded border border-border">
          <button
            onClick={() => setExpanded(expanded === group ? null : group)}
            className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-surface-2 transition-colors"
          >
            <span className="text-sm font-medium text-text">{group}</span>
            <span className="text-xs text-text-muted">{groupCards.length} cards</span>
          </button>
          {expanded === group && (
            <div className="border-t border-border">
              {groupCards.map((c) => (
                <div key={c.id} className="px-4 py-3 border-b border-border last:border-0">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-text font-medium">{c.question}</p>
                      <p className="text-xs text-text-muted mt-1">{c.answer}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className="text-xs px-1.5 py-0.5 bg-purple/20 text-purple rounded">B{c.bloom}</span>
                      <p className="text-xs text-text-muted mt-1">
                        {c.nextReview <= new Date().toISOString().split("T")[0] ? (
                          <span className="text-coral">Due</span>
                        ) : (
                          `Next: ${c.nextReview}`
                        )}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
      <NewCardForm />
    </div>
  );
}

export default function FlashcardsPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<"review" | "browse">("review");
  const {
    cards,
    currentIndex,
    showAnswer,
    loading,
    sessionComplete,
    dueCount,
    loadDueCards,
    loadDueCount,
    revealAnswer,
    rateCard,
    resetSession,
  } = useFlashcardStore();

  useEffect(() => {
    loadDueCards();
    loadDueCount();
    return () => resetSession();
  }, [loadDueCards, loadDueCount, resetSession]);

  // Browse tab
  if (tab === "browse") {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-4 px-6 py-3 border-b border-border shrink-0">
          <button onClick={() => setTab("review")} className="text-sm text-text-muted hover:text-text">Review{dueCount > 0 ? ` (${dueCount})` : ""}</button>
          <button className="text-sm text-purple font-medium border-b-2 border-purple pb-0.5">All Cards</button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <AllCardsView />
        </div>
      </div>
    );
  }

  if (loading && tab === "review") {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-text-muted">Loading flashcards...</p>
      </div>
    );
  }

  if (sessionComplete) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-4 px-6 py-3 border-b border-border shrink-0">
          <button className="text-sm text-purple font-medium border-b-2 border-purple pb-0.5">Review</button>
          <button onClick={() => setTab("browse")} className="text-sm text-text-muted hover:text-text">All Cards</button>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="max-w-md w-full px-8">
            <div className="text-center mb-8">
              <p className="text-teal text-lg font-medium mb-2">
                {cards.length > 0
                  ? `Review complete! ${cards.length} cards reviewed.`
                  : "No cards due for review."}
              </p>
              <p className="text-text-muted text-sm mb-4">
                {cards.length > 0
                  ? "Great work — your memory traces are stronger now."
                  : "Browse your cards or create new ones in the All Cards tab."}
              </p>
              <div className="flex gap-2 justify-center">
                <button
                  onClick={() => setTab("browse")}
                  className="px-4 py-2 text-sm text-purple border border-purple rounded hover:bg-purple/10"
                >
                  Browse All Cards
                </button>
                <button
                  onClick={() => navigate("/")}
                  className="px-4 py-2 text-sm text-text-muted border border-border rounded hover:text-text"
                >
                  Back to Home
                </button>
              </div>
            </div>
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
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/")}
            className="text-sm text-text-muted hover:text-text"
          >
            &larr; Back
          </button>
          <span className="text-sm font-medium">Flashcard Review</span>
        </div>
        <span className="text-xs text-text-muted">
          Card {currentIndex + 1} of {cards.length}
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-surface-2">
        <div
          className="h-full bg-purple transition-all duration-300"
          style={{
            width: `${((currentIndex + 1) / cards.length) * 100}%`,
          }}
        />
      </div>

      {/* Card */}
      <div className="flex-1 flex items-center justify-center overflow-y-auto">
        <div className="max-w-[600px] w-full mx-auto px-8">
          {/* Topic badge */}
          <div className="flex items-center gap-2 mb-6">
            <span className="text-xs px-2 py-1 bg-surface-2 text-text-muted rounded">
              {card.subject}
            </span>
            {card.topic && (
              <span className="text-xs px-2 py-1 bg-surface-2 text-text-muted rounded">
                {card.topic}
              </span>
            )}
            <span className="text-xs px-2 py-1 bg-purple/20 text-purple rounded">
              Bloom {card.bloom}
            </span>
          </div>

          {/* Question */}
          <div className="mb-8">
            <p className="text-lg leading-relaxed" style={{ fontFamily: "Georgia, serif" }}>
              {card.question}
            </p>
          </div>

          {/* Answer area */}
          {!showAnswer ? (
            <button
              onClick={revealAnswer}
              className="w-full py-3 bg-purple text-white rounded font-medium hover:opacity-90 transition-opacity"
            >
              Show Answer
            </button>
          ) : (
            <div>
              {/* Answer */}
              <div className="p-4 bg-surface rounded border border-border mb-6">
                <p
                  className="text-base leading-relaxed text-text"
                  style={{ fontFamily: "Georgia, serif" }}
                >
                  {card.answer}
                </p>
              </div>

              {/* Rating buttons */}
              <p className="text-xs text-text-muted mb-3 text-center">
                How well did you recall this?
              </p>
              <div className="grid grid-cols-4 gap-2">
                {RATING_BUTTONS.map((b, i) => (
                  <button
                    key={b.rating}
                    onClick={() => rateCard(b.rating)}
                    className={`${b.color} text-white py-3 rounded text-sm font-medium hover:opacity-90 transition-opacity`}
                  >
                    <div>{b.label}</div>
                    <div className="text-xs opacity-75 mt-1">
                      {intervals[i]}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
