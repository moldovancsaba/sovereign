const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "../..");
const appDir = path.join(repoRoot, "src/app");

function walk(root, predicate) {
  const results = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) {
      results.push(...walk(absolute, predicate));
      continue;
    }
    if (predicate(absolute)) {
      results.push(absolute);
    }
  }
  return results.sort();
}

function relative(absolute) {
  return path.relative(repoRoot, absolute);
}

const pageFiles = walk(appDir, (file) => file.endsWith("/page.tsx"));
const tsxFiles = walk(appDir, (file) => file.endsWith(".tsx"));

const missingDynamic = [];
for (const file of pageFiles) {
  const source = fs.readFileSync(file, "utf8");
  if (!source.includes('export const dynamic = "force-dynamic";')) {
    missingDynamic.push(relative(file));
  }
}

const googleFontUsage = [];
for (const file of tsxFiles) {
  const source = fs.readFileSync(file, "utf8");
  if (source.includes("next/font/google")) {
    googleFontUsage.push(relative(file));
  }
}

if (missingDynamic.length || googleFontUsage.length) {
  if (missingDynamic.length) {
    console.error("[sovereign-render-contract-e2e] missing force-dynamic:");
    for (const file of missingDynamic) console.error(`- ${file}`);
  }
  if (googleFontUsage.length) {
    console.error("[sovereign-render-contract-e2e] disallowed next/font/google usage:");
    for (const file of googleFontUsage) console.error(`- ${file}`);
  }
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      auditedPages: pageFiles.length,
      auditedTsxFiles: tsxFiles.length
    },
    null,
    2
  )
);
