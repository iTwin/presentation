/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { ECClass as CoreClass, Schema as CoreSchema } from "@itwin/ecschema-metadata";
import { ECClass, ECSchema } from "@itwin/presentation-hierarchy-builder";

/** @internal */
export function createECSchema(schema: CoreSchema): ECSchema {
  return {
    name: schema.name,
    async getClass(name) {
      const item = await schema.getItem<CoreClass>(name);
      return item ? createECClass(item, this) : undefined;
    },
  };
}

/** @internal */
export function createECClass(ecClass: CoreClass, schema: ECSchema): ECClass {
  return {
    schema,
    fullName: ecClass.fullName,
    name: ecClass.name,
    label: ecClass.label,
    async is(classOrClassName: ECClass | string, schemaName?: string) {
      if (typeof classOrClassName === "string") {
        return ecClass.is(classOrClassName, schemaName!);
      }
      return ecClass.is(classOrClassName.name, classOrClassName.schema.name);
    },
  };
}
