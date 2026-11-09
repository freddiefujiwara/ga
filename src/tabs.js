// Tab navigation for the dashboard. The selected tab travels in
// the URL path ("/social/instagram"), so a reload (or a reopened
// link) restores the same tab. Deep links work through the
// spa-github-pages pattern /asset uses: public/404.html rewrites
// the path to the app root with a "?/…" query, and an inline
// script in index.html restores the original path before this
// code runs.
//
// Links issued before the path form carried the tab in the URL
// hash as a "tab=" part, alongside the share token's "share="
// part. That form stays readable (tabFromHash below) so old links
// keep opening the tab they name; the tab is then rewritten into
// the path. parseShareToken in share.js reads only the share
// part, so neither form disturbs share sessions.

export const TABS = [
  { id: "overview", label: "概要" },
  { id: "instagram", label: "Instagram" },
  { id: "blog", label: "ブログ" },
  { id: "youtube", label: "YouTube" },
  { id: "threads", label: "Threads" },
  { id: "x", label: "X" },
];

export const DEFAULT_TAB = "overview";

export function isTabId(value) {
  return TABS.some((tab) => tab.id === value);
}

// The tab named by a location hash ("#share=…&tab=blog" -> "blog").
// Anything missing or unknown falls back to the default tab.
export function tabFromHash(hash) {
  if (!hash) {
    return DEFAULT_TAB;
  }
  const fragment = hash.startsWith("#") ? hash.slice(1) : hash;
  for (const part of fragment.split("&")) {
    const eq = part.indexOf("=");
    if (eq > 0 && part.slice(0, eq) === "tab") {
      const value = part.slice(eq + 1);
      return isTabId(value) ? value : DEFAULT_TAB;
    }
  }
  return DEFAULT_TAB;
}

// Whether a location hash carries a "tab=" part at all. The hash
// change listener uses this to react only to legacy tab links;
// hash changes that concern the share token alone leave the
// selected tab (which now lives in the path) untouched.
export function hasTabPart(hash) {
  if (!hash) {
    return false;
  }
  const fragment = hash.startsWith("#") ? hash.slice(1) : hash;
  return fragment.split("&").some((part) => part.startsWith("tab="));
}

// A new hash with the tab part removed, keeping every other
// part — notably the share token — intact. Returns "" when
// nothing remains, so the rewritten URL has no dangling "#".
export function hashWithoutTab(hash) {
  if (!hash) {
    return "";
  }
  const fragment = hash.startsWith("#") ? hash.slice(1) : hash;
  const parts = fragment
    .split("&")
    .filter((part) => part && !part.startsWith("tab="));
  return parts.length ? `#${parts.join("&")}` : "";
}

// The app base ("/social/" in production, "/social/staging/" in
// the staging build) with exactly one trailing slash, so path
// arithmetic below never depends on how the build spelled it.
function normalizeBase(base) {
  if (!base) {
    return "/";
  }
  return base.endsWith("/") ? base : `${base}/`;
}

// The tab named by a location pathname under the app base
// ("/social/instagram" with base "/social/" -> "instagram").
// Returns null when the pathname is the app root itself, so the
// caller can fall back to the legacy hash form. A path segment
// that is present but unknown names the default tab instead of
// falling through: the path is the canonical address, so an
// unknown segment is a (mistyped) address for the default view,
// not an absence of tab information.
export function tabFromPath(pathname, base) {
  if (!pathname) {
    return null;
  }
  const root = normalizeBase(base);
  if (pathname === root || pathname === root.slice(0, -1)) {
    return null;
  }
  if (!pathname.startsWith(root)) {
    return null;
  }
  const segment = pathname.slice(root.length).split("/")[0];
  if (!segment) {
    return null;
  }
  return isTabId(segment) ? segment : DEFAULT_TAB;
}

// The pathname for a tab under the app base: the root itself for
// the default tab (the overview lives at "/social/", not
// "/social/overview"), "<base><id>" for the others.
export function pathForTab(base, tabId) {
  const root = normalizeBase(base);
  const id = isTabId(tabId) ? tabId : DEFAULT_TAB;
  return id === DEFAULT_TAB ? root : `${root}${id}`;
}

// A new hash with the tab part set (or replaced), keeping every
// other part — notably the share token — intact.
export function hashWithTab(hash, tabId) {
  const id = isTabId(tabId) ? tabId : DEFAULT_TAB;
  const fragment = hash && hash.startsWith("#") ? hash.slice(1) : hash || "";
  const parts = fragment
    .split("&")
    .filter((part) => part && !part.startsWith("tab="));
  parts.push(`tab=${id}`);
  return `#${parts.join("&")}`;
}
