/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { PropertyRecord } from "@itwin/appui-abstract";
import { Field } from "@itwin/presentation-common";

/**
 * Data structure that defines table column.
 * @beta
 */
export interface ColumnDefinition {
  /** Unique column name. */
  name: string;
  /** Column display label. */
  label: string;
  /** [Field]($presentation-common) that this column is based on. */
  field: Field;
}

/**
 * Data structure that defined table row.
 * @beta
 */
export interface RowDefinition {
  /** Unique row key. */
  key: string;
  /** List of cells in this row. */
  cells: CellDefinition[];
}

/**
 * Data structure that defined table cell.
 * @beta
 */
export interface CellDefinition {
  /** Unique key that matches [[ColumnDefinition]] name. */
  key: string;
  /** Record containing property definition and value of this cell. */
  record: PropertyRecord;
}
