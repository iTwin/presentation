/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Core
 */

import { createContext, PropsWithChildren, useContext } from "react";

/**
 * Context that stores a portal target.
 */
export interface PortalTargetContext {
  portalTarget: HTMLElement | null;
}

const portalTargetContext = createContext<PortalTargetContext>({} as PortalTargetContext);

/**
 * Props for [[PortalTargetContextProvider]]
 */
export interface PortalTargetContextProviderProps {
  portalTarget: HTMLElement | null;
}

/**
 * Provides a portal target for components.
 */
export function PortalTargetContextProvider({ portalTarget, children }: PropsWithChildren<PortalTargetContextProviderProps>) {
  return <portalTargetContext.Provider value={{ portalTarget }}>{children}</portalTargetContext.Provider>;
}

/**
 * Returns context provided by [[PortalTargetContextProvider]].
 */
export function usePortalTargetContext() {
  return useContext(portalTargetContext);
}
