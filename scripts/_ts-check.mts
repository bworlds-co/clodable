import { chromium } from "playwright";

const b = await chromium.launch();
const p = await b.newPage();
p.on("console", (m) => {
  if (/hydrat/i.test(m.text())) console.log(m.text().slice(0, 2500));
});
await p.goto(process.argv[2]!, { waitUntil: "networkidle" });
await p.waitForTimeout(800);
await b.close();
