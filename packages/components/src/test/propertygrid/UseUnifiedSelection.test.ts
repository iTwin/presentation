/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import sinon from "sinon";
import { IModelConnection } from "@itwin/core-frontend";
import { KeySet } from "@itwin/presentation-common";
import { ISelectionProvider, SelectionChangeEventArgs, SelectionChangeType, SelectionHandler } from "@itwin/presentation-frontend";
import { IPresentationPropertyDataProvider } from "../../presentation-components/propertygrid/DataProvider";
import { usePropertyDataProviderWithUnifiedSelection } from "../../presentation-components/propertygrid/UseUnifiedSelection";
import { createTestECInstanceKey } from "../_helpers/Common";
import { act, renderHook } from "../TestUtils";

describe("usePropertyDataProviderWithUnifiedSelection", () => {
  let selectionHandler: sinon.SinonStubbedInstance<SelectionHandler>;
  const setKeysSpy = sinon.stub<[KeySet], void>();
  const dataProvider = {
    set keys(newKeys: KeySet) {
      setKeysSpy(newKeys);
    },
    rulesetId: "test_ruleset_id",
    imodel: {} as IModelConnection,
  };

  function getProvider() {
    return dataProvider as unknown as IPresentationPropertyDataProvider;
  }

  beforeEach(() => {
    selectionHandler = sinon.createStubInstance(SelectionHandler);
    setKeysSpy.reset();
  });

  it("doesn't set provider keys when handler returns no selection", () => {
    selectionHandler.getSelectionLevels.returns([]);

    const { result } = renderHook(usePropertyDataProviderWithUnifiedSelection, {
      initialProps: { selectionHandler, dataProvider: getProvider() },
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
      initialProps: { selectionHandler, dataProvider: getProvider() },
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
      initialProps: { selectionHandler, dataProvider: getProvider() },
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
      initialProps: { selectionHandler, dataProvider: getProvider() },
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
      initialProps: { selectionHandler, dataProvider: getProvider() },
    });

    unmount();
    expect(selectionHandler.dispose).to.be.called;
  });
});

function equalKeySets(lhs: KeySet, rhs: KeySet) {
  return lhs.size === rhs.size && lhs.hasAll(rhs);
}
