import { invoke } from "@tauri-apps/api/core";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { Quiz } from "../pages/Quiz";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const invokeMock = vi.mocked(invoke);

describe("quiz question state", () => {
  it("resets the answer field when moving to the next question", async () => {
    invokeMock.mockImplementation(async (command: string) => {
      if (command === "list_navigation_chapters") {
        return [
          {
            id: 9,
            subject_id: 1,
            title: "Chapter",
            slug: "chapter",
            status: "reading",
            estimated_minutes: null,
            created_at: "2026-01-01T00:00:00Z",
            section_count: 2,
            checked_count: 0,
            subject_name: "Subject",
          },
        ];
      }

      if (command === "generate_quiz") {
        return {
          id: 1,
          chapter_id: 9,
          chapter_title: "Chapter",
          questions: [
            {
              question_type: "short_answer",
              prompt: "What is the first idea?",
              options: null,
              correct_answer: "First answer",
              section_id: 1,
              section_heading: "Section 1",
              question_data: null,
            },
            {
              question_type: "short_answer",
              prompt: "What is the second idea?",
              options: null,
              correct_answer: "Second answer",
              section_id: 2,
              section_heading: "Section 2",
              question_data: null,
            },
          ],
          attempts: [
            { question_index: 0, result: "unanswered" },
            { question_index: 1, result: "unanswered" },
          ],
          score: null,
        };
      }

      if (command === "submit_quiz_answer") {
        return {
          verdict: "correct",
          correct_answer: "First answer",
          explanation: null,
          repair_card_id: null,
          needs_self_rating: false,
        };
      }

      if (command === "complete_quiz") {
        return {
          score: 1,
          total: 2,
          correct: 2,
          partial: 0,
          incorrect: 0,
          repair_cards_created: 0,
          retest_scheduled: false,
        };
      }

      if (command === "get_quiz") {
        return null;
      }

      throw new Error(`Unexpected invoke command: ${command}`);
    });

    render(
      <MemoryRouter initialEntries={["/quiz?chapter=9"]}>
        <Routes>
          <Route path="/quiz" element={<Quiz />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /generate quiz/i }));

    await waitFor(() => {
      expect(screen.getByText("What is the first idea?")).toBeInTheDocument();
    });

    const firstAnswer = screen.getByPlaceholderText(
      "Type your answer...",
    ) as HTMLTextAreaElement;
    fireEvent.change(firstAnswer, { target: { value: "persisted answer" } });
    expect(firstAnswer.value).toBe("persisted answer");

    fireEvent.click(screen.getByRole("button", { name: /submit/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /next/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    await waitFor(() => {
      expect(screen.getByText("What is the second idea?")).toBeInTheDocument();
    });

    const secondAnswer = screen.getByPlaceholderText(
      "Type your answer...",
    ) as HTMLTextAreaElement;
    expect(secondAnswer.value).toBe("");
  });
});
