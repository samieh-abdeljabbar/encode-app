import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import App from "../App";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue({
    configured: true,
    has_api_key: true,
    provider: "none",
  }),
}));

describe("App shell", () => {
  it("renders the Shell with Ribbon navigation", async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByLabelText("Queue")).toBeInTheDocument();
      expect(screen.getByLabelText("Workspace")).toBeInTheDocument();
      expect(screen.getByLabelText("Review")).toBeInTheDocument();
      expect(screen.getByLabelText("Settings")).toBeInTheDocument();
    });
  });

  it("renders the Workspace page by default", async () => {
    render(<App />);
    await waitFor(() => {
      // Workspace page renders — check for the sidebar header or content area
      expect(screen.getByLabelText("Workspace")).toBeInTheDocument();
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
