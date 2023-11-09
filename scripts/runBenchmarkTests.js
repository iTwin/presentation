/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

/**
 * Purpose of this script is to detect @internal APIs exposed through the barrel file of the given package.
 * That's a problem because:
 * - @internal APIs may expose dependencies that don't need to be specified as peer dependencies, making it difficult
 *   to identify whether a specific import should be a peer dependency or not.
 * - Consumers import contents of our package through the barrel file. Including @internal APIs there causes consumers
 *   to see those APIs as available for them to use.
 */

"use strict";

const { execSync, spawn } = require("child_process");
const { Socket } = require("net");
const path = require("path");

// get info about root package
const [{ path: workspaceRootPath }] = JSON.parse(execSync("pnpm list -w --only-projects --json", { encoding: "utf-8" }));

// on windows child processes are left dangling unless we kill the whole process tree...
if (process.platform === "win32") {
  process.on("exit", () => {
    execSync(`taskkill /pid ${process.pid} /t /f`, { shell: true });
  });
}

// set up benchmark tests
execSync(`npm run benchmark:setup`, {
  cwd: path.join(workspaceRootPath, "apps/load-tests/tests"),
  shell: true,
  stdio: "inherit",
});

async function main() {
  const BACKEND_PORT = 5001;
  const BACKEND_TIMEOUT = 60 * 1000; // 1 minute;

  // ensure 5001 port used by the backend is available
  if (!(await waitWithTimeout(async () => isPortAvailable(BACKEND_PORT), BACKEND_TIMEOUT))) {
    console.error(`Backend port ${BACKEND_PORT} is not available, aborting.`);
    process.exit(1);
  }

  // start the backend process
  console.log("Starting the backend...");
  const backendProcess = spawn(`npm run start`, {
    cwd: path.join(workspaceRootPath, "apps/load-tests/backend"),
    shell: true,
    stdio: "inherit",
  });
  backendProcess.on("error", (err) => {
    console.error(`BACKEND ERROR: ${err.message}`);
    process.exitCode = 1;
  });

  // wait for the backend to start listening on port 5001
  if (!(await waitWithTimeout(async () => isPortTaken(BACKEND_PORT), BACKEND_TIMEOUT))) {
    console.error(`Backend failed to start listening in ${BACKEND_TIMEOUT / 1000} seconds`);
    process.exit(1);
  }
  console.log("Backend is listening, starting the benchmark...");

  // run the benchmark tests
  try {
    execSync(`npm run benchmark`, {
      cwd: path.join(workspaceRootPath, "apps/load-tests/tests"),
      shell: true,
      stdio: "inherit",
    });
    console.log(`tests complete`);
  } catch (e) {
    console.error(`TESTS ERROR: ${err.message}`);
    process.exitCode = 1;
  }

  // we still have child processes running, so this one won't exit - need to tell it explicitly
  process.exit();
}

async function waitWithTimeout(predicate, timeout) {
  let timer = new Date();
  let value;
  while (!(value = await predicate()) && Date.now() - timer < timeout) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return value;
}

async function isPortTaken(port) {
  return !(await isPortAvailable(port));
}
async function isPortAvailable(port) {
  const socket = new Socket();
  const result = await new Promise((resolve) => {
    socket.once("error", () => resolve(true));
    socket.connect(port, "localhost", () => resolve(false));
  });
  socket.destroy();
  return result;
}

main();
