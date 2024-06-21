/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { createContext, PropsWithChildren, useContext, useEffect, useState } from "react";

/** @internal */
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
   * Title for clear hierarchy filter button.
   * Default value: `Clear active filter`.
   */
  clearHierarchyLevelFilter: string;
  /**
   * Message displayed when no nodes matching filter are found.
   * Default value: `No child nodes match current filter`.
   */
  noFilteredChildren: string;
  /**
   * Message displayed when result limit exceeds hierarchy size limit.
   * Default value: `There are more items than allowed limit of {{limit}}.`.
   */
  resultLimitExceeded: string;
  /**
   * Message displayed when result limit exceeds hierarchy size limit and hierarchy filtering is enabled.
   * Default value: `Please provide <link>additional filtering</link> - there are more items than allowed limit of {{limit}}.`.
   */
  resultLimitExceededWithFiltering: string;
  /**
   * Message displayed when hierarchy size limit can be overridden.
   * Default value: `<link>Increase the hierarchy level size limit to {{limit}}.</link>`.
   */
  increaseHierarchyLimit: string;
  /**
   * Message displayed when hierarchy size limit can be overridden and hierarchy filtering is enabled.
   * Default value: `Or, <link>increase the hierarchy level size limit to {{limit}}.</link>`.
   */
  increaseHierarchyLimitWithFiltering: string;
  /**
   * Label for retry action.
   * Default value: `Retry`.
   */
  retry: string;
}

/** @internal */
export interface LocalizationContext {
  localizedStrings: LocalizedStrings;
}

const defaultLocalizedStrings: LocalizedStrings = {
  loading: "Loading...",
  filterHierarchyLevel: "Apply filter",
  clearHierarchyLevelFilter: "Clear active filter",
  noFilteredChildren: "No child nodes match current filter",
  resultLimitExceeded: "There are more items than allowed limit of {{limit}}.",
  resultLimitExceededWithFiltering: "Please provide <link>additional filtering</link> - there are more items than allowed limit of {{limit}}.",
  increaseHierarchyLimit: "<link>Increase the hierarchy level size limit to {{limit}}.</link>",
  increaseHierarchyLimitWithFiltering: "Or, <link>increase the hierarchy level size limit to {{limit}}.</link>",
  retry: "Retry",
};

const localizationContext = createContext<LocalizationContext>({ localizedStrings: defaultLocalizedStrings });

/** @beta */
interface LocalizationContextProviderProps {
  localizedStrings?: Partial<LocalizedStrings>;
}

/** @beta */
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
