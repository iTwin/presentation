/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { createContext, PropsWithChildren, useContext, useEffect, useState } from "react";

/** @internal */
export interface Localization {
  loading: string;
  filterHierarchyLevel: string;
  clearHierarchyLevelFilter: string;
  noFilteredChildren: string;
  resultLimitExceeded: string;
  resultLimitExceededWithFiltering: string;
  increaseHierarchyLimit: string;
  increaseHierarchyLimitWithFiltering: string;
}

/** @internal */
export interface LocalizationContext {
  localization: Localization;
}

const defaultLocalization: Localization = {
  loading: "Loading...",
  filterHierarchyLevel: "Apply filter",
  clearHierarchyLevelFilter: "Clear active filter",
  noFilteredChildren: "No child nodes match current filter",
  resultLimitExceeded: "There are more items than allowed limit of {{limit}}.",
  resultLimitExceededWithFiltering: "Please provide <link>additional filtering</link> - there are more items than allowed limit of {{limit}}.",
  increaseHierarchyLimit: "<link>Increase the hierarchy level size limit to {{limit}}.</link>",
  increaseHierarchyLimitWithFiltering: "Or, <link>increase the hierarchy level size limit to {{limit}}.</link>",
};

const localizationContext = createContext<LocalizationContext>({ localization: defaultLocalization });

interface LocalizationContextProviderProps {
  localization?: Localization;
}

/**
 * Provides localized strings.
 * @beta
 */
export function LocalizationContextProvider({ localization, children }: PropsWithChildren<LocalizationContextProviderProps>) {
  const [state, setState] = useState({ localization: localization ?? defaultLocalization });

  useEffect(() => {
    setState({ localization: localization ?? defaultLocalization });
  }, [localization]);

  return <localizationContext.Provider value={state}>{children}</localizationContext.Provider>;
}

/** @beta */
export function useLocalizationContext() {
  return useContext(localizationContext);
}
