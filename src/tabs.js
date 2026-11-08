// Tab navigation for the dashboard. The selected tab travels in
// the URL hash as a "tab=" part, alongside the share token's
// "share=" part, so a reload (or a reopened share link) restores
// the same tab. parseShareToken in share.js reads only the share
// part, so the extra part does not disturb share sessions.

export const TABS = [
  { id: "overview", label: "概要" },
  { id: "instagram", label: "Instagram" },
  { id: "blog", label: "ブログ" },
  { id: "youtube", label: "YouTube" },
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
