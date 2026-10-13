import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { inflateRawSync } from "node:zlib";
import { messageOf } from "../errors.js";
import { exec } from "../exec.js";
import { cacheDir } from "../places.js";

/**
 * PostgreSQL's own tools (pg_restore, pg_dump, psql), which restoring a Lovable Cloud export needs:
 * version 18, built with zstd, the compression Lovable's exports use. Fetched once per computer
 * into the system cache, every file checked against a pinned SHA-256, so builders install nothing.
 *
 * - macOS (Apple silicon and Intel): PostgreSQL's official binaries by EDB, build 18.6-5. Only the
 *   15 files these tools use are read out of the 448 MB archive: 8.8 MB, fetched by byte range.
 * - Linux: the theseus-rs builds, which use the system's own libraries (glibc 2.34+, OpenSSL 3).
 * - Windows: not yet.
 */

export const POSTGRES_BUILD = "18.6-5";

export class ToolUnavailable extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "ToolUnavailable";
  }
}

const EDB_MAC = "https://get.enterprisedb.com/postgresql/postgresql-18.6-5-osx-binaries.zip";

/** [path inside pgsql/, local header offset, compressed size, size, SHA-256], read off the verified zip. */
const MAC_FILES: Array<[string, number, number, number, string]> = [
  [
    "bin/pg_dump",
    12552580,
    413575,
    1055008,
    "578a5ab9c6e2e253f4e676b04b3132f512c30d9f7e84a3553672ca6e9d3b1157",
  ],
  [
    "bin/pg_restore",
    693377,
    213814,
    584464,
    "377a4d87973b2dcec3fb2a6707c441e7c8cbc1f96f771261ac4e4ba4464cc7f1",
  ],
  [
    "bin/psql",
    2698469,
    522895,
    1589680,
    "34f4c1cbe9da29388c5dd151b93971af6c491fb73f886221495581802ea66aa8",
  ],
  [
    "lib/libcom_err.3.0.dylib",
    304965043,
    19054,
    136128,
    "9f68017a65d9bca37223cf545489c27f369658a7051da305728d329c47c90279",
  ],
  [
    "lib/libcrypto.3.dylib",
    389794773,
    3861310,
    12081616,
    "7cdd1de35d5fa2b42f7d7fe7204dde0fb5654f448d8d7210e507de5002a865dd",
  ],
  [
    "lib/libedit.0.dylib",
    414131790,
    167720,
    578144,
    "ce22e17b8bdee00035f9b811015a05f96a00ae78c06ba3f90569d703df78ad8f",
  ],
  [
    "lib/libgssapi_krb5.2.2.dylib",
    393756903,
    285796,
    893568,
    "95fb8ab48428c56c130081a08d1fcdc818fae5c1c0af356a78193c7a922c36d6",
  ],
  [
    "lib/libk5crypto.3.1.dylib",
    415962054,
    159826,
    631328,
    "1e7071723ac5670daa4fc321fd3dc0a7e46a914303a49dd0a5752c65c0382288",
  ],
  [
    "lib/libkrb5.3.3.dylib",
    411291706,
    668842,
    1993392,
    "173d3ed3a9d0c02377b761b4189108e81549e3978b8a2dac07ddd7b66d97f6b1",
  ],
  [
    "lib/libkrb5support.1.1.dylib",
    414017198,
    46457,
    211296,
    "7087d9a21fd00e23db21fcd0ba362228345a4ee55bebf22ee05703e40a9e3d9f",
  ],
  [
    "lib/liblz4.1.10.0.dylib",
    330665977,
    360440,
    1149392,
    "97ee49d29441883c700f88c76f361baf857a2d9743cdac78c220edfb95a39d44",
  ],
  [
    "lib/libpq.5.dylib",
    356409588,
    314242,
    799088,
    "b3bf55621a3234483e736dd8d6eaaaf7279f87f95ef8ebeb363a445546d021d2",
  ],
  [
    "lib/libssl.3.dylib",
    388163690,
    962076,
    2811424,
    "9550178aa376630c107361062ef304de9e27095619039c50bf41c241c7fe6671",
  ],
  [
    "lib/libz.1.3.2.dylib",
    413195285,
    108034,
    338912,
    "74ab9160570a2d2b5b4e92ea4a776f6a660ccad20906c8958c5c15d539fa86e1",
  ],
  [
    "lib/libzstd.1.dylib",
    413303403,
    713712,
    1799696,
    "4c5e77b1231a4bb31e7c62d1b5e77ebd3e5ce25ef3d9ae764702be1f280f51d8",
  ],
];

