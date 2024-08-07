/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Table
 */

import { PropertyRecord } from "@itwin/appui-abstract";
import { Field } from "@itwin/presentation-common";

/**
 * Data structure that defines table column.
 * @public
 */
export interface TableColumnDefinition {
  /** Unique column name. */
  name: string;
  /** Column display label. */
  label: string;
  /** [Field]($presentation-common) that this column is based on. */
  field: Field;
}

/**
 * Data structure that defined table row.
 * @public
 */
export interface TableRowDefinition {
  /** Unique row key. */
  key: string;
  /** List of cells in this row. */
  cells: TableCellDefinition[];
}

/**
 * Data structure that defined table cell.
 * @public
 */
export interface TableCellDefinition {
  /** Unique key that matches [[TableColumnDefinition]] name. */
  key: string;
  /** Record containing property definition and value of this cell. */
  record: PropertyRecord;
}
