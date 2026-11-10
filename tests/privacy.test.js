import { describe, it, expect, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  PRIVACY_KEY,
  resolvePrivacy,
  privacyLabel,
  applyPrivacy,
} from "../src/privacy.js";

// Privacy masking follows the asset / health apps' convention,
// which these tests pin down for this app: a local-storage
// preference (default off), data-private="on" on <html> while
// masking, the header toggle labelled by what a click does
// next, and suspension while a share link is being viewed.
describe("resolvePrivacy", () => {
  it("is on only for the stored value 'on'", () => {
    expect(resolvePrivacy("on")).toBe(true);
    expect(resolvePrivacy("off")).toBe(false);
    expect(resolvePrivacy(null)).toBe(false);
    expect(resolvePrivacy("")).toBe(false);
  });

  it("stores the preference under its own key", () => {
    expect(PRIVACY_KEY).toBe("social-private");
  });
});

describe("privacyLabel", () => {
  it("names what a click does next, like the health app", () => {
    expect(privacyLabel(false)).toBe("数値を隠す");
    expect(privacyLabel(true)).toBe("数値を表示");
  });
});

describe("applyPrivacy", () => {
  let root, button;
  beforeEach(() => {
    root = document.createElement("html");
    button = document.createElement("button");
  });

  it("on sets data-private and labels the button 数値を表示", () => {
    applyPrivacy(root, button, true);
    expect(root.getAttribute("data-private")).toBe("on");
    expect(button.textContent).toBe("数値を表示");
  });

  it("off removes data-private and labels the button 数値を隠す", () => {
    root.setAttribute("data-private", "on");
    applyPrivacy(root, button, false);
    expect(root.hasAttribute("data-private")).toBe(false);
    expect(button.textContent).toBe("数値を隠す");
  });

  it("suspended leaves the attribute off but keeps the preference's label", () => {
    applyPrivacy(root, button, true, true);
    expect(root.hasAttribute("data-private")).toBe(false);
    expect(button.textContent).toBe("数値を表示");
  });

  it("tolerates a missing button", () => {
    applyPrivacy(root, null, true);
    expect(root.getAttribute("data-private")).toBe("on");
  });
});

// Source guards for the wiring the module tests cannot see:
// the toggle lives in the header next to the theme button, the
// blog tab's static total boxes carry the masking class in the
// markup itself, main.js drives the module from local storage,
// and the stylesheet carries the shared masking rules.
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const mainJs = fs.readFileSync(path.join(root, "src", "main.js"), "utf8");
const css = fs.readFileSync(path.join(root, "src", "style.css"), "utf8");

describe("privacy wiring", () => {
  it("puts the privacy toggle in the header buttons, before the theme toggle", () => {
    const privacyAt = html.indexOf('id="privacy-toggle"');
    const themeAt = html.indexOf('id="theme-toggle"');
    expect(privacyAt).toBeGreaterThan(-1);
    expect(themeAt).toBeGreaterThan(privacyAt);
  });

  it("marks the blog tab's static total values as raw counts", () => {
    for (const id of [
      "total-views",
      "total-users",
      "total-sessions",
      "total-articles",
      "total-per-article",
    ]) {
      expect(html).toContain(`class="total-value amount-value" id="${id}"`);
    }
  });

  it("drives the module from the stored preference in main.js", () => {
    expect(mainJs).toContain('from "./privacy.js"');
    expect(mainJs).toContain("localStorage.getItem(PRIVACY_KEY)");
    expect(mainJs).toContain('getElementById("privacy-toggle")');
  });

  it("carries the shared masking rules in the stylesheet", () => {
    expect(css).toContain(':root[data-private="on"] .amount-value:not(.is-public)');
    expect(css).toContain(':root[data-private="on"] .privacy-mask:not(.is-public)');
    expect(css).toContain("filter: blur(5px)");
    expect(css).toContain(':root[data-private="on"] .chart-max-label');
  });
});
