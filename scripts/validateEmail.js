/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

const emailPattern = "[^@]+@users\\.noreply\\.github\\.com";
const emailMatch = new RegExp(emailPattern);
const email = process.env.GIT_AUTHOR_EMAIL;

if (!emailMatch.test(email)) {
  console.log(`Git commits should be using an e-mail like this pattern: "${emailPattern}"`);
  console.log(`But yours is configured like this: ${email}`);
  console.log(`To fix it, you can use command like this:`);
  console.log(`git config --local user.email "mrexample@users.noreply.github.com"`);
  process.exit(1);
}
