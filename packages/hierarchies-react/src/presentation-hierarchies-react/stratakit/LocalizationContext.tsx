/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { createContext, useContext, useMemo } from "react";
import { HIERARCHIES_REACT_LOCALIZATION_NAMESPACE } from "../internal/LocalizedStrings.js";

import type { JSX, PropsWithChildren } from "react";
import type { LocalizationKey } from "../internal/LocalizedStrings.js";

type TranslateFunc = (key: LocalizationKey) => string;

const localizationContext = createContext<TranslateFunc>((key) => key);

/**
 * Properties for `LocalizationContextProvider`.
 * @public
 */
interface LocalizationContextProviderProps {
  /** Localization object compatible with `@itwin/core-common` */
  localization: {
    getLocalizedString: (key: string) => string;
  };
}

/**
 * Context provider for localizing components.
 * @public
 */
export function LocalizationContextProvider({ localization, children }: PropsWithChildren<LocalizationContextProviderProps>): JSX.Element {
  const translate = useMemo<TranslateFunc>(() => {
    return (key: LocalizationKey) => localization.getLocalizedString(`${HIERARCHIES_REACT_LOCALIZATION_NAMESPACE}:${key}`);
  }, [localization]);
  return <localizationContext.Provider value={translate}>{children}</localizationContext.Provider>;
}

/** @internal */
export function useTranslation() {
  return useContext(localizationContext);
}
