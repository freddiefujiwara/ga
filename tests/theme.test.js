import { describe, it, expect, beforeEach } from "vitest";
import { THEME_KEY, resolveTheme, nextTheme, applyTheme } from "../src/theme.js";

describe("resolveTheme", () => {
  it("returns light only for the stored value 'light'", () => {
    expect(resolveTheme("light")).toBe("light");
    expect(resolveTheme("dark")).toBe("dark");
    expect(resolveTheme(null)).toBe("dark");
  });

  it("uses the same storage key as the current page", () => {
    expect(THEME_KEY).toBe("ga-theme");
  });
});

describe("nextTheme", () => {
  it("toggles both ways", () => {
    expect(nextTheme("light")).toBe("dark");
    expect(nextTheme("dark")).toBe("light");
  });
});

describe("applyTheme", () => {
  let root, button;
  beforeEach(() => {
    root = document.createElement("html");
    button = document.createElement("button");
  });

  it("light sets data-theme and labels the button ダーク", () => {
    applyTheme(root, button, "light");
    expect(root.getAttribute("data-theme")).toBe("light");
    expect(button.textContent).toBe("ダーク");
  });

  it("dark removes data-theme and labels the button ライト", () => {
    root.setAttribute("data-theme", "light");
    applyTheme(root, button, "dark");
    expect(root.hasAttribute("data-theme")).toBe(false);
    expect(button.textContent).toBe("ライト");
  });
});
