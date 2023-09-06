/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

/** @beta */
export type ECSqlBindingType = "boolean" | "double" | "id" | "idset" | "int" | "long" | "string" | "point2d" | "point3d";

/** @beta */
export interface ECSqlBinding {
  type: ECSqlBindingType;
  value?: any;
}
