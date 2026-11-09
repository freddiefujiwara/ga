import { describe, expect, it } from "vitest";
import {
  TABS,
  DEFAULT_TAB,
  isTabId,
  tabFromHash,
  hashWithTab,
} from "../src/tabs.js";
import { parseShareToken } from "../src/share.js";

describe("TABS", () => {
  it("lists the five tabs in display order", () => {
    expect(TABS).toEqual([
      { id: "overview", label: "概要" },
      { id: "instagram", label: "Instagram" },
      { id: "blog", label: "ブログ" },
      { id: "youtube", label: "YouTube" },
      { id: "threads", label: "Threads" },
    ]);
    expect(DEFAULT_TAB).toBe("overview");
    expect(TABS.every((tab) => isTabId(tab.id))).toBe(true);
    expect(isTabId("nope")).toBe(false);
    expect(isTabId("")).toBe(false);
  });
});

describe("tabFromHash", () => {
  it("reads the tab part of the hash", () => {
    expect(tabFromHash("#tab=overview")).toBe("overview");
    expect(tabFromHash("#tab=instagram")).toBe("instagram");
    expect(tabFromHash("#tab=blog")).toBe("blog");
    expect(tabFromHash("#tab=youtube")).toBe("youtube");
    expect(tabFromHash("#tab=threads")).toBe("threads");
  });

  it("coexists with the share token part, in either order", () => {
    expect(tabFromHash("#share=tok&tab=blog")).toBe("blog");
    expect(tabFromHash("#tab=youtube&share=tok")).toBe("youtube");
    expect(tabFromHash("#share=tok")).toBe("overview");
  });

  it("falls back to the default tab for anything else", () => {
    expect(tabFromHash("")).toBe("overview");
    expect(tabFromHash("#")).toBe("overview");
    expect(tabFromHash(null)).toBe("overview");
    expect(tabFromHash(undefined)).toBe("overview");
    expect(tabFromHash("#tab=nope")).toBe("overview");
    expect(tabFromHash("#tab=")).toBe("overview");
    expect(tabFromHash("#instagram")).toBe("overview");
  });
});

describe("hashWithTab", () => {
  it("sets the tab on an empty hash", () => {
    expect(hashWithTab("", "blog")).toBe("#tab=blog");
    expect(hashWithTab("#", "blog")).toBe("#tab=blog");
  });

  it("keeps the share token intact", () => {
    expect(hashWithTab("#share=tok", "instagram")).toBe(
      "#share=tok&tab=instagram",
    );
  });

  it("replaces an existing tab part instead of duplicating it", () => {
    expect(hashWithTab("#share=tok&tab=blog", "youtube")).toBe(
      "#share=tok&tab=youtube",
    );
    expect(hashWithTab("#tab=blog", "overview")).toBe("#tab=overview");
  });

  it("falls back to the default tab for an unknown id", () => {
    expect(hashWithTab("#share=tok", "nope")).toBe("#share=tok&tab=overview");
  });

  it("round-trips through tabFromHash and parseShareToken", () => {
    for (const tab of TABS) {
      const hash = hashWithTab("#share=tok123", tab.id);
      expect(tabFromHash(hash)).toBe(tab.id);
      // The share session survives tab switches untouched.
      expect(parseShareToken(hash)).toBe("tok123");
    }
    expect(parseShareToken(hashWithTab("", "blog"))).toBe("");
  });
});
