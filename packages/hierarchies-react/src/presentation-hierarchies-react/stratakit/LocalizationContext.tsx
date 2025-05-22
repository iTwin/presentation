/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { createContext, PropsWithChildren, useContext, useEffect, useState } from "react";

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
   * Accesible description for applied hierarchy filter button.
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
   * Label displayed on error dropdown.
   * Default value: `issues found`.
   */
  issuesFound: string;
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
  issuesFound: "issues found",
  increaseHierarchyLimit: "Increase limit to {{limit}}",
  increaseHierarchyLimitToUnlimited: "Remove limit",
  increaseHierarchyLimitWithFiltering: "Add Filter",
  retry: "Retry",
  rename: "Rename",
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
export function LocalizationContextProvider({ localizedStrings, children }: PropsWithChildren<LocalizationContextProviderProps>) {
  const [state, setState] = useState({ localizedStrings: { ...defaultLocalizedStrings, ...localizedStrings } });

  useEffect(() => {
    setState({ localizedStrings: { ...defaultLocalizedStrings, ...localizedStrings } });
  }, [localizedStrings]);

  return <localizationContext.Provider value={state}>{children}</localizationContext.Provider>;
}

/** @internal */
export function useLocalizationContext() {
  return useContext(localizationContext);
}
