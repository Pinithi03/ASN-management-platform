import { describe, expect, it } from "vitest";
import { barWidth, monthTrend, percentages } from "./OverviewWidgets";

describe("overview helpers", () => {
  it("legend percentages always add up to 100", () => {
    const cases = [
      [1, 15, 1],
      [1, 1, 1],
      [3, 0, 7, 2, 1],
      [16],
    ];
    for (const values of cases) {
      expect(percentages(values).reduce((a, b) => a + b, 0)).toBe(100);
    }
    expect(percentages([0, 0])).toEqual([0, 0]);
    expect(percentages([1, 0, 1])[1]).toBe(0); // an empty slice never gets a rounding point
  });

  it("a zero value draws no bar (no minimum stub)", () => {
    expect(barWidth(0, 500)).toBe(0);
    expect(barWidth(10, 0)).toBe(0);
    expect(barWidth(250, 500)).toBe(50);
    expect(barWidth(500, 500)).toBe(100);
  });

  it("month trend is null without last-month data", () => {
    expect(monthTrend(100, 0)).toBeNull();
    expect(monthTrend(150, 100)).toBe(50);
    expect(monthTrend(50, 100)).toBe(-50);
  });
});
