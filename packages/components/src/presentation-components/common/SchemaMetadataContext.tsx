/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Core
 */

import { createContext, PropsWithChildren, useContext, useEffect, useState } from "react";
import { IModelConnection } from "@itwin/core-frontend";
import { SchemaContext } from "@itwin/ecschema-metadata";

/**
 * Context that stores metadata related to schemas.
 * @beta
 */
export interface SchemaMetadataContext {
  /** Schema context for schemas lookup. */
  schemaContext: SchemaContext;
}

const schemaMetadataContext = createContext<SchemaMetadataContext | undefined>(undefined);

/**
 * Props for [[SchemaMetadataContextProvider]]
 * @beta
 */
export interface SchemaMetadataContextProviderProps {
  /** iModel to pull schemas from. */
  imodel: IModelConnection;
  /** Callback that provides schema context for supplied imodel. */
  schemaContextProvider: (imodel: IModelConnection) => SchemaContext;
}

/**
 * Provides schema metadata to components that work with schemas.
 * @beta
 */
export function SchemaMetadataContextProvider({ schemaContextProvider, imodel, children }: PropsWithChildren<SchemaMetadataContextProviderProps>) {
  const [state, setState] = useState<SchemaMetadataContext>(() => ({
    schemaContext: schemaContextProvider(imodel),
  }));

  useEffect(() => {
    setState({
      schemaContext: schemaContextProvider(imodel),
    });
  }, [imodel, schemaContextProvider]);

  return <schemaMetadataContext.Provider value={state}>{children}</schemaMetadataContext.Provider>;
}

export function useSchemaMetadataContext() {
  return useContext(schemaMetadataContext);
}
