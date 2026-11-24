// Generates assets/languages.svg from ALL repos owned by the token's user
// (public + private). Only aggregate numbers are written: no repo names.
// Usage: STATS_TOKEN=<token with repo read access> node scripts/stats.mjs
import { mkdir, writeFile } from "node:fs/promises";

const token = process.env.STATS_TOKEN || process.env.GH_TOKEN;
if (!token) {
  console.error("STATS_TOKEN is not set; skipping.");
  process.exit(0);
}

const TOP = 8;
const EXCLUDE_LANGS = new Set(["Jupyter Notebook"]);
const COLORS = {
  JavaScript: "#f1e05a", TypeScript: "#3178c6", Python: "#3572A5", HCL: "#844FBA",
  Go: "#00ADD8", PowerShell: "#5391FE", CSS: "#663399", HTML: "#e34c26",
  Java: "#b07219", C: "#555555", Shell: "#89e051", PHP: "#4F5D95", SCSS: "#c6538c",
  Dockerfile: "#384d54", "Go Template": "#00ADD8", Bicep: "#519aba", PLpgSQL: "#336790",
  Vue: "#41b883", Svelte: "#ff3e00",
};

async function gh(path) {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "profile-stats",
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json();
}

const repos = [];
for (let page = 1; ; page++) {
  const batch = await gh(`/user/repos?affiliation=owner&per_page=100&page=${page}`);
  repos.push(...batch);
  if (batch.length < 100) break;
}
const own = repos.filter((r) => !r.fork && !r.archived);

const totals = {};
for (const r of own) {
  // Each repo counts once, split by its own byte share, so one huge repo
  // (vendored frameworks, generated code) can't dominate the chart.
  const langs = Object.entries(await gh(`/repos/${r.full_name}/languages`))
    .filter(([lang]) => !EXCLUDE_LANGS.has(lang));
  const repoBytes = langs.reduce((a, [, b]) => a + b, 0);
  if (!repoBytes) continue;
  for (const [lang, bytes] of langs) {
    totals[lang] = (totals[lang] || 0) + bytes / repoBytes;
  }
}

const sum = Object.values(totals).reduce((a, b) => a + b, 0) || 1;
const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);
const top = sorted.slice(0, TOP).map(([name, bytes]) => ({ name, pct: (bytes / sum) * 100 }));
const otherPct = 100 - top.reduce((a, l) => a + l.pct, 0);
if (otherPct > 0.05) top.push({ name: "Other", pct: otherPct });

const privateCount = own.filter((r) => r.private).length;
const W = 360, PAD = 22, BAR_Y = 52, BAR_W = W - PAD * 2;
const rows = Math.ceil(top.length / 2);
const H = BAR_Y + 26 + rows * 24 + 30;
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const color = (n) => COLORS[n] || "#8b949e";

let x = PAD;
const bar = top.map((l) => {
  const w = (l.pct / 100) * BAR_W;
  const rect = `<rect x="${x.toFixed(2)}" y="${BAR_Y}" width="${Math.max(w, 0.5).toFixed(2)}" height="8" fill="${color(l.name)}"/>`;
  x += w;
  return rect;
}).join("");

const legend = top.map((l, i) => {
  const cx = PAD + (i % 2) * (BAR_W / 2);
  const cy = BAR_Y + 34 + Math.floor(i / 2) * 24;
  return `<g transform="translate(${cx},${cy})"><circle cx="5" cy="-4" r="5" fill="${color(l.name)}"/><text x="16" y="0" class="t">${esc(l.name)} <tspan class="m">${l.pct.toFixed(1)}%</tspan></text></g>`;
}).join("");

const date = new Date().toISOString().slice(0, 10);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Most used languages across all repositories">
<style>.h{font:600 17px 'Segoe UI',Ubuntu,sans-serif;fill:#58a6ff}.t{font:400 12px 'Segoe UI',Ubuntu,sans-serif;fill:#c9d1d9}.m{fill:#8b949e}.f{font:400 10.5px 'Segoe UI',Ubuntu,sans-serif;fill:#8b949e}</style>
<rect width="${W}" height="${H}" rx="6" fill="#0d1117"/>
<text x="${PAD}" y="34" class="h">Languages · all repos</text>
<clipPath id="c"><rect x="${PAD}" y="${BAR_Y}" width="${BAR_W}" height="8" rx="4"/></clipPath>
<g clip-path="url(#c)">${bar}</g>
${legend}
<text x="${PAD}" y="${H - 14}" class="f">${own.length} repos (${privateCount} private) · updated ${date}</text>
</svg>
`;

await mkdir("assets", { recursive: true });
await writeFile("assets/languages.svg", svg);
console.log(`Wrote assets/languages.svg: ${own.length} repos, ${privateCount} private`);
console.log(top.map((l) => `${l.name} ${l.pct.toFixed(1)}%`).join(", "));
