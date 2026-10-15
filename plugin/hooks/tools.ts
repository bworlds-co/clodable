// The command-line tools Clodable needs on the builder's computer, and the Node.js it fetches when
// there's none. Pure facts and words: no `$`.

/** The oldest Node.js Clodable runs on (its CLI's `engines`). */
const MIN_NODE = [20, 19] as const;

/** Whether a Node.js version ("24.21.0", "v20.18.1") is recent enough. */
export function nodeOk(version: string): boolean {
  const [major = 0, minor = 0] = version.replace(/^v/, "").split(".").map(Number);
  return major > MIN_NODE[0] || (major === MIN_NODE[0] && minor >= MIN_NODE[1]);
}

/**
 * The Node.js Clodable fetches for a builder who has none: an LTS release from nodejs.org, checked
 * against its published SHA-256, keyed by what `uname -sm` prints.
 */
export const NODE_VERSION = "v24.21.0";
export const NODE_BUILDS: Record<string, { name: string; sha256: string }> = {
  "Darwin arm64": {
    name: "node-v24.21.0-darwin-arm64",
    sha256: "bed7eea5325e1108f32ce5228ddd6a5f0f08a499ee42aa7442aea583702f6057",
  },
  "Darwin x86_64": {
    name: "node-v24.21.0-darwin-x64",
    sha256: "1462cb3b3046b815cf8ea436d3da450ec1a9f11dac7e5a46b0ada5305d7e8097",
  },
  "Linux aarch64": {
    name: "node-v24.21.0-linux-arm64",
    sha256: "724282c3b43aec998aa9527380465b45d229e021b58035f5f4f63095eabfe5d5",
  },
  "Linux x86_64": {
    name: "node-v24.21.0-linux-x64",
    sha256: "6e1db87ef58b8819e5d5402eff1536491b18edd8eb7bee5ef7897876e88dc5ff",
  },
};

export const nodeUrl = (name: string) => `https://nodejs.org/dist/${NODE_VERSION}/${name}.tar.gz`;

/**
 * Where the tools Clodable fetches go, on macOS and Linux (`uname -s`): the `tools` folder in the
 * plugin's data folder, which Claude Code keeps across updates and removes with the plugin. The
 * CLI reads it from `CLODABLE_TOOLS_DIR`. A plugin loaded from a folder of its own (a developer's)
 * has no data folder: Clodable's cache, as the CLI's `cacheDir()` has it. Undefined on Windows,
 * where the builder installs Node.js themselves for now.
 */
export function toolsFolder(
  root: string,
  system: string,
  env: { home?: string; xdg?: string; override?: string },
): string | undefined {
  if (env.override) return env.override;
  if (!system.startsWith("Darwin") && !system.startsWith("Linux")) return undefined;
  const data = pluginDataFolder(root);
  if (data) return `${data}/tools`;
  if (!env.home) return undefined;
  return system.startsWith("Darwin")
    ? `${env.home}/Library/Caches/clodable`
    : `${env.xdg || `${env.home}/.cache`}/clodable`;
}

/**
 * The plugin's data folder (`${CLAUDE_PLUGIN_DATA}` in a plugin's hooks), which mods aren't told:
 * an installed plugin's folder is `<plugins>/cache/<marketplace>/<plugin>/<version>`, its data
 * `<plugins>/data/<plugin>-<marketplace>`, with anything but letters, digits, `_` and `-` as `-`.
 */
export function pluginDataFolder(root: string): string | undefined {
  const parts = root.replace(/\/+$/, "").split("/");
  if (parts.length < 6 || parts.at(-4) !== "cache") return undefined;
  const id = `${parts.at(-2)}@${parts.at(-3)}`.replace(/[^A-Za-z0-9_-]/g, "-");
  return [...parts.slice(0, -4), "data", id].join("/");
}

/** Prints the Node.js version and where it runs from, as JSON: `node -e NODE_FACTS`. */
export const NODE_FACTS =
  "process.stdout.write(JSON.stringify([process.versions.node, process.execPath]))";

/** The full path of a Node.js recent enough for Clodable, from what NODE_FACTS printed. */
export function nodeFrom(printed: string): string | undefined {
  try {
    const [version, path] = JSON.parse(printed) as unknown[];
    return typeof version === "string" && typeof path === "string" && path && nodeOk(version)
      ? path
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Downloads the Node.js build named in the environment, checks it, unpacks it in Clodable's tools
 * folder, and links node, npm and npx in its bin folder. Only macOS's and Linux's own tools.
 */
export const FETCH_NODE = `set -e
PATH=/usr/bin:/bin:/usr/sbin:/sbin:$PATH
mkdir -p "$CLODABLE_NODE_DIR" "$CLODABLE_BIN"
work=$(mktemp -d "$CLODABLE_NODE_DIR/.download-XXXXXX")
trap 'rm -rf "$work"' EXIT
curl -fsSL --retry 2 "$CLODABLE_NODE_URL" -o "$work/node.tar.gz"
if command -v shasum >/dev/null 2>&1; then sum=$(shasum -a 256 "$work/node.tar.gz"); else sum=$(sha256sum "$work/node.tar.gz"); fi
[ "\${sum%% *}" = "$CLODABLE_NODE_SHA" ] || { echo "The download didn't match its checksum." >&2; exit 1; }
tar -xzf "$work/node.tar.gz" -C "$work"
rm -rf "$CLODABLE_NODE_DIR/$CLODABLE_NODE_NAME"
mv "$work/$CLODABLE_NODE_NAME" "$CLODABLE_NODE_DIR/$CLODABLE_NODE_NAME"
for tool in node npm npx; do ln -sfn "$CLODABLE_NODE_DIR/$CLODABLE_NODE_NAME/bin/$tool" "$CLODABLE_BIN/$tool"; done
`;

/** A PATH with Clodable's bin folder first (its own Node.js) or last (the builder's own first). */
export function pathWith(path: string, bin: string, first: boolean): string {
  const rest = path.split(":").filter((p) => p && p !== bin);
  return (first ? [bin, ...rest] : [...rest, bin]).join(":");
}
