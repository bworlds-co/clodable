/** Writes the brand SVGs to docs/assets and re-renders the design sheet. */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { lockupSvg, logoSvg } from "../packages/design/src/index.ts";

const dir = resolve(import.meta.dirname, "../docs/assets");
writeFileSync(resolve(dir, "logo.svg"), logoSvg({ size: 64, label: "Clodable" }));
writeFileSync(
  resolve(dir, "logo-dark.svg"),
  logoSvg({ size: 64, clay: "#E5764F", groove: "#15110E", label: "Clodable" }),
);
writeFileSync(resolve(dir, "favicon.svg"), logoSvg({ size: 32, small: true, label: "Clodable" }));
writeFileSync(resolve(dir, "lockup.svg"), lockupSvg({ height: 60 }));
writeFileSync(
  resolve(dir, "lockup-dark.svg"),
  lockupSvg({ height: 60, ink: "#F3EEE7", clay: "#E5764F", groove: "#15110E" }),
);
console.log("exported");
