/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

/**
 * An interface that allows subscribing and unsubscribing listeners that
 * are called upon an event.
 *
 * @beta
 */
export interface Event<TListener extends () => void = () => void> {
  addListener(listener: TListener): () => void;
  removeListener(listener: TListener): void;
}

/**
 * An interface for a transaction manager that has 3 types of events fired before and after a commit
 * and when changes are applied on a briefcase.
 *
 * Generally, this either means [TxnManager]($core-backend), accessed through [IModelDb.txns], or
 * [BriefcaseTxns]($core-frontend), accessed through [BriefcaseConnection.txns]($core-frontend).
 *
 * @beta
 */
export interface ICoreTxnManager {
  /**
   * Event raised before a commit operation is performed. Initiated by a call to either [IModelDb.saveChanges]($core-backend)
   * or [BriefcaseConnection.saveChanges]($core-frontend), unless there are no changes to save.
   */
  onCommit: Event;
  /**
   * Event raised after a commit operation is performed. Initiated by a call to either [IModelDb.saveChanges]($core-backend)
   * or [BriefcaseConnection.saveChanges]($core-frontend), even if there were no changes to save.
   */
  onCommitted: Event;
  /**
   * Event raised after a changeset has been applied to the briefcase. Changesets may be applied as a result of
   * [IModelDb.pullChanges]($core-backend) or [BriefcaseConnection.pullChanges]($core-frontend), or by undo/redo operations.
   */
  onChangesApplied: Event;
}

/**
 * Registers listeners to `txns` events and calls provided `onChanged` even when transaction manager
 * reports there are iModel data changes.
 *
 * @param txns Either [TxnManager]($core-backend), accessed through [IModelDb.txns], or [BriefcaseTxns]($core-frontend), accessed through [BriefcaseConnection.txns]($core-frontend).
 * @param onChanged A function to call when transaction manager reports iModel data changes.
 * @returns A function that unregisters the transaction manager listeners.
 * @beta
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
