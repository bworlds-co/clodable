import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readRehearsal, recordRehearsal } from "../src/move/rehearsal.js";
import { loadMove, MOVE_PATH, saveMove, updateMove } from "../src/move/state.js";

let root: string;
const copy = { ref: "test-copy", dataAt: "2026-10-10T10:00:00.000Z" };
const observation = {
  feature: "Open a note attachment",
  result: "passed",
  method: "browser",
  observedAt: "2026-10-10T11:00:00.000Z",
  evidence: "Uploaded a disposable text file, reloaded and opened it.",
  limitation: "Does not verify transfer of existing users' files.",
};
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "clodable-rehearsal-"));
  await saveMove(root, {
    version: 1,
    home: {
      ref: copy.ref,
      name: "Copy",
      region: "local",
      createdAt: copy.dataAt,
      createdByClodable: true,
    },
    data: { at: copy.dataAt, ok: true, problems: [], fixes: [] },
  });
});
afterEach(() => rm(root, { recursive: true, force: true }));
const record = (changes = {}) =>
  recordRehearsal({ root }, JSON.stringify({ copy, observations: [observation], ...changes }));

describe("dated copy rehearsal evidence", () => {
  it("survives a new read without changing the move or duplicating the same observation", async () => {
    const initial = await loadMove(root);
    await record();
    await record();
    const before = await readFile(join(root, MOVE_PATH), "utf8");
    const result = await readRehearsal({ root });
    expect(result.copy).toEqual(copy);
    expect(result.observations).toHaveLength(1);
    expect(result.observations[0]).toMatchObject({ ...observation, copy, scope: "current-copy" });
    expect(await readFile(join(root, MOVE_PATH), "utf8")).toBe(before);
    expect(await loadMove(root)).toMatchObject(initial);
  });

  it("keeps checks historical during a failed recopy and after a new copy or target", async () => {
    await record();
    await updateMove(root, (s) => {
      s.copyStartedAt = "2026-10-11T10:00:00.000Z";
    });
    expect((await readRehearsal({ root })).copy).toBeUndefined();
    expect((await readRehearsal({ root })).observations[0]?.scope).toBe("earlier-copy");
    await expect(record()).rejects.toMatchObject({ code: "move-not-ready" });
    await updateMove(root, (s) => {
      s.data!.at = "2026-10-11T10:01:00.000Z";
    });
    expect((await readRehearsal({ root })).observations[0]?.scope).toBe("earlier-copy");
    await updateMove(root, (s) => {
      s.data!.at = copy.dataAt;
      delete s.copyStartedAt;
      s.home!.ref = "another-copy";
    });
    expect((await readRehearsal({ root })).observations[0]?.scope).toBe("earlier-copy");
  });

  it("distinguishes automated evidence and later failures, and rejects false dates or shapes", async () => {
    await record();
    await record({
      observations: [
        {
          ...observation,
          method: "automated",
          result: "failed",
          observedAt: "2026-10-10T12:00:00.000Z",
          evidence: "Failed with access denied.",
        },
      ],
    });
    expect((await readRehearsal({ root })).observations.map((o) => o.result)).toEqual([
      "passed",
      "failed",
    ]);
    const before = await readFile(join(root, MOVE_PATH), "utf8");
    for (const observedAt of ["2026-10-09T10:00:00.000Z", "2999-01-01T00:00:00.000Z"]) {
      await expect(
        record({ observations: [{ ...observation, observedAt }] }),
      ).rejects.toMatchObject({ code: "invalid-config" });
    }
    await expect(
      record({ observations: [{ ...observation, token: "not-allowed" }] }),
    ).rejects.toMatchObject({ code: "invalid-config" });
    expect(await readFile(join(root, MOVE_PATH), "utf8")).toBe(before);
  });

  it("treats missing evidence as unknown and can read an app without a move", async () => {
    await rm(join(root, MOVE_PATH));
    expect(await readRehearsal({ root })).toMatchObject({
      observations: [],
      limit: expect.stringContaining("unknown, not never tested"),
    });
    await expect(record()).rejects.toMatchObject({ code: "move-not-ready" });
  });
});
