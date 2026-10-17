import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export const LOCAL_CLI = ".clodable/local/clodable.mjs";
export const LOCAL_PREVIEW = ".clodable/local/preview.sh";

/** The plugin supplies its own bundle. These files stay on this computer, outside saved history. */
export function hasLocalRuntime(root: string): boolean {
  return Boolean(process.env.CLODABLE_RUNTIME_SOURCE) || existsSync(join(root, LOCAL_CLI));
}

const shellQuote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;

async function replaceIfChanged(path: string, content: Buffer | string): Promise<void> {
  const bytes = Buffer.from(content);
  const before = await readFile(path).catch(() => undefined);
  if (before?.equals(bytes)) return;
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, bytes);
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

/** Atomic replacement also lets two conversations refresh the same app safely. */
export async function installRuntime(root: string): Promise<void> {
  const source = process.env.CLODABLE_RUNTIME_SOURCE;
  if (!source) return;
  await replaceIfChanged(join(root, LOCAL_CLI), await readFile(source));
  // Desktop starts previews with its own PATH. Use the Node that successfully ran this CLI.
  await replaceIfChanged(
    join(root, LOCAL_PREVIEW),
    `#!/bin/sh\nexec ${shellQuote(process.execPath)} "$(dirname "$0")/clodable.mjs" dev "$@"\n`,
  );
}
