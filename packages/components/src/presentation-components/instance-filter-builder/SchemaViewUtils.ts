/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module InstancesFilter
 */

import { Id64 } from "@itwin/core-bentley";
import { SchemaView } from "@itwin/ecschema-metadata";

/** @internal */
export function hasBaseClass(derivedClass: SchemaView.Class, expectedBase: SchemaView.Class | string): boolean {
  return (
    !!derivedClass.baseClass &&
    (getClassId(derivedClass.baseClass) === getClassId(expectedBase) ||
      hasBaseClass(derivedClass.baseClass, expectedBase))
  );
}

/** @internal */
export function getClassId(classView: SchemaView.Class | string): string {
  if (typeof classView === "string") {
    return classView;
  }
  return Id64.fromUint32Pair(classView.ecInstanceId, 0);
}
