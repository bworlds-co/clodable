import { describe, expect, test } from "claude-code/testing";
import { setLocale, t } from "../hooks/i18n.ts";
import { stagesOf } from "../hooks/move.ts";
import {
  ago,
  describeCommand,
  describeTool,
  fixRequest,
  pageName,
  plural,
  pointedAt,
  saveMessage,
} from "../hooks/words.ts";

describe("French wording", () => {
  test("keeps builder content intact inside translated requests", () => {
    setLocale("fr");
    try {
      const pointed = pointedAt("Heading <h1> “Offre : {count} API calls”");
      expect(pointed).toBe("le titre “Offre : {count} API calls”");
      const message = t("About {0}: {1}", { 0: pointed, 1: "Garde GitHub et change la couleur" });
      expect(saveMessage(message)).toBe("Garde GitHub et change la couleur");
      expect(pageName("/pricing")).toBe("la page /pricing");
    } finally {
      setLocale("en");
    }
  });

  test("uses French plurals and relative time", () => {
    setLocale("fr");
    try {
      expect(plural(1, "secret key")).toBe("1 clé secrète");
      expect(plural(2, "secret key")).toBe("2 clés secrètes");
      expect(plural(3, "scheduled job")).toBe("3 tâches planifiées");
      expect(ago(0, 120_000)).toBe("il y a 2 min");
    } finally {
      setLocale("en");
    }
  });

  test("looks up activity and migration labels after the language changes", () => {
    setLocale("en");
    expect(describeCommand("clodable move copy", true)?.text).toBe("Copying your data");
    setLocale("fr");
    try {
      expect(describeCommand("clodable move copy", true)?.text).toBe("Copie de vos données");
      expect(describeCommand("clodable move copy", false)?.text).toBe("Données copiées");
      expect(
        describeTool({
          tool: "Read",
          input: { file_path: "src/pages/Pricing.tsx" },
          isRunning: false,
          isErrored: false,
        })?.text,
      ).toBe("Lecture terminée : la page Pricing");
      expect(stagesOf([{ id: "copy" }], "careful")[0]?.title).toBe(
        "Préparation : votre nouveau backend",
      );
    } finally {
      setLocale("en");
    }
  });

  test("recognizes translated recovery requests without storing the whole prompt as a title", () => {
    setLocale("fr");
    try {
      const request = fixRequest({
        code: "secret-found",
        message: "A secret key is in src/app.ts",
      });
      expect(request.text).toBe(
        "Retire la clé secrète de mon code pour que mes changements puissent être enregistrés.",
      );
      expect(saveMessage(request.text)).toBe("Clé secrète retirée du code");
      expect(saveMessage("Répare la page d’accueil : elle ne fonctionne pas dans l’aperçu.")).toBe(
        "Page réparée",
      );
      expect(
        saveMessage(
          "Départ de Lovable : copie mes données dans mon nouveau backend, puis vérifie le résultat.",
        ),
      ).toBe("Copie mes données dans mon nouveau backend");
    } finally {
      setLocale("en");
    }
  });
});
