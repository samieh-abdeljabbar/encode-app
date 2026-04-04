import katex from "katex";
import type { QuizQuestion } from "../../lib/tauri";

function renderKatex(tex: string) {
  try {
    return katex.renderToString(tex, {
      throwOnError: false,
      displayMode: true,
    });
  } catch {
    return null;
  }
}

function parseStepAnswer(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item));
    }
  } catch {
    // ignore parse failures
  }

  if (value.includes("->")) {
    return value
      .split("->")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function QuizPromptSupplement({
  question,
}: {
  question: QuizQuestion;
}) {
  if (question.question_type === "math_input") {
    const tex =
      question.question_data && "grader" in question.question_data
        ? question.question_data.prompt_latex
        : null;
    if (!tex) return null;
    const rendered = renderKatex(tex);
    return rendered ? (
      <div
        className="mb-6 rounded-xl border border-border-subtle bg-surface px-4 py-3 text-text"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: KaTeX renders trusted generated/loaded quiz math
        dangerouslySetInnerHTML={{ __html: rendered }}
      />
    ) : null;
  }

  if (
    question.question_type === "code_output" &&
    question.question_data &&
    "snippet" in question.question_data
  ) {
    return (
      <pre className="mb-6 overflow-x-auto rounded-xl border border-border-subtle bg-surface px-4 py-3 text-xs leading-6 text-text">
        <code>{question.question_data.snippet}</code>
      </pre>
    );
  }

  return null;
}

export function QuizRichValue({
  question,
  value,
  muted = false,
}: {
  question: QuizQuestion;
  value: string;
  muted?: boolean;
}) {
  const textClassName = muted ? "text-text-muted" : "text-text";

  if (question.question_type === "math_input") {
    const rendered = renderKatex(value);
    if (rendered) {
      return (
        <div
          className={`rounded-lg bg-surface px-4 py-3 ${textClassName}`}
          // biome-ignore lint/security/noDangerouslySetInnerHtml: KaTeX renders trusted quiz answers
          dangerouslySetInnerHTML={{ __html: rendered }}
        />
      );
    }
  }

  if (
    (question.question_type === "code_output" ||
      question.question_type === "complete_snippet") &&
    question.question_data
  ) {
    const language =
      "language" in question.question_data
        ? question.question_data.language
        : "text";
    return (
      <pre
        className={`rounded-lg bg-surface px-4 py-3 text-xs leading-6 ${textClassName}`}
      >
        <code className={`language-${language}`}>{value}</code>
      </pre>
    );
  }

  if (question.question_type === "step_order") {
    const steps = parseStepAnswer(value);
    return (
      <ol
        className={`rounded-lg bg-surface px-6 py-3 text-xs leading-6 ${textClassName}`}
      >
        {steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
    );
  }

  return (
    <p
      className={`rounded-lg bg-surface p-3 text-xs leading-relaxed ${textClassName}`}
    >
      {value}
    </p>
  );
}
