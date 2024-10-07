/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import * as sinon from "sinon";
import { SelectableInstanceKey, Selectables } from "../unified-selection/Selectable";
import { createStorage, SelectionStorage } from "../unified-selection/SelectionStorage";
import { createSelectableInstanceKey } from "./_helpers/SelectablesCreator";

const generateSelection = (): SelectableInstanceKey[] => {
  return [createSelectableInstanceKey(1, "base.Class1"), createSelectableInstanceKey(2, "base.Class2"), createSelectableInstanceKey(3, "base.Class3")];
};

describe("SelectionStorage", () => {
  let selectionStorage: SelectionStorage;
  let baseSelection: SelectableInstanceKey[];
  const imodelKey = "iModelKey";
  const source = "test";

  beforeEach(() => {
    selectionStorage = createStorage();
    baseSelection = generateSelection();
  });

  describe("clearStorage", () => {
    it("clears iModelKey selection", () => {
      selectionStorage.addToSelection({ imodelKey, source, selectables: [createSelectableInstanceKey()] });
      expect(Selectables.isEmpty(selectionStorage.getSelection({ imodelKey }))).to.be.false;
      const listenerSpy = sinon.spy(() => {});
      selectionStorage.selectionChangeEvent.addListener(listenerSpy);
      selectionStorage.clearStorage({ imodelKey });
      expect(Selectables.isEmpty(selectionStorage.getSelection({ imodelKey }))).to.be.true;
      expect(listenerSpy, "Expected selectionChange.onSelectionChange to be called").to.have.callCount(1);
    });
  });

  describe("getSelectionLevels", () => {
    it("returns empty list when there're no selection levels", () => {
      expect(selectionStorage.getSelectionLevels({ imodelKey })).to.be.empty;
    });

    it("returns available selection levels", () => {
      selectionStorage.addToSelection({ imodelKey, source: "", selectables: [createSelectableInstanceKey(1, "schema.class1")] });
      selectionStorage.addToSelection({ imodelKey, source: "", selectables: [createSelectableInstanceKey(2, "schema.class2")], level: 3 });
      expect(selectionStorage.getSelectionLevels({ imodelKey })).to.deep.eq([0, 3]);
    });

    it("doesn't include empty selection levels", () => {
      selectionStorage.addToSelection({ imodelKey, source: "", selectables: [createSelectableInstanceKey(1, "schema.class1")] });
      selectionStorage.addToSelection({ imodelKey, source: "", selectables: [createSelectableInstanceKey(2, "schema.class2")], level: 1 });
      selectionStorage.addToSelection({ imodelKey, source: "", selectables: [], level: 2 });
      expect(selectionStorage.getSelectionLevels({ imodelKey })).to.deep.eq([0, 1]);
    });

    it("returns available selection levels with deprecated `iModelKey` prop", () => {
      selectionStorage.addToSelection({ iModelKey: imodelKey, source: "", selectables: [createSelectableInstanceKey(1, "schema.class1")] });
      selectionStorage.addToSelection({ iModelKey: imodelKey, source: "", selectables: [createSelectableInstanceKey(2, "schema.class2")], level: 3 });
      expect(selectionStorage.getSelectionLevels({ iModelKey: imodelKey })).to.deep.eq([0, 3]);
    });
  });

  describe("addToSelection", () => {
    it("adds selection on an empty selection", () => {
      selectionStorage.addToSelection({ imodelKey, source, selectables: baseSelection });
      const selectables = selectionStorage.getSelection({ imodelKey });
      expect(Selectables.size(selectables)).to.be.equal(baseSelection.length);

      for (const selectable of baseSelection) {
        expect(Selectables.has(selectables, selectable)).true;
      }
    });

    it("adds selection on non empty selection", () => {
      selectionStorage.addToSelection({ imodelKey, source, selectables: [baseSelection[0]] });
      selectionStorage.addToSelection({ imodelKey, source, selectables: [baseSelection[1], baseSelection[2]] });
      const selectables = selectionStorage.getSelection({ imodelKey });
      expect(Selectables.size(selectables)).to.be.equal(baseSelection.length);

      for (const selectable of baseSelection) {
        expect(Selectables.has(selectables, selectable)).true;
      }
    });

    it("adds selection on different iModels", () => {
      const imodel2 = "iModel2";
      selectionStorage.addToSelection({ imodelKey, source, selectables: baseSelection });
      selectionStorage.addToSelection({ imodelKey: imodel2, source, selectables: baseSelection });

      for (const imodelToken of [imodelKey, imodel2]) {
        const selectables = selectionStorage.getSelection({ imodelKey: imodelToken });
        expect(Selectables.size(selectables)).to.be.equal(baseSelection.length);

        for (const selectable of baseSelection) {
          expect(Selectables.has(selectables, selectable)).true;
        }
      }
    });

    it("adds selection on different levels", () => {
      selectionStorage.addToSelection({ imodelKey, source, selectables: baseSelection });
      selectionStorage.addToSelection({ imodelKey, source, selectables: baseSelection, level: 1 });
      for (let i = 0; i <= 1; i++) {
        const selectables = selectionStorage.getSelection({ imodelKey, level: i });
        expect(Selectables.size(selectables)).to.be.equal(baseSelection.length);
        for (const selectable of baseSelection) {
          expect(Selectables.has(selectables, selectable)).true;
        }
      }
    });

    it("clears higher level selection when adding items to lower level selection", () => {
      selectionStorage.addToSelection({ imodelKey, source, selectables: baseSelection });
      selectionStorage.addToSelection({ imodelKey, source, selectables: [createSelectableInstanceKey(1, "schema.class1")], level: 1 });
      selectionStorage.addToSelection({ imodelKey, source, selectables: [createSelectableInstanceKey(2, "schema.class2")], level: 0 });
      const selectables = selectionStorage.getSelection({ imodelKey, level: 1 });
      expect(Selectables.isEmpty(selectables)).to.be.true;
    });

    it("doesn't clear higher level selection when adding same items to lower level selection", () => {
      selectionStorage.addToSelection({ imodelKey, source, selectables: baseSelection, level: 0 });
      selectionStorage.addToSelection({ imodelKey, source, selectables: [createSelectableInstanceKey(1)], level: 1 });
      selectionStorage.addToSelection({ imodelKey, source, selectables: baseSelection, level: 0 });
      const selectables = selectionStorage.getSelection({ imodelKey, level: 1 });
      expect(Selectables.isEmpty(selectables)).to.be.false;
    });
  });

  describe("replaceSelection", () => {
    it("replaces selection on an empty selection", () => {
      selectionStorage.replaceSelection({ imodelKey, source, selectables: baseSelection });
      const selectables = selectionStorage.getSelection({ imodelKey });
      expect(Selectables.size(selectables)).to.be.equal(baseSelection.length);

      for (const selectable of baseSelection) {
        expect(Selectables.has(selectables, selectable)).true;
      }
    });

    it("replaces on an non empty selection", () => {
      selectionStorage.addToSelection({ imodelKey, source, selectables: [baseSelection[0]] });
      selectionStorage.replaceSelection({ imodelKey, source, selectables: [baseSelection[1], baseSelection[2]] });
      const selectables = selectionStorage.getSelection({ imodelKey });
      expect(Selectables.size(selectables)).to.be.equal(baseSelection.length - 1);
      expect(Selectables.has(selectables, baseSelection[0])).false;
      expect(Selectables.has(selectables, baseSelection[1])).true;
      expect(Selectables.has(selectables, baseSelection[2])).true;
    });

    it("replaces on different iModels", () => {
      const imodel2 = "iModel2";
      selectionStorage.replaceSelection({ imodelKey, source, selectables: baseSelection });
      selectionStorage.replaceSelection({ imodelKey: imodel2, source, selectables: baseSelection });

      for (const imodelToken of [imodelKey, imodel2]) {
        const selectables = selectionStorage.getSelection({ imodelKey: imodelToken });
        expect(Selectables.size(selectables)).to.be.equal(baseSelection.length);

        for (const selectable of baseSelection) {
          expect(Selectables.has(selectables, selectable)).true;
        }
      }
    });

    it("replaces with different levels", () => {
      selectionStorage.replaceSelection({ imodelKey, source, selectables: baseSelection, level: 0 });
      selectionStorage.replaceSelection({ imodelKey, source, selectables: baseSelection, level: 1 });
      for (let i = 0; i <= 1; i++) {
        const selectables = selectionStorage.getSelection({ imodelKey, level: i });
        expect(Selectables.size(selectables)).to.be.equal(baseSelection.length);
        for (const selectable of baseSelection) {
          expect(Selectables.has(selectables, selectable)).true;
        }
      }
    });

    it("clears higher level selection when replacing lower level selection", () => {
      selectionStorage.addToSelection({ imodelKey, source, selectables: baseSelection, level: 0 });
      selectionStorage.addToSelection({ imodelKey, source, selectables: [createSelectableInstanceKey(1, "schema.class1")], level: 1 });
      selectionStorage.replaceSelection({ imodelKey, source, selectables: [createSelectableInstanceKey(2, "schema.class2")], level: 0 });
      const selectables = selectionStorage.getSelection({ imodelKey, level: 1 });
      expect(Selectables.isEmpty(selectables)).to.be.true;
    });

    it("doesn't clear higher level selection when replacing lower level selection with same items", () => {
      selectionStorage.addToSelection({ imodelKey, source, selectables: baseSelection, level: 0 });
      selectionStorage.addToSelection({ imodelKey, source, selectables: [createSelectableInstanceKey(1)], level: 1 });
      selectionStorage.replaceSelection({ imodelKey, source, selectables: baseSelection, level: 0 });
      const selectables = selectionStorage.getSelection({ imodelKey, level: 1 });
      expect(Selectables.isEmpty(selectables)).to.be.false;
    });
  });

  describe("clearSelection", () => {
    it("clears empty selection", () => {
      selectionStorage.clearSelection({ imodelKey, source });
      const selectables = selectionStorage.getSelection({ imodelKey });
      expect(Selectables.size(selectables)).to.be.equal(0);
    });

    it("clears non empty selection", () => {
      selectionStorage.addToSelection({ imodelKey, source, selectables: baseSelection });
      selectionStorage.clearSelection({ imodelKey, source });
      expect(Selectables.isEmpty(selectionStorage.getSelection({ imodelKey }))).to.be.true;
    });

    it("clears on different iModels", () => {
      const imodel2 = "iModel2";
      selectionStorage.addToSelection({ imodelKey, source, selectables: baseSelection });
      selectionStorage.addToSelection({ imodelKey: imodel2, source, selectables: baseSelection });

      selectionStorage.clearSelection({ imodelKey: imodel2, source });

      let selectables = selectionStorage.getSelection({ imodelKey: imodel2 });
      expect(Selectables.size(selectables)).to.be.equal(0);

      selectables = selectionStorage.getSelection({ imodelKey });
      expect(Selectables.size(selectables)).to.be.equal(baseSelection.length);

      for (const selectable of baseSelection) {
        expect(Selectables.has(selectables, selectable)).true;
      }
    });

    it("clears with different levels", () => {
      selectionStorage.addToSelection({ imodelKey, source, selectables: baseSelection, level: 0 });
      selectionStorage.addToSelection({ imodelKey, source, selectables: baseSelection, level: 1 });

      selectionStorage.clearSelection({ imodelKey, source, level: 1 });
      const selectablesAtLevel1 = selectionStorage.getSelection({ imodelKey, level: 1 });
      expect(Selectables.size(selectablesAtLevel1)).to.be.equal(0);

      const selectablesAtLevel0 = selectionStorage.getSelection({ imodelKey, level: 0 });
      expect(Selectables.size(selectablesAtLevel0)).to.be.equal(baseSelection.length);

      for (const selectable of baseSelection) {
        expect(Selectables.has(selectablesAtLevel0, selectable)).to.be.true;
      }
    });

    it("clears higher level selection when clearing items in lower level selection", () => {
      selectionStorage.addToSelection({ imodelKey, source, selectables: baseSelection, level: 0 });
      selectionStorage.addToSelection({ imodelKey, source, selectables: [createSelectableInstanceKey(1)], level: 1 });
      selectionStorage.clearSelection({ imodelKey, source, level: 0 });
      const selectables = selectionStorage.getSelection({ imodelKey, level: 1 });
      expect(Selectables.isEmpty(selectables)).to.be.true;
    });

    it("doesn't clear higher level selection when clearing empty lower level selection", () => {
      selectionStorage.addToSelection({ imodelKey, source, selectables: [createSelectableInstanceKey(1)], level: 1 });
      selectionStorage.clearSelection({ imodelKey, source, level: 0 });
      const selectables = selectionStorage.getSelection({ imodelKey, level: 1 });
      expect(Selectables.isEmpty(selectables)).to.be.false;
    });
  });

  describe("removeFromSelection", () => {
    it("removes part of the selection", () => {
      selectionStorage.addToSelection({ imodelKey, source, selectables: baseSelection });
      selectionStorage.removeFromSelection({ imodelKey, source, selectables: [baseSelection[1], baseSelection[2]] });
      const selectables = selectionStorage.getSelection({ imodelKey });
      expect(Selectables.size(selectables)).to.be.equal(baseSelection.length - 2);
      expect(Selectables.has(selectables, baseSelection[0])).true;
      expect(Selectables.has(selectables, baseSelection[1])).false;
      expect(Selectables.has(selectables, baseSelection[2])).false;
    });

    it("removes whole selection", () => {
      selectionStorage.addToSelection({ imodelKey, source, selectables: baseSelection });
      selectionStorage.removeFromSelection({ imodelKey, source, selectables: baseSelection });
      const selectables = selectionStorage.getSelection({ imodelKey });
      expect(Selectables.size(selectables)).to.be.equal(0);
    });

    it("removes on different iModels", () => {
      const imodel2 = "iModel2";
      selectionStorage.addToSelection({ imodelKey, source, selectables: baseSelection });
      selectionStorage.addToSelection({ imodelKey: imodel2, source, selectables: baseSelection });

      selectionStorage.removeFromSelection({ imodelKey, source, selectables: [baseSelection[0]] });
      selectionStorage.removeFromSelection({ imodelKey: imodel2, source, selectables: [baseSelection[1], baseSelection[2]] });
      let selectables = selectionStorage.getSelection({ imodelKey });
      expect(Selectables.size(selectables)).to.be.equal(baseSelection.length - 1);
      expect(Selectables.has(selectables, baseSelection[0])).false;
      expect(Selectables.has(selectables, baseSelection[1])).true;
      expect(Selectables.has(selectables, baseSelection[2])).true;

      selectables = selectionStorage.getSelection({ imodelKey: imodel2 });
      expect(Selectables.size(selectables)).to.be.equal(baseSelection.length - 2);
      expect(Selectables.has(selectables, baseSelection[0])).true;
      expect(Selectables.has(selectables, baseSelection[1])).false;
      expect(Selectables.has(selectables, baseSelection[2])).false;
    });

    it("removes with different levels", () => {
      selectionStorage.addToSelection({ imodelKey, source, selectables: baseSelection, level: 0 });
      selectionStorage.addToSelection({ imodelKey, source, selectables: baseSelection, level: 1 });
      selectionStorage.removeFromSelection({ imodelKey, source, selectables: [baseSelection[0]], level: 1 });

      const selectablesAtLevel0 = selectionStorage.getSelection({ imodelKey, level: 0 });
      expect(Selectables.size(selectablesAtLevel0)).to.be.equal(baseSelection.length);
      expect(Selectables.has(selectablesAtLevel0, baseSelection[0])).true;
      expect(Selectables.has(selectablesAtLevel0, baseSelection[1])).true;
      expect(Selectables.has(selectablesAtLevel0, baseSelection[2])).true;

      const selectablesAtLevel1 = selectionStorage.getSelection({ imodelKey, level: 1 });
      expect(Selectables.size(selectablesAtLevel1)).to.be.equal(baseSelection.length - 1);
      expect(Selectables.has(selectablesAtLevel1, baseSelection[0])).false;
      expect(Selectables.has(selectablesAtLevel1, baseSelection[1])).true;
      expect(Selectables.has(selectablesAtLevel1, baseSelection[2])).true;
    });

    it("clears higher level selection when removing items from lower level selection", () => {
      selectionStorage.addToSelection({ imodelKey, source, selectables: baseSelection, level: 0 });
      selectionStorage.addToSelection({ imodelKey, source, selectables: [createSelectableInstanceKey(1)], level: 1 });
      selectionStorage.removeFromSelection({ imodelKey, source, selectables: baseSelection, level: 0 });
      const selectables = selectionStorage.getSelection({ imodelKey, level: 1 });
      expect(Selectables.isEmpty(selectables)).to.be.true;
    });

    it("doesn't clear higher level selection when removing non-existing items from lower level selection", () => {
      selectionStorage.addToSelection({ imodelKey, source, selectables: baseSelection, level: 0 });
      selectionStorage.addToSelection({ imodelKey, source, selectables: [createSelectableInstanceKey(1, "schema.class1")], level: 1 });
      selectionStorage.removeFromSelection({ imodelKey, source, selectables: [createSelectableInstanceKey(2, "schema.class2")] });
      const selectables = selectionStorage.getSelection({ imodelKey, level: 1 });
      expect(Selectables.isEmpty(selectables)).to.be.false;
    });
  });

  describe("selectionChange", () => {
    it("fires `selectionChange` event after `addToSelection`, `replaceSelection`, `clearSelection`, `removeFromSelection`", () => {
      const listenerSpy = sinon.stub();
      selectionStorage.selectionChangeEvent.addListener(listenerSpy);
      selectionStorage.addToSelection({ imodelKey, source, selectables: baseSelection });
      selectionStorage.removeFromSelection({ imodelKey, source, selectables: baseSelection });
      selectionStorage.replaceSelection({ imodelKey, source, selectables: baseSelection });
      selectionStorage.clearSelection({ imodelKey, source });
      expect(listenerSpy, "Expected selectionChange.raiseEvent to be called").to.have.callCount(4);
    });

    it("doesn't fire `selectionChange` event after addToSelection, replaceSelection, clearSelection, removeFromSelection if nothing changes", () => {
      const listenerSpy = sinon.stub();
      selectionStorage.selectionChangeEvent.addListener(listenerSpy);
      selectionStorage.addToSelection({ imodelKey, source, selectables: [] });
      selectionStorage.clearSelection({ imodelKey, source });
      selectionStorage.removeFromSelection({ imodelKey, source, selectables: baseSelection });
      selectionStorage.replaceSelection({ imodelKey, source, selectables: [] });
      expect(listenerSpy, "Expected selectionChange.raiseEvent to not be called").to.not.have.been.called;
    });
  });
});
