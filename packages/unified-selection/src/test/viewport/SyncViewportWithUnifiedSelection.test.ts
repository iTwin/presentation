/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import sinon from "sinon";
import { HiliteSet } from "../../unified-selection/HiliteSetProvider";
import { enableUnifiedSelectionSyncWithIModel } from "../../unified-selection/iModel/EnableUnifiedSelectionSyncWithIModel";
import { IModelConnection } from "../../unified-selection/iModel/IModel";
import { IMetadataProvider } from "../../unified-selection/queries/ECMetadata";
import { IECSqlQueryExecutor } from "../../unified-selection/queries/ECSqlCore";
import { StorageSelectionChangesListener } from "../../unified-selection/SelectionChangeEvent";
import { SelectionStorage } from "../../unified-selection/SelectionStorage";

describe("enableUnifiedSelectionSyncWithIModel", () => {
  const selectionStorage = {
    selectionChangeEvent: {
      addListener: sinon.stub<[StorageSelectionChangesListener], () => void>(),
      removeListener: sinon.stub<[], void>(),
    },
  };
  const provider = {
    getHiliteSet: sinon.stub<[{ iModelKey: string }], AsyncIterableIterator<HiliteSet>>(),
    dispose: () => {},
  };
  const iModel = {
    hilited: {
      wantSyncWithSelectionSet: false,
      clear: () => {},
    },
    selectionSet: {
      emptyAll: () => {},
      onChanged: {
        addListener: () => () => {},
      },
    },
  } as unknown as IModelConnection;

  function resetListeners() {
    selectionStorage.selectionChangeEvent.addListener.reset();
    selectionStorage.selectionChangeEvent.removeListener.reset();
  }

  beforeEach(() => {
    async function* emptyGenerator() {}
    provider.getHiliteSet.reset();
    provider.getHiliteSet.callsFake(emptyGenerator);

    resetListeners();
    selectionStorage.selectionChangeEvent.addListener.returns(selectionStorage.selectionChangeEvent.removeListener);
  });

  afterEach(() => {
    sinon.restore();
  });

  it("creates and disposes IModelSelectionHandler", () => {
    const cleanup = enableUnifiedSelectionSyncWithIModel({
      iModel,
      selectionStorage: selectionStorage as unknown as SelectionStorage,
      cachingHiliteSetProvider: provider,
      queryExecutor: {} as IECSqlQueryExecutor,
      metadataProvider: {} as IMetadataProvider,
      activeScopeProvider: () => "element",
    });

    expect(selectionStorage.selectionChangeEvent.addListener).to.be.calledOnce;
    expect(selectionStorage.selectionChangeEvent.removeListener).to.not.be.called;

    resetListeners();
    cleanup();

    expect(selectionStorage.selectionChangeEvent.addListener).to.not.be.called;
    expect(selectionStorage.selectionChangeEvent.removeListener).to.be.calledOnce;
  });
});
