/**
 * Translation review round-trip for native-speaker reviewers.
 *
 *   npm run i18n:export [-- out.csv]   → CSV with every key: namespace, key, English, zh-CN, it
 *   npm run i18n:import -- in.csv      → writes the reviewed zh-CN / it values back into the JSON files
 *
 * The CSV opens in Excel (UTF-8 with BOM so Chinese shows correctly). Reviewers edit only the
 * zh-CN and it columns; keys and English are context. {{placeholders}} and <tags> must stay
 * unchanged — run `npm run i18n:check` after importing.
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const LOCALES_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "locales");
const LANGS = ["en", "zh-CN", "it"];
const TARGETS = ["zh-CN", "it"];
const HEADER = ["namespace", "key", "en", "zh-CN", "it"];

const flatten = (obj, prefix = "", out = {}) => {
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === "object") flatten(v, path, out);
    else out[path] = String(v);
  }
  return out;
};

const setPath = (obj, path, value) => {
  const parts = path.split(".");
  let node = obj;
  for (const p of parts.slice(0, -1)) node = node[p] ??= {};
  node[parts.at(-1)] = value;
};

const sortKeys = (v) =>
  v && typeof v === "object" && !Array.isArray(v)
    ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])]))
    : v;

const csvCell = (s) => (/[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c !== ""));
}

const namespaces = readdirSync(join(LOCALES_DIR, "en")).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5));
const load = (lang, ns) => JSON.parse(readFileSync(join(LOCALES_DIR, lang, `${ns}.json`), "utf8"));

const [command, file] = process.argv.slice(2);

if (command === "export") {
  const lines = [HEADER.join(",")];
  for (const ns of namespaces) {
    const flat = Object.fromEntries(LANGS.map((l) => [l, flatten(load(l, ns))]));
    const keys = new Set(LANGS.flatMap((l) => Object.keys(flat[l])));
    for (const key of [...keys].sort()) {
      lines.push([ns, key, ...LANGS.map((l) => flat[l][key] ?? "")].map(csvCell).join(","));
    }
  }
  const out = file || "i18n-review.csv";
  writeFileSync(out, "﻿" + lines.join("\r\n") + "\r\n", "utf8");
  console.log(`Exported ${lines.length - 1} strings to ${out}`);
} else if (command === "import") {
  if (!file) { console.error("Usage: npm run i18n:import -- reviewed.csv"); process.exit(1); }
  const rows = parseCsv(readFileSync(file, "utf8").replace(/^﻿/, ""));
  const header = rows.shift();
  if (HEADER.some((h, i) => header[i] !== h)) { console.error(`Unexpected header: ${header.join(",")}`); process.exit(1); }
  const changed = {};
  let updates = 0;
  for (const [ns, key, , zh, it] of rows) {
    if (!namespaces.includes(ns)) { console.error(`Unknown namespace "${ns}" (key ${key})`); process.exit(1); }
    for (const [lang, value] of [["zh-CN", zh], ["it", it]]) {
      if (value === undefined || value === "") continue;
      const data = (changed[`${lang}/${ns}`] ??= load(lang, ns));
      if (flatten(data)[key] !== value) { setPath(data, key, value); updates++; }
    }
  }
  for (const [id, data] of Object.entries(changed)) {
    const [lang, ns] = id.split("/");
    writeFileSync(join(LOCALES_DIR, lang, `${ns}.json`), JSON.stringify(sortKeys(data), null, 2) + "\n", "utf8");
  }
  console.log(`Imported ${updates} changed translation(s) for ${TARGETS.join(", ")}. Now run: npm run i18n:check`);
} else {
  console.error("Usage: node scripts/i18n-review.mjs export [out.csv] | import <in.csv>");
  process.exit(1);
}
