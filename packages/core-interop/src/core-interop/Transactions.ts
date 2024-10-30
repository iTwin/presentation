/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { Event } from "@itwin/presentation-shared";

/**
 * An interface for a transaction manager that has 3 types of events fired before and after a commit
 * and when changes are applied on a briefcase.
 *
 * Generally, this either means [TxnManager](https://www.itwinjs.org/reference/core-backend/imodels/txnmanager/), accessed
 * through [BriefcaseDb.txns](https://www.itwinjs.org/reference/core-backend/imodels/briefcasedb/#txns), or
 * [BriefcaseTxns](https://www.itwinjs.org/reference/core-frontend/imodelconnection/briefcasetxns/), accessed
 * through [BriefcaseConnection.txns](https://www.itwinjs.org/reference/core-frontend/imodelconnection/briefcaseconnection/#txns).
 * @public
 */
interface ICoreTxnManager {
  /**
   * Event raised before a commit operation is performed. Initiated by a call to either
   * [IModelDb.saveChanges](https://www.itwinjs.org/reference/core-backend/imodels/imodeldb/savechanges/)
   * or [BriefcaseConnection.saveChanges](https://www.itwinjs.org/reference/core-frontend/imodelconnection/briefcaseconnection/savechanges/),
   * unless there are no changes to save.
   */
  onCommit: Event;
  /**
   * Event raised after a commit operation is performed. Initiated by a call to either
   * [IModelDb.saveChanges](https://www.itwinjs.org/reference/core-backend/imodels/imodeldb/savechanges/)
   * or [BriefcaseConnection.saveChanges](https://www.itwinjs.org/reference/core-frontend/imodelconnection/briefcaseconnection/savechanges/),
   * even if there were no changes to save.
   */
  onCommitted: Event;
  /**
   * Event raised after a changeset has been applied to the briefcase. Changesets may be applied as a result of
   * [BriefcaseDb.pullChanges](https://www.itwinjs.org/reference/core-backend/imodels/briefcasedb/) or
   * [BriefcaseConnection.pullChanges](https://www.itwinjs.org/reference/core-frontend/imodelconnection/briefcaseconnection/pullchanges/),
   * or by undo/redo operations.
   */
  onChangesApplied: Event;
}

/**
 * Registers listeners to `txns` events and calls provided `onChanged` callback when transaction manager
 * reports there are iModel data changes.
 *
 * Usage example:
 *
 * ```ts
 * import { BriefcaseDb } from "@itwin/core-backend";
 * import { registerTxnListeners } from "@itwin/presentation-core-interop";
 * import { HierarchyProvider } from "@itwin/presentation-hierarchies";
 *
 * // get iModel and hierarchy provider from arbitrary sources
 * const db: BriefcaseDb = getIModel();
 * const provider: HierarchyProvider = getHierarchyProvider();
 *
 * // register the listeners
 * const unregister = registerTxnListeners(db.txns, () => {
 *   // notify provided about the changed data
 *   provider.notifyDataSourceChanged();
 *   // TODO: force the components using `provider` to reload
 * });
 *
 * // clean up on iModel close
 * db.onClosed.addOnce(() => unregister());
 * ```
 *
 * @param txns Either [TxnManager](https://www.itwinjs.org/reference/core-backend/imodels/txnmanager/), accessed
 * through [BriefcaseDb.txns](https://www.itwinjs.org/reference/core-backend/imodels/briefcasedb/#txns),
 * or [BriefcaseTxns](https://www.itwinjs.org/reference/core-frontend/imodelconnection/briefcasetxns/), accessed
 * through [BriefcaseConnection.txns](https://www.itwinjs.org/reference/core-frontend/imodelconnection/briefcaseconnection/#txns).
 * @param onChanged A function to call when transaction manager reports iModel data changes.
 * @returns A function that unregisters the transaction manager listeners.
 * @public
 */
export function registerTxnListeners(txns: ICoreTxnManager, onChanged: () => void): () => void {
  let hasChanges = false;
  const beforeCommit = txns.onCommit.addListener(() => {
    hasChanges = true;
  });
  const afterCommit = txns.onCommitted.addListener(() => {
    if (hasChanges) {
      onChanged();
    }
    hasChanges = false;
  });
  const appliedChanges = txns.onChangesApplied.addListener(onChanged);
  return () => {
    beforeCommit();
    afterCommit();
    appliedChanges();
  };
}
