import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "vite";
import { expect, it } from "vitest";
import { clodablePreview } from "../src/plugin.js";
import { privateFilesPlugin } from "../src/private-files.js";

it.each([
  { toolbar: true, prefix: "/" },
  { toolbar: false, prefix: "/" },
  { toolbar: true, prefix: "/prefix/" },
  { toolbar: false, prefix: "/prefix/" },
])("never serves the original backup, with $toolbar and $prefix", async ({ toolbar, prefix }) => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "clodable-private-preview-")));
  const original = join(root, ".clodable/local/original/snapshot");
  await mkdir(original, { recursive: true });
  await mkdir(join(root, "public"));
  await writeFile(join(root, "index.html"), "<h1>My app</h1>");
  await writeFile(join(original, "private.txt"), "original private value");
  await symlink(join(original, "private.txt"), join(root, "public", "alias.txt"));
  const server = await createServer({
    root,
    base: prefix,
    configFile: false,
    logLevel: "silent",
    plugins: toolbar ? [clodablePreview({ root, tag: false })] : [privateFilesPlugin()],
    server: { host: "127.0.0.1", port: 0 },
  });
  try {
    await server.listen();
    const base = `http://127.0.0.1:${(server.httpServer!.address() as AddressInfo).port}`;
    expect((await fetch(`${base}${prefix}`)).status).toBe(200);
    for (const path of [
      "/.clodable/local/original/snapshot/private.txt",
      "/%2eclodable%2flocal/original/snapshot/private.txt?raw",
      `/@fs/${original}/private.txt`,
      "/alias.txt",
      `/@fs/${join(root, "public", "alias.txt")}`,
    ]) {
      const response = await fetch(`${base}${prefix}${path.slice(1)}`);
      expect(response.status, path).toBe(403);
      expect(await response.text()).not.toContain("original private value");
    }
  } finally {
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
});