const LINUX: Record<string, { url: string; sha256: string; dir: string }> = {
  "linux-x64": {
    url: "https://github.com/theseus-rs/postgresql-binaries/releases/download/18.6.0/postgresql-18.6.0-x86_64-unknown-linux-gnu.tar.gz",
    sha256: "bb3d09f876b2383e25a8c9ce09e32d185a03656a23d074f5195542b1b1b3ca61",
    dir: "postgresql-18.6.0-x86_64-unknown-linux-gnu",
  },
  "linux-arm64": {
    url: "https://github.com/theseus-rs/postgresql-binaries/releases/download/18.6.0/postgresql-18.6.0-aarch64-unknown-linux-gnu.tar.gz",
    sha256: "5d2b5e8be9e96bfc3d7f22090057a836ec36d5d092542d8d3b93cc145cf4ee13",
    dir: "postgresql-18.6.0-aarch64-unknown-linux-gnu",
  },
};

const sha256 = (data: Buffer) => createHash("sha256").update(data).digest("hex");

async function fetchRange(url: string, start: number, length: number): Promise<Buffer> {
  const response = await fetch(url, {
    headers: { Range: `bytes=${start}-${start + length - 1}` },
    signal: AbortSignal.timeout(120_000),
  });
  if (response.status !== 206) throw new Error(`the download server answered ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

/** One file out of the EDB zip: its local header, then its deflated bytes, checked. */
async function fetchMacFile(entry: (typeof MAC_FILES)[number]): Promise<Buffer> {
  const [path, offset, compressed, size, hash] = entry;
  const chunk = await fetchRange(EDB_MAC, offset, 30 + 1024 + compressed);
  if (chunk.readUInt32LE(0) !== 0x04034b50) throw new Error(`${path} isn't where it should be`);
  const method = chunk.readUInt16LE(8);
  const start = 30 + chunk.readUInt16LE(26) + chunk.readUInt16LE(28);
  const raw = chunk.subarray(start, start + compressed);
  const data = method === 8 ? inflateRawSync(raw) : raw;
  if (data.length !== size || sha256(data) !== hash) {
    throw new Error(`${path} didn't match its checksum`);
  }
  return data;
}

let ready: Promise<string> | undefined;

/** The folder holding bin/ and lib/, fetched and checked the first time. */
export function postgresHome(): Promise<string> {
  if (process.env.CLODABLE_POSTGRES_HOME)
    return Promise.resolve(process.env.CLODABLE_POSTGRES_HOME);
  ready ??= install().catch((error) => {
    ready = undefined;
    throw error;
  });
  return ready;
}

/** Where one of the tools is, ready to run. */
export async function postgresTool(tool: "pg_restore" | "pg_dump" | "psql"): Promise<string> {
  return join(await postgresHome(), "bin", process.platform === "win32" ? `${tool}.exe` : tool);
}

async function install(): Promise<string> {
  const platform = `${process.platform}-${process.arch}`;
  const home = join(cacheDir(), "postgres", POSTGRES_BUILD);
  if (existsSync(join(home, "bin", "pg_restore"))) return home;
  await mkdir(dirname(home), { recursive: true });
  const work = await mkdtemp(join(dirname(home), ".download-"));
  try {
    if (process.platform === "darwin") {
      // Four at a time: quick, and gentle with the download server.
      for (let i = 0; i < MAC_FILES.length; i += 4) {
        const batch = MAC_FILES.slice(i, i + 4);
        const files = await Promise.all(batch.map(fetchMacFile));
        for (const [index, data] of files.entries()) {
          const target = join(work, batch[index]![0]);
          await mkdir(dirname(target), { recursive: true });
          await writeFile(target, data);
          await chmod(target, 0o755);
        }
      }
    } else if (LINUX[platform]) {
      const { url, sha256: hash, dir } = LINUX[platform]!;
      const response = await fetch(url, { signal: AbortSignal.timeout(300_000) });
      if (!response.ok) throw new Error(`the download server answered ${response.status}`);
      const archive = Buffer.from(await response.arrayBuffer());
      if (sha256(archive) !== hash) throw new Error("the download didn't match its checksum");
      await writeFile(join(work, "postgres.tar.gz"), archive);
      const unpacked = await exec("tar", ["-xzf", "postgres.tar.gz"], {
        cwd: work,
        timeout: 120_000,
      });
      if (unpacked.exitCode !== 0) throw new Error(unpacked.stderr.trim() || "couldn't unpack it");
      await rename(join(work, dir), join(work, "pgsql"));
      await rm(join(work, "postgres.tar.gz"), { force: true });
      await rename(join(work, "pgsql"), join(work, "staged"));
      // The tarball's layout is bin/ lib/ share/ under its folder: keep it as is.
      await rm(home, { recursive: true, force: true });
      await rename(join(work, "staged"), home);
      return home;
    } else {
      throw new ToolUnavailable(
        `Moving a database needs PostgreSQL's tools, which Clodable can't fetch for ${platform} yet.`,
      );
    }
    await rm(home, { recursive: true, force: true });
    await rename(work, home);
    return home;
  } catch (error) {
    if (error instanceof ToolUnavailable) throw error;
    throw new ToolUnavailable(`Couldn't fetch PostgreSQL's tools: ${messageOf(error)}`);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}
