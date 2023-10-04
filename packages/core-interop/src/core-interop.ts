/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

<<<<<<<< HEAD:packages/hierarchy-builder/src/test/queries/Utils.ts
export function trimWhitespace(str: string): string {
  return str.replaceAll(/\s+/gm, " ").replaceAll(/\(\s+/g, "(").replaceAll(/\s+\)/g, ")").trim();
}
========
export * from "./core-interop/Logging";
export * from "./core-interop/Metadata";
export * from "./core-interop/QueryExecutor";
>>>>>>>> master:packages/core-interop/src/core-interop.ts
