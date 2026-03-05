/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { createContext, useContext, useMemo } from "react";
import { LOCALIZATION_NAMESPACE } from "../internal/LocalizationHelpers.js";

import type { JSX, PropsWithChildren } from "react";
import type { LocalizationKey, TranslateFunc } from "../internal/LocalizationHelpers.js";

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
    return (key: LocalizationKey) => localization.getLocalizedString(`${LOCALIZATION_NAMESPACE}:${key}`);
  }, [localization]);
  return <localizationContext.Provider value={translate}>{children}</localizationContext.Provider>;
}

/** @internal */
export function useTranslation() {
  return useContext(localizationContext);
}
