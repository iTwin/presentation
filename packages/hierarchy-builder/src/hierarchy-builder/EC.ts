/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

/**
 * A string representing a 64 bit number in hex.
 * @see [Id64String]($core-bentley)
 * @beta
 */
export type Id64String = string;

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

/** @beta */
export interface LabelInfo {
  /** ECClass ID */
  id: Id64String;
  /** ECClass label */
  label: string;
}
