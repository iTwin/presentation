/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Core
 */

import { createContext, PropsWithChildren, useContext } from "react";

/**
 * Props for [[PortalTargetContextProvider]]
 * @beta
 */
export interface PortalTargetContextProviderProps {
  portalTarget: HTMLElement | null;
}

/**
 * Provides a portal target for components.
 * @beta
 */
export function PortalTargetContextProvider({ portalTarget, children }: PropsWithChildren<PortalTargetContextProviderProps>) {
  return <portalTargetContext.Provider value={{ portalTarget }}>{children}</portalTargetContext.Provider>;
}

/**
 * Context that stores a portal target. It will be used to portal popovers opened by presentation components.
 * @internal
 */
export interface PortalTargetContext {
  portalTarget: HTMLElement | null;
}

const portalTargetContext = createContext<PortalTargetContext>({ portalTarget: null });

/**
 * Returns context provided by [[PortalTargetContextProvider]].
 * @internal
 */
export function usePortalTargetContext() {
  return useContext(portalTargetContext);
}
