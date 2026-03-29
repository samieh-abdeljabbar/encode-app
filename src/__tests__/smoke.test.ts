import { describe, expect, it } from "vitest";

describe("smoke", () => {
  it("vitest environment is functional", () => {
    expect(document).toBeDefined();
    expect(document.createElement("div")).toBeInstanceOf(HTMLDivElement);
  });
});
