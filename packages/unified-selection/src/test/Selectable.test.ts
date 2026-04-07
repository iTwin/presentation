/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { collect } from "presentation-test-utilities";
import { describe, expect, it, vi } from "vitest";
import { CustomSelectable, Selectable, SelectableInstanceKey, Selectables, TRANSIENT_ELEMENT_CLASSNAME } from "../unified-selection/Selectable.js";
import { createCustomSelectable, createECInstanceId, createSelectableInstanceKey } from "./_helpers/SelectablesCreator.js";

describe("Selectable", () => {
  describe("isInstanceKey", () => {
    it("returns true when selectable is instance key", () => {
      expect(Selectable.isInstanceKey(createSelectableInstanceKey())).toBe(true);
    });

    it("returns false when selectable is not instance key", () => {
      expect(Selectable.isInstanceKey(createCustomSelectable())).toBe(false);
    });
  });

  describe("isCustom", () => {
    it("returns true when selectable is custom selectable", () => {
      expect(Selectable.isCustom(createCustomSelectable())).toBe(true);
    });

    it("returns false when selectable is not custom selectable", () => {
      expect(Selectable.isCustom(createSelectableInstanceKey())).toBe(false);
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
      expect(Selectables.size(selectables)).toBe(0);
    });

    it("returns correct number of selectables", () => {
      const selectables = {
        instanceKeys: new Map<string, Set<string>>([
          ["class1", new Set(["id1", "id2"])],
          ["class2", new Set(["id1"])],
        ]),
        custom: new Map<string, CustomSelectable>([["id", createCustomSelectable()]]),
      };
      expect(Selectables.size(selectables)).toBe(4);
    });
  });

  describe("isEmpty", () => {
    it("returns true when selectables empty", () => {
      const selectables = {
        instanceKeys: new Map<string, Set<string>>(),
        custom: new Map<string, CustomSelectable>(),
      };
      expect(Selectables.isEmpty(selectables)).toBe(true);
    });

    it("returns false when non empty", () => {
      const selectables = {
        instanceKeys: new Map<string, Set<string>>(),
        custom: new Map<string, CustomSelectable>([["id", createCustomSelectable()]]),
      };
      expect(Selectables.isEmpty(selectables)).toBe(false);
    });
  });

  describe("create", () => {
    it("creates empty selectables", () => {
      const selectables = Selectables.create([]);
      expect(selectables.instanceKeys.size).toBe(0);
      expect(selectables.custom.size).toBe(0);
    });

    it("creates from instance keys", () => {
      const selectableInstanceKeys = [createSelectableInstanceKey(1, "schema.class1"), createSelectableInstanceKey(2, "schema.class2")];
      const selectables = Selectables.create(selectableInstanceKeys);
      expect(selectables.instanceKeys.size).toBe(2);
      expect(selectables.custom.size).toBe(0);
      expect(Selectables.has(selectables, selectableInstanceKeys[0])).toBe(true);
      expect(Selectables.has(selectables, selectableInstanceKeys[1])).toBe(true);
    });

    it("creates from custom selectables", () => {
      const customSelectables = [createCustomSelectable(1), createCustomSelectable(2)];
      const selectables = Selectables.create(customSelectables);
      expect(selectables.instanceKeys.size).toBe(0);
      expect(selectables.custom.size).toBe(2);
      expect(Selectables.has(selectables, customSelectables[0])).toBe(true);
      expect(Selectables.has(selectables, customSelectables[1])).toBe(true);
    });
  });

  describe("clear", () => {
    it("clears custom selectables", () => {
      const customSelectables = [createCustomSelectable(1), createCustomSelectable(2)];
      const selectables = Selectables.create(customSelectables);
      expect(selectables.custom.size).toBe(2);
      Selectables.clear(selectables);
      expect(selectables.custom.size).toBe(0);
    });

    it("clears instance selectables", () => {
      const instanceSelectables = [createSelectableInstanceKey(1, "schema.class1"), createSelectableInstanceKey(2, "schema.class2")];
      const selectables = Selectables.create(instanceSelectables);
      expect(selectables.instanceKeys.size).toBe(2);
      Selectables.clear(selectables);
      expect(selectables.instanceKeys.size).toBe(0);
    });
  });

  describe("add", () => {
    it("adds a custom selectable", () => {
      const selectables = Selectables.create([createCustomSelectable(1)]);
      expect(selectables.custom.size).toBe(1);
      const selectable = createCustomSelectable(2);
      Selectables.add(selectables, [selectable]);
      expect(selectables.custom.size).toBe(2);
      expect(Selectables.has(selectables, selectable)).toBe(true);
    });

    it("does not add the same custom selectable", () => {
      const selectable = createCustomSelectable(1);
      const selectables = Selectables.create([selectable]);
      expect(selectables.custom.size).toBe(1);

      Selectables.add(selectables, [selectable]);
      expect(selectables.custom.size).toBe(1);
    });

    it("adds an instance key selectable", () => {
      const selectables = Selectables.create([createSelectableInstanceKey(1, "schema.class1")]);
      expect(selectables.instanceKeys.size).toBe(1);

      const selectable = createSelectableInstanceKey(2, "schema.class2");
      Selectables.add(selectables, [selectable]);
      expect(selectables.instanceKeys.size).toBe(2);
      expect(Selectables.has(selectables, selectable)).toBe(true);
    });

    it("does not add the same instance key selectable", () => {
      const selectable = createSelectableInstanceKey(1);
      const selectables = Selectables.create([selectable]);
      expect(selectables.instanceKeys.size).toBe(1);
      Selectables.add(selectables, [selectable]);
      expect(selectables.instanceKeys.size).toBe(1);
    });

    it("does not add the same instance key selectable with different format", () => {
      const selectable = createSelectableInstanceKey(1, "Schema:Class");
      const selectableFormat = createSelectableInstanceKey(1, "Schema.Class");
      const selectables = Selectables.create([selectable]);
      expect(Selectables.size(selectables)).toBe(1);
      Selectables.add(selectables, [selectableFormat]);
      expect(Selectables.size(selectables)).toBe(1);
    });

    it("adds transient element instance key", () => {
      const selectable = createSelectableInstanceKey(1, TRANSIENT_ELEMENT_CLASSNAME);
      const selectables = Selectables.create([selectable]);
      expect(Selectables.size(selectables)).toBe(1);
    });

    it("adds an array of selectables", () => {
      const selectables = Selectables.create([]);
      const selectablesToAdd = [createCustomSelectable(), createSelectableInstanceKey(1)];
      Selectables.add(selectables, selectablesToAdd);
      expect(Selectables.size(selectables)).toBe(2);
      expect(Selectables.has(selectables, selectablesToAdd[0])).toBe(true);
      expect(Selectables.has(selectables, selectablesToAdd[1])).toBe(true);
    });
  });

  describe("remove", () => {
    it("removes a custom selectable", () => {
      const customSelectables = [createCustomSelectable(1), createCustomSelectable(2), createCustomSelectable(3)];
      const selectables = Selectables.create(customSelectables);
      expect(selectables.custom.size).toBe(3);
      Selectables.remove(selectables, [customSelectables[0]]);
      expect(selectables.custom.size).toBe(2);
      expect(Selectables.has(selectables, customSelectables[0])).toBe(false);
    });

    it("removes an instance key selectable of the same class", () => {
      const instanceSelectables = [
        createSelectableInstanceKey(1, "schema.class"),
        createSelectableInstanceKey(2, "schema.class"),
        createSelectableInstanceKey(3, "schema.class"),
      ];
      const selectables = Selectables.create(instanceSelectables);
      expect(Selectables.size(selectables)).toBe(3);
      Selectables.remove(selectables, [instanceSelectables[1]]);
      expect(Selectables.size(selectables)).toBe(2);
      expect(Selectables.has(selectables, instanceSelectables[1])).toBe(false);
    });

    it("removes an instance key selectable with different format", () => {
      const instanceSelectables = [createSelectableInstanceKey(1, "Schema:Class")];
      const selectableToRemove = createSelectableInstanceKey(1, "Schema.Class");
      const selectables = Selectables.create(instanceSelectables);
      expect(Selectables.size(selectables)).toBe(1);
      Selectables.remove(selectables, [selectableToRemove]);
      expect(Selectables.size(selectables)).toBe(0);
    });

    it("removes an instance key selectable of different classes", () => {
      const instanceSelectables = [
        createSelectableInstanceKey(1, "schema.class1"),
        createSelectableInstanceKey(2, "schema.class2"),
        createSelectableInstanceKey(3, "schema.class3"),
      ];
      const selectables = Selectables.create(instanceSelectables);
      expect(Selectables.size(selectables)).toBe(3);
      Selectables.remove(selectables, [instanceSelectables[1]]);
      expect(Selectables.size(selectables)).toBe(2);
      expect(Selectables.has(selectables, instanceSelectables[1])).toBe(false);
    });

    it("removes an array of selectables", () => {
      const selectablesToRemove = [createCustomSelectable(1), createSelectableInstanceKey(1), createCustomSelectable(2)];
      const selectables = Selectables.create(selectablesToRemove);
      expect(Selectables.size(selectables)).toBe(3);
      Selectables.remove(selectables, [selectablesToRemove[0], selectablesToRemove[1]]);
      expect(Selectables.size(selectables)).toBe(1);
      expect(Selectables.has(selectables, selectablesToRemove[0])).toBe(false);
      expect(Selectables.has(selectables, selectablesToRemove[1])).toBe(false);
      expect(Selectables.has(selectables, selectablesToRemove[2])).toBe(true);
    });

    it("does nothing when trying to remove an non-existing instance key selectable", () => {
      const selectables = Selectables.create([createSelectableInstanceKey(1, "schema.class1")]);
      expect(selectables.instanceKeys.size).toBe(1);
      Selectables.remove(selectables, [createSelectableInstanceKey(2, "schema.class2")]);
      expect(selectables.instanceKeys.size).toBe(1);
    });

    it("does nothing when trying to remove a custom selectable from empty Selectables", () => {
      const selectables = Selectables.create([]);
      Selectables.remove(selectables, [createCustomSelectable(1)]);
      expect(selectables.custom.size).toBe(0);
    });

    it("does nothing when trying to remove a non-existing custom selectable", () => {
      const selectables = Selectables.create([createCustomSelectable(1)]);
      expect(selectables.custom.size).toBe(1);
      Selectables.remove(selectables, [createCustomSelectable(2)]);
      expect(selectables.custom.size).toBe(1);
    });
  });

  describe("has", () => {
    it("returns true when Selectables contains instance key", () => {
      const instanceKey = createSelectableInstanceKey(1);
      const selectables = Selectables.create([instanceKey]);
      expect(Selectables.has(selectables, instanceKey)).toBe(true);
    });

    it("returns false when Selectables does not contain instance key", () => {
      const instanceKey = createSelectableInstanceKey(1);
      const selectables = Selectables.create([]);
      expect(Selectables.has(selectables, instanceKey)).toBe(false);
    });

    it("returns true when Selectables contains selectable in different format", () => {
      const instanceKey = createSelectableInstanceKey(1, "Schema:Class");
      const instanceKeyFormat = createSelectableInstanceKey(1, "Schema.Class");
      const selectables = Selectables.create([instanceKey]);
      expect(Selectables.has(selectables, instanceKeyFormat)).toBe(true);
    });

    it("returns true when Selectables contains custom selectable", () => {
      const customSelectable = createCustomSelectable(1);
      const selectables = Selectables.create([customSelectable]);
      expect(Selectables.has(selectables, customSelectable)).toBe(true);
    });

    it("returns false when Selectables does not contain custom selectable", () => {
      const customSelectable = createCustomSelectable(1);
      const selectables = Selectables.create([]);
      expect(Selectables.has(selectables, customSelectable)).toBe(false);
    });
  });

  describe("hasAll", () => {
    it("returns true when Selectables has all values", () => {
      const instanceKey1 = createSelectableInstanceKey(1);
      const instanceKey2 = createSelectableInstanceKey(2);
      const customSelectable1 = createCustomSelectable(1);
      const customSelectable2 = createCustomSelectable(2);
      const selectables = Selectables.create([instanceKey1, instanceKey2, customSelectable1, customSelectable2]);
      expect(Selectables.hasAll(selectables, [instanceKey1, customSelectable1])).toBe(true);
    });

    it("returns false when selectables count is smaller", () => {
      const customSelectable1 = createCustomSelectable(1);
      const customSelectable2 = createCustomSelectable(2);
      const selectables = Selectables.create([customSelectable1]);
      expect(Selectables.hasAll(selectables, [customSelectable1, customSelectable2])).toBe(false);
    });

    it("returns false when selectables are different", () => {
      const customSelectable1 = createCustomSelectable(1);
      const customSelectable2 = createCustomSelectable(2);
      const selectables = Selectables.create([customSelectable1]);
      expect(Selectables.hasAll(selectables, [customSelectable2])).toBe(false);
    });

    it("returns false when instance selectables count is smaller", () => {
      const instanceKey1 = createSelectableInstanceKey(1);
      const instanceKey2 = createSelectableInstanceKey(2);
      const selectables = Selectables.create([instanceKey1]);
      expect(Selectables.hasAll(selectables, [instanceKey1, instanceKey2])).toBe(false);
    });

    it("returns false when instance selectable classes are different", () => {
      const instanceKey1 = createSelectableInstanceKey();
      const instanceKey2: SelectableInstanceKey = {
        className: `${instanceKey1.className}_different`,
        id: instanceKey1.id,
      };
      const selectables = Selectables.create([instanceKey1]);
      expect(Selectables.hasAll(selectables, [instanceKey2])).toBe(false);
    });

    it("returns false when instance selectable has different id", () => {
      const instanceKey1 = createSelectableInstanceKey(1);
      const instanceKey2: SelectableInstanceKey = {
        className: instanceKey1.className,
        id: createECInstanceId(2),
      };
      const selectables = Selectables.create([instanceKey1]);
      expect(Selectables.hasAll(selectables, [instanceKey2])).toBe(false);
    });
  });

  describe("hasAny", () => {
    it("returns true when Selectables has any custom selectables", () => {
      const customSelectable1 = createCustomSelectable(1);
      const customSelectable2 = createCustomSelectable(2);
      const selectables = Selectables.create([customSelectable1, customSelectable2]);
      expect(Selectables.hasAny(selectables, [customSelectable2])).toBe(true);
    });

    it("returns true when Selectables has any instance selectable", () => {
      const instanceKey1 = createSelectableInstanceKey(1);
      const instanceKey2 = createSelectableInstanceKey(2);
      const instanceKey3 = createSelectableInstanceKey(3);
      const selectables = Selectables.create([instanceKey1, instanceKey2]);
      expect(Selectables.hasAny(selectables, [instanceKey2, instanceKey3])).toBe(true);
    });

    it("returns false when Selectables does not have any selectable", () => {
      const selectables = Selectables.create([createSelectableInstanceKey(1), createCustomSelectable(1)]);
      expect(Selectables.hasAny(selectables, [createSelectableInstanceKey(2), createCustomSelectable(2)])).toBe(false);
    });
  });

  describe("some", () => {
    it("returns true if callback returns true for instance selectable", () => {
      const instanceKey = createSelectableInstanceKey();
      const selectables = Selectables.create([instanceKey]);
      const callback = vi.fn().mockReturnValue(true);
      expect(Selectables.some(selectables, callback)).toBe(true);
      expect(callback).toHaveBeenCalledOnce();
      expect(callback).toHaveBeenCalledWith(instanceKey);
    });

    it("returns true if callback returns true for custom selectables", () => {
      const customSelectable = createCustomSelectable();
      const selectables = Selectables.create([customSelectable]);
      const callback = vi.fn().mockReturnValue(true);
      expect(Selectables.some(selectables, callback)).toBe(true);
      expect(callback).toHaveBeenCalledOnce();
      expect(callback).toHaveBeenCalledWith(customSelectable);
    });

    it("returns false if callback returns false", () => {
      const instanceKeys = [createSelectableInstanceKey(1), createSelectableInstanceKey(2)];
      const customSelectables = [createCustomSelectable(1), createCustomSelectable(2)];
      const selectables = Selectables.create([...instanceKeys, ...customSelectables]);
      const callback = vi.fn().mockReturnValue(false);
      expect(Selectables.some(selectables, callback)).toBe(false);
      expect(callback).toHaveBeenCalledTimes(4);
      expect(callback).toHaveBeenCalledWith(instanceKeys[0]);
      expect(callback).toHaveBeenCalledWith(instanceKeys[1]);
      expect(callback).toHaveBeenCalledWith(customSelectables[0]);
      expect(callback).toHaveBeenCalledWith(customSelectables[1]);
    });
  });

  describe("forEach", () => {
    it("calls callback for every selectable", () => {
      const instanceKeys = [createSelectableInstanceKey(1), createSelectableInstanceKey(2)];
      const customSelectables = [createCustomSelectable(1), createCustomSelectable(2)];
      const selectables = Selectables.create([...instanceKeys, ...customSelectables]);
      const callback = vi.fn();
      Selectables.forEach(selectables, callback);
      expect(callback).toHaveBeenCalledTimes(4);
      expect(callback).toHaveBeenCalledWith(instanceKeys[0], expect.any(Number));
      expect(callback).toHaveBeenCalledWith(instanceKeys[1], expect.any(Number));
      expect(callback).toHaveBeenCalledWith(customSelectables[0], expect.any(Number));
      expect(callback).toHaveBeenCalledWith(customSelectables[1], expect.any(Number));
    });
  });

  describe("load", () => {
    it("loads instance keys", async () => {
      const instanceKeys = [createSelectableInstanceKey(1), createSelectableInstanceKey(2)];
      const selectables = Selectables.create(instanceKeys);
      const result = await collect(Selectables.load(selectables));
      expect(result).toEqual(instanceKeys);
    });

    it("loads instance keys from custom selectables", async () => {
      const instanceKeys1 = [createSelectableInstanceKey(1)];
      const instanceKeys2 = [createSelectableInstanceKey(2)];
      const customSelectables = [createCustomSelectable(1, instanceKeys1), createCustomSelectable(2, instanceKeys2)];
      const selectables = Selectables.create(customSelectables);
      const result = await collect(Selectables.load(selectables));
      expect(result).toEqual([...instanceKeys1, ...instanceKeys2]);
    });

    it("loads all instance keys", async () => {
      const instanceKeys1 = [createSelectableInstanceKey(1), createSelectableInstanceKey(2)];
      const instanceKeys2 = [createSelectableInstanceKey(3), createSelectableInstanceKey(4)];
      const customSelectables = [createCustomSelectable(2, instanceKeys2)];
      const selectables = Selectables.create([...instanceKeys1, ...customSelectables]);
      const result = await collect(Selectables.load(selectables));
      expect(result).toEqual([...instanceKeys1, ...instanceKeys2]);
    });
  });
});
