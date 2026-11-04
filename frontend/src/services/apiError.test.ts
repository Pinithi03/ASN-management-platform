import { afterAll, describe, expect, it } from "vitest";
import i18n from "@/i18n";
import { getErrorMessage } from "./apiError";

const axiosError = (data: unknown, message = "Request failed with status code 422") => ({
  message,
  response: { data },
});

describe("getErrorMessage", () => {
  afterAll(() => i18n.changeLanguage("en"));

  it("translates a known error code with its params", async () => {
    await i18n.changeLanguage("it");
    const err = axiosError({ detail: "Carton 2: bad", code: "CARTON_QTY_INVALID", params: { carton: 2 } });
    expect(getErrorMessage(err)).toBe("Cartone 2: la quantità deve essere maggiore di 0.");
  });

  it("falls back to the server detail for unknown codes or plain errors", async () => {
    await i18n.changeLanguage("en");
    expect(getErrorMessage(axiosError({ detail: "Legacy message", code: "UNKNOWN_CODE" }))).toBe("Legacy message");
    expect(getErrorMessage(axiosError({ detail: { message: "Object message", errors: [] } }))).toBe("Object message");
  });

  it("falls back to the JS error message, then the given fallback", () => {
    expect(getErrorMessage(new Error("Network Error"), "fallback")).toBe("Network Error");
    expect(getErrorMessage({}, "fallback")).toBe("fallback");
  });
});
