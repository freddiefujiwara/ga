import { describe, expect, it } from "vitest";
import {
  ID_TOKEN_STORAGE_KEY,
  SHARE_TOKEN_STORAGE_KEY,
  bootEntry,
  clearSavedIdToken,
  clearSavedShareToken,
  loadSavedIdToken,
  loadSavedShareToken,
  saveIdToken,
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
    expect(sessionKey(ID_TOKEN_STORAGE_KEY, false)).toBe("ga-google-id-token");
    expect(sessionKey(SHARE_TOKEN_STORAGE_KEY, false)).toBe("ga-share-token");
  });

  it("suffixes the key with :staging in staging builds", () => {
    expect(sessionKey(ID_TOKEN_STORAGE_KEY, true)).toBe(
      "ga-google-id-token:staging",
    );
    expect(sessionKey(SHARE_TOKEN_STORAGE_KEY, true)).toBe(
      "ga-share-token:staging",
    );
  });
});

describe("saved ID token", () => {
  it("round-trips through storage", () => {
    const storage = fakeStorage();
    saveIdToken("tok-1", storage, false);
    expect(storage.map.get("ga-google-id-token")).toBe("tok-1");
    expect(loadSavedIdToken(storage, false)).toBe("tok-1");
  });

  it("returns an empty string when nothing is saved", () => {
    expect(loadSavedIdToken(fakeStorage(), false)).toBe("");
  });

  it("clears the saved token", () => {
    const storage = fakeStorage();
    saveIdToken("tok-1", storage, false);
    clearSavedIdToken(storage, false);
    expect(loadSavedIdToken(storage, false)).toBe("");
    expect(storage.map.has("ga-google-id-token")).toBe(false);
  });

  it("keeps staging and production tokens apart", () => {
    const storage = fakeStorage();
    saveIdToken("prod-tok", storage, false);
    saveIdToken("staging-tok", storage, true);
    expect(loadSavedIdToken(storage, false)).toBe("prod-tok");
    expect(loadSavedIdToken(storage, true)).toBe("staging-tok");
    clearSavedIdToken(storage, true);
    expect(loadSavedIdToken(storage, true)).toBe("");
    expect(loadSavedIdToken(storage, false)).toBe("prod-tok");
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
    expect(loadSavedIdToken(throwing, false)).toBe("");
    expect(loadSavedShareToken(throwing, false)).toBe("");
    expect(() => saveIdToken("t", throwing, false)).not.toThrow();
    expect(() => saveShareToken("t", throwing, false)).not.toThrow();
    expect(() => clearSavedIdToken(throwing, false)).not.toThrow();
    expect(() => clearSavedShareToken(throwing, false)).not.toThrow();
  });

  it("tolerates a missing storage object", () => {
    expect(loadSavedIdToken(null, false)).toBe("");
    expect(loadSavedShareToken(undefined, false)).toBe("");
    expect(() => saveIdToken("t", null, false)).not.toThrow();
    expect(() => saveShareToken("t", undefined, false)).not.toThrow();
  });
});

describe("bootEntry", () => {
  it("prefers a share link opened just now over everything", () => {
    expect(
      bootEntry({
        hashToken: "hash-tok",
        savedIdToken: "id-tok",
        savedShareToken: "share-tok",
      }),
    ).toEqual({ kind: "share", token: "hash-tok", fromHash: true });
  });

  it("restores the saved Google sign-in next", () => {
    expect(
      bootEntry({ savedIdToken: "id-tok", savedShareToken: "share-tok" }),
    ).toEqual({ kind: "idToken", token: "id-tok" });
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
      bootEntry({ hashToken: "", savedIdToken: "", savedShareToken: "" }),
    ).toEqual({ kind: "none" });
  });
});
