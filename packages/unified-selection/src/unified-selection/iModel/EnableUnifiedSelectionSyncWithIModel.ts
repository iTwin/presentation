/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module UnifiedSelection
 */

import { CachingHiliteSetProvider } from "../CachingHiliteSetProvider";
import { IMetadataProvider } from "../queries/ECMetadata";
import { IECSqlQueryExecutor } from "../queries/ECSqlCore";
import { ElementSelectionScopeProps, SelectionScope } from "../SelectionScope";
import { SelectionStorage } from "../SelectionStorage";
import { IModelConnection } from "./IModel";
import { IModelSelectionHandler } from "./IModelSelectionHandler";

/**
 * Props for `enableUnifiedSelectionSyncWithIModel`.
 * @internal Not exported through barrel, but used in public API as an argument. May be supplemented with optional attributes any time.
 */
export interface EnableUnifiedSelectionSyncWithIModelProps {
  /** iModel to synchronize selection for. */
  iModel: IModelConnection;
  /** SelectionStorage to synchronize selection with. */
  selectionStorage: SelectionStorage;
  /** Caching hilite set provider. */
  cachingHiliteSetProvider: CachingHiliteSetProvider;
  /** iModel ECSql query executor. */
  queryExecutor: IECSqlQueryExecutor;
  /** iModel metadata provider. */
  metadataProvider: IMetadataProvider;
  /** Active scope provider. */
  activeScopeProvider: () => ElementSelectionScopeProps | { id: SelectionScope } | SelectionScope;
}

/**
 * Enables synchronization between iModel selection and unified selection.
 * @param iModel iModel to synchronize selection for.
 * @returns function for disposing the synchronization.
 * @beta
 */
export function enableUnifiedSelectionSyncWithIModel(props: EnableUnifiedSelectionSyncWithIModelProps): () => void {
  const selectionHandler = new IModelSelectionHandler(props);
  return () => selectionHandler.dispose();
}
