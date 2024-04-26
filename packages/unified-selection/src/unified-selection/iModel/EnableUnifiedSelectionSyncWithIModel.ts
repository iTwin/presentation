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
import { ComputeSelectionProps } from "../SelectionScope";
import { SelectionStorage } from "../SelectionStorage";
import { IModelSelection } from "./IModel";
import { IModelSelectionHandler } from "./IModelSelectionHandler";

/**
 * Props for `enableUnifiedSelectionSyncWithIModel`.
 * @internal Not exported through barrel, but used in public API as an argument. May be supplemented with optional attributes any time.
 */
export interface EnableUnifiedSelectionSyncWithIModelProps {
  /** iModel selection to synchronize with unified selection. */
  iModelSelection: IModelSelection;
  /** Selection storage to synchronize IModel's tool selection with. */
  selectionStorage: SelectionStorage;
  /** iModel ECSql query executor. */
  queryExecutor: IECSqlQueryExecutor;
  /** iModel metadata provider. */
  metadataProvider: IMetadataProvider;
  /** Active scope provider. */
  activeScopeProvider: () => ComputeSelectionProps["scope"];
  /**
   * A caching hilite set provider used to retrieve hilite sets for an iModel. If not provided, a new `CachingHiliteSetProvider`
   * will be created for the given iModel using the provided `queryExecutor` and `metadataProvider`.
   * If the consuming application already has a `CachingHiliteSetProvider` defined, it should be provided instead
   * to reuse the cache and avoid creating new providers for each iModel.
   */
  cachingHiliteSetProvider?: CachingHiliteSetProvider;
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
