import { describe, expect, test } from "vitest";
import { resolveLocale, translate } from "../src/index.js";

describe("Claude's language preference", () => {
  test.each(["french", "French", " français ", "francais", "fr", "fr-FR", "fr_CA", "fr-BE"])(
    "%s selects the French catalog",
    (language) => expect(resolveLocale(language)).toBe("fr"),
  );

  test.each([undefined, null, "", "english", "en-US", "japanese", "de", 42, "frankenstein"])(
    "%s falls back to the English catalog",
    (language) => expect(resolveLocale(language)).toBe("en"),
  );

  test("keeps product names and placeholder-like user content intact", () => {
    const messages = { "Saved {name}.": "{name} est enregistré." };
    expect(translate("fr", messages, "Saved {name}.", { name: "GitHub {other}" })).toBe(
      "GitHub {other} est enregistré.",
    );
    expect(translate("en", messages, "Saved {name}.", { name: "Supabase" })).toBe(
      "Saved Supabase.",
    );
    expect(translate("fr", messages, "Saved {name}.")).toBe("{name} est enregistré.");
    expect(translate("fr", messages, "constructor")).toBe("constructor");
  });
});
