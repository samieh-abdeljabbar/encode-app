import type {
  CompletionContext,
  CompletionResult,
} from "@codemirror/autocomplete";
import { autocompletion } from "@codemirror/autocomplete";
import type { Extension } from "@codemirror/state";

type TitleFetcher = () => Promise<[number, string][]>;

function wikilinkCompletion(fetchTitles: TitleFetcher) {
  let cachedTitles: [number, string][] | null = null;

  return async (
    context: CompletionContext,
  ): Promise<CompletionResult | null> => {
    // Check if we're inside [[ ]]
    const before = context.matchBefore(/\[\[([^\]]*)/);
    if (!before) return null;

    const query = before.text.slice(2); // remove [[

    if (!cachedTitles) {
      cachedTitles = await fetchTitles();
      // Clear cache after 10s so new notes show up
      setTimeout(() => {
        cachedTitles = null;
      }, 10000);
    }

    const filtered = cachedTitles.filter(([, title]) =>
      title.toLowerCase().includes(query.toLowerCase()),
    );

    return {
      from: before.from + 2, // after [[
      options: filtered.map(([, title]) => ({
        label: title,
        apply: `${title}]]`,
      })),
    };
  };
}

export function wikilinkExtension(fetchTitles: TitleFetcher): Extension {
  return autocompletion({
    override: [wikilinkCompletion(fetchTitles)],
    activateOnTyping: true,
  });
}
