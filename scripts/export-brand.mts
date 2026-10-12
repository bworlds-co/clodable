/** Writes the brand SVGs to docs/assets and re-renders the design sheet. */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { lockupSvg, logoSvg, wordmarkSvg } from "../packages/design/src/index.ts";

const dir = resolve(import.meta.dirname, "../docs/assets");
// One mark for light and dark backgrounds; only the lockup's word changes color.
writeFileSync(resolve(dir, "logo.svg"), logoSvg({ size: 64, label: "Clodable" }));
writeFileSync(resolve(dir, "favicon.svg"), logoSvg({ size: 32, label: "Clodable" }));
writeFileSync(resolve(dir, "lockup.svg"), lockupSvg());
writeFileSync(resolve(dir, "lockup-dark.svg"), lockupSvg({ ink: "#F3EEE7" }));
// The README header puts the word under a drawing of the mascot.
writeFileSync(resolve(dir, "wordmark.svg"), wordmarkSvg({ height: 40 }));
writeFileSync(resolve(dir, "wordmark-dark.svg"), wordmarkSvg({ height: 40, ink: "#F3EEE7" }));
console.log("exported");
