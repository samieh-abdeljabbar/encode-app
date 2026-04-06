import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// Global mocks for Tauri updater plugins so tests that render Shell
// (which calls checkForUpdates on mount) don't hit real plugin calls.
vi.mock("@tauri-apps/plugin-updater", () => ({
  check: vi.fn().mockResolvedValue(null),
}));
vi.mock("@tauri-apps/plugin-process", () => ({
  relaunch: vi.fn().mockResolvedValue(undefined),
}));

// jsdom doesn't implement matchMedia — Shell uses it for sidebar auto-collapse.
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});
