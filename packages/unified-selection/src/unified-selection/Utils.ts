/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { ECSqlBinding } from "@itwin/presentation-shared";

/**
 * Forms ECSql bindings from given ID's.
 * @internal
 */
export function formIdBindings(property: string, ids: string[], bindings: ECSqlBinding[]): string {
  if (ids.length > 1000) {
    bindings.push({ type: "idset", value: ids });
    return `InVirtualSet(?, ${property})`;
  }

  if (ids.length === 0) {
    return `FALSE`;
  }

  ids.forEach((id) => bindings.push({ type: "id", value: id }));
  return `${property} IN (${ids.map(() => "?").join(",")})`;
}
