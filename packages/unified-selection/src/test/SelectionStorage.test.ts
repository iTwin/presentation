/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import * as sinon from "sinon";
import * as moq from "typemoq";
import { IModelConnection } from "@itwin/core-frontend";
import { InstanceKey } from "@itwin/presentation-common";
import { SelectionStorage } from "../unified-selection/SelectionStorage";
import { createRandomSelectableECInstanceObject } from "./_helpers/SelectableObjectCreator";

const generateSelection = (): InstanceKey[] => {
  return [createRandomSelectableECInstanceObject(), createRandomSelectableECInstanceObject(), createRandomSelectableECInstanceObject()];
};

describe("SelectionStorage", () => {
  let selectionStorage: SelectionStorage;
  let baseSelection: InstanceKey[];
  const imodelMock = moq.Mock.ofType<IModelConnection>();
  const source: string = "test";

  beforeEach(() => {
    selectionStorage = new SelectionStorage();
    imodelMock.reset();
    baseSelection = generateSelection();
  });

  it("clears imodel selection when it's closed", () => {
    selectionStorage.addToSelection(source, imodelMock.object, [createRandomSelectableECInstanceObject()]);
    expect(selectionStorage.getSelection(imodelMock.object).isEmpty).to.be.false;

    IModelConnection.onClose.raiseEvent(imodelMock.object);
    expect(selectionStorage.getSelection(imodelMock.object).isEmpty).to.be.true;
  });

  describe("getSelectionLevels", () => {
    it("returns empty list when there're no selection levels", () => {
      expect(selectionStorage.getSelectionLevels(imodelMock.object)).to.be.empty;
    });

    it("returns available selection levels", () => {
      selectionStorage.addToSelection("", imodelMock.object, [createRandomSelectableECInstanceObject()], 0);
      selectionStorage.addToSelection("", imodelMock.object, [createRandomSelectableECInstanceObject()], 3);
      expect(selectionStorage.getSelectionLevels(imodelMock.object)).to.deep.eq([0, 3]);
    });

    it("doesn't include empty selection levels", () => {
      selectionStorage.addToSelection("", imodelMock.object, [createRandomSelectableECInstanceObject()], 0);
      selectionStorage.addToSelection("", imodelMock.object, [createRandomSelectableECInstanceObject()], 1);
      selectionStorage.addToSelection("", imodelMock.object, [], 2);
      expect(selectionStorage.getSelectionLevels(imodelMock.object)).to.deep.eq([0, 1]);
    });
  });

  describe("addToSelection", () => {
    it("adds selection on an empty selection", () => {
      selectionStorage.addToSelection(source, imodelMock.object, baseSelection);
      const selectedItemsSet = selectionStorage.getSelection(imodelMock.object);
      expect(selectedItemsSet.size).to.be.equal(baseSelection.length);

      for (const selectableObject of baseSelection) {
        expect(selectedItemsSet.has(selectableObject)).true;
      }
    });

    it("adds selection on non empty selection", () => {
      selectionStorage.addToSelection(source, imodelMock.object, [baseSelection[0]]);
      selectionStorage.addToSelection(source, imodelMock.object, [baseSelection[1], baseSelection[2]]);
      const selectedItemsSet = selectionStorage.getSelection(imodelMock.object);
      expect(selectedItemsSet.size).to.be.equal(baseSelection.length);

      for (const selectableObject of baseSelection) {
        expect(selectedItemsSet.has(selectableObject)).true;
      }
    });

    it("adds selection on different imodels", () => {
      const imodelMock2 = moq.Mock.ofType<IModelConnection>();
      selectionStorage.addToSelection(source, imodelMock.object, baseSelection);
      selectionStorage.addToSelection(source, imodelMock2.object, baseSelection);

      for (const imodelToken of [imodelMock.object, imodelMock2.object]) {
        const selectedItemsSet = selectionStorage.getSelection(imodelToken);
        expect(selectedItemsSet.size).to.be.equal(baseSelection.length);

        for (const selectableObject of baseSelection) {
          expect(selectedItemsSet.has(selectableObject)).true;
        }
      }
    });

    it("adds selection on different levels", () => {
      selectionStorage.addToSelection(source, imodelMock.object, baseSelection);
      selectionStorage.addToSelection(source, imodelMock.object, baseSelection, 1);
      for (let i = 0; i <= 1; i++) {
        const selectedItemsSet = selectionStorage.getSelection(imodelMock.object, i);
        expect(selectedItemsSet.size).to.be.equal(baseSelection.length);
        for (const selectableObject of baseSelection) {
          expect(selectedItemsSet.has(selectableObject)).true;
        }
      }
    });

    it("clears higher level selection when adding items to lower level selection", () => {
      selectionStorage.addToSelection(source, imodelMock.object, baseSelection);
      selectionStorage.addToSelection(source, imodelMock.object, [createRandomSelectableECInstanceObject()], 1);
      selectionStorage.addToSelection(source, imodelMock.object, [createRandomSelectableECInstanceObject()]);
      const selectedItemsSet = selectionStorage.getSelection(imodelMock.object, 1);
      expect(selectedItemsSet.isEmpty).to.be.true;
    });

    it("doesn't clear higher level selection when adding same items to lower level selection", () => {
      selectionStorage.addToSelection(source, imodelMock.object, baseSelection);
      selectionStorage.addToSelection(source, imodelMock.object, [createRandomSelectableECInstanceObject()], 1);
      selectionStorage.addToSelection(source, imodelMock.object, baseSelection);
      const selectedItemsSet = selectionStorage.getSelection(imodelMock.object, 1);
      expect(selectedItemsSet.isEmpty).to.be.false;
    });
  });

  describe("replaceSelection", () => {
    it("replaces selection on an empty selection", () => {
      selectionStorage.replaceSelection(source, imodelMock.object, baseSelection);
      const selectedItemsSet = selectionStorage.getSelection(imodelMock.object);
      expect(selectedItemsSet.size).to.be.equal(baseSelection.length);

      for (const selectableObject of baseSelection) {
        expect(selectedItemsSet.has(selectableObject)).true;
      }
    });

    it("replaces on an non empty selection", () => {
      selectionStorage.addToSelection(source, imodelMock.object, [baseSelection[0]]);
      selectionStorage.replaceSelection(source, imodelMock.object, [baseSelection[1], baseSelection[2]]);
      const selectedItemsSet = selectionStorage.getSelection(imodelMock.object);
      expect(selectedItemsSet.size).to.be.equal(baseSelection.length - 1);
      expect(selectedItemsSet.has(baseSelection[0])).false;
      expect(selectedItemsSet.has(baseSelection[1])).true;
      expect(selectedItemsSet.has(baseSelection[2])).true;
    });

    it("replaces on different imodels", () => {
      const imodelMock2 = moq.Mock.ofType<IModelConnection>();
      selectionStorage.replaceSelection(source, imodelMock.object, baseSelection);
      selectionStorage.replaceSelection(source, imodelMock2.object, baseSelection);

      for (const imodelToken of [imodelMock.object, imodelMock2.object]) {
        const selectedItemsSet = selectionStorage.getSelection(imodelToken);
        expect(selectedItemsSet.size).to.be.equal(baseSelection.length);

        for (const selectableObject of baseSelection) {
          expect(selectedItemsSet.has(selectableObject)).true;
        }
      }
    });

    it("replaces with different levels", () => {
      selectionStorage.replaceSelection(source, imodelMock.object, baseSelection);
      selectionStorage.replaceSelection(source, imodelMock.object, baseSelection, 1);
      for (let i = 0; i <= 1; i++) {
        const selectedItemsSet = selectionStorage.getSelection(imodelMock.object, i);
        expect(selectedItemsSet.size).to.be.equal(baseSelection.length);
        for (const selectableObject of baseSelection) {
          expect(selectedItemsSet.has(selectableObject)).true;
        }
      }
    });

    it("clears higher level selection when replacing lower level selection", () => {
      selectionStorage.addToSelection(source, imodelMock.object, baseSelection);
      selectionStorage.addToSelection(source, imodelMock.object, [createRandomSelectableECInstanceObject()], 1);
      selectionStorage.replaceSelection(source, imodelMock.object, [createRandomSelectableECInstanceObject()]);
      const selectedItemsSet = selectionStorage.getSelection(imodelMock.object, 1);
      expect(selectedItemsSet.isEmpty).to.be.true;
    });

    it("doesn't clear higher level selection when replacing lower level selection with same items", () => {
      selectionStorage.addToSelection(source, imodelMock.object, baseSelection);
      selectionStorage.addToSelection(source, imodelMock.object, [createRandomSelectableECInstanceObject()], 1);
      selectionStorage.replaceSelection(source, imodelMock.object, baseSelection);
      const selectedItemsSet = selectionStorage.getSelection(imodelMock.object, 1);
      expect(selectedItemsSet.isEmpty).to.be.false;
    });
  });

  describe("clearSelection", () => {
    it("clears empty selection", () => {
      selectionStorage.clearSelection(source, imodelMock.object);
      const selectedItemsSet = selectionStorage.getSelection(imodelMock.object);
      expect(selectedItemsSet.size).to.be.equal(0);
    });

    it("clears non empty selection", () => {
      selectionStorage.addToSelection(source, imodelMock.object, baseSelection);
      selectionStorage.clearSelection(source, imodelMock.object);
      expect(selectionStorage.getSelection(imodelMock.object).isEmpty).to.be.true;
    });

    it("clears on different imodels", () => {
      const imodelMock2 = moq.Mock.ofType<IModelConnection>();
      selectionStorage.addToSelection(source, imodelMock.object, baseSelection);
      selectionStorage.addToSelection(source, imodelMock2.object, baseSelection);

      selectionStorage.clearSelection(source, imodelMock2.object);

      let selectedItemsSet = selectionStorage.getSelection(imodelMock2.object);
      expect(selectedItemsSet.size).to.be.equal(0);

      selectedItemsSet = selectionStorage.getSelection(imodelMock.object);
      expect(selectedItemsSet.size).to.be.equal(baseSelection.length);

      for (const selectableObject of baseSelection) {
        expect(selectedItemsSet.has(selectableObject)).true;
      }
    });

    it("clears with different levels", () => {
      selectionStorage.addToSelection(source, imodelMock.object, baseSelection);
      selectionStorage.addToSelection(source, imodelMock.object, baseSelection, 1);

      selectionStorage.clearSelection(source, imodelMock.object, 1);
      let selectedItemsSet = selectionStorage.getSelection(imodelMock.object, 1);
      expect(selectedItemsSet.size).to.be.equal(0);

      selectedItemsSet = selectionStorage.getSelection(imodelMock.object);
      expect(selectedItemsSet.size).to.be.equal(baseSelection.length);

      for (const selectableObject of baseSelection) {
        expect(selectedItemsSet.has(selectableObject)).true;
      }
    });

    it("clears higher level selection when clearing items in lower level selection", () => {
      selectionStorage.addToSelection(source, imodelMock.object, baseSelection);
      selectionStorage.addToSelection(source, imodelMock.object, [createRandomSelectableECInstanceObject()], 1);
      selectionStorage.clearSelection(source, imodelMock.object);
      const selectedItemsSet = selectionStorage.getSelection(imodelMock.object, 1);
      expect(selectedItemsSet.isEmpty).to.be.true;
    });

    it("doesn't clears higher level selection when clearing empty lower level selection", () => {
      selectionStorage.addToSelection(source, imodelMock.object, [createRandomSelectableECInstanceObject()], 1);
      selectionStorage.clearSelection(source, imodelMock.object);
      const selectedItemsSet = selectionStorage.getSelection(imodelMock.object, 1);
      expect(selectedItemsSet.isEmpty).to.be.false;
    });
  });

  describe("removeFromSelection", () => {
    it("removes part of the selection", () => {
      selectionStorage.addToSelection(source, imodelMock.object, baseSelection);
      selectionStorage.removeFromSelection(source, imodelMock.object, [baseSelection[1], baseSelection[2]]);
      const selectedItemsSet = selectionStorage.getSelection(imodelMock.object);
      expect(selectedItemsSet.size).to.be.equal(baseSelection.length - 2);
      expect(selectedItemsSet.has(baseSelection[0])).true;
      expect(selectedItemsSet.has(baseSelection[1])).false;
      expect(selectedItemsSet.has(baseSelection[2])).false;
    });

    it("removes whole selection", () => {
      selectionStorage.addToSelection(source, imodelMock.object, baseSelection);
      selectionStorage.removeFromSelection(source, imodelMock.object, baseSelection);
      const selectedItemsSet = selectionStorage.getSelection(imodelMock.object);
      expect(selectedItemsSet.size).to.be.equal(0);
    });

    it("removes on different imodels", () => {
      const imodelMock2 = moq.Mock.ofType<IModelConnection>();
      selectionStorage.addToSelection(source, imodelMock.object, baseSelection);
      selectionStorage.addToSelection(source, imodelMock2.object, baseSelection);

      selectionStorage.removeFromSelection(source, imodelMock.object, [baseSelection[0]]);
      selectionStorage.removeFromSelection(source, imodelMock2.object, [baseSelection[1], baseSelection[2]]);
      let selectedItemsSet = selectionStorage.getSelection(imodelMock.object);
      expect(selectedItemsSet.size).to.be.equal(baseSelection.length - 1);
      expect(selectedItemsSet.has(baseSelection[0])).false;
      expect(selectedItemsSet.has(baseSelection[1])).true;
      expect(selectedItemsSet.has(baseSelection[2])).true;

      selectedItemsSet = selectionStorage.getSelection(imodelMock2.object);
      expect(selectedItemsSet.size).to.be.equal(baseSelection.length - 2);
      expect(selectedItemsSet.has(baseSelection[0])).true;
      expect(selectedItemsSet.has(baseSelection[1])).false;
      expect(selectedItemsSet.has(baseSelection[2])).false;
    });

    it("removes with different levels", () => {
      selectionStorage.addToSelection(source, imodelMock.object, baseSelection);
      selectionStorage.addToSelection(source, imodelMock.object, baseSelection, 1);
      selectionStorage.removeFromSelection(source, imodelMock.object, [baseSelection[0]], 1);

      let selectedItemsSet = selectionStorage.getSelection(imodelMock.object);
      expect(selectedItemsSet.size).to.be.equal(baseSelection.length);
      expect(selectedItemsSet.has(baseSelection[0])).true;
      expect(selectedItemsSet.has(baseSelection[1])).true;
      expect(selectedItemsSet.has(baseSelection[2])).true;

      selectedItemsSet = selectionStorage.getSelection(imodelMock.object, 1);
      expect(selectedItemsSet.size).to.be.equal(baseSelection.length - 1);
      expect(selectedItemsSet.has(baseSelection[0])).false;
      expect(selectedItemsSet.has(baseSelection[1])).true;
      expect(selectedItemsSet.has(baseSelection[2])).true;
    });

    it("clears higher level selection when removing items from lower level selection", () => {
      selectionStorage.addToSelection(source, imodelMock.object, baseSelection);
      selectionStorage.addToSelection(source, imodelMock.object, [createRandomSelectableECInstanceObject()], 1);
      selectionStorage.removeFromSelection(source, imodelMock.object, baseSelection);
      const selectedItemsSet = selectionStorage.getSelection(imodelMock.object, 1);
      expect(selectedItemsSet.isEmpty).to.be.true;
    });

    it("doesn't clear higher level selection when removing non-existing items from lower level selection", () => {
      selectionStorage.addToSelection(source, imodelMock.object, baseSelection);
      selectionStorage.addToSelection(source, imodelMock.object, [createRandomSelectableECInstanceObject()], 1);
      selectionStorage.removeFromSelection(source, imodelMock.object, [createRandomSelectableECInstanceObject()]);
      const selectedItemsSet = selectionStorage.getSelection(imodelMock.object, 1);
      expect(selectedItemsSet.isEmpty).to.be.false;
    });
  });

  describe("handleEvent", () => {
    it("fires `selectionChange` event after `addToSelection`, `replaceSelection`, `clearSelection`, `removeFromSelection`", () => {
      const raiseEventSpy = sinon.spy(selectionStorage.selectionChange, "raiseEvent");
      selectionStorage.addToSelection(source, imodelMock.object, baseSelection);
      selectionStorage.removeFromSelection(source, imodelMock.object, baseSelection);
      selectionStorage.replaceSelection(source, imodelMock.object, baseSelection);
      selectionStorage.clearSelection(source, imodelMock.object);
      expect(raiseEventSpy, "Expected selectionChange.raiseEvent to be called").to.have.callCount(4);
    });

    it("doesn't fire `selectionChange` event after addToSelection, replaceSelection, clearSelection, removeFromSelection if nothing changes", () => {
      const raiseEventSpy = sinon.spy(selectionStorage.selectionChange, "raiseEvent");
      selectionStorage.addToSelection(source, imodelMock.object, []);
      selectionStorage.clearSelection(source, imodelMock.object);
      selectionStorage.removeFromSelection(source, imodelMock.object, baseSelection);
      selectionStorage.replaceSelection(source, imodelMock.object, []);
      expect(raiseEventSpy, "Expected selectionChange.raiseEvent to not be called").to.not.have.been.called;
    });
  });
});
