/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { createContext, PropsWithChildren, useContext, useEffect, useState } from "react";

/** @internal */
export interface Localization {
  loading: string;
  pleaseProvide: string;
  additionalFiltering: string;
  filterHierarchyLevel: string;
  clearHierarchyLevelFilter: string;
  noFilteredChildren: string;
  resultLimitExceeded: string;
  increaseHierarchyLimit: string;
  increaseHierarchyLimitTo: string;
}

/** @internal */
export interface LocalizationContext {
  localization: Localization;
}

const defaultLocalization: Localization = {
  loading: "Loading...",
  pleaseProvide: "Please provide",
  additionalFiltering: "additional filtering",
  filterHierarchyLevel: "Apply filter",
  clearHierarchyLevelFilter: "Clear active filter",
  noFilteredChildren: "There are no child nodes matching current filter",
  resultLimitExceeded: "there are more items than allowed limit of",
  increaseHierarchyLimit: "Increase hierarchy level size limit",
  increaseHierarchyLimitTo: "Increase hierarchy level size limit to",
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
