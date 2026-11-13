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

  it("masks the blog tab's static total values (unpublished figures)", () => {
    // The blog tab's numbers are GA rollups over the last 28
    // days that no public page prints, so its static total
    // boxes carry only the masking classes — no .is-public.
    for (const id of [
      "total-views",
      "total-users",
      "total-sessions",
      "total-articles",
      "total-per-article",
    ]) {
      expect(html).toContain(
        `class="total-value amount-value" id="${id}"`,
      );
      expect(html).not.toContain(
        `class="total-value amount-value is-public" id="${id}"`,
      );
    }
  });

  it("wires the published-figure exemptions into the renderers", () => {
    // Channel treemap tiles and legend values are the top
    // page's published follower counts — except the blog's
    // tile and legend row, whose 28-day user count is not
    // published anywhere and masks.
    expect(mainJs).toContain('"treemap-tile-value amount-value"');
    expect(mainJs).toContain('tile.id !== "blog" ? " is-public" : ""');
    expect(mainJs).toContain('entry.id !== "blog" ? " is-public" : ""');
    // The blog tab's figures (per-article counts, genre table,
    // rankings, daily chart) carry no exemption any more.
    expect(mainJs).toContain('viewsTd.className = "num amount-value"');
    expect(mainJs).toContain('td.className = "num amount-value"');
    expect(mainJs).not.toContain('"num amount-value is-public"');
    expect(mainJs).not.toContain("publicMaxLabel");
    // Only the combined follower trend's latest value is
    // exempt among the overview trends.
    expect(mainJs).toContain(
      'countSpan(item.latest, item.key === "total_followers")',
    );
  });

  it("drives the module from the stored preference in main.js", () => {
    expect(mainJs).toContain('from "./privacy.js"');
    expect(mainJs).toContain("localStorage.getItem(PRIVACY_KEY)");
    expect(mainJs).toContain('getElementById("privacy-toggle")');
  });

  it("hides the toggle in share sessions — and the stylesheet honours it", () => {
    // main.js hides the toggle whenever a share token is in
    // play (masking is suspended there, so the toggle must not
    // be offered) — and also until the session kind settles, so
    // the button never flashes during loading only to vanish
    // once a share session is confirmed.
    expect(mainJs).toContain(
      "privacyBtn.hidden = !sessionSettled || Boolean(shareToken)",
    );
    expect(mainJs).toContain("sessionSettled = true");
    // The markup starts the toggle hidden for the same reason:
    // nothing may show it before the script settles the entry.
    expect(html).toContain('id="privacy-toggle" class="theme-toggle"');
    expect(html).toContain('type="button" hidden>数値を隠す</button>');
    expect(css).toMatch(/\.theme-toggle \{[^}]*display: inline-flex/);
    // The stylesheet therefore restores the attribute's force
    // with an !important rule no class display can override.
    expect(css).toMatch(/\[hidden\] \{\s*display: none !important;/);
  });

  it("applies the masking rules to real element structures (computed styles)", () => {
    // The jsdom environment resolves the real stylesheet
    // against elements built with the same classes the markup
    // and renderers use, so the selector chain is exercised
    // end to end: data-private on <html> blurs a raw count,
    // spares an .is-public one, and a hidden header toggle
    // (share sessions) computes to display:none while its
    // visible state stays inline-flex.
    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
    try {
      document.documentElement.setAttribute("data-private", "on");
      const raw = document.createElement("span");
      raw.className = "amount-value";
      document.body.appendChild(raw);
      expect(window.getComputedStyle(raw).filter).toContain("blur(5px)");
      const pub = document.createElement("div");
      pub.className = "total-value amount-value is-public";
      document.body.appendChild(pub);
      expect(window.getComputedStyle(pub).filter).not.toContain("blur");
      const btn = document.createElement("button");
      btn.className = "theme-toggle";
      document.body.appendChild(btn);
      btn.hidden = true;
      expect(window.getComputedStyle(btn).display).toBe("none");
      btn.hidden = false;
      expect(window.getComputedStyle(btn).display).toBe("inline-flex");
      raw.remove();
      pub.remove();
      btn.remove();
    } finally {
      style.remove();
      document.documentElement.removeAttribute("data-private");
    }
  });

  it("carries the shared masking rules in the stylesheet", () => {
    expect(css).toContain(':root[data-private="on"] .amount-value:not(.is-public)');
    expect(css).toContain(':root[data-private="on"] .privacy-mask:not(.is-public)');
    expect(css).toContain("filter: blur(5px)");
    // The in-chart max label stays hidden while masking (no
    // chart marks its label .is-public any more; the selector
    // keeps the :not() guard the other rules use).
    expect(css).toContain(
      ':root[data-private="on"] .chart-max-label:not(.is-public)',
    );
    // The trend chart's y tick labels are raw counts too, so
    // they hide under the same masking rule.
    expect(css).toContain(
      ':root[data-private="on"] .chart-y-label:not(.is-public)',
    );
  });
});
