/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { defineConfig } from "tsdown";
import babel from "@rolldown/plugin-babel";
import { reactCompilerPreset } from "@vitejs/plugin-react";
import pkg from "./package.json" with { type: "json" };

const bundledPackages = ["@stratakit/structures", "@stratakit/bricks", "@stratakit/internal-utils"];
const declaredPackages = [...Object.keys(pkg.dependencies), ...Object.keys(pkg.peerDependencies)];
assertBundledPackagesUseDeclaredVersions();

export default defineConfig({
  entry: [
    "./src/presentation-hierarchies-react.ts",
    "./src/presentation-hierarchies-react-stratakit.ts",
    "./src/presentation-hierarchies-react-extract.ts",
  ],
  outDir: "./lib",
  format: ["esm"],
  fixedExtension: false,
  banner: ({ fileName }) => (fileName === "presentation-hierarchies-react-stratakit.js" ? '"use client";' : undefined),
  deps: {
    // StrataKit component packages are an implementation detail of the `/stratakit` entry, so we bundle them.
    // The build fails if they pull in anything else that isn't declared in our package.json, or if output
    // imports a package we don't declare, so upstream dependency changes can't break consumers silently.
    alwaysBundle: bundledPackages.map((name) => new RegExp(`^${name}(/|$)`)),
    onlyBundle: bundledPackages,
    onlyImport: declaredPackages,
    neverBundle: [/\.css$/],
  },
  plugins: [babel({ presets: [reactCompilerPreset({ target: "18" })] })],
});

/**
 * Bundled packages' imports of packages we declare resolve to *our* copy at consumer side. Make sure that's the
 * same version they're built against - otherwise an upstream range bump (e.g. `@ariakit/react` 0.4 -> 0.5) would
 * go unnoticed.
 */
function assertBundledPackagesUseDeclaredVersions() {
  const getPackageJson = (name: string, from: string) => {
    const path = createRequire(from).resolve(`${name}/package.json`);
    return {
      path,
      ...(JSON.parse(readFileSync(path, "utf8")) as {
        version: string;
        dependencies?: object;
        peerDependencies?: object;
      }),
    };
  };
  for (const bundled of bundledPackages) {
    const bundledPkg = getPackageJson(bundled, getPackageJson("@stratakit/structures", import.meta.url).path);
    for (const dep of [
      ...Object.keys(bundledPkg.dependencies ?? {}),
      ...Object.keys(bundledPkg.peerDependencies ?? {}),
    ]) {
      if (!declaredPackages.includes(dep)) {
        continue;
      }
      const theirs = getPackageJson(dep, bundledPkg.path).version;
      const ours = getPackageJson(dep, import.meta.url).version;
      if (theirs !== ours) {
        throw new Error(
          `Bundled "${bundled}" is built against "${dep}@${theirs}", but our declared dependency resolves to "${dep}@${ours}". Update "${dep}" version in package.json.`,
        );
      }
    }
  }
}
