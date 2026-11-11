import { describe, expect, it } from "vitest";
import {
  ID_TOKEN_STORAGE_KEY,
  SESSION_TOKEN_STORAGE_KEY,
  SHARE_TOKEN_STORAGE_KEY,
  bootEntry,
  clearSavedIdToken,
  clearSavedSessionToken,
  clearSavedShareToken,
  loadSavedSessionToken,
  loadSavedShareToken,
  saveSessionToken,
  saveShareToken,
  sessionKey,
} from "../src/session.js";

function fakeStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    map,
  };
}

describe("sessionKey", () => {
  it("uses the bare key in production builds", () => {
    expect(sessionKey(SESSION_TOKEN_STORAGE_KEY, false)).toBe("ga-session-token");
    expect(sessionKey(SHARE_TOKEN_STORAGE_KEY, false)).toBe("ga-share-token");
  });

  it("suffixes the key with :staging in staging builds", () => {
    expect(sessionKey(SESSION_TOKEN_STORAGE_KEY, true)).toBe(
      "ga-session-token:staging",
    );
    expect(sessionKey(SHARE_TOKEN_STORAGE_KEY, true)).toBe(
      "ga-share-token:staging",
    );
  });
});

describe("saved session token", () => {
  it("round-trips through storage", () => {
    const storage = fakeStorage();
    saveSessionToken("tok-1", storage, false);
    expect(storage.map.get("ga-session-token")).toBe("tok-1");
    expect(loadSavedSessionToken(storage, false)).toBe("tok-1");
  });

  it("returns an empty string when nothing is saved", () => {
    expect(loadSavedSessionToken(fakeStorage(), false)).toBe("");
  });

  it("clears the saved token", () => {
    const storage = fakeStorage();
    saveSessionToken("tok-1", storage, false);
    clearSavedSessionToken(storage, false);
    expect(loadSavedSessionToken(storage, false)).toBe("");
    expect(storage.map.has("ga-session-token")).toBe(false);
  });

  it("keeps staging and production tokens apart", () => {
    const storage = fakeStorage();
    saveSessionToken("prod-tok", storage, false);
    saveSessionToken("staging-tok", storage, true);
    expect(loadSavedSessionToken(storage, false)).toBe("prod-tok");
    expect(loadSavedSessionToken(storage, true)).toBe("staging-tok");
    clearSavedSessionToken(storage, true);
    expect(loadSavedSessionToken(storage, true)).toBe("");
    expect(loadSavedSessionToken(storage, false)).toBe("prod-tok");
  });

  it("clearSavedIdToken removes the legacy saved ID token", () => {
    const storage = fakeStorage();
    storage.setItem("ga-google-id-token", "legacy-tok");
    clearSavedIdToken(storage, false);
    expect(storage.map.has("ga-google-id-token")).toBe(false);
  });
});

describe("saved share token", () => {
  it("round-trips through storage", () => {
    const storage = fakeStorage();
    saveShareToken("share-1", storage, false);
    expect(storage.map.get("ga-share-token")).toBe("share-1");
    expect(loadSavedShareToken(storage, false)).toBe("share-1");
  });

  it("returns an empty string when nothing is saved", () => {
    expect(loadSavedShareToken(fakeStorage(), false)).toBe("");
  });

  it("clears the saved token", () => {
    const storage = fakeStorage();
    saveShareToken("share-1", storage, false);
    clearSavedShareToken(storage, false);
    expect(loadSavedShareToken(storage, false)).toBe("");
    expect(storage.map.has("ga-share-token")).toBe(false);
  });

  it("keeps staging and production tokens apart", () => {
    const storage = fakeStorage();
    saveShareToken("prod-share", storage, false);
    saveShareToken("staging-share", storage, true);
    expect(loadSavedShareToken(storage, false)).toBe("prod-share");
    expect(loadSavedShareToken(storage, true)).toBe("staging-share");
    clearSavedShareToken(storage, false);
    expect(loadSavedShareToken(storage, false)).toBe("");
    expect(loadSavedShareToken(storage, true)).toBe("staging-share");
  });
});

describe("unavailable storage", () => {
  const throwing = {
    getItem() {
      throw new Error("denied");
    },
    setItem() {
      throw new Error("denied");
    },
    removeItem() {
      throw new Error("denied");
    },
  };

  it("loads as empty and never throws on save or clear", () => {
    expect(loadSavedSessionToken(throwing, false)).toBe("");
    expect(loadSavedShareToken(throwing, false)).toBe("");
    expect(() => saveSessionToken("t", throwing, false)).not.toThrow();
    expect(() => saveShareToken("t", throwing, false)).not.toThrow();
    expect(() => clearSavedSessionToken(throwing, false)).not.toThrow();
    expect(() => clearSavedIdToken(throwing, false)).not.toThrow();
    expect(() => clearSavedShareToken(throwing, false)).not.toThrow();
  });

  it("tolerates a missing storage object", () => {
    expect(loadSavedSessionToken(null, false)).toBe("");
    expect(loadSavedShareToken(undefined, false)).toBe("");
    expect(() => saveSessionToken("t", null, false)).not.toThrow();
    expect(() => saveShareToken("t", undefined, false)).not.toThrow();
  });
});

describe("bootEntry", () => {
  it("prefers a share link opened just now over everything", () => {
    expect(
      bootEntry({
        hashToken: "hash-tok",
        savedSessionToken: "session-tok",
        savedShareToken: "share-tok",
      }),
    ).toEqual({ kind: "share", token: "hash-tok", fromHash: true });
  });

  it("restores the saved owner session next", () => {
    expect(
      bootEntry({ savedSessionToken: "session-tok", savedShareToken: "share-tok" }),
    ).toEqual({ kind: "session", token: "session-tok" });
  });

  it("falls back to the saved share copy", () => {
    expect(bootEntry({ savedShareToken: "share-tok" })).toEqual({
      kind: "share",
      token: "share-tok",
      fromHash: false,
    });
  });

  it("reports no entry when nothing is saved", () => {
    expect(bootEntry()).toEqual({ kind: "none" });
    expect(bootEntry({})).toEqual({ kind: "none" });
    expect(
      bootEntry({ hashToken: "", savedSessionToken: "", savedShareToken: "" }),
    ).toEqual({ kind: "none" });
  });
});
