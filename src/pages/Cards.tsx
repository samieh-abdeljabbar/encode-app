import {
  ArrowRight,
  BookOpen,
  ChevronDown,
  Dumbbell,
  Layers,
  Plus,
  Search,
  Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { CardForm } from "../components/cards/CardForm";
import { CardRow } from "../components/cards/CardRow";
import { PracticeSetup } from "../components/cards/PracticeSetup";
import { CardStudyHelpDialog } from "../components/review/CardStudyHelpDialog";
import { ReviewCard } from "../components/review/ReviewCard";
import {
  getPracticeBucketCounts,
  getPracticeCards,
  listCards,
  listSubjects,
} from "../lib/tauri";
import type {
  CardInfo,
  DueCard,
  PracticeBucketCounts,
  Subject,
} from "../lib/tauri";

const PREVIEW_MODES = [
  { key: "new", label: "New", countKey: "new_cards" as const },
  { key: "struggling", label: "Struggling", countKey: "struggling" as const },
  { key: "building", label: "Building", countKey: "building" as const },
  { key: "all", label: "All", countKey: "all" as const },
];

export function Cards() {
  const [cards, setCards] = useState<CardInfo[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [practiceCards, setPracticeCards] = useState<DueCard[]>([]);
  const [previewCounts, setPreviewCounts] =
    useState<PracticeBucketCounts | null>(null);
  const [practiceIndex, setPracticeIndex] = useState(0);
  const [practiceRevealed, setPracticeRevealed] = useState(false);
  const [previewMode, setPreviewMode] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterSubjectId, setFilterSubjectId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [practiceSetupOpen, setPracticeSetupOpen] = useState(false);
  const [studyHelpCardId, setStudyHelpCardId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [practicePreviewError, setPracticePreviewError] = useState<
    string | null
  >(null);

  const loadCards = useCallback(async () => {
    setError(null);
    setPracticePreviewError(null);

    const [cardResult, practiceResult, countResult] = await Promise.allSettled([
      listCards(filterSubjectId ?? undefined, searchQuery.trim() || undefined),
      getPracticeCards(filterSubjectId ?? undefined, 6, previewMode),
      getPracticeBucketCounts(filterSubjectId ?? undefined),
    ]);

    if (cardResult.status === "fulfilled") {
      setCards(cardResult.value);
    } else {
      setCards([]);
      setError(String(cardResult.reason));
    }

    if (practiceResult.status === "fulfilled") {
      setPracticeCards(practiceResult.value);
      setPracticeIndex(0);
      setPracticeRevealed(false);
    } else {
      console.error("Failed to load practice preview", practiceResult.reason);
      setPracticeCards([]);
      setPracticePreviewError("Couldn't load the practice preview.");
    }

    if (countResult.status === "fulfilled") {
      setPreviewCounts(countResult.value);
    } else {
      console.error(
        "Failed to load practice bucket counts",
        countResult.reason,
      );
      setPreviewCounts(null);
      setPracticePreviewError("Couldn't load the practice preview.");
    }

    setLoading(false);
  }, [filterSubjectId, previewMode, searchQuery]);

  useEffect(() => {
    listSubjects()
      .then(setSubjects)
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    loadCards();
  }, [loadCards]);

  useEffect(() => {
    if (!previewCounts) return;

    const currentMode =
      PREVIEW_MODES.find((mode) => mode.key === previewMode) ??
      PREVIEW_MODES[3];
    if (previewCounts[currentMode.countKey] > 0) return;

    const firstAvailable = PREVIEW_MODES.find(
      (mode) => previewCounts[mode.countKey] > 0,
    );
    if (firstAvailable && firstAvailable.key !== previewMode) {
      setPreviewMode(firstAvailable.key);
    }
  }, [previewCounts, previewMode]);

  const handleCreated = () => {
    setShowForm(false);
    loadCards();
  };

  const activePracticeCard = practiceCards[practiceIndex] ?? null;
  const suspendedCount = cards.filter(
    (card) => card.status === "suspended",
  ).length;
  const readyCount = cards.filter((card) => card.status === "active").length;
  const activePreviewLabel =
    PREVIEW_MODES.find((mode) => mode.key === previewMode)?.label ?? "All";

  const cyclePracticeCard = (direction: 1 | -1) => {
    if (practiceCards.length === 0) return;
    setPracticeIndex((current) => {
      const next =
        (current + direction + practiceCards.length) % practiceCards.length;
      return next;
    });
    setPracticeRevealed(false);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 border-b border-border-subtle px-7 py-5">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10">
              <Layers size={15} className="text-accent" />
            </div>
            <h1 className="text-base font-semibold tracking-tight text-text">
              Cards
            </h1>
            {!loading && (
              <span className="rounded-md bg-panel-active px-2 py-0.5 text-[11px] font-medium text-text-muted">
                {cards.length}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPracticeSetupOpen(true)}
              className="flex h-10 items-center gap-1.5 rounded-xl border border-border px-4 text-xs font-medium text-text-muted transition-all hover:border-accent/30 hover:text-accent"
            >
              <Dumbbell size={13} />
              Practice
            </button>
            <button
              type="button"
              onClick={() => setShowForm((v) => !v)}
              className="flex h-10 items-center gap-1.5 rounded-xl bg-accent px-4 text-xs font-medium text-white shadow-sm transition-all hover:bg-accent/90 hover:shadow-md"
            >
              <Plus size={13} />
              Create Card
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="mx-auto max-w-6xl px-7 py-7">
          {showForm && (
            <div className="mb-6 max-w-3xl">
              <CardForm onCreated={handleCreated} />
            </div>
          )}

          <div className="mb-7 grid gap-6 xl:grid-cols-[1.25fr_0.95fr]">
            <div className="soft-panel rounded-[28px] border border-border-subtle/80 p-6">
              <div className="mb-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
                <div className="min-w-0">
                  <div className="section-kicker">Practice Preview</div>
                  <h2 className="serif-heading mt-2 text-2xl font-semibold text-text">
                    Flip through a few cards before you start.
                  </h2>
                  <p className="mt-2 max-w-xl text-sm leading-relaxed text-text-muted">
                    Preview the same practice lanes you can launch for a full
                    session, then start the one that fits how you want to study.
                  </p>
                </div>
                <label className="relative block min-w-0 lg:justify-self-end">
                  <select
                    aria-label="Practice preview subject"
                    value={filterSubjectId ?? ""}
                    onChange={(e) =>
                      setFilterSubjectId(
                        e.target.value === "" ? null : Number(e.target.value),
                      )
                    }
                    className="h-11 w-full max-w-full appearance-none rounded-full border border-border-subtle bg-panel px-4 pr-10 text-sm text-text focus:border-accent/40 focus:outline-none lg:w-80"
                  >
                    <option value="">All subjects</option>
                    {subjects.map((subject) => (
                      <option key={subject.id} value={subject.id}>
                        {subject.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    size={15}
                    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-muted/60"
                  />
                </label>
              </div>

              {previewCounts && (
                <div className="mb-5 flex flex-wrap gap-2">
                  {PREVIEW_MODES.map((mode) => {
                    const count = previewCounts[mode.countKey];
                    const isActive = previewMode === mode.key;
                    return (
                      <button
                        key={mode.key}
                        type="button"
                        onClick={() => setPreviewMode(mode.key)}
                        disabled={count === 0}
                        className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                          count === 0
                            ? "cursor-not-allowed border-border-subtle bg-panel-alt text-text-muted/45"
                            : isActive
                              ? "border-accent/20 bg-accent/8 text-accent"
                              : "border-border bg-panel text-text-muted hover:border-accent/20 hover:text-text"
                        }`}
                      >
                        {mode.label}
                        <span className="ml-1 text-[11px] opacity-75">
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {practicePreviewError ? (
                <div className="rounded-[24px] border border-coral/20 bg-coral/5 px-6 py-8 text-center">
                  <p className="text-sm font-medium text-coral">
                    {practicePreviewError}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setLoading(true);
                      loadCards();
                    }}
                    className="mt-3 rounded-xl border border-coral/20 px-4 py-2 text-xs font-medium text-coral transition-all hover:bg-coral/10"
                  >
                    Reload preview
                  </button>
                </div>
              ) : activePracticeCard ? (
                <>
                  <div className="mb-4 flex items-center justify-between text-xs text-text-muted">
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-accent/8 px-2.5 py-1 text-accent">
                        {activePreviewLabel} practice
                      </span>
                      <span className="rounded-full bg-panel-alt px-2.5 py-1">
                        {activePracticeCard.card_type}
                      </span>
                    </div>
                    <span>
                      {practiceIndex + 1} of {practiceCards.length}
                    </span>
                  </div>

                  <ReviewCard
                    prompt={activePracticeCard.prompt}
                    answer={activePracticeCard.answer}
                    revealed={practiceRevealed}
                    sourceType={activePracticeCard.source_type}
                    cardType={activePracticeCard.card_type}
                    onReveal={() => setPracticeRevealed(true)}
                    onStudyHelp={() =>
                      setStudyHelpCardId(activePracticeCard.id)
                    }
                  />

                  <div className="mt-5 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => cyclePracticeCard(1)}
                      className="rounded-2xl border border-border bg-panel px-4 py-2 text-sm font-medium text-text-muted transition-all hover:border-accent/30 hover:text-text"
                    >
                      Next preview
                    </button>
                    <button
                      type="button"
                      onClick={() => setPracticeSetupOpen(true)}
                      className="inline-flex items-center gap-2 rounded-2xl bg-accent px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-accent/90 hover:shadow-md"
                    >
                      Start full practice
                      <ArrowRight size={14} />
                    </button>
                  </div>
                </>
              ) : (
                <div className="rounded-[24px] border border-dashed border-border bg-panel-alt/70 px-6 py-10 text-center">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-accent/8">
                    <Sparkles size={18} className="text-accent/60" />
                  </div>
                  <p className="text-sm font-medium text-text">
                    No {activePreviewLabel.toLowerCase()} cards in this slice
                    yet
                  </p>
                  <p className="mt-1 text-xs text-text-muted/70">
                    Switch the preview lane or change subjects to warm up here.
                  </p>
                </div>
              )}
            </div>

            <div className="grid gap-4">
              <div className="soft-panel rounded-[28px] border border-border-subtle/80 p-6">
                <div className="section-kicker">Card Library</div>
                <h2 className="mt-2 text-lg font-semibold text-text">
                  Keep cards approachable, not hidden.
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-text-muted">
                  Use this space to inspect what exists, spot stale cards, and
                  hand-make the ones that matter.
                </p>
                <div className="mt-5 grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
                  <div className="rounded-2xl bg-panel-alt px-4 py-3">
                    <div className="text-[11px] uppercase tracking-[0.12em] text-text-muted">
                      Total cards
                    </div>
                    <div className="mt-1 text-2xl font-semibold text-text">
                      {cards.length}
                    </div>
                  </div>
                  <div className="rounded-2xl bg-panel-alt px-4 py-3">
                    <div className="text-[11px] uppercase tracking-[0.12em] text-text-muted">
                      Ready to study
                    </div>
                    <div className="mt-1 text-2xl font-semibold text-text">
                      {readyCount}
                    </div>
                  </div>
                  <div className="rounded-2xl bg-panel-alt px-4 py-3">
                    <div className="text-[11px] uppercase tracking-[0.12em] text-text-muted">
                      Paused
                    </div>
                    <div className="mt-1 text-2xl font-semibold text-text">
                      {suspendedCount}
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-[28px] border border-border-subtle bg-panel/70 p-5">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium text-text">
                  <BookOpen size={15} className="text-accent" />
                  Narrow the stack
                </div>

                <div className="flex flex-col gap-3">
                  <div className="relative">
                    <Search
                      size={14}
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted/40"
                    />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search prompt or answer..."
                      className="h-11 w-full rounded-2xl border border-border bg-panel px-4 pl-10 text-sm text-text placeholder:text-text-muted/50 focus:border-accent/40 focus:outline-none"
                    />
                  </div>

                  <select
                    value={filterSubjectId ?? ""}
                    onChange={(e) =>
                      setFilterSubjectId(
                        e.target.value === "" ? null : Number(e.target.value),
                      )
                    }
                    className="h-11 rounded-2xl border border-border bg-panel px-4 text-sm text-text focus:border-accent/40 focus:outline-none"
                  >
                    <option value="">All subjects</option>
                    {subjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {error && (
            <div className="mb-5 rounded-2xl border border-coral/20 bg-coral/5 px-4 py-3 text-sm text-coral">
              {error}
              <button
                type="button"
                onClick={() => setError(null)}
                className="ml-2 text-coral/50 hover:text-coral"
              >
                dismiss
              </button>
            </div>
          )}

          {loading && (
            <div className="flex justify-center py-16">
              <p className="text-sm text-text-muted">Loading...</p>
            </div>
          )}

          {!loading && cards.length > 0 && (
            <div className="flex flex-col gap-3">
              {cards.map((card) => (
                <CardRow key={card.id} card={card} onUpdated={loadCards} />
              ))}
            </div>
          )}

          {!loading && cards.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-[28px] border border-dashed border-border bg-panel/50 py-20 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-accent/6">
                <Layers size={20} className="text-accent/40" />
              </div>
              <p className="text-sm font-medium text-text-muted">
                {searchQuery.trim() || filterSubjectId
                  ? "No cards match your filters"
                  : "No cards yet"}
              </p>
              <p className="mt-1 text-xs text-text-muted/60">
                {searchQuery.trim() || filterSubjectId
                  ? "Try adjusting your search or subject filter"
                  : "Create a card to get started"}
              </p>
            </div>
          )}
        </div>
      </div>

      <PracticeSetup
        open={practiceSetupOpen}
        onClose={() => setPracticeSetupOpen(false)}
        subjects={subjects}
        initialSubjectId={filterSubjectId}
      />

      {studyHelpCardId != null ? (
        <CardStudyHelpDialog
          cardId={studyHelpCardId}
          onClose={() => setStudyHelpCardId(null)}
        />
      ) : null}
    </div>
  );
}
