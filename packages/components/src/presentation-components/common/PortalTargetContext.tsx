/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Core
 */

import { createContext, PropsWithChildren } from "react";

/* eslint-disable @typescript-eslint/no-deprecated */

/**
 * Props for [[PortalTargetContextProvider]]
 * @public
 * @deprecated in 5.6. No longer needed.
 */
export interface PortalTargetContextProviderProps {
  portalTarget: HTMLElement | null;
}

/**
 * Provides a portal target for components.
 * @public
 * @deprecated in 5.6. No longer needed.
 */
export function PortalTargetContextProvider({ portalTarget, children }: PropsWithChildren<PortalTargetContextProviderProps>) {
  return <portalTargetContext.Provider value={{ portalTarget }}>{children}</portalTargetContext.Provider>;
}

/**
 * Context that stores a portal target. It will be used to portal popovers opened by presentation components.
 * @internal
 * @deprecated in 5.6. No longer needed.
 */
export interface PortalTargetContext {
  portalTarget: HTMLElement | null;
}

const portalTargetContext = createContext<PortalTargetContext>({ portalTarget: null });
