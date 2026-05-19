/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import fs from "node:fs";
import path from "node:path";

const workspaceFile = path.join(process.cwd(), "pnpm-workspace.yaml");

if (!fs.existsSync(workspaceFile)) {
  console.error(`Error: ${workspaceFile} not found`);
  process.exit(1);
}

const content = fs.readFileSync(workspaceFile, "utf-8");

// Find the catalogs section: starts at "catalogs:" and ends at the next top-level key (non-indented, non-empty line)
const catalogsStart = content.indexOf("\ncatalogs:");
if (catalogsStart === -1) {
  console.log("No catalogs section found. Nothing to do.");
  process.exit(0);
}

// Find the end of catalogs section (next top-level key or EOF)
const afterCatalogs = content.slice(catalogsStart + 1);
const nextTopLevelMatch = afterCatalogs.match(/\n[a-zA-Z]/);
const catalogsEnd = nextTopLevelMatch ? catalogsStart + 1 + nextTopLevelMatch.index : content.length;

const before = content.slice(0, catalogsStart + 1);
const catalogsSection = content.slice(catalogsStart + 1, catalogsEnd);
const after = content.slice(catalogsEnd);

// Match lines with bare -dev.N versions (no ^, ~, >=, >, <= prefix)
const versionPattern = /^(\s+'[^']+':)\s+(\d+\.\d+\.\d+-dev\.\d+)\s*$/gm;

const changes = [];
const fixedCatalogs = catalogsSection.replace(versionPattern, (match, prefix, version) => {
  changes.push({ prefix: prefix.trim(), oldVersion: version, newVersion: `^${version}` });
  return `${prefix} ^${version}`;
});

if (changes.length === 0) {
  console.log("All -dev.x versions in catalogs already have ^ prefix. Nothing to do.");
  process.exit(0);
}

const result = before + fixedCatalogs + after;
fs.writeFileSync(workspaceFile, result, "utf-8");

console.log(`Fixed ${changes.length} version(s):`);
for (const { prefix, oldVersion, newVersion } of changes) {
  console.log(`  ${prefix} ${oldVersion} → ${newVersion}`);
}
