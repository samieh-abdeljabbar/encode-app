import { invoke } from "@tauri-apps/api/core";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { Quiz } from "../pages/Quiz";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const invokeMock = vi.mocked(invoke);

describe("interactive quiz configuration", () => {
  it("submits the selected interactive question type and renders the matching input", async () => {
    invokeMock.mockImplementation(async (command: string, args?: unknown) => {
      if (command === "list_navigation_chapters") {
        return [
          {
            id: 9,
            subject_id: 1,
            title: "Chapter",
            slug: "chapter",
            status: "ready_for_quiz",
            estimated_minutes: null,
            created_at: "2026-01-01T00:00:00Z",
            section_count: 2,
            checked_count: 2,
            subject_name: "Subject",
          },
        ];
      }

      if (command === "generate_quiz") {
        expect(args).toMatchObject({
          chapterId: 9,
          questionType: "math_input",
        });

        return {
          id: 1,
          chapter_id: 9,
          chapter_title: "Chapter",
          questions: [
            {
              question_type: "math_input",
              prompt: "Evaluate the expression from Algebra.",
              options: null,
              correct_answer: "4",
              section_id: 1,
              section_heading: "Algebra",
              question_data: {
                grader: "numeric",
                prompt_latex: "2 + 2",
                accepted_answers: ["4"],
                tolerance: 0.0001,
              },
            },
          ],
          attempts: [{ question_index: 0, result: "unanswered" }],
          score: null,
        };
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

    fireEvent.click(screen.getByRole("button", { name: /math input/i }));
    fireEvent.click(screen.getByRole("button", { name: /generate quiz/i }));

    await waitFor(() => {
      expect(
        screen.getByPlaceholderText(/type the numeric result/i),
      ).toBeInTheDocument();
    });
  });
});
