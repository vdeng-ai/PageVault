import { describe, expect, it } from "vitest";
import {
  LANGUAGE_STORAGE_KEY,
  parseLanguage,
  parseThemePreference,
  resolveTheme,
  THEME_STORAGE_KEY,
} from "./settings.js";

describe("settings helpers", () => {
  it("uses PageVault-scoped browser storage keys", () => {
    expect(LANGUAGE_STORAGE_KEY).toBe("pagevault.admin.language");
    expect(THEME_STORAGE_KEY).toBe("pagevault.admin.theme");
  });

  it("defaults to English for missing or invalid languages", () => {
    expect(parseLanguage(null)).toBe("en");
    expect(parseLanguage("fr")).toBe("en");
    expect(parseLanguage("en")).toBe("en");
    expect(parseLanguage("zh-CN")).toBe("zh-CN");
  });

  it("defaults to system for missing or invalid theme preferences", () => {
    expect(parseThemePreference(null)).toBe("system");
    expect(parseThemePreference("auto")).toBe("system");
    expect(parseThemePreference("light")).toBe("light");
    expect(parseThemePreference("dark")).toBe("dark");
  });

  it("resolves system, light, and dark theme preferences", () => {
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });
});
