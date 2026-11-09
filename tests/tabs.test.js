import { describe, expect, it } from "vitest";
import {
  TABS,
  DEFAULT_TAB,
  isTabId,
  tabFromHash,
  hashWithTab,
  hasTabPart,
  hashWithoutTab,
  tabFromPath,
  pathForTab,
} from "../src/tabs.js";
import { parseShareToken } from "../src/share.js";

describe("TABS", () => {
  it("lists the six tabs in display order", () => {
    expect(TABS).toEqual([
      { id: "overview", label: "概要" },
      { id: "instagram", label: "Instagram" },
      { id: "blog", label: "ブログ" },
      { id: "youtube", label: "YouTube" },
      { id: "threads", label: "Threads" },
      { id: "x", label: "X" },
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
    expect(tabFromHash("#tab=x")).toBe("x");
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

describe("hasTabPart", () => {
  it("detects a tab part in either position", () => {
    expect(hasTabPart("#tab=blog")).toBe(true);
    expect(hasTabPart("#share=tok&tab=blog")).toBe(true);
    expect(hasTabPart("#tab=blog&share=tok")).toBe(true);
  });

  it("leaves share-only and empty hashes alone", () => {
    expect(hasTabPart("#share=tok")).toBe(false);
    expect(hasTabPart("")).toBe(false);
    expect(hasTabPart("#")).toBe(false);
    expect(hasTabPart(null)).toBe(false);
    expect(hasTabPart(undefined)).toBe(false);
  });
});

describe("hashWithoutTab", () => {
  it("removes only the tab part, keeping the share token", () => {
    expect(hashWithoutTab("#share=tok&tab=blog")).toBe("#share=tok");
    expect(hashWithoutTab("#tab=blog&share=tok")).toBe("#share=tok");
    expect(hashWithoutTab("#share=tok")).toBe("#share=tok");
  });

  it("returns an empty string when nothing remains", () => {
    expect(hashWithoutTab("#tab=blog")).toBe("");
    expect(hashWithoutTab("")).toBe("");
    expect(hashWithoutTab("#")).toBe("");
    expect(hashWithoutTab(null)).toBe("");
  });

  it("keeps the share token parseable after the rewrite", () => {
    expect(parseShareToken(hashWithoutTab("#share=tok123&tab=x"))).toBe(
      "tok123",
    );
  });
});

describe("tabFromPath", () => {
  const PROD = "/social/";
  const STAGING = "/social/staging/";

  it("reads the tab segment under the production base", () => {
    expect(tabFromPath("/social/overview", PROD)).toBe("overview");
    expect(tabFromPath("/social/instagram", PROD)).toBe("instagram");
    expect(tabFromPath("/social/blog", PROD)).toBe("blog");
    expect(tabFromPath("/social/youtube", PROD)).toBe("youtube");
    expect(tabFromPath("/social/threads", PROD)).toBe("threads");
    expect(tabFromPath("/social/x", PROD)).toBe("x");
  });

  it("tolerates a trailing slash after the tab segment", () => {
    expect(tabFromPath("/social/blog/", PROD)).toBe("blog");
  });

  it("reads the tab segment under the staging base", () => {
    expect(tabFromPath("/social/staging/instagram", STAGING)).toBe(
      "instagram",
    );
    expect(tabFromPath("/social/staging/x", STAGING)).toBe("x");
  });

  it("returns null at the app root so the hash form can speak", () => {
    expect(tabFromPath("/social/", PROD)).toBe(null);
    expect(tabFromPath("/social", PROD)).toBe(null);
    expect(tabFromPath("/social/staging/", STAGING)).toBe(null);
    expect(tabFromPath("/social/staging", STAGING)).toBe(null);
  });

  it("names the default tab for an unknown segment", () => {
    expect(tabFromPath("/social/nope", PROD)).toBe("overview");
    expect(tabFromPath("/social/staging/nope", STAGING)).toBe("overview");
  });

  it("returns null outside the app base", () => {
    expect(tabFromPath("/asset/cash-flow", PROD)).toBe(null);
    expect(tabFromPath("", PROD)).toBe(null);
    expect(tabFromPath(null, PROD)).toBe(null);
  });
});

describe("pathForTab", () => {
  it("builds tab paths under the production base", () => {
    expect(pathForTab("/social/", "instagram")).toBe("/social/instagram");
    expect(pathForTab("/social/", "blog")).toBe("/social/blog");
    expect(pathForTab("/social/", "youtube")).toBe("/social/youtube");
    expect(pathForTab("/social/", "threads")).toBe("/social/threads");
    expect(pathForTab("/social/", "x")).toBe("/social/x");
  });

  it("maps the default tab to the app root itself", () => {
    expect(pathForTab("/social/", "overview")).toBe("/social/");
    expect(pathForTab("/social/staging/", "overview")).toBe(
      "/social/staging/",
    );
  });

  it("builds tab paths under the staging base", () => {
    expect(pathForTab("/social/staging/", "instagram")).toBe(
      "/social/staging/instagram",
    );
  });

  it("falls back to the default tab for an unknown id", () => {
    expect(pathForTab("/social/", "nope")).toBe("/social/");
  });

  it("round-trips through tabFromPath for every tab and base", () => {
    for (const base of ["/social/", "/social/staging/"]) {
      for (const tab of TABS) {
        const path = pathForTab(base, tab.id);
        // The default tab's path is the root, which tabFromPath
        // reports as "no tab in the path" — the caller then falls
        // back to the hash, whose absence also means the default.
        const expected = tab.id === DEFAULT_TAB ? null : tab.id;
        expect(tabFromPath(path, base)).toBe(expected);
      }
    }
  });
});
