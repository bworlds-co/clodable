import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { chromium } from "playwright";
import { type Locale, languages } from "../packages/i18n/src/index.ts";
import { french } from "../packages/i18n/src/mod.ts";

type Localized = Record<Locale, string>;
type Block =
  | { type: "text" | "quote"; text: Localized; tone?: "note" | "muted" }
  | { type: "image"; asset: string; width: number }
  | { type: "link"; ref: string }
  | { type: "columns"; ratio: "equal" | "wide-left"; columns: Block[][] };
interface Section {
  id: string;
  kind?: "callout";
  title: Localized;
  blocks: Block[];
}
interface Guide {
  id: string;
  title: Localized;
  description: Localized;
  captureNotes: Localized;
  pages: {
    title: Localized;
    subtitle: Localized;
    sections: (Section | { shared: string })[];
  }[];
}
interface Asset {
  file: string;
  width: number;
  height: number;
  sha256: string;
  caption: Localized;
  capturedAt: string;
  pluginVersion: string | null;
  claudeVersion: string | null;
  highlight?: [number, number, number, number];
}
interface Catalog {
  locales: Record<
    Locale,
    { name: string; screenshotNote: string; footer: string; generated: string }
  >;
  verifiedAt: string;
  verifiedPluginVersion: string;
  controls: Record<string, string>;
  externalControls: Record<string, Localized>;
  links: Record<string, { url: string; label: Localized }>;
}

const root = resolve(import.meta.dirname, "..");
const tutorials = resolve(root, "docs/tutorials");
const locales = Object.keys(languages) as Locale[];
const modCatalogs: Partial<Record<Locale, Record<string, string>>> = { fr: french };
const args = new Set(process.argv.slice(2));
for (const arg of args) {
  if (!["--check", "--links", "--sources-only"].includes(arg)) {
    throw new Error(`Unknown guide option: ${arg}`);
  }
}
if (args.size > 1) throw new Error("Choose only one guide option.");

async function json<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(resolve(tutorials, file), "utf8")) as T;
}
const catalog = await json<Catalog>("catalog.json");
const shared = await json<Record<string, Section>>("shared.json");
const assets = await json<Record<string, Asset>>("assets/screenshots.json");
const guides: Guide[] = [];
for (const entry of await readdir(tutorials, { withFileTypes: true })) {
  if (!entry.isDirectory() || entry.name === "assets") continue;
  const guide = await json<Guide>(`${entry.name}/guide.json`);
  if (guide.id !== entry.name) throw new Error(`Guide id must match its folder: ${entry.name}`);
  guides.push(guide);
}
guides.sort((a, b) => a.id.localeCompare(b.id));
if (!guides.length) throw new Error("No guide sources found.");
if (Object.keys(catalog.locales).sort().join() !== locales.sort().join()) {
  throw new Error("Guide languages must match packages/i18n/src/index.ts.");
}

const tokens = (value: string) => [...value.matchAll(/\{\{[^}]+\}\}/g)].map((m) => m[0]).sort();
function validateTranslations(value: unknown, path: string): void {
  if (!value || typeof value !== "object") return;
  if ("en" in value || "fr" in value) {
    const entries = value as Record<string, unknown>;
    for (const locale of locales) {
      if (typeof entries[locale] !== "string" || !entries[locale].trim()) {
        throw new Error(`Missing ${locale} translation at ${path}`);
      }
      if (tokens(entries[locale]).join() !== tokens(String(entries.en)).join()) {
        throw new Error(`UI references differ between languages at ${path}`);
      }
    }
    return;
  }
  for (const [key, item] of Object.entries(value)) validateTranslations(item, `${path}.${key}`);
}
for (const [name, value] of Object.entries({ shared, assets, guides })) {
  validateTranslations(value, name);
}
validateTranslations(catalog.externalControls, "externalControls");
validateTranslations(catalog.links, "links");

