// SlashMenu.tsx
// The slash command menu is rendered entirely in the DOM by the
// SlashMenuPlugin class inside cm-slash.ts.  This file re-exports
// the public types for consumers that want to reference them.

export type { SlashCommand } from "./cm-slash";
export { SLASH_COMMANDS, slashCommands } from "./cm-slash";
