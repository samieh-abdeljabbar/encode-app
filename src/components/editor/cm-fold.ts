import { foldService, syntaxTree } from "@codemirror/language";

/**
 * Fold service for markdown headings.
 * Folds from a heading to the next heading of equal or higher level.
 */
export const markdownFoldService = foldService.of((state, lineStart) => {
  const tree = syntaxTree(state);
  let headingLevel = 0;
  let headingEnd = 0;

  // Check if this line starts a heading
  tree.iterate({
    from: lineStart,
    to: state.doc.lineAt(lineStart).to,
    enter(node) {
      if (node.name.startsWith("ATXHeading") && node.from === lineStart) {
        headingLevel = Number.parseInt(node.name.replace("ATXHeading", ""), 10);
        headingEnd = node.to;
      }
    },
  });

  if (headingLevel === 0) return null;

  // Find the next heading of equal or higher level
  let foldEnd = state.doc.length;
  const startLine = state.doc.lineAt(lineStart).number;

  tree.iterate({
    from: headingEnd,
    enter(node) {
      if (node.name.startsWith("ATXHeading")) {
        const level = Number.parseInt(node.name.replace("ATXHeading", ""), 10);
        if (level <= headingLevel) {
          // Found a heading of equal or higher level
          const prevLine = state.doc.lineAt(node.from);
          if (prevLine.number > startLine) {
            foldEnd = prevLine.from > 0 ? prevLine.from - 1 : prevLine.from;
            return false; // stop iteration
          }
        }
      }
    },
  });

  if (foldEnd <= headingEnd) return null;

  return { from: headingEnd, to: foldEnd };
});
