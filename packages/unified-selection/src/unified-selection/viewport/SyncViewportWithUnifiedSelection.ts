/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module UnifiedSelection
 */

import { CachingHiliteSetProvider } from "../CachingHiliteSetProvider";
import { IModelConnection } from "../iModel/IModel";
import { IMetadataProvider } from "../queries/ECMetadata";
import { IECSqlQueryExecutor } from "../queries/ECSqlCore";
import { ElementSelectionScopeProps, SelectionScope } from "../SelectionScope";
import { SelectionStorage } from "../SelectionStorage";
import { ViewportSelectionHandler } from "./ViewportSelectionHandler";

/**
 * Props for `syncViewportWithUnifiedSelection`.
 * @beta
 */
export interface SyncViewportWithUnifiedSelectionProps {
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
 * Enables synchronization between viewport selection and unified selection.
 * @param iModel iModel to synchronize selection for.
 * @returns function for disposing the synchronization.
 * @beta
 */
export function syncViewportWithUnifiedSelection(props: SyncViewportWithUnifiedSelectionProps): () => void {
  const selectionHandler = new ViewportSelectionHandler(props);
  return () => selectionHandler.dispose();
}
