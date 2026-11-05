import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Guards for CI/configuration regressions that unit tests cannot see:
// a masked "<redacted>" placeholder left in a workflow file, an "if"
// condition that references the secrets context (which invalidates the
// whole workflow), a staging build step placed before the production
// build (Vite empties dist, wiping the bundled staging variant), and
// the production/staging GAS endpoints wired to the wrong project.
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const workflowsDir = path.join(root, ".github", "workflows");
const workflowFiles = fs
  .readdirSync(workflowsDir)
  .filter((f) => /\.(yml|yaml)$/.test(f));
const read = (file) => fs.readFileSync(path.join(workflowsDir, file), "utf8");
const readRoot = (file) => fs.readFileSync(path.join(root, file), "utf8");

const PROD_GAS_ID =
  "AKfycbypis7IqAtM2u0_h7ysiZ5UgztUEwNYJ1zPMnr8IbTBXiyfiapfRMtD_9CxVpc5G8YVzQ";
const STAGING_GAS_ID =
  "AKfycbyRCLUuKbRElDdlUc0Rqh6Qxdfxd5R8hICpRe-keEyGCe1z-mC9gfN798MlXfQgY8kw";

describe("CI configuration", () => {
  it("finds workflow files", () => {
    expect(workflowFiles.length).toBeGreaterThan(0);
  });

  it.each(workflowFiles)(
    "%s does not contain a masked <redacted> placeholder",
    (file) => {
      expect(read(file)).not.toContain("<redacted>");
    },
  );

  it.each(workflowFiles)(
    "%s does not reference secrets in an if condition",
    (file) => {
      const bad = read(file)
        .split("\n")
        .filter((line) => /^\s*if:.*secrets\./.test(line));
      expect(bad).toEqual([]);
    },
  );

  it.each(workflowFiles)(
    "%s builds the staging variant after the production build",
    (file) => {
      const lines = read(file).split("\n");
      const buildIdx = lines.findIndex((l) => /npm run build(?!:staging)/.test(l));
      const stagingIdx = lines.findIndex((l) => l.includes("build:staging"));
      if (buildIdx >= 0 && stagingIdx >= 0) {
        expect(stagingIdx).toBeGreaterThan(buildIdx);
      }
    },
  );

  it("points the production build at the production GAS deployment", () => {
    expect(readRoot("src/config.js")).toContain(PROD_GAS_ID);
    expect(readRoot("src/config.js")).not.toContain(STAGING_GAS_ID);
  });

  it("points the staging builds at the staging GAS deployment", () => {
    for (const file of workflowFiles) {
      expect(read(file)).toContain(STAGING_GAS_ID);
      expect(read(file)).not.toContain(PROD_GAS_ID);
    }
  });

  it("uses /ga/ as the Vite base and /ga/staging/ for staging", () => {
    expect(readRoot("vite.config.js")).toContain('base: "/ga/"');
    expect(readRoot("package.json")).toContain("--base /ga/staging/");
  });
});
