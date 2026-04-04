import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { QuizComplete } from "../components/quiz/QuizComplete";
import { ReviewCard } from "../components/review/ReviewCard";

describe("study help ui", () => {
  it("shows the review card study-help action only after reveal", () => {
    const { rerender } = render(
      <ReviewCard
        prompt="What is ATP?"
        answer="Energy currency"
        revealed={false}
        sourceType="repair"
        onReveal={() => {}}
        onStudyHelp={() => {}}
      />,
    );

    expect(
      screen.queryByRole("button", { name: /help me remember this/i }),
    ).not.toBeInTheDocument();

    rerender(
      <ReviewCard
        prompt="What is ATP?"
        answer="Energy currency"
        revealed
        sourceType="repair"
        onReveal={() => {}}
        onStudyHelp={() => {}}
      />,
    );

    expect(
      screen.getByRole("button", { name: /help me remember this/i }),
    ).toBeInTheDocument();
  });

  it("shows the quiz study-help CTA only when there are incorrect answers", () => {
    const { rerender } = render(
      <MemoryRouter>
        <QuizComplete
          summary={{
            score: 1,
            total: 4,
            correct: 4,
            partial: 0,
            incorrect: 0,
            repair_cards_created: 0,
            retest_scheduled: false,
          }}
          chapterTitle="Biology"
          onCreateStudyHelp={() => {}}
        />
      </MemoryRouter>,
    );

    expect(
      screen.queryByRole("button", {
        name: /create study help note for misses/i,
      }),
    ).not.toBeInTheDocument();

    rerender(
      <MemoryRouter>
        <QuizComplete
          summary={{
            score: 0.5,
            total: 4,
            correct: 2,
            partial: 0,
            incorrect: 2,
            repair_cards_created: 2,
            retest_scheduled: true,
          }}
          chapterTitle="Biology"
          onCreateStudyHelp={() => {}}
        />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("button", {
        name: /create study help note for misses/i,
      }),
    ).toBeInTheDocument();
  });
});
