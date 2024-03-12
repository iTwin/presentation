/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import sinon from "sinon";
import { CustomSelectable, Selectable, SelectableInstanceKey, Selectables } from "../unified-selection/Selectable";
import { createCustomSelectable, createECInstanceId, createSelectableInstanceKey } from "./_helpers/SelectablesCreator";

describe("Selectable", () => {
  describe("isInstanceKey", () => {
    it("returns true when selectable is instance key", () => {
      expect(Selectable.isInstanceKey(createSelectableInstanceKey())).to.be.true;
    });

    it("returns false when selectable is not instance key", () => {
      expect(Selectable.isInstanceKey(createCustomSelectable())).to.be.false;
    });
  });

  describe("isCustom", () => {
    it("returns true when selectable is custom selectable", () => {
      expect(Selectable.isCustom(createCustomSelectable())).to.be.true;
    });

    it("returns false when selectable is not custom selectable", () => {
      expect(Selectable.isCustom(createSelectableInstanceKey())).to.be.false;
    });
  });
});

describe("Selectables", () => {
  describe("size", () => {
    it("returns zero when selectables empty", () => {
      const selectables = {
        instanceKeys: new Map<string, Set<string>>(),
        custom: new Map<string, CustomSelectable>(),
      };
      expect(Selectables.size(selectables)).to.eq(0);
    });

    it("returns correct number of selectables", () => {
      const selectables = {
        instanceKeys: new Map<string, Set<string>>([
          ["class1", new Set(["id1", "id2"])],
          ["class2", new Set(["id1"])],
        ]),
        custom: new Map<string, CustomSelectable>([["id", createCustomSelectable()]]),
      };
      expect(Selectables.size(selectables)).to.eq(4);
    });
  });

  describe("isEmpty", () => {
    it("returns true when selectables empty", () => {
      const selectables = {
        instanceKeys: new Map<string, Set<string>>(),
        custom: new Map<string, CustomSelectable>(),
      };
      expect(Selectables.isEmpty(selectables)).to.be.true;
    });

    it("returns false when non empty", () => {
      const selectables = {
        instanceKeys: new Map<string, Set<string>>(),
        custom: new Map<string, CustomSelectable>([["id", createCustomSelectable()]]),
      };
      expect(Selectables.isEmpty(selectables)).to.be.false;
    });
  });

  describe("create", () => {
    it("creates empty selectables", () => {
      const selectables = Selectables.create([]);
      expect(selectables.instanceKeys.size).to.eq(0);
      expect(selectables.custom.size).to.eq(0);
    });

    it("creates from instance keys", () => {
      const selectableInstanceKeys = [createSelectableInstanceKey(1, "class1"), createSelectableInstanceKey(2, "class2")];
      const selectables = Selectables.create(selectableInstanceKeys);
      expect(selectables.instanceKeys.size).to.eq(2);
      expect(selectables.custom.size).to.eq(0);
      expect(Selectables.has(selectables, selectableInstanceKeys[0])).to.be.true;
      expect(Selectables.has(selectables, selectableInstanceKeys[1])).to.be.true;
    });

    it("creates from custom selectables", () => {
      const customSelectables = [createCustomSelectable(1), createCustomSelectable(2)];
      const selectables = Selectables.create(customSelectables);
      expect(selectables.instanceKeys.size).to.eq(0);
      expect(selectables.custom.size).to.eq(2);
      expect(Selectables.has(selectables, customSelectables[0])).to.be.true;
      expect(Selectables.has(selectables, customSelectables[1])).to.be.true;
    });
  });

  describe("clear", () => {
    it("clears custom selectables", () => {
      const customSelectables = [createCustomSelectable(1), createCustomSelectable(2)];
      const selectables = Selectables.create(customSelectables);
      expect(selectables.custom.size).to.be.eq(2);
      Selectables.clear(selectables);
      expect(selectables.custom.size).to.be.eq(0);
    });

    it("clears instance selectables", () => {
      const instanceSelectables = [createSelectableInstanceKey(1, "class1"), createSelectableInstanceKey(2, "class2")];
      const selectables = Selectables.create(instanceSelectables);
      expect(selectables.instanceKeys.size).to.eq(2);
      Selectables.clear(selectables);
      expect(selectables.instanceKeys.size).to.be.eq(0);
    });
  });

  describe("add", () => {
    it("adds a custom selectable", () => {
      const selectables = Selectables.create([createCustomSelectable(1)]);
      expect(selectables.custom.size).to.eq(1);
      const selectable = createCustomSelectable(2);
      Selectables.add(selectables, [selectable]);
      expect(selectables.custom.size).to.eq(2);
      expect(Selectables.has(selectables, selectable)).to.be.true;
    });

    it("does not add the same custom selectable", () => {
      const selectable = createCustomSelectable(1);
      const selectables = Selectables.create([selectable]);
      expect(selectables.custom.size).to.eq(1);

      Selectables.add(selectables, [selectable]);
      expect(selectables.custom.size).to.eq(1);
    });

    it("adds an instance key selectable", () => {
      const selectables = Selectables.create([createSelectableInstanceKey(1, "class1")]);
      expect(selectables.instanceKeys.size).to.eq(1);

      const selectable = createSelectableInstanceKey(2, "class2");
      Selectables.add(selectables, [selectable]);
      expect(selectables.instanceKeys.size).to.eq(2);
      expect(Selectables.has(selectables, selectable)).to.be.true;
    });

    it("does not add the same instance key selectable", () => {
      const selectable = createSelectableInstanceKey(1);
      const selectables = Selectables.create([selectable]);
      expect(selectables.instanceKeys.size).to.eq(1);
      Selectables.add(selectables, [selectable]);
      expect(selectables.instanceKeys.size).to.eq(1);
    });

    it("does not add the same instance key selectable with different format", () => {
      const selectable = createSelectableInstanceKey(1, "Schema:Class");
      const selectableFormat = createSelectableInstanceKey(1, "Schema.Class");
      const selectables = Selectables.create([selectable]);
      expect(Selectables.size(selectables)).to.eq(1);
      Selectables.add(selectables, [selectableFormat]);
      expect(Selectables.size(selectables)).to.eq(1);
    });

    it("adds an array of selectables", () => {
      const selectables = Selectables.create([]);
      const selectablesToAdd = [createCustomSelectable(), createSelectableInstanceKey(1)];
      Selectables.add(selectables, selectablesToAdd);
      expect(Selectables.size(selectables)).to.eq(2);
      expect(Selectables.has(selectables, selectablesToAdd[0])).to.be.true;
      expect(Selectables.has(selectables, selectablesToAdd[1])).to.be.true;
    });
  });

  describe("remove", () => {
    it("removes a custom selectable", () => {
      const customSelectables = [createCustomSelectable(1), createCustomSelectable(2), createCustomSelectable(3)];
      const selectables = Selectables.create(customSelectables);
      expect(selectables.custom.size).to.eq(3);
      Selectables.remove(selectables, [customSelectables[0]]);
      expect(selectables.custom.size).to.eq(2);
      expect(Selectables.has(selectables, customSelectables[0])).to.be.false;
    });

    it("removes an instance key selectable of the same class", () => {
      const instanceSelectables = [createSelectableInstanceKey(1, "class"), createSelectableInstanceKey(2, "class"), createSelectableInstanceKey(3, "class")];
      const selectables = Selectables.create(instanceSelectables);
      expect(Selectables.size(selectables)).to.eq(3);
      Selectables.remove(selectables, [instanceSelectables[1]]);
      expect(Selectables.size(selectables)).to.eq(2);
      expect(Selectables.has(selectables, instanceSelectables[1])).to.be.false;
    });

    it("removes an instance key selectable with different format", () => {
      const instanceSelectables = [createSelectableInstanceKey(1, "Schema:Class")];
      const selectableToRemove = createSelectableInstanceKey(1, "Schema.Class");
      const selectables = Selectables.create(instanceSelectables);
      expect(Selectables.size(selectables)).to.eq(1);
      Selectables.remove(selectables, [selectableToRemove]);
      expect(Selectables.size(selectables)).to.eq(0);
    });

    it("removes an instance key selectable of different classes", () => {
      const instanceSelectables = [
        createSelectableInstanceKey(1, "class1"),
        createSelectableInstanceKey(2, "class2"),
        createSelectableInstanceKey(3, "class3"),
      ];
      const selectables = Selectables.create(instanceSelectables);
      expect(Selectables.size(selectables)).to.eq(3);
      Selectables.remove(selectables, [instanceSelectables[1]]);
      expect(Selectables.size(selectables)).to.eq(2);
      expect(Selectables.has(selectables, instanceSelectables[1])).to.be.false;
    });

    it("removes an array of selectables", () => {
      const selectablesToRemove = [createCustomSelectable(1), createSelectableInstanceKey(1), createCustomSelectable(2)];
      const selectables = Selectables.create(selectablesToRemove);
      expect(Selectables.size(selectables)).to.eq(3);
      Selectables.remove(selectables, [selectablesToRemove[0], selectablesToRemove[1]]);
      expect(Selectables.size(selectables)).to.eq(1);
      expect(Selectables.has(selectables, selectablesToRemove[0])).to.be.false;
      expect(Selectables.has(selectables, selectablesToRemove[1])).to.be.false;
      expect(Selectables.has(selectables, selectablesToRemove[2])).to.be.true;
    });

    it("does nothing when trying to remove an non-existing instance key selectable", () => {
      const selectables = Selectables.create([createSelectableInstanceKey(1, "class1")]);
      expect(selectables.instanceKeys.size).to.eq(1);
      Selectables.remove(selectables, [createSelectableInstanceKey(2, "class2")]);
      expect(selectables.instanceKeys.size).to.eq(1);
    });

    it("does nothing when trying to remove a custom selectable from empty Selectables", () => {
      const selectables = Selectables.create([]);
      Selectables.remove(selectables, [createCustomSelectable(1)]);
      expect(selectables.custom.size).to.eq(0);
    });

    it("does nothing when trying to remove a non-existing custom selectable", () => {
      const selectables = Selectables.create([createCustomSelectable(1)]);
      expect(selectables.custom.size).to.eq(1);
      Selectables.remove(selectables, [createCustomSelectable(2)]);
      expect(selectables.custom.size).to.eq(1);
    });
  });

  describe("has", () => {
    it("returns true when Selectables contains instance key", () => {
      const instanceKey = createSelectableInstanceKey(1);
      const selectables = Selectables.create([instanceKey]);
      expect(Selectables.has(selectables, instanceKey)).to.be.true;
    });

    it("returns false when Selectables does not contain instance key", () => {
      const instanceKey = createSelectableInstanceKey(1);
      const selectables = Selectables.create([]);
      expect(Selectables.has(selectables, instanceKey)).to.be.false;
    });

    it("returns true when Selectables contains selectable in different format", () => {
      const instanceKey = createSelectableInstanceKey(1, "Schema:Class");
      const instanceKeyFormat = createSelectableInstanceKey(1, "Schema.Class");
      const selectables = Selectables.create([instanceKey]);
      expect(Selectables.has(selectables, instanceKeyFormat)).to.be.true;
    });

    it("returns true when Selectables contains custom selectable", () => {
      const customSelectable = createCustomSelectable(1);
      const selectables = Selectables.create([customSelectable]);
      expect(Selectables.has(selectables, customSelectable)).to.be.true;
    });

    it("returns false when Selectables does not contain custom selectable", () => {
      const customSelectable = createCustomSelectable(1);
      const selectables = Selectables.create([]);
      expect(Selectables.has(selectables, customSelectable)).to.be.false;
    });
  });

  describe("hasAll", () => {
    it("returns true when Selectables has all values", () => {
      const instanceKey1 = createSelectableInstanceKey(1);
      const instanceKey2 = createSelectableInstanceKey(2);
      const customSelectable1 = createCustomSelectable(1);
      const customSelectable2 = createCustomSelectable(2);
      const selectables = Selectables.create([instanceKey1, instanceKey2, customSelectable1, customSelectable2]);
      expect(Selectables.hasAll(selectables, [instanceKey1, customSelectable1])).to.be.true;
    });

    it("returns false when selectables count is smaller", () => {
      const customSelectable1 = createCustomSelectable(1);
      const customSelectable2 = createCustomSelectable(2);
      const selectables = Selectables.create([customSelectable1]);
      expect(Selectables.hasAll(selectables, [customSelectable1, customSelectable2])).to.be.false;
    });

    it("returns false when selectables are different", () => {
      const customSelectable1 = createCustomSelectable(1);
      const customSelectable2 = createCustomSelectable(2);
      const selectables = Selectables.create([customSelectable1]);
      expect(Selectables.hasAll(selectables, [customSelectable2])).to.be.false;
    });

    it("returns false when instance selectables count is smaller", () => {
      const instanceKey1 = createSelectableInstanceKey(1);
      const instanceKey2 = createSelectableInstanceKey(2);
      const selectables = Selectables.create([instanceKey1]);
      expect(Selectables.hasAll(selectables, [instanceKey1, instanceKey2])).to.be.false;
    });

    it("returns false when instance selectable classes are different", () => {
      const instanceKey1 = createSelectableInstanceKey();
      const instanceKey2: SelectableInstanceKey = {
        className: `${instanceKey1.className}_different`,
        id: instanceKey1.id,
      };
      const selectables = Selectables.create([instanceKey1]);
      expect(Selectables.hasAll(selectables, [instanceKey2])).to.be.false;
    });

    it("returns false when instance selectable has different id", () => {
      const instanceKey1 = createSelectableInstanceKey(1);
      const instanceKey2: SelectableInstanceKey = {
        className: instanceKey1.className,
        id: createECInstanceId(2),
      };
      const selectables = Selectables.create([instanceKey1]);
      expect(Selectables.hasAll(selectables, [instanceKey2])).to.be.false;
    });
  });

  describe("hasAny", () => {
    it("returns true when Selectables has any custom selectables", () => {
      const customSelectable1 = createCustomSelectable(1);
      const customSelectable2 = createCustomSelectable(2);
      const selectables = Selectables.create([customSelectable1, customSelectable2]);
      expect(Selectables.hasAny(selectables, [customSelectable2])).to.be.true;
    });

    it("returns true when Selectables has any instance selectable", () => {
      const instanceKey1 = createSelectableInstanceKey(1);
      const instanceKey2 = createSelectableInstanceKey(2);
      const instanceKey3 = createSelectableInstanceKey(3);
      const selectables = Selectables.create([instanceKey1, instanceKey2]);
      expect(Selectables.hasAny(selectables, [instanceKey2, instanceKey3])).to.be.true;
    });

    it("returns false when Selectables does not have any selectable", () => {
      const selectables = Selectables.create([createSelectableInstanceKey(1), createCustomSelectable(1)]);
      expect(Selectables.hasAny(selectables, [createSelectableInstanceKey(2), createCustomSelectable(2)])).to.be.false;
    });
  });

  describe("some", () => {
    it("returns true if callback returns true for instance selectable", () => {
      const instanceKey = createSelectableInstanceKey();
      const selectables = Selectables.create([instanceKey]);
      const callback = sinon.stub();
      callback.returns(true);
      expect(Selectables.some(selectables, callback)).to.be.true;
      expect(callback.callCount).to.eq(1);
      expect(callback).to.be.calledWith(instanceKey);
    });

    it("returns true if callback returns true for custom selectables", () => {
      const customSelectable = createCustomSelectable();
      const selectables = Selectables.create([customSelectable]);
      const callback = sinon.stub();
      callback.returns(true);
      expect(Selectables.some(selectables, callback)).to.be.true;
      expect(callback.callCount).to.eq(1);
      expect(callback).to.be.calledWith(customSelectable);
    });

    it("returns false if callback returns false", () => {
      const instanceKeys = [createSelectableInstanceKey(1), createSelectableInstanceKey(2)];
      const customSelectables = [createCustomSelectable(1), createCustomSelectable(2)];
      const selectables = Selectables.create([...instanceKeys, ...customSelectables]);
      const callback = sinon.stub();
      callback.returns(false);
      expect(Selectables.some(selectables, callback)).to.be.false;
      expect(callback.callCount).to.eq(4);
      expect(callback).to.be.calledWith(instanceKeys[0]);
      expect(callback).to.be.calledWith(instanceKeys[1]);
      expect(callback).to.be.calledWith(customSelectables[0]);
      expect(callback).to.be.calledWith(customSelectables[1]);
    });
  });

  describe("forEach", () => {
    it("calls callback for every selectable", () => {
      const instanceKeys = [createSelectableInstanceKey(1), createSelectableInstanceKey(2)];
      const customSelectables = [createCustomSelectable(1), createCustomSelectable(2)];
      const selectables = Selectables.create([...instanceKeys, ...customSelectables]);
      const callback = sinon.spy();
      Selectables.forEach(selectables, callback);
      expect(callback.callCount).to.eq(4);
      expect(callback).to.be.calledWith(instanceKeys[0]);
      expect(callback).to.be.calledWith(instanceKeys[1]);
      expect(callback).to.be.calledWith(customSelectables[0]);
      expect(callback).to.be.calledWith(customSelectables[1]);
    });
  });
});
