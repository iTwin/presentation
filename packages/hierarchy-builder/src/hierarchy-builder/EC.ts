/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { Id64String } from "@itwin/core-bentley";

/** @beta */
export interface ClassInfo {
  /** ECClass ID */
  id: Id64String;
  /** Full class name in format `SchemaName:ClassName` */
  name: string;
  /** ECClass label */
  label: string;
}

/** @beta */
export interface InstanceKey {
  /** Full class name in format `SchemaName:ClassName` */
  className: string;
  /** ECInstance ID */
  id: Id64String;
}
