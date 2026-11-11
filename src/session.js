// Persistence for the sign-in session, mirroring the asset app so a
// reload no longer drops the visitor back at the sign-in gate:
//   - at sign-in the Google ID token is exchanged for a 30-day owner
//     session token, and that session token is what gets saved in
//     localStorage and read back at boot (the raw ID token expires
//     after about an hour and is never stored; a legacy saved copy
//     is cleared at boot);
//   - the share token keeps a copy in sessionStorage, so reopening
//     the app without the #share= fragment restores the session.
//
// Production and staging are served from the same origin (paths
// /social/ and /social/staging/) and therefore share localStorage. Staging
// builds use ":staging"-suffixed keys — the convention the blog
// introduced for its list cache — so the two environments can never
// read or clear each other's saved session.
import { isStagingBuild } from "./staging-banner.js";

export const ID_TOKEN_STORAGE_KEY = "ga-google-id-token";
export const SESSION_TOKEN_STORAGE_KEY = "ga-session-token";
export const SHARE_TOKEN_STORAGE_KEY = "ga-share-token";

/** The storage key for this build; staging gets a ":staging" suffix. */
export function sessionKey(baseKey, staging = isStagingBuild()) {
  return staging ? `${baseKey}:staging` : baseKey;
}

function readToken(storage, key) {
  try {
    return storage?.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function writeToken(storage, key, token) {
  try {
    if (token) {
      storage?.setItem(key, token);
    } else {
      storage?.removeItem(key);
    }
  } catch {
    // Storage may be unavailable (private browsing, blocked
    // cookies); the session then stays in memory only, as before.
  }
}

export function loadSavedSessionToken(
  storage = globalThis.localStorage,
  staging = isStagingBuild(),
) {
  return readToken(storage, sessionKey(SESSION_TOKEN_STORAGE_KEY, staging));
}

export function saveSessionToken(
  token,
  storage = globalThis.localStorage,
  staging = isStagingBuild(),
) {
  writeToken(storage, sessionKey(SESSION_TOKEN_STORAGE_KEY, staging), token);
}

export function clearSavedSessionToken(
  storage = globalThis.localStorage,
  staging = isStagingBuild(),
) {
  writeToken(storage, sessionKey(SESSION_TOKEN_STORAGE_KEY, staging), "");
}

export function clearSavedIdToken(
  storage = globalThis.localStorage,
  staging = isStagingBuild(),
) {
  writeToken(storage, sessionKey(ID_TOKEN_STORAGE_KEY, staging), "");
}

export function loadSavedShareToken(
  storage = globalThis.sessionStorage,
  staging = isStagingBuild(),
) {
  return readToken(storage, sessionKey(SHARE_TOKEN_STORAGE_KEY, staging));
}

export function saveShareToken(
  token,
  storage = globalThis.sessionStorage,
  staging = isStagingBuild(),
) {
  writeToken(storage, sessionKey(SHARE_TOKEN_STORAGE_KEY, staging), token);
}

export function clearSavedShareToken(
  storage = globalThis.sessionStorage,
  staging = isStagingBuild(),
) {
  writeToken(storage, sessionKey(SHARE_TOKEN_STORAGE_KEY, staging), "");
}

/**
 * Decide how boot should try to enter, strongest signal first: a
 * share link opened just now, then the saved owner session, then
 * the sessionStorage copy of an earlier share link. Returns one of
 *   { kind: "share", token, fromHash: true }
 *   { kind: "session", token }
 *   { kind: "share", token, fromHash: false }
 *   { kind: "none" }
 */
export function bootEntry({
  hashToken = "",
  savedSessionToken = "",
  savedShareToken = "",
} = {}) {
  if (hashToken) {
    return { kind: "share", token: hashToken, fromHash: true };
  }
  if (savedSessionToken) {
    return { kind: "session", token: savedSessionToken };
  }
  if (savedShareToken) {
    return { kind: "share", token: savedShareToken, fromHash: false };
  }
  return { kind: "none" };
}
