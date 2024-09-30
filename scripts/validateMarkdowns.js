/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
"use strict";

const { spawn, spawnSync } = require("child_process");
const fg = require("fast-glob");

const [_node, _script, ...targets] = process.argv;
if (!targets.length) {
  console.error(`Fail! Please specify the "targets" argument as list of globs to the target markdowns.`);
  process.exit(1);
}

let hasError = false;
let combinedOutput = "";

const filePaths = targets.flatMap((pattern) => fg.sync(pattern, { dot: true }));

// Promise.all(
//   filePaths.map(
//     (filePath) =>
//       new Promise((resolve) => {
//         const p = spawn("npx", ["markdown-link-check", filePath], { shell: true, encoding: "utf8" });
//
//         let myStdout = "";
//         p.stdout.on("data", (data) => (myStdout += data));
//
//         p.on("close", (code) => {
//           combinedOutput += myStdout;
//           hasError |= !!code;
//           resolve();
//         });
//       }),
//   ),
// ).then(() => {
//   process.stdout.write(combinedOutput);
//
//   console.log();
//   if (hasError) {
//     console.error(`Markdowns validation failed.`);
//     process.exit(1);
//   }
//   console.log(`Markdowns validation succeeded.`);
// });

filePaths.forEach((filePath) => {
  const res = spawnSync("npx", ["markdown-link-check", filePath], { shell: true, stdio: "inherit" });
  hasError |= !!res.status;
});

console.log();
if (hasError) {
  console.error(`Markdowns validation failed.`);
  process.exit(1);
}
console.log(`Markdowns validation succeeded.`);