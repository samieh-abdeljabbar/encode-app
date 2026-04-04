const RESTORABLE_PATHS = new Set([
  "/",
  "/workspace",
  "/chapter",
  "/reader",
  "/review",
  "/cards",
  "/quiz",
  "/quizzes",
  "/progress",
  "/settings",
  "/teachback",
  "/notes",
  "/graph",
  "/pathway",
]);

const PAGE_LABELS: Record<string, string> = {
  "/": "Queue",
  "/workspace": "Library",
  "/chapter": "Chapter",
  "/reader": "Reader",
  "/review": "Review",
  "/cards": "Cards",
  "/quiz": "Quiz",
  "/quizzes": "Quizzes",
  "/progress": "Progress",
  "/settings": "Settings",
  "/teachback": "Teachback",
  "/notes": "Library",
  "/graph": "Graph",
  "/pathway": "Pathway",
};

const PAGE_DESCRIPTIONS: Record<string, string> = {
  "/": "One place to decide what to do next.",
  "/workspace": "Browse subjects, chapters, imports, and notes.",
  "/chapter": "Edit and organize one chapter at a time.",
  "/reader": "Read in focused chunks and check understanding.",
  "/review": "Move quickly through repair and spaced repetition.",
  "/cards": "Inspect and manage the card set behind review.",
  "/quiz": "Answer one quiz at a time with clear feedback.",
  "/quizzes": "See quiz history and restart when you are ready.",
  "/progress": "A light overview of learning momentum and coverage.",
  "/settings": "Keep setup, export, and AI configuration in one place.",
  "/teachback": "Practice explaining material in your own words.",
  "/notes": "Browse subjects, chapters, imports, and notes.",
  "/graph": "Explore note relationships when you need context.",
  "/pathway": "Generate a guided learning path for a new topic.",
};

function routePath(route: string): string {
  return route.split("?")[0] || "/";
}

export function isRestorableRoute(route: string | null | undefined): boolean {
  if (!route) return false;
  return RESTORABLE_PATHS.has(routePath(route));
}

export function sanitizeRestorableRoute(
  route: string | null | undefined,
): string {
  return route && isRestorableRoute(route) ? route : "/";
}

export function getPageLabel(pathname: string): string {
  return PAGE_LABELS[pathname] ?? "";
}

export function getPageDescription(pathname: string): string {
  return PAGE_DESCRIPTIONS[pathname] ?? "";
}
