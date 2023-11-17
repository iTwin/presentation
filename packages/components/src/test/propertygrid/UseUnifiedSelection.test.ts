/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import * as moq from "typemoq";
import { IModelConnection } from "@itwin/core-frontend";
import { KeySet } from "@itwin/presentation-common";
import { ISelectionProvider, SelectionChangeEventArgs, SelectionChangeType, SelectionHandler } from "@itwin/presentation-frontend";
import { IPresentationPropertyDataProvider } from "../../presentation-components/propertygrid/DataProvider";
import { usePropertyDataProviderWithUnifiedSelection } from "../../presentation-components/propertygrid/UseUnifiedSelection";
import { createTestECInstanceKey, isKeySet } from "../_helpers/Common";
import { act, renderHook } from "../TestUtils";

describe("usePropertyDataProviderWithUnifiedSelection", () => {
  const selectionHandlerMock = moq.Mock.ofType<SelectionHandler>();
  const dataProviderMock = moq.Mock.ofType<IPresentationPropertyDataProvider>();
  const testImodel = {} as IModelConnection;

  beforeEach(() => {
    selectionHandlerMock.reset();
    dataProviderMock.reset();

    dataProviderMock.setup((x) => x.rulesetId).returns(() => "test_ruleset_id");
    dataProviderMock.setup((x) => x.imodel).returns(() => testImodel);
  });

  it("doesn't set provider keys when handler returns no selection", () => {
    selectionHandlerMock.setup((x) => x.getSelectionLevels()).returns(() => []);
    const { result } = renderHook(usePropertyDataProviderWithUnifiedSelection, {
      initialProps: { selectionHandler: selectionHandlerMock.object, dataProvider: dataProviderMock.object },
    });
    expect(result.current).to.not.be.undefined;
    expect(result.current.isOverLimit).to.be.false;
    expect(result.current.numSelectedElements).to.be.equal(0);

    dataProviderMock.verify((x) => (x.keys = moq.It.isAny()), moq.Times.never());
  });

  it("sets empty keyset when handler returns empty selection", () => {
    selectionHandlerMock.setup((x) => x.getSelectionLevels()).returns(() => [0]);
    selectionHandlerMock.setup((x) => x.getSelection(0)).returns(() => new KeySet());
    const { result } = renderHook(usePropertyDataProviderWithUnifiedSelection, {
      initialProps: { selectionHandler: selectionHandlerMock.object, dataProvider: dataProviderMock.object },
    });
    expect(result.current).to.not.be.undefined;
    expect(result.current.isOverLimit).to.be.false;
    expect(result.current.numSelectedElements).to.be.equal(0);

    dataProviderMock.verify((x) => (x.keys = moq.It.is((keys) => keys.isEmpty)), moq.Times.atLeastOnce());
  });

  it("sets keyset when handler returns a selection", () => {
    const setKeys = new KeySet([createTestECInstanceKey({ id: "0x1" }), createTestECInstanceKey({ id: "0x2" })]);
    selectionHandlerMock.setup((x) => x.getSelectionLevels()).returns(() => [0]);
    selectionHandlerMock.setup((x) => x.getSelection(0)).returns(() => setKeys);
    const { result } = renderHook(usePropertyDataProviderWithUnifiedSelection, {
      initialProps: { selectionHandler: selectionHandlerMock.object, dataProvider: dataProviderMock.object },
    });
    expect(result.current).to.not.be.undefined;
    expect(result.current.isOverLimit).to.be.false;
    expect(result.current.numSelectedElements).to.be.equal(2);

    dataProviderMock.verify((x) => (x.keys = isKeySet(setKeys)), moq.Times.atLeastOnce());
  });

  it("sets empty keyset when handler returns selection containing more keys than set limit", () => {
    const setKeys = new KeySet([createTestECInstanceKey({ id: "0x1" }), createTestECInstanceKey({ id: "0x2" })]);
    const instancesLimit = 1;
    selectionHandlerMock.setup((x) => x.getSelectionLevels()).returns(() => [0]);
    selectionHandlerMock.setup((x) => x.getSelection(0)).returns(() => setKeys);

    const { result } = renderHook(usePropertyDataProviderWithUnifiedSelection, {
      initialProps: { selectionHandler: selectionHandlerMock.object, requestedContentInstancesLimit: instancesLimit, dataProvider: dataProviderMock.object },
    });

    expect(result.current).to.not.be.undefined;
    expect(result.current.isOverLimit).to.be.true;
    expect(result.current.numSelectedElements).to.be.equal(2);
    dataProviderMock.verify((x) => (x.keys = moq.It.is((keys) => keys.isEmpty)), moq.Times.atLeastOnce());
  });

  it("changes KeySet according to selection", () => {
    const keys0 = new KeySet([createTestECInstanceKey({ id: "0x1" }), createTestECInstanceKey({ id: "0x2" })]);
    const keys2 = new KeySet([createTestECInstanceKey({ id: "0x3" }), createTestECInstanceKey({ id: "0x4" })]);
    const imodelMock = moq.Mock.ofType<IModelConnection>();
    const selectionProviderMock = moq.Mock.ofType<ISelectionProvider>();
    const selectionEvent: SelectionChangeEventArgs = {
      changeType: SelectionChangeType.Add,
      imodel: imodelMock.object,
      keys: new KeySet(),
      level: 2,
      source: "Test",
      timestamp: new Date(),
    };
    selectionHandlerMock.setup((x) => x.getSelectionLevels()).returns(() => [0]);
    selectionHandlerMock.setup((x) => x.getSelection(0)).returns(() => keys0);
    selectionHandlerMock.setup((x) => x.getSelection(2)).returns(() => keys2);

    const { result } = renderHook(usePropertyDataProviderWithUnifiedSelection, {
      initialProps: { selectionHandler: selectionHandlerMock.object, dataProvider: dataProviderMock.object },
    });

    dataProviderMock.verify((x) => (x.keys = isKeySet(keys0)), moq.Times.atLeastOnce());

    expect(selectionHandlerMock.target.onSelect).to.not.be.undefined;
    expect(result.current).to.not.be.undefined;
    expect(result.current.isOverLimit).to.be.false;
    expect(result.current.numSelectedElements).to.be.equal(2);

    act(() => {
      selectionHandlerMock.target.onSelect!(selectionEvent, selectionProviderMock.object);
    });
    dataProviderMock.verify((x) => (x.keys = isKeySet(keys2)), moq.Times.atLeastOnce());
  });

  it("disposes selection handler when unmounts", () => {
    const setKeys = new KeySet([createTestECInstanceKey({ id: "0x1" }), createTestECInstanceKey({ id: "0x2" })]);
    selectionHandlerMock.setup((x) => x.getSelectionLevels()).returns(() => [0]);
    selectionHandlerMock.setup((x) => x.getSelection(0)).returns(() => setKeys);

    const { unmount } = renderHook(usePropertyDataProviderWithUnifiedSelection, {
      initialProps: { selectionHandler: selectionHandlerMock.object, dataProvider: dataProviderMock.object },
    });

    unmount();
    selectionHandlerMock.verify((x) => x.dispose(), moq.Times.atLeastOnce());
  });
});
