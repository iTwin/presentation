/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

/**
 * Localized strings used in the components. This object is the single source of truth for the
 * `PresentationComponents` localization namespace - the locale JSON file shipped with the package
 * is generated from it by the `build:locale` script.
 *
 * The version suffix in `LOCALIZATION_NAMESPACE` should be bumped when making changes to this object:
 * - minor bump when new strings are added or existing string values are changed,
 * - major bump when a string is removed.
 *
 * Bumping the version changes the name of the generated locale file, so that different versions of
 * the package loaded at the same time use distinctly named locale files and don't override each other.
 *
 * @internal
 */
export const LOCALIZED_STRINGS = {
  categories: {
    favorite: {
      /**
       * Label for the favorite properties category.
       * Default value: `Favorite`.
       */
      label: "Favorite",
      /**
       * Description for the favorite properties category.
       * Default value: `Favorite properties`.
       */
      description: "Favorite properties",
    },
  },
  general: {
    /**
     * Generic error heading.
     * Default value: `Error`.
     */
    error: "Error",
    /**
     * Generic error description.
     * Default value: `An unexpected error was encountered.`.
     */
    "generic-error-description": "An unexpected error was encountered.",
  },
  "instance-key-value-renderer": {
    /**
     * Title for the action that selects an instance.
     * Default value: `Select element`.
     */
    "select-instance": "Select element",
  },
  "instance-filter-builder": {
    /**
     * Placeholder for the optional class selector.
     * Default value: `Select classes (optional)`.
     */
    "select-classes-optional": "Select classes (optional)",
    /**
     * Label for the selected classes.
     * Default value: `Selected classes`.
     */
    "selected-classes": "Selected classes",
    /**
     * Label for the property category column.
     * Default value: `Category:`.
     */
    category: "Category:",
    /**
     * Label for the property class column.
     * Default value: `Class:`.
     */
    class: "Class:",
    /**
     * Label for the property schema column.
     * Default value: `Schema:`.
     */
    schema: "Schema:",
    /**
     * Label for the apply filter action.
     * Default value: `Apply`.
     */
    apply: "Apply",
    /**
     * Label for the cancel action.
     * Default value: `Cancel`.
     */
    cancel: "Cancel",
    /**
     * Label for the reset filter action.
     * Default value: `Reset`.
     */
    reset: "Reset",
    /**
     * Title for the filter dialog.
     * Default value: `Filter`.
     */
    filter: "Filter",
    "error-messages": {
      /**
       * Validation message for a value that is expected to be a number.
       * Default value: `Value must be a number`.
       */
      "not-a-number": "Value must be a number",
      /**
       * Validation message for an invalid value.
       * Default value: `Value is invalid`.
       */
      invalid: "Value is invalid",
    },
    /**
     * Warning displayed when changing the selected class list.
     * Default value: `Changing the class list clears all property filtering rules.`.
     */
    "class-selection-warning": "Changing the class list clears all property filtering rules.",
  },
  tree: {
    /**
     * Prefix for the message suggesting to provide additional filtering.
     * Default value: `Please provide`.
     */
    "please-provide": "Please provide",
    /**
     * Message displayed when no child nodes match the current filter.
     * Default value: `There are no child nodes matching current filter`.
     */
    "no-filtered-children": "There are no child nodes matching current filter",
    /**
     * Message displayed when result limit exceeds hierarchy size limit.
     * Default value: `there are more items than allowed limit of`.
     */
    "result-limit-exceeded": "there are more items than allowed limit of",
    /**
     * Link text for providing additional filtering.
     * Default value: `additional filtering`.
     */
    "additional-filtering": "additional filtering",
    /**
     * Message displayed when hierarchy level creation times out.
     * Default value: `Creating the hierarchy level took too long`.
     */
    timeout: "Creating the hierarchy level took too long",
    /**
     * Message displayed when hierarchy level creation fails with an unknown error.
     * Default value: `Error creating the hierarchy level`.
     */
    "unknown-error": "Error creating the hierarchy level",
    /**
     * Title for the apply hierarchy filter button.
     * Default value: `Apply filter`.
     */
    "filter-hierarchy-level": "Apply filter",
    /**
     * Title for the clear hierarchy filter button.
     * Default value: `Clear active filter`.
     */
    "clear-hierarchy-level-filter": "Clear active filter",
    "filter-dialog": {
      /**
       * Label for the matching items count.
       * Default value: `Matching items`.
       */
      "results-count": "Matching items",
      /**
       * Message displayed when the filter dialog result limit is exceeded.
       * Default value: `There are too many results to display. Please adjust your filters to limit the results count to {{itemCount}} items.`.
       */
      "result-limit-exceeded":
        "There are too many results to display. Please adjust your filters to limit the results count to {{itemCount}} items.",
    },
  },
  "navigation-property-editor": {
    /**
     * Placeholder for the navigation property target selector.
     * Default value: `Select target instance`.
     */
    "select-target-instance": "Select target instance",
    /**
     * Message displayed while loading navigation property targets.
     * Default value: `Loading target instances`.
     */
    "loading-target-instances": "Loading target instances",
    /**
     * Message displayed when no navigation property targets are available.
     * Default value: `No target instances`.
     */
    "no-target-instances": "No target instances",
  },
  "unique-values-property-editor": {
    /**
     * Placeholder for the unique values selector.
     * Default value: `Select provided value(s)`.
     */
    "select-values": "Select provided value(s)",
    /**
     * Message displayed while loading unique values.
     * Default value: `Loading values`.
     */
    "loading-values": "Loading values",
    /**
     * Label for an empty unique value.
     * Default value: `Empty Value`.
     */
    "empty-value": "Empty Value",
    /**
     * Message displayed when no unique values are available.
     * Default value: `No values`.
     */
    "no-values": "No values",
  },
};

type AddPrefix<TPrefix extends string, TPath extends string> = [TPrefix] extends [never]
  ? `${TPath}`
  : `${TPrefix}.${TPath}`;

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
      [K in keyof TObject & string]: TObject[K] extends object
        ? ObjectKeys<TObject[K], AddPrefix<Acc, K>>
        : AddPrefix<Acc, K>;
    }[keyof TObject & string];

/**
 * Type representing all possible localization keys
 * @internal
 */
export type LocalizationKey = ObjectKeys<typeof LOCALIZED_STRINGS>;

/**
 * Localization namespace used by the components. The version suffix is bumped whenever the localized
 * strings change so that different versions of the package don't override each other's locale files.
 * @internal
 */
export const LOCALIZATION_NAMESPACE = "PresentationComponents_1.0";

/**
 * Namespaces used for localization of presentation components.
 * @internal
 */
export const LOCALIZATION_NAMESPACES = [LOCALIZATION_NAMESPACE];
