/**
 * i18n check — fails (exit 1) when the translation files drift apart.
 *
 * For every namespace file in src/locales/en/:
 *   - every key in en must exist in zh-CN and it (and no extra keys)
 *   - {{placeholders}} and <tags> must be the same in every language
 *   - no empty translations
 *
 * Plural forms (key_one, key_other, …) are compared by their base key,
 * because languages have different plural forms (Chinese has only _other).
 *
 * Run: npm run i18n:check
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const LOCALES_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "locales");
const SOURCE = "en";
const TARGETS = ["zh-CN", "it"];
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

function flatten(obj, prefix = "", out = {}) {
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === "object") flatten(value, path, out);
    else out[path] = String(value);
  }
  return out;
}

/** { baseKey: [value, ...] } — plural forms grouped under their base key. */
function groupByBaseKey(flat) {
  const groups = {};
  for (const [key, value] of Object.entries(flat)) {
    (groups[key.replace(PLURAL_SUFFIX, "")] ??= []).push(value);
  }
  return groups;
}

/** Sorted, de-duplicated {{placeholders}} and <tags> used across all forms. */
function tokens(values) {
  const found = new Set();
  for (const value of values) {
    for (const m of value.matchAll(/{{\s*([\w.]+)[^}]*}}/g)) found.add(`{{${m[1]}}}`);
    for (const m of value.matchAll(/<\/?([\w]+)\s*\/?>/g)) found.add(`<${m[1]}>`);
  }
  return [...found].sort().join(" ");
}

function load(lang, file) {
  return groupByBaseKey(flatten(JSON.parse(readFileSync(join(LOCALES_DIR, lang, file), "utf8"))));
}

const errors = [];
const files = readdirSync(join(LOCALES_DIR, SOURCE)).filter((f) => f.endsWith(".json"));
let keyCount = 0;

for (const file of files) {
  const source = load(SOURCE, file);
  keyCount += Object.keys(source).length;

  for (const lang of TARGETS) {
    let target;
    try {
      target = load(lang, file);
    } catch (err) {
      errors.push(`${lang}/${file}: ${err.code === "ENOENT" ? "file is missing" : err.message}`);
      continue;
    }

    for (const [key, values] of Object.entries(source)) {
      if (!target[key]) {
        errors.push(`${lang}/${file}: missing key "${key}"`);
        continue;
      }
      if (target[key].some((v) => !v.trim())) {
        errors.push(`${lang}/${file}: empty translation for "${key}"`);
      }
      const expected = tokens(values);
      const actual = tokens(target[key]);
      if (expected !== actual) {
        errors.push(`${lang}/${file}: "${key}" has [${actual}], en has [${expected}]`);
      }
    }
    for (const key of Object.keys(target)) {
      if (!source[key]) errors.push(`${lang}/${file}: extra key "${key}" (not in en)`);
    }
  }
}

if (errors.length > 0) {
  console.error(`i18n check failed (${errors.length} problem${errors.length === 1 ? "" : "s"}):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(`i18n check passed: ${keyCount} keys in ${files.length} namespaces, ${TARGETS.join(", ")} complete.`);
