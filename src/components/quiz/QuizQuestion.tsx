import type { QuizQuestion as QuizQuestionType } from "../../lib/tauri";
import { CodeOutputInput } from "./CodeOutputInput";
import { CodeSnippetInput } from "./CodeSnippetInput";
import { FillBlankInput } from "./FillBlankInput";
import { MathInput } from "./MathInput";
import { MultipleChoiceInput } from "./MultipleChoiceInput";
import { QuizPromptSupplement } from "./QuizRichValue";
import { ShortAnswerInput } from "./ShortAnswerInput";
import { StepOrderInput } from "./StepOrderInput";
import { TrueFalseInput } from "./TrueFalseInput";

function typeLabel(t: string): string {
  switch (t) {
    case "short_answer":
      return "Short Answer";
    case "multiple_choice":
      return "Multiple Choice";
    case "true_false":
      return "True or False";
    case "fill_blank":
      return "Fill in the Blank";
    case "math_input":
      return "Math Input";
    case "step_order":
      return "Step Order";
    case "code_output":
      return "Code Output";
    case "complete_snippet":
      return "Complete Snippet";
    default:
      return t;
  }
}

export function QuizQuestion({
  question,
  onSubmit,
  disabled,
}: {
  question: QuizQuestionType;
  onSubmit: (answer: string) => void;
  disabled: boolean;
}) {
  return (
    <div>
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-accent">
        {typeLabel(question.question_type)}
      </p>
      {question.section_heading && (
        <p className="mb-2 text-[11px] text-text-muted">
          From: {question.section_heading}
        </p>
      )}
      <p className="mb-6 text-[15px] leading-relaxed text-text">
        {question.prompt}
      </p>
      <QuizPromptSupplement question={question} />

      {question.question_type === "multiple_choice" && question.options && (
        <MultipleChoiceInput
          options={question.options}
          onSubmit={onSubmit}
          disabled={disabled}
        />
      )}
      {question.question_type === "true_false" && (
        <TrueFalseInput onSubmit={onSubmit} disabled={disabled} />
      )}
      {question.question_type === "fill_blank" && (
        <FillBlankInput
          prompt={question.prompt}
          onSubmit={onSubmit}
          disabled={disabled}
        />
      )}
      {question.question_type === "short_answer" && (
        <ShortAnswerInput onSubmit={onSubmit} disabled={disabled} />
      )}
      {question.question_type === "math_input" &&
        question.question_data &&
        "grader" in question.question_data && (
          <MathInput
            questionData={question.question_data}
            onSubmit={onSubmit}
            disabled={disabled}
          />
        )}
      {question.question_type === "step_order" &&
        question.question_data &&
        "correct_order" in question.question_data && (
          <StepOrderInput
            questionData={question.question_data}
            onSubmit={onSubmit}
            disabled={disabled}
          />
        )}
      {question.question_type === "code_output" && (
        <CodeOutputInput onSubmit={onSubmit} disabled={disabled} />
      )}
      {question.question_type === "complete_snippet" &&
        question.question_data &&
        "starter_code" in question.question_data && (
          <CodeSnippetInput
            questionData={question.question_data}
            onSubmit={onSubmit}
            disabled={disabled}
          />
        )}
    </div>
  );
}
