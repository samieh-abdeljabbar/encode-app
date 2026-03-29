import { Dumbbell, Layers, Plus, Search } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CardForm } from "../components/cards/CardForm";
import { CardRow } from "../components/cards/CardRow";
import { listCards, listSubjects } from "../lib/tauri";
import type { CardInfo, Subject } from "../lib/tauri";

export function Cards() {
  const navigate = useNavigate();
  const [cards, setCards] = useState<CardInfo[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterSubjectId, setFilterSubjectId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCards = useCallback(async () => {
    try {
      const data = await listCards(
        filterSubjectId ?? undefined,
        searchQuery.trim() || undefined,
      );
      setCards(data);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [filterSubjectId, searchQuery]);

  useEffect(() => {
    listSubjects()
      .then(setSubjects)
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    loadCards();
  }, [loadCards]);

  const handleCreated = () => {
    setShowForm(false);
    loadCards();
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Page header */}
      <div className="shrink-0 border-b border-border-subtle px-7 py-5">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
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
              onClick={() => navigate("/review?practice=all")}
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

      {/* Scrollable content */}
      <div className="flex-1 overflow-auto">
        <div className="mx-auto max-w-3xl px-7 py-7">
          {/* Create form */}
          {showForm && (
            <div className="mb-6">
              <CardForm onCreated={handleCreated} />
            </div>
          )}

          {/* Filters */}
          <div className="mb-5 flex gap-3">
            <div className="relative flex-1">
              <Search
                size={14}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted/40"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search prompt or answer..."
                className="h-11 w-full rounded-xl border border-border bg-panel px-4 pl-10 text-sm text-text placeholder:text-text-muted/50 focus:border-accent/40 focus:outline-none"
              />
            </div>

            <select
              value={filterSubjectId ?? ""}
              onChange={(e) =>
                setFilterSubjectId(
                  e.target.value === "" ? null : Number(e.target.value),
                )
              }
              className="h-11 rounded-xl border border-border bg-panel px-4 text-sm text-text focus:border-accent/40 focus:outline-none"
            >
              <option value="">All subjects</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-5 rounded-xl border border-coral/20 bg-coral/5 px-4 py-3 text-sm text-coral">
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

          {/* Loading */}
          {loading && (
            <div className="flex justify-center py-16">
              <p className="text-sm text-text-muted">Loading...</p>
            </div>
          )}

          {/* Card list */}
          {!loading && cards.length > 0 && (
            <div className="flex flex-col gap-2">
              {cards.map((card) => (
                <CardRow key={card.id} card={card} onUpdated={loadCards} />
              ))}
            </div>
          )}

          {/* Empty state */}
          {!loading && cards.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-panel/50 py-20 text-center">
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
    </div>
  );
}
