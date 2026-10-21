/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import type { Id64String } from "@itwin/core-bentley";
import type { InstanceKey } from "@itwin/presentation-common";
import type { EC } from "@itwin/presentation-shared";

export function toColonInstanceKey(instanceKey: InstanceKey): {
  className: EC.FullClassNameColonNotation;
  id: Id64String;
} {
  return { ...instanceKey, className: instanceKey.className.replace(/\./g, ":") as EC.FullClassNameColonNotation };
}