const sha256 = (data: Buffer) => createHash("sha256").update(data).digest("hex");
const imageData = new Map<string, Buffer>();
for (const [id, asset] of Object.entries(assets)) {
  if (!/^assets\/screenshots\/[a-z0-9-]+\.png$/.test(asset.file)) {
    throw new Error(`Invalid screenshot path: ${asset.file}`);
  }
  const bytes = await readFile(resolve(tutorials, asset.file));
  if (sha256(bytes) !== asset.sha256) throw new Error(`Update capture metadata for ${id}`);
  if (bytes.readUInt32BE(16) !== asset.width || bytes.readUInt32BE(20) !== asset.height) {
    throw new Error(`Incorrect dimensions for ${id}`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asset.capturedAt)) throw new Error(`Missing capture date: ${id}`);
  if (asset.highlight) {
    const [x, y, w, h] = asset.highlight;
    if (Math.min(x, y) < 0 || Math.min(w, h) <= 0 || x + w > asset.width || y + h > asset.height) {
      throw new Error(`Highlight falls outside ${id}`);
    }
  }
  imageData.set(id, bytes);
}
const fonts = new Map<string, Buffer>();
const fontSources = await json<{ file: string; sha256: string }[]>("assets/fonts/sources.json");
for (const font of fontSources) {
  const bytes = await readFile(resolve(tutorials, "assets/fonts", font.file));
  if (sha256(bytes) !== font.sha256) throw new Error(`Font hash mismatch: ${font.file}`);
  if (font.file.endsWith(".ttf")) fonts.set(font.file, bytes);
}

function section(value: Section | { shared: string }): Section {
  if (!("shared" in value)) return value;
  const result = shared[value.shared];
  if (!result) throw new Error(`Unknown shared section: ${value.shared}`);
  return result;
}

function uiLabel(id: string, locale: Locale): string {
  const key = catalog.controls[id];
  if (!key) throw new Error(`Unknown Clodable control: ${id}`);
  const translated = locale === "en" ? key : modCatalogs[locale]?.[key];
  if (!translated) throw new Error(`Missing ${locale} catalog label for ${key}`);
  return translated.replace("{0}", "").trim();
}
function expand(value: string, locale: Locale): string {
  const expanded = value.replace(/\{\{(ui|external):([^}]+)\}\}/g, (_all, kind, id) => {
    const text = kind === "ui" ? uiLabel(id, locale) : catalog.externalControls[id]?.[locale];
    if (!text) throw new Error(`Unknown ${locale} control: ${kind}:${id}`);
    return `**${text}**`;
  });
  if (expanded.includes("{{")) throw new Error(`Unresolved template: ${expanded}`);
  return expanded;
}
const escapeHTML = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
function inline(value: string, locale: Locale): string {
  return escapeHTML(expand(value, locale))
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}
function assetFor(id: string): Asset {
  const asset = assets[id];
  if (!asset) throw new Error(`Unknown screenshot: ${id}`);
  return asset;
}
function linkFor(id: string) {
  const link = catalog.links[id];
  if (!link || new URL(link.url).protocol !== "https:")
    throw new Error(`Invalid guide link: ${id}`);
  return link;
}

