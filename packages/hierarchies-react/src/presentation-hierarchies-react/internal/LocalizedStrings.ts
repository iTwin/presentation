/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

/**
 * Localized strings used in the components.
 *
 * The version suffix in `LOCALIZATION_NAMESPACE` should be bumped when making changes to this object:
 * - minor bump when new strings are added or exists string values are changed,
 * - major bump when a string is removed.
 *
 * @internal
 */
export const LOCALIZED_STRINGS = {
  /**
   * Message displayed when nodes are loading.
   * Default value: `Loading...`.
   */
  loading: "Loading...",
  /**
   * Title for apply hierarchy filter button.
   * Default value: `Apply filter`.
   */
  filterHierarchyLevel: "Apply filter",
  /**
   * Accessible description for applied hierarchy filter button.
   * Default value: `Filter is applied`.
   */
  filterHierarchyLevelActiveDescription: "Filter is applied",
  /**
   * Title for clear hierarchy filter button.
   * Default value: `Clear active filter`.
   */
  clearHierarchyLevelFilter: "Clear active filter",
  /**
   * Message displayed when no nodes matching filter are found.
   * Default value: `No matches for current filter for {{node}}.`.
   */
  noFilteredChildren: "No matches for current filter for {{node}}.",
  /**
   * Label for change filter action.
   * Default value: `Change filter`.
   */
  noFilteredChildrenChangeFilter: "Change filter",
  /**
   * Message displayed when hierarchy creation for a node failed.
   * Default value: `Failed to create hierarchy for {{node}}.`.
   */
  failedToCreateHierarchy: "Failed to create hierarchy for {{node}}.",
  /**
   * Message displayed when hierarchy creation for a node failed.
   * Default value: `Failed to load tree.`.
   */
  failedToCreateRootHierarchy: "Failed to load tree.",
  /**
   * Message displayed when result limit exceeds hierarchy size limit.
   * Default value: `The hierarchy for {{node}} contains {{limit}}+ items. Try using filters or increase the limit.`.
   */
  resultLimitExceeded: "The hierarchy for {{node}} contains {{limit}}+ items. Try using filters or increase the limit.",
  /**
   * Message displayed when result limit exceeds hierarchy size limit.
   * Default value: `The root item hierarchy contains {{limit}}+ items. Try increasing the limit.`.
   */
  rootResultLimitExceeded: "The root item hierarchy contains {{limit}}+ items. Try increasing the limit.",
  /**
   * Name for the error region landmark.
   * Default value: `Issues for {{tree_label}}.`.
   */
  issuesForTree: "Issues for {{tree_label}}.",
  /**
   * Label displayed on the error region, when errors are detected.
   * Default value: `{{number_of_issues}} issue(s) found.`.
   */
  issuesFound: "{{number_of_issues}} issue(s) found.",
  /**
   * Label displayed on the error region, when no issues are found.
   * Default value: `No issues found.`.
   */
  noIssuesFound: "No issues found.",
  /**
   * Message displayed when hierarchy size limit can be overridden.
   * Default value: `Increase limit to {{limit}}`.
   */
  increaseHierarchyLimit: "Increase limit to {{limit}}",
  /**
   * Message displayed when hierarchy size limit can be overridden.
   * Default value: `Remove limit`.
   */
  increaseHierarchyLimitToUnlimited: "Remove limit",
  /**
   * Message displayed when hierarchy size limit can be overridden and hierarchy filtering is enabled.
   * Default value: `Add Filter`.
   */
  increaseHierarchyLimitWithFiltering: "Add Filter",
  /**
   * Label for retry action.
   * Default value: `Retry`.
   */
  retry: "Retry",
  /**
   * Label for rename action.
   * Default value: `Rename`.
   */
  rename: "Rename",
  /**
   * Label for more actions button.
   * Default value: `More`.
   */
  more: "More",
  /**
   * Label for confirm button.
   * Default value: `Confirm`.
   */
  confirm: "Confirm",
  /**
   * Label for cancel button.
   * Default value: `Cancel`.
   */
  cancel: "Cancel",
  /**
   * Label for tree node rename input.
   * Default value: `New label`.
   */
  newLabel: "New label",
  /**
   * A string for "Other". Used for label of a range property grouping node that
   * groups values which don't fit into any other range.
   */
  other: "Other",
  /**
   * A string for "Unspecified". Used for labels of property grouping nodes
   * that group by an empty value.
   */
  unspecified: "Unspecified",
};

type AddPrefix<TPrefix extends string, TPath extends string> = [TPrefix] extends [never] ? `${TPath}` : `${TPrefix}.${TPath}`;

/**
 * Utility type that extracts all possible keys from a nested object as dot-separated strings
 *
 * Example:
 *
 * ```ts
 * type Example = {
 *   a: {
 *     b: string;
 *     c: number;
 *   };
 *   d: boolean;
 * }
 * // ExampleKeys will be "a.b" | "a.c" | "d"
 * type ExampleKeys = ObjectKeys<Example>
 * ```
 */
type ObjectKeys<TObject extends object, Acc extends string = never> =
  | Acc
  | {
      [K in keyof TObject & string]: TObject[K] extends object ? ObjectKeys<TObject[K], AddPrefix<Acc, K>> : AddPrefix<Acc, K>;
    }[keyof TObject & string];

/**
 * Type representing all possible localization keys
 * @internal
 */
export type LocalizationKey = ObjectKeys<typeof LOCALIZED_STRINGS>;

/** @internal */
export const LOCALIZATION_NAMESPACE = "PresentationHierarchies_1.0";

/**
 * Namespaces used for localization of presentation hierarchies components.
 * @alpha
 */
export const LOCALIZATION_NAMESPACES = [LOCALIZATION_NAMESPACE];
