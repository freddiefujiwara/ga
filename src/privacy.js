// Privacy masking: the same behaviour as the health site.
// A header toggle flips data-private="on" on <html>; the CSS
// then blurs every element carrying .amount-value / .privacy-mask
// except the ones marked .is-public. The exemptions are the
// percentages and other ratios, and the figures the owner
// already publishes elsewhere — the top page's follower counts
// and post count, and the blog's own numbers (its article list
// prints every article's view count) — so a screenshot can go
// on the blog with those intact; only the unpublished analysis
// (per-post platform counts, day-over-day changes, genre
// rollups of the SNS tabs) is masked.
// The choice persists in local storage and the default is off
// (numbers visible). While a temporary share link is being
// viewed, masking is suspended — the viewer of a shared link
// sees the numbers — and the stored preference is left
// untouched, exactly as in the asset / health apps.
export const PRIVACY_KEY = "social-private";

export function resolvePrivacy(stored) {
  return stored === "on";
}

export function privacyLabel(on) {
  return on ? "数値を表示" : "数値を隠す";
}

export function applyPrivacy(root, button, on, suspended = false) {
  if (on && !suspended) {
    root.setAttribute("data-private", "on");
  } else {
    root.removeAttribute("data-private");
  }
  if (button) {
    button.textContent = privacyLabel(on);
  }
}
