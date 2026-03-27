import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { aiRequestMock, writeFileMock } = vi.hoisted(() => ({
  aiRequestMock: vi.fn(),
  writeFileMock: vi.fn(),
}));

vi.mock("../../lib/tauri", () => ({
  aiRequest: aiRequestMock,
  writeFile: writeFileMock,
}));

import TeachBackPage from "../../pages/TeachBack";
import { useTeachBackStore } from "../../stores/teachback";

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/teach-back"]}>
      <Routes>
        <Route path="/teach-back" element={<TeachBackPage />} />
        <Route path="/vault" element={<div>Vault</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("teach-back persistence", () => {
  beforeEach(() => {
    aiRequestMock.mockReset();
    writeFileMock.mockReset();
    useTeachBackStore.getState().reset();
    useTeachBackStore.getState().startTeachBack("D426 Data Management", "Normalization");
  });

  it("keeps the explanation visible across remounts", () => {
    const firstRender = renderPage();
    const textarea = screen.getByPlaceholderText("Start explaining in your own words...") as HTMLTextAreaElement;

    fireEvent.change(textarea, { target: { value: "Normalization reduces duplicate data." } });
    expect(textarea.value).toBe("Normalization reduces duplicate data.");

    firstRender.unmount();
    renderPage();

    expect(
      (screen.getByPlaceholderText("Start explaining in your own words...") as HTMLTextAreaElement).value,
    ).toBe("Normalization reduces duplicate data.");
  });

  it("does not claim the explanation was saved when AI evaluation fails", async () => {
    aiRequestMock.mockRejectedValueOnce(new Error("offline"));

    await useTeachBackStore.getState().submitExplanation("My explanation");

    expect(useTeachBackStore.getState().evaluation).not.toContain("has been saved");
  });
});
