/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

/**
 * Per-step specification controlling which properties to load from a particular
 * step in a relationship path.
 *
 * @public
 */
export interface StepPropertySpec {
  /** 0-based position in the path. */
  stepIndex: number;
  /**
   * Properties to load from the step's target class. Omit to load no properties from the target
   * class at this step.
   */
  target?: ClassPropertySpec;
  /**
   * Properties to load from the step's relationship class. Omit to load no properties from the
   * relationship class at this step.
   *
   * Relationship-class fields are grouped under a dedicated **relationship category** (labelled by
   * the relationship class), with the step's target-class category nested beneath it. A category
   * defined for these fields should therefore nest under the relationship category, whose id is
   * `CategoryDefinition.computeId({ path, omitTargetClass: true })` — as opposed to target-class
   * fields, which nest under the target category (`CategoryDefinition.computeId({ path })`).
   */
  relationship?: ClassPropertySpec;
}

/**
 * Specification for which properties to include from a class,
 * plus optional metadata overrides.
 *
 * @public
 */
export interface ClassPropertySpec {
  /**
   * Which properties to select from this class.
   * - `"all"`: include all properties.
   * - `"none"`: include no properties from this class.
   * - `{ include: [...] }`: only these properties.
   * - `{ exclude: [...] }`: all except these properties.
   */
  select: PropertySelection;

  /**
   * Overrides applied to all selected properties.
   * Per-property entries in `overrides` take precedence over this.
   */
  defaultOverrides?: PropertyOverrides;

  /**
   * Per-property metadata overrides, keyed by property name.
   * Takes precedence over `defaultOverrides`.
   * Applied regardless of `select` — can override label, category, etc.
   */
  overrides?: Record<string, PropertyOverrides>;
}

/**
 * Selection strategy for properties of a class.
 *
 * @public
 */
type PropertySelection = "all" | "none" | { include: string[] } | { exclude: string[] };

/**
 * Per-property metadata overrides applied during content loading.
 *
 * @public
 */
interface PropertyOverrides {
  label?: string;
  categoryId?: string;
  readOnly?: boolean;
  hidden?: boolean;
}
