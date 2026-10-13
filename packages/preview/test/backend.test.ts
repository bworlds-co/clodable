import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import type { PreviewBackend } from "@clodable/core";
import { describe, expect, it } from "vitest";
import { startDevServer } from "../src/dev-server.js";

const SRC = "srcsrcsrcsrcsrcsrcsr";
const DST = "dstdstdstdstdstdstds";
const jwt = (ref: string, role: string) =>
  [
    Buffer.from('{"alg":"HS256"}').toString("base64url"),
    Buffer.from(JSON.stringify({ ref, role })).toString("base64url"),
    "c2ln",
  ].join(".");

const freePort = () =>
  new Promise<number>((resolve) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as { port: number };
      server.close(() => resolve(port));
    });
  });

describe("trying the app on a move's copy", () => {
  it("talks to the copy without a file changing, and switches back when told", async () => {
    // Inside the repository, so the app finds its `vite` the way a real one does.
    const root = mkdtempSync(join(import.meta.dirname, "tmp-backend-"));
    const cwd = process.cwd();
    const before = process.env.VITE_SUPABASE_URL;
    try {
      mkdirSync(join(root, "src/integrations/supabase"), { recursive: true });
      writeFileSync(
        join(root, "index.html"),
        '<div id="root"></div><script type="module" src="/src/integrations/supabase/client.js"></script>',
      );
      // An older Lovable app: the address and key written out in the code.
      const client = `export const SUPABASE_URL = "https://${SRC}.supabase.co";\nexport const KEY = "${jwt(SRC, "anon")}";\nexport const FROM_ENV = import.meta.env.VITE_SUPABASE_URL;\n`;
      writeFileSync(join(root, "src/integrations/supabase/client.js"), client);
      const move = join(root, "move.json");
      writeFileSync(move, '{"preview":"copy"}');
      const copy: PreviewBackend = {
        from: SRC,
        ref: DST,
        url: `https://${DST}.supabase.co`,
        publishable: "sb_publishable_test",
        anon: jwt(DST, "anon"),
        serviceRole: "sb_secret_test",
      };
      const server = await startDevServer({
        root,
        port: await freePort(),
        host: "127.0.0.1",
        backend: {
          current: async () =>
            JSON.parse(readFileSync(move, "utf8")).preview === "copy" ? copy : undefined,
          watch: move,
        },
      });
      try {
        expect(server.backend).toBe("copy");
        const base = server.urls[0]!.replace(/\/$/, "");
        const module = async () =>
          (await fetch(`${base}/src/integrations/supabase/client.js`)).text();
        const toolbar = async () => (await fetch(`${base}/__clodable/toolbar.js`)).text();

        const onCopy = await module();
        expect(onCopy).toContain(`https://${DST}.supabase.co`);
        expect(onCopy).toContain(copy.anon);
        expect(onCopy).not.toContain(SRC);
        expect(await toolbar()).toContain('"backend":"copy"');
        expect(process.env.SUPABASE_SERVICE_ROLE_KEY).toBe("sb_secret_test");
        // The file on disk is the app's own, untouched.
        expect(readFileSync(join(root, "src/integrations/supabase/client.js"), "utf8")).toBe(
          client,
        );

        writeFileSync(move, '{"preview":"live"}');
        let live = "";
        for (let i = 0; i < 40 && !live.includes('"backend":"live"'); i++) {
          await new Promise((resolve) => setTimeout(resolve, 250));
          live = await toolbar().catch(() => "");
        }
        expect(live).toContain('"backend":"live"');
        expect(await module()).toContain(`https://${SRC}.supabase.co`);
        expect(process.env.SUPABASE_SERVICE_ROLE_KEY).toBeUndefined();
      } finally {
        await server.close();
      }
    } finally {
      process.chdir(cwd);
      if (before === undefined) delete process.env.VITE_SUPABASE_URL;
      rmSync(root, { recursive: true, force: true });
    }
  }, 60_000);
});

describe("the app's settings in the preview", () => {
  it("gives the server side the settings pasted in Clodable, and restarts when one changes", async () => {
    const root = mkdtempSync(join(import.meta.dirname, "tmp-settings-"));
    const cwd = process.cwd();
    const before = process.env.CLODABLE_TEST_GREETING;
    delete process.env.CLODABLE_TEST_GREETING;
    try {
      writeFileSync(join(root, "index.html"), '<div id="root"></div>');
      const marker = join(root, "settings.json");
      let values: Record<string, string> = { CLODABLE_TEST_GREETING: "Hello" };
      writeFileSync(marker, '{"names":["CLODABLE_TEST_GREETING"]}');
      const server = await startDevServer({
        root,
        port: await freePort(),
        host: "127.0.0.1",
        toolbar: false,
        settings: { current: async () => values, watch: marker },
      });
      try {
        expect(process.env.CLODABLE_TEST_GREETING).toBe("Hello");
        values = { CLODABLE_TEST_GREETING: "Bonjour" };
        writeFileSync(marker, '{"names":["CLODABLE_TEST_GREETING"],"at":"later"}');
        for (let i = 0; i < 60 && process.env.CLODABLE_TEST_GREETING !== "Bonjour"; i++) {
          await new Promise((r) => setTimeout(r, 100));
        }
        expect(process.env.CLODABLE_TEST_GREETING).toBe("Bonjour");
      } finally {
        await server.close();
      }
    } finally {
      process.chdir(cwd);
      rmSync(root, { recursive: true, force: true });
      if (before === undefined) delete process.env.CLODABLE_TEST_GREETING;
      else process.env.CLODABLE_TEST_GREETING = before;
    }
  }, 30_000);

  it("notices a setting pasted while the preview is starting", async () => {
    const root = mkdtempSync(join(import.meta.dirname, "tmp-settings-"));
    const cwd = process.cwd();
    const before = process.env.CLODABLE_TEST_GREETING;
    delete process.env.CLODABLE_TEST_GREETING;
    try {
      writeFileSync(join(root, "index.html"), '<div id="root"></div>');
      const marker = join(root, "settings.json");
      let values: Record<string, string> = { CLODABLE_TEST_GREETING: "Hello" };
      let pasted = false;
      writeFileSync(marker, '{"names":["CLODABLE_TEST_GREETING"]}');
      const server = await startDevServer({
        root,
        port: await freePort(),
        host: "127.0.0.1",
        toolbar: false,
        settings: {
          // The builder pastes a new value just after the preview read the old one.
          current: async () => {
            const read = values;
            if (!pasted) {
              pasted = true;
              values = { CLODABLE_TEST_GREETING: "Bonjour" };
              writeFileSync(marker, '{"names":["CLODABLE_TEST_GREETING"],"at":"starting"}');
            }
            return read;
          },
          watch: marker,
        },
      });
      try {
        for (let i = 0; i < 60 && process.env.CLODABLE_TEST_GREETING !== "Bonjour"; i++) {
          await new Promise((r) => setTimeout(r, 100));
        }
        expect(process.env.CLODABLE_TEST_GREETING).toBe("Bonjour");
      } finally {
        await server.close();
      }
    } finally {
      process.chdir(cwd);
      rmSync(root, { recursive: true, force: true });
      if (before === undefined) delete process.env.CLODABLE_TEST_GREETING;
      else process.env.CLODABLE_TEST_GREETING = before;
    }
  }, 30_000);
});
