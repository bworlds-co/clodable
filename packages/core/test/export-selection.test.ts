import { mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { checkExportSource, findExport } from "../src/move/export.js";
import { makeZip } from "./move-fixtures.js";

const APP = "b5d444a0-777d-4ff9-90b8-a613ef97daa0";
const OTHER = "e1a96225-0edb-4967-ae0f-256c871f673e";
const URL = `https://lovable.dev/projects/${APP}`;
let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "clodable-exports-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

it("matches the current app instead of a newer export from another app", async () => {
  const wanted = join(dir, `${APP}_261018.backup.zip`);
  await writeFile(wanted, makeZip([{ name: `${APP}_261018.backup`, data: Buffer.from("PGDMP") }]));
  const yesterday = new Date(Date.now() - 86400_000);
  await utimes(wanted, yesterday, yesterday);
  await writeFile(join(dir, `${OTHER}.dump`), "PGDMP");
  expect(await findExport(dir, URL)).toBe(wanted);
  expect(await findExport(dir, `https://lovable.dev/projects/${OTHER}`)).toBe(
    join(dir, `${OTHER}.dump`),
  );
});

it("recognizes a manual dump inside an unlabelled zip", async () => {
  const file = join(dir, "support.zip");
  await writeFile(file, makeZip([{ name: `export/${APP}.DUMP`, data: Buffer.from("PGDMP") }]));
  expect(await findExport(dir, URL)).toBe(file);
  await expect(checkExportSource(file, URL)).resolves.toBeUndefined();
});

it("requires an explicit choice when filenames cannot identify this app", async () => {
  const file = join(dir, "manual.dump");
  await writeFile(file, "PGDMP");
  expect(await findExport(dir, URL)).toBeUndefined();
  expect(await findExport(dir)).toBeUndefined();
  await expect(checkExportSource(file, URL)).resolves.toBeUndefined();
});

it("rejects mismatches in the outer filename or the archive member", async () => {
  for (const [outer, inner] of [
    [APP, OTHER],
    [OTHER, APP],
  ]) {
    const file = join(dir, `${outer}.zip`);
    await writeFile(file, makeZip([{ name: `${inner}.backup`, data: Buffer.from("PGDMP") }]));
    await expect(checkExportSource(file, URL)).rejects.toThrow("different Lovable app");
  }
  await expect(checkExportSource(join(dir, `${OTHER}.dump`), URL)).rejects.toThrow(
    "different Lovable app",
  );
  expect(await findExport(dir, URL)).toBeUndefined();
});

it("never chooses the largest of several database exports", async () => {
  const file = join(dir, `${APP}.zip`);
  await writeFile(
    file,
    makeZip([
      { name: `${APP}.backup`, data: Buffer.from("PGDMP") },
      { name: `${OTHER}.dump`, data: Buffer.from("PGDMP".repeat(10)) },
    ]),
  );
  expect(await findExport(dir, URL)).toBeUndefined();
  await expect(checkExportSource(file, URL)).rejects.toThrow("more than one");
});

it("keeps a damaged zip error readable", async () => {
  const file = join(dir, `${APP}.zip`);
  await writeFile(file, "broken zip");
  await expect(checkExportSource(file, URL)).rejects.toMatchObject({ code: "export-unreadable" });
  expect(await findExport(dir, URL)).toBeUndefined();
});
