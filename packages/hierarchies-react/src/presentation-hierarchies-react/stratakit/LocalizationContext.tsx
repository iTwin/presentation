/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { createContext, useContext, useMemo } from "react";

import type { JSX, PropsWithChildren } from "react";

/**
 * Localized strings used in the components.
 * @public
 */
export interface LocalizedStrings {
  /**
   * Message displayed when nodes are loading.
   * Default value: `Loading...`.
   */
  loading: string;
  /**
   * Title for apply hierarchy filter button.
   * Default value: `Apply filter`.
   */
  filterHierarchyLevel: string;
  /**
   * Accessible description for applied hierarchy filter button.
   * Default value: `Filter is applied`.
   */
  filterHierarchyLevelActiveDescription: string;
  /**
   * Title for clear hierarchy filter button.
   * Default value: `Clear active filter`.
   */
  clearHierarchyLevelFilter: string;
  /**
   * Message displayed when no nodes matching filter are found.
   * Default value: `No matches for current filter for {{node}}.`.
   */
  noFilteredChildren: string;
  /**
   * Label for change filter action.
   * Default value: `Change filter`.
   */
  noFilteredChildrenChangeFilter: string;
  /**
   * Message displayed when hierarchy creation for a node failed.
   * Default value: `Failed to create hierarchy for {{node}}.`.
   */
  failedToCreateHierarchy: string;
  /**
   * Message displayed when hierarchy creation for a node failed.
   * Default value: `Failed to load tree.`.
   */
  failedToCreateRootHierarchy: string;
  /**
   * Message displayed when result limit exceeds hierarchy size limit.
   * Default value: `The hierarchy for {{node}} contains {{limit}}+ items. Try using filters or increase the limit.`.
   */
  resultLimitExceeded: string;
  /**
   * Message displayed when result limit exceeds hierarchy size limit.
   * Default value: `The root item hierarchy contains {{limit}}+ items. Try increasing the limit.`.
   */
  rootResultLimitExceeded: string;
  /**
   * Name for the error region landmark.
   * Default value: `Issues for {{tree_label}}.`.
   */
  issuesForTree: string;
  /**
   * Label displayed on the error region, when errors are detected.
   * Default value: `{{number_of_issues}} issue(s) found.`.
   */
  issuesFound: string;
  /**
   * Label displayed on the error region, when no issues are found.
   * Default value: `No issues found.`.
   */
  noIssuesFound: string;
  /**
   * Message displayed when hierarchy size limit can be overridden.
   * Default value: `Increase limit to {{limit}}`.
   */
  increaseHierarchyLimit: string;
  /**
   * Message displayed when hierarchy size limit can be overridden.
   * Default value: `Remove limit`.
   */
  increaseHierarchyLimitToUnlimited: string;
  /**
   * Message displayed when hierarchy size limit can be overridden and hierarchy filtering is enabled.
   * Default value: `Add Filter`.
   */
  increaseHierarchyLimitWithFiltering: string;
  /**
   * Label for retry action.
   * Default value: `Retry`.
   */
  retry: string;
  /**
   * Label for rename action.
   * Default value: `Rename`.
   */
  rename: string;
  /**
   * Label for more actions button.
   * Default value: `More`.
   */
  more: string;
  /**
   * Label for confirm button.
   * Default value: `Confirm`.
   */
  confirm: string;
  /**
   * Label for cancel button.
   * Default value: `Cancel`.
   */
  cancel: string;
  /**
   * Label for tree node rename input.
   * Default value: `New label`.
   */
  newLabel: string;
}

/** @internal */
export interface LocalizationContext {
  localizedStrings: LocalizedStrings;
}

const defaultLocalizedStrings: LocalizedStrings = {
  loading: "Loading...",
  filterHierarchyLevel: "Apply filter",
  filterHierarchyLevelActiveDescription: "Filter is applied",
  clearHierarchyLevelFilter: "Clear active filter",
  noFilteredChildren: "No matches for current filter for {{node}}.",
  noFilteredChildrenChangeFilter: "Change filter",
  failedToCreateHierarchy: "Failed to create hierarchy for {{node}}.",
  failedToCreateRootHierarchy: "Failed to load tree.",
  resultLimitExceeded: "The hierarchy for {{node}} contains {{limit}}+ items. Try using filters or increase the limit.",
  rootResultLimitExceeded: "The root item hierarchy contains {{limit}}+ items. Try increasing the limit.",
  issuesForTree: "Issues for {{tree_label}}.",
  issuesFound: "{{number_of_issues}} issue(s) found.",
  noIssuesFound: "No issues found.",
  increaseHierarchyLimit: "Increase limit to {{limit}}",
  increaseHierarchyLimitToUnlimited: "Remove limit",
  increaseHierarchyLimitWithFiltering: "Add Filter",
  retry: "Retry",
  rename: "Rename",
  more: "More",
  confirm: "Confirm",
  cancel: "Cancel",
  newLabel: "New label",
};

const localizationContext = createContext<LocalizationContext>({ localizedStrings: defaultLocalizedStrings });

/**
 * Properties for `LocalizationContextProvider`.
 * @public
 */
interface LocalizationContextProviderProps {
  /** Localized strings used in the components. */
  localizedStrings?: Partial<LocalizedStrings>;
}

/**
 * Context provider for localized strings used in the components.
 * @public
 */
export function LocalizationContextProvider({ localizedStrings, children }: PropsWithChildren<LocalizationContextProviderProps>): JSX.Element {
  const state = useMemo(() => ({ localizedStrings: { ...defaultLocalizedStrings, ...localizedStrings } }), [localizedStrings]);
  return <localizationContext.Provider value={state}>{children}</localizationContext.Provider>;
}

/** @internal */
export function useLocalizationContext() {
  return useContext(localizationContext);
}
