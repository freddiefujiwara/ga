/**
 * Helpers for temporary share sessions (temporary access links).
 * The share token travels in the URL hash fragment (#share=...), which
 * is never sent to servers in HTTP requests or referrer headers.
 */

/** Extract the share token from a location hash string, or return "". */
export function parseShareToken(hash) {
  if (!hash) {
    return "";
  }
  const fragment = hash.startsWith("#") ? hash.slice(1) : hash;
  for (const part of fragment.split("&")) {
    const eq = part.indexOf("=");
    if (eq > 0 && part.slice(0, eq) === "share") {
      return decodeURIComponent(part.slice(eq + 1));
    }
  }
  return "";
}

/** Build the URL a recipient opens: the app base plus the share fragment. */
export function buildShareUrl(baseUrl, token) {
  return `${baseUrl}#share=${encodeURIComponent(token)}`;
}

/** Whole seconds until the session expires; null when the date is invalid. */
export function shareSecondsLeft(expiresAt, nowMs) {
  const expiresMs = Date.parse(expiresAt);
  if (Number.isNaN(expiresMs)) {
    return null;
  }
  return Math.max(0, Math.ceil((expiresMs - nowMs) / 1000));
}

/** Expiry label as "20261202 07:53" (local time); "" when invalid. */
export function formatShareExpiry(expiresAt) {
  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const pad = (n) => String(n).padStart(2, "0");
  const ymd = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
  return `${ymd} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Human label such as "残り約30日" / "残り約30分" / "残り約1分未満" / "期限切れ". */
export function formatShareRemaining(seconds) {
  if (seconds === null) {
    return "";
  }
  if (seconds <= 0) {
    return "期限切れ";
  }
  if (seconds < 60) {
    return "残り約1分未満";
  }
  if (seconds < 3600) {
    return `残り約${Math.ceil(seconds / 60)}分`;
  }
  if (seconds < 86400) {
    return `残り約${Math.ceil(seconds / 3600)}時間`;
  }
  return `残り約${Math.ceil(seconds / 86400)}日`;
}
