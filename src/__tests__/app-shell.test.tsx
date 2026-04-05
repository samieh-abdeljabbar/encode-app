import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";

const { invokeMock, mockState } = vi.hoisted(() => ({
  mockState: {
    lastSurface: "/",
  },
  invokeMock: vi.fn(async (command: string) => {
    if (command === "get_config") {
      return {
        ai: {
          provider: "none",
          ollama_model: "llama3.1:8b",
          ollama_url: "http://localhost:11434",
          claude_api_key: "",
          gemini_api_key: "",
          openai_api_key: "",
          deepseek_api_key: "",
          claude_model: "",
          gemini_model: "",
          openai_model: "",
          deepseek_model: "",
          cli_command: "",
          cli_args: [],
        },
        profile: {
          role: "",
          domain: "",
          learning_context: "",
        },
        onboarding_completed: true,
      };
    }

    if (command === "check_ai_status") {
      return {
        configured: true,
        has_api_key: true,
        provider: "none",
      };
    }

    if (command === "get_last_surface") {
      return mockState.lastSurface;
    }

    if (command === "get_queue_dashboard") {
      return {
        summary: {
          total_items: 0,
          due_cards: 0,
          new_chapters: 0,
          sections_studied_today: 0,
        },
        items: [],
      };
    }

    if (command === "get_export_status") {
      return {
        last_export_at: null,
        last_snapshot_at: null,
        export_dirty: false,
        snapshot_dirty: false,
        next_export_due_at: null,
        next_snapshot_due_at: null,
      };
    }

    if (command === "list_snapshots_cmd") {
      return [];
    }

    return null;
  }),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

describe("App shell", () => {
  beforeEach(() => {
    mockState.lastSurface = "/";
    invokeMock.mockClear();
  });

  it("renders the Shell with Ribbon navigation", async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByLabelText("Queue")).toBeInTheDocument();
      expect(screen.getByLabelText("Library")).toBeInTheDocument();
      expect(screen.getByLabelText("Reader")).toBeInTheDocument();
      expect(screen.getByLabelText("Review")).toBeInTheDocument();
      expect(screen.getByLabelText("Settings")).toBeInTheDocument();
    });
  });

  it("renders the Queue page by default", async () => {
    render(<App />);
    await waitFor(() => {
      expect(
        screen.getByRole("heading", {
          name: "Your next step is already lined up.",
        }),
      ).toBeInTheDocument();
    });
  });

  it("restores the last saved surface on startup", async () => {
    mockState.lastSurface = "/settings";
    render(<App />);
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Settings" }),
      ).toBeInTheDocument();
    });
  });

  it("mounts with a main content area and drag region", async () => {
    const { container } = render(<App />);
    await waitFor(() => {
      expect(container.querySelector("main")).toBeInTheDocument();
      expect(
        container.querySelector("[data-tauri-drag-region]"),
      ).toBeInTheDocument();
    });
  });
});
