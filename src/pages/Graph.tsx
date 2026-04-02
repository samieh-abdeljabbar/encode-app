import { Network } from "lucide-react";

export function Graph() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4">
      <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-accent/6">
        <Network size={24} className="text-accent/40" />
      </div>
      <h2 className="text-lg font-semibold text-text">Graph View</h2>
      <p className="text-sm text-text-muted">
        Knowledge graph visualization coming soon.
      </p>
    </div>
  );
}
