/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import * as sinon from "sinon";
import { HiliteSetProvider, HiliteSetProviderProps } from "../unified-selection/HiliteSetProvider";
import { IMetadataProvider } from "../unified-selection/queries/ECMetadata";
import { IECSqlQueryExecutor } from "../unified-selection/queries/ECSqlCore";
import { SelectableInstanceKey, Selectables } from "../unified-selection/Selectable";
import { createStorage, SelectionStorage } from "../unified-selection/SelectionStorage";
import { createSelectableInstanceKey } from "./_helpers/SelectablesCreator";

const generateSelection = (): SelectableInstanceKey[] => {
  return [createSelectableInstanceKey(1, "baseClass1"), createSelectableInstanceKey(2, "baseClass2"), createSelectableInstanceKey(3, "baseClass3")];
};

describe("SelectionStorage", () => {
  let selectionStorage: SelectionStorage;
  let baseSelection: SelectableInstanceKey[];
  const iModel = "iModelKey";
  const source: string = "test";

  beforeEach(() => {
    selectionStorage = createStorage();
    baseSelection = generateSelection();
  });

  describe("clearStorage", () => {
    it("clears iModel selection", () => {
      selectionStorage.addToSelection(source, iModel, [createSelectableInstanceKey()], 0);
      expect(Selectables.isEmpty(selectionStorage.getSelection(iModel, 0))).to.be.false;
      const listenerSpy = sinon.spy(() => {});
      selectionStorage.selectionChangeEvent.addListener(listenerSpy);
      selectionStorage.clearStorage(iModel);
      expect(Selectables.isEmpty(selectionStorage.getSelection(iModel, 0))).to.be.true;
      expect(listenerSpy, "Expected selectionChange.onSelectionChange to be called").to.have.callCount(1);
    });
  });

  describe("getSelectionLevels", () => {
    it("returns empty list when there're no selection levels", () => {
      expect(selectionStorage.getSelectionLevels(iModel)).to.be.empty;
    });

    it("returns available selection levels", () => {
      selectionStorage.addToSelection("", iModel, [createSelectableInstanceKey(1, "class1")], 0);
      selectionStorage.addToSelection("", iModel, [createSelectableInstanceKey(2, "class2")], 3);
      expect(selectionStorage.getSelectionLevels(iModel)).to.deep.eq([0, 3]);
    });

    it("doesn't include empty selection levels", () => {
      selectionStorage.addToSelection("", iModel, [createSelectableInstanceKey(1, "class1")], 0);
      selectionStorage.addToSelection("", iModel, [createSelectableInstanceKey(2, "class2")], 1);
      selectionStorage.addToSelection("", iModel, [], 2);
      expect(selectionStorage.getSelectionLevels(iModel)).to.deep.eq([0, 1]);
    });
  });

  describe("addToSelection", () => {
    it("adds selection on an empty selection", () => {
      selectionStorage.addToSelection(source, iModel, baseSelection, 0);
      const selectables = selectionStorage.getSelection(iModel, 0);
      expect(Selectables.size(selectables)).to.be.equal(baseSelection.length);

      for (const selectable of baseSelection) {
        expect(Selectables.has(selectables, selectable)).true;
      }
    });

    it("adds selection on non empty selection", () => {
      selectionStorage.addToSelection(source, iModel, [baseSelection[0]], 0);
      selectionStorage.addToSelection(source, iModel, [baseSelection[1], baseSelection[2]], 0);
      const selectables = selectionStorage.getSelection(iModel, 0);
      expect(Selectables.size(selectables)).to.be.equal(baseSelection.length);

      for (const selectable of baseSelection) {
        expect(Selectables.has(selectables, selectable)).true;
      }
    });

    it("adds selection on different iModels", () => {
      const iModel2 = "iModel2";
      selectionStorage.addToSelection(source, iModel, baseSelection, 0);
      selectionStorage.addToSelection(source, iModel2, baseSelection, 0);

      for (const iModelToken of [iModel, iModel2]) {
        const selectables = selectionStorage.getSelection(iModelToken, 0);
        expect(Selectables.size(selectables)).to.be.equal(baseSelection.length);

        for (const selectable of baseSelection) {
          expect(Selectables.has(selectables, selectable)).true;
        }
      }
    });

    it("adds selection on different levels", () => {
      selectionStorage.addToSelection(source, iModel, baseSelection, 0);
      selectionStorage.addToSelection(source, iModel, baseSelection, 1);
      for (let i = 0; i <= 1; i++) {
        const selectables = selectionStorage.getSelection(iModel, i);
        expect(Selectables.size(selectables)).to.be.equal(baseSelection.length);
        for (const selectable of baseSelection) {
          expect(Selectables.has(selectables, selectable)).true;
        }
      }
    });

    it("clears higher level selection when adding items to lower level selection", () => {
      selectionStorage.addToSelection(source, iModel, baseSelection, 0);
      selectionStorage.addToSelection(source, iModel, [createSelectableInstanceKey(1, "class1")], 1);
      selectionStorage.addToSelection(source, iModel, [createSelectableInstanceKey(2, "class2")], 0);
      const selectables = selectionStorage.getSelection(iModel, 1);
      expect(Selectables.isEmpty(selectables)).to.be.true;
    });

    it("doesn't clear higher level selection when adding same items to lower level selection", () => {
      selectionStorage.addToSelection(source, iModel, baseSelection, 0);
      selectionStorage.addToSelection(source, iModel, [createSelectableInstanceKey(1)], 1);
      selectionStorage.addToSelection(source, iModel, baseSelection, 0);
      const selectables = selectionStorage.getSelection(iModel, 1);
      expect(Selectables.isEmpty(selectables)).to.be.false;
    });
  });

  describe("replaceSelection", () => {
    it("replaces selection on an empty selection", () => {
      selectionStorage.replaceSelection(source, iModel, baseSelection, 0);
      const selectables = selectionStorage.getSelection(iModel, 0);
      expect(Selectables.size(selectables)).to.be.equal(baseSelection.length);

      for (const selectable of baseSelection) {
        expect(Selectables.has(selectables, selectable)).true;
      }
    });

    it("replaces on an non empty selection", () => {
      selectionStorage.addToSelection(source, iModel, [baseSelection[0]], 0);
      selectionStorage.replaceSelection(source, iModel, [baseSelection[1], baseSelection[2]], 0);
      const selectables = selectionStorage.getSelection(iModel, 0);
      expect(Selectables.size(selectables)).to.be.equal(baseSelection.length - 1);
      expect(Selectables.has(selectables, baseSelection[0])).false;
      expect(Selectables.has(selectables, baseSelection[1])).true;
      expect(Selectables.has(selectables, baseSelection[2])).true;
    });

    it("replaces on different iModels", () => {
      const iModel2 = "iModel2";
      selectionStorage.replaceSelection(source, iModel, baseSelection, 0);
      selectionStorage.replaceSelection(source, iModel2, baseSelection, 0);

      for (const iModelToken of [iModel, iModel2]) {
        const selectables = selectionStorage.getSelection(iModelToken, 0);
        expect(Selectables.size(selectables)).to.be.equal(baseSelection.length);

        for (const selectable of baseSelection) {
          expect(Selectables.has(selectables, selectable)).true;
        }
      }
    });

    it("replaces with different levels", () => {
      selectionStorage.replaceSelection(source, iModel, baseSelection, 0);
      selectionStorage.replaceSelection(source, iModel, baseSelection, 1);
      for (let i = 0; i <= 1; i++) {
        const selectables = selectionStorage.getSelection(iModel, i);
        expect(Selectables.size(selectables)).to.be.equal(baseSelection.length);
        for (const selectable of baseSelection) {
          expect(Selectables.has(selectables, selectable)).true;
        }
      }
    });

    it("clears higher level selection when replacing lower level selection", () => {
      selectionStorage.addToSelection(source, iModel, baseSelection, 0);
      selectionStorage.addToSelection(source, iModel, [createSelectableInstanceKey(1, "class1")], 1);
      selectionStorage.replaceSelection(source, iModel, [createSelectableInstanceKey(2, "class2")], 0);
      const selectables = selectionStorage.getSelection(iModel, 1);
      expect(Selectables.isEmpty(selectables)).to.be.true;
    });

    it("doesn't clear higher level selection when replacing lower level selection with same items", () => {
      selectionStorage.addToSelection(source, iModel, baseSelection, 0);
      selectionStorage.addToSelection(source, iModel, [createSelectableInstanceKey(1)], 1);
      selectionStorage.replaceSelection(source, iModel, baseSelection, 0);
      const selectables = selectionStorage.getSelection(iModel, 1);
      expect(Selectables.isEmpty(selectables)).to.be.false;
    });
  });

  describe("clearSelection", () => {
    it("clears empty selection", () => {
      selectionStorage.clearSelection(source, iModel, 0);
      const selectables = selectionStorage.getSelection(iModel, 0);
      expect(Selectables.size(selectables)).to.be.equal(0);
    });

    it("clears non empty selection", () => {
      selectionStorage.addToSelection(source, iModel, baseSelection, 0);
      selectionStorage.clearSelection(source, iModel, 0);
      expect(Selectables.isEmpty(selectionStorage.getSelection(iModel, 0))).to.be.true;
    });

    it("clears on different iModels", () => {
      const iModel2 = "iModel2";
      selectionStorage.addToSelection(source, iModel, baseSelection, 0);
      selectionStorage.addToSelection(source, iModel2, baseSelection, 0);

      selectionStorage.clearSelection(source, iModel2, 0);

      let selectables = selectionStorage.getSelection(iModel2, 0);
      expect(Selectables.size(selectables)).to.be.equal(0);

      selectables = selectionStorage.getSelection(iModel, 0);
      expect(Selectables.size(selectables)).to.be.equal(baseSelection.length);

      for (const selectable of baseSelection) {
        expect(Selectables.has(selectables, selectable)).true;
      }
    });

    it("clears with different levels", () => {
      selectionStorage.addToSelection(source, iModel, baseSelection, 0);
      selectionStorage.addToSelection(source, iModel, baseSelection, 1);

      selectionStorage.clearSelection(source, iModel, 1);
      let selectables = selectionStorage.getSelection(iModel, 1);
      expect(Selectables.size(selectables)).to.be.equal(0);

      selectables = selectionStorage.getSelection(iModel, 0);
      expect(Selectables.size(selectables)).to.be.equal(baseSelection.length);

      for (const selectable of baseSelection) {
        expect(Selectables.has(selectables, selectable)).true;
      }
    });

    it("clears higher level selection when clearing items in lower level selection", () => {
      selectionStorage.addToSelection(source, iModel, baseSelection, 0);
      selectionStorage.addToSelection(source, iModel, [createSelectableInstanceKey(1)], 1);
      selectionStorage.clearSelection(source, iModel, 0);
      const selectables = selectionStorage.getSelection(iModel, 1);
      expect(Selectables.isEmpty(selectables)).to.be.true;
    });

    it("doesn't clears higher level selection when clearing empty lower level selection", () => {
      selectionStorage.addToSelection(source, iModel, [createSelectableInstanceKey(1)], 1);
      selectionStorage.clearSelection(source, iModel, 0);
      const selectables = selectionStorage.getSelection(iModel, 1);
      expect(Selectables.isEmpty(selectables)).to.be.false;
    });
  });

  describe("removeFromSelection", () => {
    it("removes part of the selection", () => {
      selectionStorage.addToSelection(source, iModel, baseSelection, 0);
      selectionStorage.removeFromSelection(source, iModel, [baseSelection[1], baseSelection[2]], 0);
      const selectables = selectionStorage.getSelection(iModel, 0);
      expect(Selectables.size(selectables)).to.be.equal(baseSelection.length - 2);
      expect(Selectables.has(selectables, baseSelection[0])).true;
      expect(Selectables.has(selectables, baseSelection[1])).false;
      expect(Selectables.has(selectables, baseSelection[2])).false;
    });

    it("removes whole selection", () => {
      selectionStorage.addToSelection(source, iModel, baseSelection, 0);
      selectionStorage.removeFromSelection(source, iModel, baseSelection, 0);
      const selectables = selectionStorage.getSelection(iModel, 0);
      expect(Selectables.size(selectables)).to.be.equal(0);
    });

    it("removes on different iModels", () => {
      const iModel2 = "iModel2";
      selectionStorage.addToSelection(source, iModel, baseSelection, 0);
      selectionStorage.addToSelection(source, iModel2, baseSelection, 0);

      selectionStorage.removeFromSelection(source, iModel, [baseSelection[0]], 0);
      selectionStorage.removeFromSelection(source, iModel2, [baseSelection[1], baseSelection[2]], 0);
      let selectables = selectionStorage.getSelection(iModel, 0);
      expect(Selectables.size(selectables)).to.be.equal(baseSelection.length - 1);
      expect(Selectables.has(selectables, baseSelection[0])).false;
      expect(Selectables.has(selectables, baseSelection[1])).true;
      expect(Selectables.has(selectables, baseSelection[2])).true;

      selectables = selectionStorage.getSelection(iModel2, 0);
      expect(Selectables.size(selectables)).to.be.equal(baseSelection.length - 2);
      expect(Selectables.has(selectables, baseSelection[0])).true;
      expect(Selectables.has(selectables, baseSelection[1])).false;
      expect(Selectables.has(selectables, baseSelection[2])).false;
    });

    it("removes with different levels", () => {
      selectionStorage.addToSelection(source, iModel, baseSelection, 0);
      selectionStorage.addToSelection(source, iModel, baseSelection, 1);
      selectionStorage.removeFromSelection(source, iModel, [baseSelection[0]], 1);

      let selectables = selectionStorage.getSelection(iModel, 0);
      expect(Selectables.size(selectables)).to.be.equal(baseSelection.length);
      expect(Selectables.has(selectables, baseSelection[0])).true;
      expect(Selectables.has(selectables, baseSelection[1])).true;
      expect(Selectables.has(selectables, baseSelection[2])).true;

      selectables = selectionStorage.getSelection(iModel, 1);
      expect(Selectables.size(selectables)).to.be.equal(baseSelection.length - 1);
      expect(Selectables.has(selectables, baseSelection[0])).false;
      expect(Selectables.has(selectables, baseSelection[1])).true;
      expect(Selectables.has(selectables, baseSelection[2])).true;
    });

    it("clears higher level selection when removing items from lower level selection", () => {
      selectionStorage.addToSelection(source, iModel, baseSelection, 0);
      selectionStorage.addToSelection(source, iModel, [createSelectableInstanceKey(1)], 1);
      selectionStorage.removeFromSelection(source, iModel, baseSelection, 0);
      const selectables = selectionStorage.getSelection(iModel, 1);
      expect(Selectables.isEmpty(selectables)).to.be.true;
    });

    it("doesn't clear higher level selection when removing non-existing items from lower level selection", () => {
      selectionStorage.addToSelection(source, iModel, baseSelection, 0);
      selectionStorage.addToSelection(source, iModel, [createSelectableInstanceKey(1, "class1")], 1);
      selectionStorage.removeFromSelection(source, iModel, [createSelectableInstanceKey(2, "class2")], 0);
      const selectables = selectionStorage.getSelection(iModel, 1);
      expect(Selectables.isEmpty(selectables)).to.be.false;
    });
  });

  describe("selectionChange", () => {
    it("fires `selectionChange` event after `addToSelection`, `replaceSelection`, `clearSelection`, `removeFromSelection`", () => {
      const listenerSpy = sinon.spy(() => {});
      selectionStorage.selectionChangeEvent.addListener(listenerSpy);
      selectionStorage.addToSelection(source, iModel, baseSelection, 0);
      selectionStorage.removeFromSelection(source, iModel, baseSelection, 0);
      selectionStorage.replaceSelection(source, iModel, baseSelection, 0);
      selectionStorage.clearSelection(source, iModel, 0);
      expect(listenerSpy, "Expected selectionChange.raiseEvent to be called").to.have.callCount(4);
    });

    it("doesn't fire `selectionChange` event after addToSelection, replaceSelection, clearSelection, removeFromSelection if nothing changes", () => {
      const listenerSpy = sinon.spy(() => {});
      selectionStorage.selectionChangeEvent.addListener(listenerSpy);
      selectionStorage.addToSelection(source, iModel, [], 0);
      selectionStorage.clearSelection(source, iModel, 0);
      selectionStorage.removeFromSelection(source, iModel, baseSelection, 0);
      selectionStorage.replaceSelection(source, iModel, [], 0);
      expect(listenerSpy, "Expected selectionChange.raiseEvent to not be called").to.not.have.been.called;
    });
  });

  describe("getHiliteSet", () => {
    let factory: sinon.SinonStub<[HiliteSetProviderProps], HiliteSetProvider>;

    beforeEach(() => {
      const provider = { getHiliteSet: async () => {} } as unknown as HiliteSetProvider;
      factory = sinon.stub(HiliteSetProvider, "create").returns(provider);
    });

    afterEach(() => {
      factory.restore();
    });

    it("creates provider once for iModel", async () => {
      // first call for an iModel should create a provider
      const executor1 = {} as IECSqlQueryExecutor;
      const executor2 = {} as IECSqlQueryExecutor;
      const metadataProvider1 = {} as IMetadataProvider;
      const metadataProvider2 = {} as IMetadataProvider;

      await selectionStorage.getHiliteSet("model1", executor1, metadataProvider1);
      expect(factory).to.be.calledOnceWith({ queryExecutor: executor1, metadataProvider: metadataProvider1 });
      factory.resetHistory();

      // second call with same iModel shouldn't create a new provider
      await selectionStorage.getHiliteSet("model1", executor1, metadataProvider1);
      expect(factory).to.not.be.called;

      // another iModel - new provider
      await selectionStorage.getHiliteSet("model2", executor2, metadataProvider2);
      expect(factory).to.be.calledOnceWith({ queryExecutor: executor2, metadataProvider: metadataProvider2 });
      factory.resetHistory();

      // make sure we still have provider for the first iModel
      await selectionStorage.getHiliteSet("model1", executor1, metadataProvider1);
      expect(factory).to.not.be.called;
    });
  });
});
