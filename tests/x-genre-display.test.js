import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Guards for the X tab's genre layout, which the unit tests
// over src modules cannot see: like the Instagram and Threads
// tabs, the X tab shows a ジャンル別 section above its per-post
// table, and the per-post table carries the genre filter
// buttons above it (below ジャンル別, per the owner's layout).
// The renderers live in main.js over the shared genre builder,
// so this pins the element ids and the wiring together.
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const mainJs = fs.readFileSync(path.join(root, "src", "main.js"), "utf8");

describe("x tab genre layout", () => {
  it("places the genre section inside the X panel, above the posts table", () => {
    const panelAt = html.indexOf('id="tab-x"');
    const genresAt = html.indexOf('id="x-genres"');
    const postsAt = html.indexOf('id="x-posts-table"');
    expect(panelAt).toBeGreaterThan(-1);
    expect(genresAt).toBeGreaterThan(panelAt);
    expect(genresAt).toBeLessThan(postsAt);
  });

  it("places the genre filter buttons above the posts table", () => {
    const tabsAt = html.indexOf('id="x-posts-genre-tabs"');
    const postsAt = html.indexOf('id="x-posts-table"');
    expect(tabsAt).toBeGreaterThan(-1);
    expect(tabsAt).toBeLessThan(postsAt);
  });

  it("renders the genre section through the shared builder", () => {
    expect(mainJs).toContain('getElementById("x-genres")');
    expect(mainJs).toContain("genreStatsForX(xPostRows)");
    expect(mainJs).toContain("renderPostGenres(");
  });

  it("wires the filter buttons and the filtered table render", () => {
    expect(mainJs).toContain('getElementById("x-posts-genre-tabs")');
    expect(mainJs).toContain("xGenreOptions(xPostRows)");
    expect(mainJs).toContain("filterXByGenre(xPostRows, xGenreFilter)");
  });
});
