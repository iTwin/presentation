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
  /** Properties from the target class at this step. */
  target?: ClassPropertySpec;
  /** Properties from the relationship class at this step. */
  relationship?: ClassPropertySpec;
}

/**
 * Specification for which properties to include from a class,
 * plus optional metadata overrides.
 *
 * @public
 */
interface ClassPropertySpec {
  /**
   * Which properties to select from this class.
   * - `"all"`: include all properties.
   * - `"none"`: include no properties from this class.
   * - `{ include: [...] }`: only these properties.
   * - `{ exclude: [...] }`: all except these properties.
   */
  select?: PropertySelection;

  /**
   * Overrides applied to all selected properties.
   * Per-property entries in {@link ClassPropertySpec.overrides} take precedence over this.
   */
  defaultOverrides?: PropertyOverrides;

  /**
   * Per-property metadata overrides, keyed by property name.
   * Takes precedence over {@link ClassPropertySpec.defaultOverrides}.
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
