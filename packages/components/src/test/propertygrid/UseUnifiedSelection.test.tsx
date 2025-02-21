/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { PropsWithChildren } from "react";
import sinon from "sinon";
import { IModelConnection } from "@itwin/core-frontend";
import { KeySet } from "@itwin/presentation-common";
import { ISelectionProvider, SelectionChangeEventArgs, SelectionChangeType, SelectionHandler } from "@itwin/presentation-frontend";
import { createStorage, Selectables, SelectionStorage } from "@itwin/unified-selection";
import { IPresentationPropertyDataProvider } from "../../presentation-components/propertygrid/DataProvider.js";
import {
  SelectionHandlerContextProvider,
  usePropertyDataProviderWithUnifiedSelection,
} from "../../presentation-components/propertygrid/UseUnifiedSelection.js";
import { createTestECInstanceKey } from "../_helpers/Common.js";
import { act, renderHook, waitFor } from "../TestUtils.js";

describe("usePropertyDataProviderWithUnifiedSelection", () => {
  const imodelKey = "test-imodel-key";
  const setKeysSpy = sinon.stub<[KeySet], void>();
  const dataProvider = {
    set keys(newKeys: KeySet) {
      setKeysSpy(newKeys);
    },
    rulesetId: "test_ruleset_id",
    imodel: {
      key: imodelKey,
    } as IModelConnection,
  };

  beforeEach(() => {
    setKeysSpy.reset();
  });

  function getProvider() {
    return dataProvider as unknown as IPresentationPropertyDataProvider;
  }

  describe("with deprecated SelectionHandler", () => {
    let selectionHandler: sinon.SinonStubbedInstance<SelectionHandler>;
    function SelectionHandlerWrapper({ children }: PropsWithChildren<{}>) {
      return <SelectionHandlerContextProvider selectionHandler={selectionHandler}>{children}</SelectionHandlerContextProvider>;
    }

    beforeEach(() => {
      selectionHandler = sinon.createStubInstance(SelectionHandler);
      selectionHandler[Symbol.dispose] = sinon.stub();
    });

    it("doesn't set provider keys when handler returns no selection", () => {
      selectionHandler.getSelectionLevels.returns([]);

      const { result } = renderHook(usePropertyDataProviderWithUnifiedSelection, {
        initialProps: { dataProvider: getProvider() },
        wrapper: SelectionHandlerWrapper,
      });
      expect(result.current).to.not.be.undefined;
      expect(result.current.isOverLimit).to.be.false;
      expect(result.current.numSelectedElements).to.be.equal(0);

      expect(setKeysSpy).to.not.be.called;
    });

    it("sets empty keyset when handler returns empty selection", () => {
      selectionHandler.getSelectionLevels.returns([0]);
      selectionHandler.getSelection.returns(new KeySet());

      const { result } = renderHook(usePropertyDataProviderWithUnifiedSelection, {
        initialProps: { dataProvider: getProvider() },
        wrapper: SelectionHandlerWrapper,
      });
      expect(result.current).to.not.be.undefined;
      expect(result.current.isOverLimit).to.be.false;
      expect(result.current.numSelectedElements).to.be.equal(0);

      expect(setKeysSpy).to.be.calledWith(sinon.match((keys: KeySet) => keys.isEmpty));
    });

    it("sets keyset when handler returns a selection", () => {
      const setKeys = new KeySet([createTestECInstanceKey({ id: "0x1" }), createTestECInstanceKey({ id: "0x2" })]);

      selectionHandler.getSelectionLevels.returns([0]);
      selectionHandler.getSelection.returns(setKeys);

      const { result } = renderHook(usePropertyDataProviderWithUnifiedSelection, {
        initialProps: { dataProvider: getProvider() },
        wrapper: SelectionHandlerWrapper,
      });
      expect(result.current).to.not.be.undefined;
      expect(result.current.isOverLimit).to.be.false;
      expect(result.current.numSelectedElements).to.be.equal(2);

      expect(setKeysSpy).to.be.calledWith(sinon.match((keys: KeySet) => equalKeySets(setKeys, keys)));
    });

    it("sets empty keyset when handler returns selection containing more keys than set limit", () => {
      const setKeys = new KeySet([createTestECInstanceKey({ id: "0x1" }), createTestECInstanceKey({ id: "0x2" })]);
      const instancesLimit = 1;

      selectionHandler.getSelectionLevels.returns([0]);
      selectionHandler.getSelection.returns(setKeys);

      const { result } = renderHook(usePropertyDataProviderWithUnifiedSelection, {
        initialProps: { selectionHandler, requestedContentInstancesLimit: instancesLimit, dataProvider: getProvider() },
        wrapper: SelectionHandlerWrapper,
      });

      expect(result.current).to.not.be.undefined;
      expect(result.current.isOverLimit).to.be.true;
      expect(result.current.numSelectedElements).to.be.equal(2);

      expect(setKeysSpy).to.be.calledWith(sinon.match((keys: KeySet) => keys.isEmpty));
    });

    it("changes KeySet according to selection", () => {
      const keys0 = new KeySet([createTestECInstanceKey({ id: "0x1" }), createTestECInstanceKey({ id: "0x2" })]);
      const keys2 = new KeySet([createTestECInstanceKey({ id: "0x3" }), createTestECInstanceKey({ id: "0x4" })]);
      const imodel = {} as IModelConnection;
      const selectionProvider = {} as ISelectionProvider;
      const selectionEvent: SelectionChangeEventArgs = {
        changeType: SelectionChangeType.Add,
        imodel,
        keys: new KeySet(),
        level: 2,
        source: "Test",
        timestamp: new Date(),
      };

      selectionHandler.getSelectionLevels.returns([0]);
      selectionHandler.getSelection.callsFake((level) => {
        if (level === 0) {
          return keys0;
        }
        if (level === 2) {
          return keys2;
        }
        return new KeySet();
      });

      const { result } = renderHook(usePropertyDataProviderWithUnifiedSelection, {
        initialProps: { dataProvider: getProvider() },
        wrapper: SelectionHandlerWrapper,
      });

      expect(setKeysSpy).to.be.calledWith(sinon.match((keys: KeySet) => equalKeySets(keys0, keys)));

      expect(selectionHandler.onSelect).to.not.be.undefined;
      expect(result.current).to.not.be.undefined;
      expect(result.current.isOverLimit).to.be.false;
      expect(result.current.numSelectedElements).to.be.equal(2);

      act(() => {
        selectionHandler.onSelect!(selectionEvent, selectionProvider);
      });

      expect(setKeysSpy).to.be.calledWith(sinon.match((keys: KeySet) => equalKeySets(keys2, keys)));
    });

    it("disposes selection handler when unmounts", () => {
      const setKeys = new KeySet([createTestECInstanceKey({ id: "0x1" }), createTestECInstanceKey({ id: "0x2" })]);
      selectionHandler.getSelectionLevels.returns([0]);
      selectionHandler.getSelection.returns(setKeys);

      const { unmount } = renderHook(usePropertyDataProviderWithUnifiedSelection, {
        initialProps: { dataProvider: getProvider() },
        wrapper: SelectionHandlerWrapper,
      });

      unmount();
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      expect(selectionHandler.dispose).to.be.called;
    });
  });

  describe("with unified selection storage", () => {
    let selectionStorage: SelectionStorage;

    beforeEach(() => {
      selectionStorage = createStorage();
    });

    afterEach(() => {
      sinon.restore();
    });

    it("doesn't set provider keys when selection storage has no selection", () => {
      sinon.stub(selectionStorage, "getSelectionLevels").returns([]);
      const { result } = renderHook(usePropertyDataProviderWithUnifiedSelection, {
        initialProps: { selectionStorage, dataProvider: getProvider() },
      });
      expect(result.current).to.not.be.undefined;
      expect(result.current.isOverLimit).to.be.false;
      expect(result.current.numSelectedElements).to.be.equal(0);
      expect(setKeysSpy).to.not.be.called;
    });

    it("sets empty keyset when selection storage has empty selection", async () => {
      sinon.stub(selectionStorage, "getSelectionLevels").returns([0]);
      sinon.stub(selectionStorage, "getSelection").returns(Selectables.create([]));

      const { result } = renderHook(usePropertyDataProviderWithUnifiedSelection, {
        initialProps: { selectionStorage, dataProvider: getProvider() },
      });
      await waitFor(async () => {
        expect(result.current).to.not.be.undefined;
        expect(result.current.isOverLimit).to.be.false;
        expect(result.current.numSelectedElements).to.be.equal(0);
        expect(setKeysSpy).to.be.calledWith(sinon.match((keys: KeySet) => keys.isEmpty));
      });
    });

    it("sets keyset when selection storage has selection", async () => {
      const selectedInstances = [createTestECInstanceKey({ id: "0x1" }), createTestECInstanceKey({ id: "0x2" })];
      selectionStorage.addToSelection({ imodelKey, source: "test", selectables: selectedInstances });

      const { result } = renderHook(usePropertyDataProviderWithUnifiedSelection, {
        initialProps: { selectionStorage, dataProvider: getProvider() },
      });
      await waitFor(async () => {
        expect(result.current).to.not.be.undefined;
        expect(result.current.isOverLimit).to.be.false;
        expect(result.current.numSelectedElements).to.be.equal(2);
        expect(setKeysSpy).to.be.calledWith(sinon.match((keys: KeySet) => equalKeySets(new KeySet(selectedInstances), keys)));
      });
    });

    it("sets empty keyset when selection storage contains more keys than set limit", async () => {
      const selectedInstances = [createTestECInstanceKey({ id: "0x1" }), createTestECInstanceKey({ id: "0x2" })];
      selectionStorage.addToSelection({ imodelKey, source: "test", selectables: selectedInstances });

      const { result } = renderHook(usePropertyDataProviderWithUnifiedSelection, {
        initialProps: { selectionStorage, requestedContentInstancesLimit: 1, dataProvider: getProvider() },
      });
      await waitFor(async () => {
        expect(result.current).to.not.be.undefined;
        expect(result.current.isOverLimit).to.be.true;
        expect(result.current.numSelectedElements).to.be.equal(2);
        expect(setKeysSpy).to.be.calledWith(sinon.match((keys: KeySet) => keys.isEmpty));
      });
    });

    it("changes KeySet according to selection", async () => {
      const selectedInstances1 = [createTestECInstanceKey({ id: "0x1" }), createTestECInstanceKey({ id: "0x2" })];
      const selectedInstances2 = [createTestECInstanceKey({ id: "0x3" }), createTestECInstanceKey({ id: "0x4" })];

      selectionStorage.addToSelection({ imodelKey, source: "test", selectables: selectedInstances1 });

      const { result } = renderHook(usePropertyDataProviderWithUnifiedSelection, {
        initialProps: { selectionStorage, dataProvider: getProvider() },
      });
      await waitFor(async () => {
        expect(setKeysSpy).to.be.calledWith(sinon.match((keys: KeySet) => equalKeySets(new KeySet(selectedInstances1), keys)));
        expect(result.current).to.not.be.undefined;
        expect(result.current.isOverLimit).to.be.false;
        expect(result.current.numSelectedElements).to.be.equal(2);
      });

      act(() => {
        selectionStorage.replaceSelection({ imodelKey, source: "test", selectables: selectedInstances2 });
      });
      await waitFor(async () => {
        expect(setKeysSpy).to.be.calledWith(sinon.match((keys: KeySet) => equalKeySets(new KeySet(selectedInstances2), keys)));
      });
    });
  });
});

function equalKeySets(lhs: KeySet, rhs: KeySet) {
  return lhs.size === rhs.size && lhs.hasAll(rhs);
}
