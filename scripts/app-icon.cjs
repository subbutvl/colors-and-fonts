// Renders the Huetype app icon (1024 x 1024 PNG) with Playwright, matching
// the sidebar brand mark: a rounded square with the brand conic gradient and
// a white loupe ring around a dark sample dot.
// `npm run icon` writes src-tauri/icons/app-icon.png, then runs `tauri icon`
// on it and removes the mobile sizes we do not ship.
const { execSync } = require("node:child_process");
const fs = require("node:fs");
const { chromium } = require("playwright");
const dir = "src-tauri/icons";
const out = `${dir}/app-icon.png`;
const html = `<!doctype html><style>
  html, body { margin: 0; background: transparent; }
  .sq { position: relative; width: 1024px; height: 1024px; border-radius: 232px; overflow: hidden;
    background: conic-gradient(from 200deg, #ff6a88, #f2b84b, #3ccf8e, #7c8cff, #ff6a88); }
  .sq::after { content: ""; position: absolute; inset: 0;
    background: radial-gradient(circle at 28% 18%, rgba(255,255,255,.30), transparent 62%); }
  .ring { position: absolute; left: 50%; top: 50%; width: 560px; height: 560px; margin: -280px;
    border-radius: 50%; border: 110px solid #fff; box-sizing: border-box;
    box-shadow: 0 20px 44px rgba(0,0,0,.20), inset 0 10px 24px rgba(0,0,0,.12); }
  .dot { position: absolute; left: 50%; top: 50%; width: 170px; height: 170px; margin: -85px;
    border-radius: 50%; background: #16161d; }
</style><div class="sq"><div class="ring"></div><div class="dot"></div></div>`;
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1024, height: 1024 } });
  await page.setContent(html);
  await page.screenshot({ path: out, omitBackground: true });
  await browser.close();
  console.log(`wrote ${out}`);
  execSync(`npx tauri icon ${out} -o ${dir}`, { stdio: "inherit" });
  for (const extra of ["android", "ios", "64x64.png"]) fs.rmSync(`${dir}/${extra}`, { recursive: true, force: true });
  fs.copyFileSync(`${dir}/32x32.png`, "public/favicon.png");
})();
