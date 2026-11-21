import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { toErrorInfo } from "../src/errors.js";
import { checkDetail, checkLabel, countMessage, presentMoveCheck } from "../src/move/messages.js";
import { loadMove, type MoveCheck, saveMove } from "../src/move/state.js";
import { formatRelative } from "../src/time.js";
import { buildLine } from "../src/waits.js";

afterEach(() => vi.unstubAllEnvs());

describe("the language inherited from Claude", () => {
  it("uses French at invocation time and falls back to English without changing error codes or diagnostics", () => {
    const failure = new Error("original API diagnostic");
    vi.stubEnv("CLODABLE_LANGUAGE", "fr-CA");
    expect(toErrorInfo(failure)).toMatchObject({
      code: "unknown",
      message: "Un problème inattendu est survenu.",
      details: "original API diagnostic",
    });
    expect(buildLine(undefined, 120_000)).toBe("Votre hébergeur prépare le site · 2 min écoulées");
    expect(formatRelative("2026-10-10T14:48:00Z", new Date("2026-10-10T15:00:00Z"))).toBe(
      "il y a 12 min",
    );
    vi.stubEnv("CLODABLE_LANGUAGE", "de-DE");
    expect(toErrorInfo(failure).message).toBe("Something unexpected went wrong.");
    expect(buildLine(undefined, 120_000)).toBe("Your host is building it · 2 min so far");
  });

  it("renders existing English migration records in French without changing saved facts", async () => {
    const root = await mkdtemp(join(tmpdir(), "clodable-i18n-"));
    const items: MoveCheck[] = [
      { id: "tables", ok: true, label: "All 2 tables and their 1,200 rows are there" },
      {
        id: "people",
        ok: true,
        label: "1 person can sign in as before",
        detail: "1 person sign in without a password (Google and the like, or invited).",
      },
      {
        id: "files",
        ok: false,
        label: "Some files are missing",
        detail: "customer-assets: 2 of 5 files; private: missing",
      },
      {
        id: "rules",
        ok: false,
        label: "Some access rules are missing",
        detail: "access rules in public: 2 of 4",
      },
      {
        id: "vendor-diagnostic",
        ok: false,
        label: "A raw check",
        detail: "public.orders SELECT: opaque raw output",
      },
    ];
    try {
      await saveMove(root, {
        version: 1,
        checks: { at: "2026-10-10T12:00:00Z", ok: false, items },
      });
      const before = await readFile(join(root, ".clodable/local/move.json"), "utf8");
      vi.stubEnv("CLODABLE_LANGUAGE", "French");
      const stored = (await loadMove(root)).checks!.items;
      const translated = stored.map(presentMoveCheck);
      expect(translated[0]?.label).toBe("Tout est présent : 2 tables et 1\u202f200 lignes");
      expect(translated[1]).toMatchObject({
        label: "Connexion inchangée : 1 utilisateur",
        detail:
          "Connexion sans mot de passe : 1 utilisateur (Google ou autre service, ou sur invitation).",
      });
      expect(translated[2]?.detail).toBe("customer-assets : 2 fichiers sur 5; private : manquant");
      expect(translated[3]?.detail).toBe("règles d’accès dans public : 2 sur 4");
      expect(translated[4]).toEqual(items[4]);
      expect(stored).toEqual(items);
      vi.stubEnv("CLODABLE_LANGUAGE", "English");
      expect(stored.map(presentMoveCheck)).toEqual(items);
      expect(await readFile(join(root, ".clodable/local/move.json"), "utf8")).toBe(before);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("persists canonical messages even when a new check is produced in French", () => {
    vi.stubEnv("CLODABLE_LANGUAGE", "fr");
    const check: MoveCheck = {
      id: "people",
      ok: true,
      ...checkLabel("{0} can sign in as before", { "0": countMessage(1, "person", "people") }),
      ...checkDetail("{0} sign in without a password (Google and the like, or invited).", {
        "0": countMessage(1, "person", "people"),
      }),
    };
    expect(check.label).toBe("1 person can sign in as before");
    expect(check.detail).toContain("1 person sign in without a password");
    expect(presentMoveCheck(check).label).toBe("Connexion inchangée : 1 utilisateur");
    vi.stubEnv("CLODABLE_LANGUAGE", "en");
    expect(presentMoveCheck(check).label).toBe(check.label);
    expect(presentMoveCheck(check).detail).toBe(check.detail);
  });
});
