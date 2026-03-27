import { describe, expect, it } from "vitest";
import { localDateString, localDateTimeString } from "../../lib/dates";

describe("localDateString", () => {
  it("formats a date as YYYY-MM-DD using local calendar values", () => {
    const date = new Date(2026, 2, 27, 23, 59, 58);
    expect(localDateString(date)).toBe("2026-03-27");
  });
});

describe("localDateTimeString", () => {
  it("formats a date-time as YYYY-MM-DDTHH:mm:ss using local clock values", () => {
    const date = new Date(2026, 2, 27, 6, 7, 8);
    expect(localDateTimeString(date)).toBe("2026-03-27T06:07:08");
  });
});
