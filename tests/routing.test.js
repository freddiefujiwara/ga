import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Guards for the path-form tab URLs ("/social/instagram"), which
// the unit tests over src modules cannot see. The mechanism is the
// spa-github-pages pattern /asset uses, in three parts that must
// stay in agreement:
//   - public/404.html rewrites an unknown path to the app root
//     with the requested path in a "?/…" query (keeping two path
//     segments on the staging site, /social/staging/<tab>, so the
//     redirect lands on the staging index);
//   - an inline script in index.html restores the original path
//     with replaceState before the app code runs;
//   - the hash (and with it the share token) rides along untouched
//     through both hops.
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const fallback = fs.readFileSync(
  path.join(root, "public", "404.html"),
  "utf8",
);

describe("path tab routing files", () => {
  it("index.html restores the path rewritten by 404.html", () => {
    expect(html).toContain('query.startsWith("?/")');
    expect(html).toContain("window.history.replaceState");
    expect(html).toContain("window.location.hash");
    // The restore must run before the module entry point loads.
    const restoreAt = html.indexOf('query.startsWith("?/")');
    const moduleAt = html.indexOf('src="/src/main.js"');
    expect(restoreAt).toBeGreaterThan(-1);
    expect(moduleAt).toBeGreaterThan(restoreAt);
  });

  it("404.html rewrites unknown paths to the app root with a ?/ query", () => {
    expect(fallback).toContain("pathSegmentsToKeep");
    expect(fallback).toContain("/?/");
    expect(fallback).toContain("window.location.replace");
    // The share token lives in the hash; the redirect must carry it.
    expect(fallback).toContain("hash");
  });

  it("404.html keeps two segments when the second one is staging", () => {
    expect(fallback).toContain('split("/")[2] === "staging" ? 2 : 1');
  });
});
