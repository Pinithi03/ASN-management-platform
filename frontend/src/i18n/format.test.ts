import { afterAll, describe, expect, it } from "vitest";
import i18n from "./index";
import { formatDate, formatNumber } from "./format";

const date = new Date(2026, 10, 4, 14, 5, 9); // 4 Nov 2026, 14:05:09

describe("format helpers", () => {
  afterAll(() => i18n.changeLanguage("en"));

  it("keeps the existing English formats", async () => {
    await i18n.changeLanguage("en");
    expect(formatDate(date)).toBe("Nov 4, 2026");
    expect(formatDate(date, "numeric")).toBe("04/11/2026");
    expect(formatDate(date, "shortDateTime")).toBe("Nov 4, 14:05");
    expect(formatNumber(1234.5)).toBe("1,234.5");
  });

  it("formats Italian dates and numbers", async () => {
    await i18n.changeLanguage("it");
    expect(formatDate(date, "numeric")).toBe("04/11/2026");
    expect(formatNumber(1234.5)).toBe("1.234,5");
  });

  it("formats Chinese dates and numbers", async () => {
    await i18n.changeLanguage("zh-CN");
    expect(formatDate(date, "numeric")).toBe("2026/11/04");
    expect(formatNumber(1234.5)).toBe("1,234.5");
  });

  it("returns an empty string for missing values", () => {
    expect(formatDate(null)).toBe("");
    expect(formatNumber(undefined)).toBe("");
  });
});
