/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
"use strict";

const { spawn } = require("child_process");
const fg = require("fast-glob");

const [_node, _script, ...targets] = process.argv;
if (!targets.length) {
  console.error(`Fail! Please specify the "targets" argument as list of globs to the target markdowns.`);
  process.exit(1);
}

let hasError = false;
let combinedStdout = "";
let combinedStderr = "";

const filePaths = targets.flatMap((pattern) => fg.sync(pattern, { dot: true }));

Promise.all(
  filePaths.map(
    (filePath) =>
      new Promise((resolve) => {
        // TODO: fix false negatives for `npmjs.com` links. https://github.com/iTwin/presentation/issues/1116
        const p = spawn("pnpm", ["markdown-link-check", "-a", "200,403", filePath], { shell: true });

        let myStdout = "";
        p.stdout.on("data", (data) => (myStdout += data));

        let myStderr = "";
        p.stderr.on("data", (data) => (myStderr += data));

        p.on("close", (code) => {
          combinedStdout += myStdout;
          combinedStderr += myStderr;
          hasError |= !!code;
          resolve();
        });
      }),
  ),
).then(() => {
  process.stdout.write(combinedStdout);
  process.stderr.write(combinedStderr);

  console.log();
  if (hasError) {
    console.error(`Markdowns validation failed.`);
    process.exit(1);
  }
  console.log(`Markdowns validation succeeded.`);
});