function blockHTML(block: Block, locale: Locale): string {
  switch (block.type) {
    case "text":
      return `<p class="${block.tone ?? "body"}">${inline(block.text[locale], locale)}</p>`;
    case "quote":
      return `<blockquote>${inline(block.text[locale], locale)}</blockquote>`;
    case "link": {
      const link = linkFor(block.ref);
      return `<p class="guide-link"><a href="${escapeHTML(link.url)}">${escapeHTML(link.label[locale])}</a></p>`;
    }
    case "image": {
      const asset = assetFor(block.asset);
      const data = imageData.get(block.asset)?.toString("base64");
      const mark = asset.highlight
        ? `<rect x="${asset.highlight[0]}" y="${asset.highlight[1]}" width="${asset.highlight[2]}" height="${asset.highlight[3]}" rx="5" fill="none" stroke="#B9502B" stroke-width="2"/>`
        : "";
      return `<figure data-asset="${block.asset}" style="max-width:${block.width}px"><svg viewBox="0 0 ${asset.width} ${asset.height}" role="img" aria-label="${escapeHTML(asset.caption[locale])}"><image width="${asset.width}" height="${asset.height}" href="data:image/png;base64,${data}"/>${mark}</svg><figcaption>${escapeHTML(asset.caption[locale])}</figcaption></figure>`;
    }
    case "columns":
      if (block.columns.length !== 2 || !["equal", "wide-left"].includes(block.ratio)) {
        throw new Error("Guide columns need two columns and a known ratio.");
      }
      return `<div class="columns ${block.ratio}">${block.columns.map((items) => `<div>${items.map((b) => blockHTML(b, locale)).join("")}</div>`).join("")}</div>`;
    default:
      throw new Error(`Unknown guide block: ${JSON.stringify(block)}`);
  }
}
function blockMarkdown(block: Block, locale: Locale): string {
  switch (block.type) {
    case "text":
      return expand(block.text[locale], locale);
    case "quote":
      return `> ${expand(block.text[locale], locale)}`;
    case "link": {
      const link = linkFor(block.ref);
      return `[${link.label[locale]}](${link.url})`;
    }
    case "image": {
      const asset = assetFor(block.asset);
      return `![${asset.caption[locale]}](../${asset.file})`;
    }
    case "columns":
      return block.columns
        .flat()
        .map((b) => blockMarkdown(b, locale))
        .join("\n\n");
  }
}
function markdown(guide: Guide, locale: Locale): string {
  const language = catalog.locales[locale];
  const other = locales
    .filter((l) => l !== locale)
    .map((l) => `[${catalog.locales[l].name}](README${l === "en" ? "" : `.${l}`}.md)`)
    .join(" · ");
  let index = 0;
  const sections = guide.pages.flatMap((p) => p.sections).map(section);
  if (new Set(sections.map((s) => s.id)).size !== sections.length) {
    throw new Error(`Duplicate section ids in ${guide.id}`);
  }
  return `<!-- ${language.generated} -->\n\n# ${guide.title[locale]}\n\n${other}\n\n${guide.description[locale]}\n\n${language.screenshotNote}\n\n${sections
    .map((s) =>
      s.kind === "callout"
        ? `> **${s.title[locale]}**\n>\n${s.blocks
            .map((b) => blockMarkdown(b, locale))
            .join("\n\n")
            .split("\n")
            .map((line) => `> ${line}`.trimEnd())
            .join("\n")}`
        : `## ${++index}. ${s.title[locale]}\n\n${s.blocks.map((b) => blockMarkdown(b, locale)).join("\n\n")}`,
    )
    .join(
      "\n\n",
    )}\n\n---\n\n${language.footer} · Clodable ${catalog.verifiedPluginVersion}\n\n${guide.captureNotes[locale]}\n`;
}
const css = await readFile(resolve(tutorials, "template.css"), "utf8");
function html(guide: Guide, locale: Locale): string {
  const language = catalog.locales[locale];
  const fontCSS = [...fonts.entries()]
    .map(
      ([file, bytes]) =>
        `@font-face{font-family:${file.replace(".ttf", "")};font-style:normal;font-weight:100 900;font-display:block;src:url(data:font/ttf;base64,${bytes.toString("base64")}) format('truetype')}`,
    )
    .join("");
  let step = 0;
  return `<!doctype html>\n<html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="${escapeHTML(guide.description[locale])}"><title>${escapeHTML(guide.title[locale])} · Clodable</title><style>${fontCSS}\n${css}</style></head><body>${guide.pages
    .map(
      (p, i) =>
        `<article class="page" data-page="${i + 1}"><header><div class="brand">clodable</div><h1>${escapeHTML(p.title[locale])}</h1><p>${escapeHTML(p.subtitle[locale])}</p>${i === 0 ? `<p class="language-note">${escapeHTML(language.screenshotNote)}</p>` : ""}</header><div class="content">${p.sections
          .map(section)
          .map((s) =>
            s.kind === "callout"
              ? `<aside class="callout" id="${s.id}"><h2>${escapeHTML(s.title[locale])}</h2>${s.blocks.map((b) => blockHTML(b, locale)).join("")}</aside>`
              : `<section class="step" id="${s.id}"><h2><span>${++step}</span>${escapeHTML(s.title[locale])}</h2><div class="step-content">${s.blocks.map((b) => blockHTML(b, locale)).join("")}</div></section>`,
          )
          .join(
            "",
          )}</div><footer><span>${escapeHTML(language.footer)} · Clodable ${catalog.verifiedPluginVersion}</span><span>${i + 1} / ${guide.pages.length}</span></footer></article>`,
    )
    .join(
      "",
    )}<aside class="capture-notes">${escapeHTML(guide.captureNotes[locale])}</aside></body></html>\n`;
}

const documents = guides.flatMap((guide) =>
  locales.map((locale) => ({
    guide,
    locale,
    markdown: markdown(guide, locale),
    html: html(guide, locale),
  })),
);
if (args.has("--links")) {
  for (const link of Object.values(catalog.links)) {
    const response = await fetch(link.url, { signal: AbortSignal.timeout(20_000) });
    await response.body?.cancel();
    if (!response.ok) throw new Error(`${response.status}: ${link.url}`);
    console.log(`Link OK: ${link.url}`);
  }
} else if (args.has("--check")) {
  for (const { guide, locale, markdown: expected } of documents) {
    const file = resolve(tutorials, guide.id, `README${locale === "en" ? "" : `.${locale}`}.md`);
    const actual = await readFile(file, "utf8").catch(() => "");
    if (actual !== expected) throw new Error(`${file} is stale. Run pnpm guides:build.`);
  }
  console.log(
    `Checked ${guides.length} guides, ${locales.join("/")} translations, catalog labels and ${imageData.size} shared screenshots.`,
  );
} else {
  for (const { guide, locale, markdown: content, html: page } of documents) {
    const suffix = locale === "en" ? "" : `.${locale}`;
    await writeFile(resolve(tutorials, guide.id, `README${suffix}.md`), content);
    await writeFile(resolve(tutorials, guide.id, `${guide.id}${suffix}.html`), page);
  }
  if (!args.has("--sources-only")) {
    const browser = await chromium.launch({ channel: "chromium", headless: true });
    try {
      const page = await browser.newPage();
      await page.emulateMedia({ media: "print" });
      const layoutErrors: string[] = [];
      for (const { guide, locale, html: content } of documents) {
        await page.setContent(content, { waitUntil: "load" });
        await page.evaluate(() => document.fonts.ready);
        const overflow = await page.evaluate(() =>
          [...document.querySelectorAll<HTMLElement>(".page")].flatMap((sheet) => {
            const footer = sheet.querySelector("footer")!.getBoundingClientRect();
            const body = sheet.querySelector(".content")!.getBoundingClientRect();
            const extra = Math.ceil(body.bottom - footer.top + 12);
            return extra > 0 || sheet.scrollWidth > sheet.clientWidth
              ? [{ page: sheet.dataset.page, extraPixels: extra }]
              : [];
          }),
        );
        if (overflow.length) {
          layoutErrors.push(`${guide.id}/${locale} overflows: ${JSON.stringify(overflow)}`);
          continue;
        }
        const file = resolve(
          root,
          "output/pdf",
          `${guide.id}${locale === "en" ? "" : `.${locale}`}.pdf`,
        );
        await mkdir(dirname(file), { recursive: true });
        await page.pdf({
          path: file,
          preferCSSPageSize: true,
          printBackground: true,
          tagged: true,
        });
        console.log(`Built ${guide.id}/${locale}: ${guide.pages.length} pages`);
      }
      if (layoutErrors.length) throw new Error(layoutErrors.join("\n"));
    } finally {
      await browser.close();
    }
  }
}
