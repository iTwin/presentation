/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { createContext, useContext, useMemo } from "react";
import { LocalizationKey } from "../internal/LocalizedStrings.js";

import type { JSX, PropsWithChildren } from "react";

type TranslateFunc = (key: LocalizationKey) => string;

const localizationContext = createContext<TranslateFunc>((key) => key);

/**
 * Properties for `LocalizationContextProvider`.
 * @public
 */
interface LocalizationContextProviderProps {
  /** Localized strings used in the components. */
  localization: {
    getLocalizedString: (key: string) => string;
  };
}

/**
 * Context provider for localized strings used in the components.
 * @public
 */
export function LocalizationContextProvider({ localization, children }: PropsWithChildren<LocalizationContextProviderProps>): JSX.Element {
  const translate = useMemo<TranslateFunc>(() => {
    return (key: LocalizationKey) => localization.getLocalizedString(key);
  }, [localization]);
  return <localizationContext.Provider value={translate}>{children}</localizationContext.Provider>;
}

/** @internal */
export function useTranslation() {
  return useContext(localizationContext);
}
