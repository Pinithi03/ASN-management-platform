import { describe, expect, it } from "vitest";
import { deliveryDateError, isPastLocalDate, parseLocalDate, todayLocalISO, toISODate } from "./dates";

describe("dates", () => {
  const now = new Date(2026, 10, 26, 0, 30); // 26 Nov 2026, 00:30 local

  it("formats today in local time", () => {
    expect(todayLocalISO(now)).toBe("2026-11-26");
  });

  it("parses the supported formats", () => {
    expect(toISODate("2026-11-26")).toBe("2026-11-26");
    expect(toISODate("26-11-2026")).toBe("2026-11-26");
    expect(toISODate("26/11/2026")).toBe("2026-11-26");
    expect(parseLocalDate("2026-02-30")).toBeNull();
    expect(parseLocalDate("nonsense")).toBeNull();
  });

  it("detects past dates against the local day", () => {
    expect(isPastLocalDate("2026-11-25", now)).toBe(true);
    expect(isPastLocalDate("2026-11-26", now)).toBe(false);
    expect(isPastLocalDate("2026-11-27", now)).toBe(false);
  });

  it("validates delivery dates", () => {
    expect(deliveryDateError("")).toBe("validation.required");
    expect(deliveryDateError("2020-01-01")).toBe("validation.deliveryDatePast");
    expect(deliveryDateError(todayLocalISO())).toBeNull();
  });
});
