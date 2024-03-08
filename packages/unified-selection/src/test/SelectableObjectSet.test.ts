/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import sinon from "sinon";
import { Guid, Id64 } from "@itwin/core-bentley";
import { InstanceKey, PresentationError } from "@itwin/presentation-common";
import { SelectableObject, SelectableObjectSet } from "../unified-selection/SelectableObjectSet";
import { createCustomSelectableObject, createRandomECInstanceId, createRandomSelectableECInstanceObject } from "./_helpers/SelectableObjectCreator";

describe("SelectableObjectSet", () => {
  describe("construction", () => {
    it("creates empty set by default", () => {
      const set = new SelectableObjectSet();
      expect(set.isEmpty).to.be.true;
    });

    it("initializes from EC instance objects", () => {
      const selectableECInstanceObjects = [createRandomSelectableECInstanceObject(), createRandomSelectableECInstanceObject()];
      const set = new SelectableObjectSet(selectableECInstanceObjects);
      expect(set.size).to.eq(2);
      expect(set.has(selectableECInstanceObjects[0])).to.be.true;
      expect(set.has(selectableECInstanceObjects[1])).to.be.true;
    });

    it("initializes from custom objects", () => {
      const customSelectableObjects = [createCustomSelectableObject(), createCustomSelectableObject()];
      const set = new SelectableObjectSet(customSelectableObjects);
      expect(set.size).to.eq(2);
      expect(set.has(customSelectableObjects[0])).to.be.true;
      expect(set.has(customSelectableObjects[1])).to.be.true;
    });

    it("initializes from SelectableObjectSet", () => {
      const instanceKey11 = createRandomSelectableECInstanceObject();
      const instanceKey12 = {
        className: instanceKey11.className,
        id: createRandomECInstanceId(),
      } as InstanceKey;
      const instanceKey2 = createRandomSelectableECInstanceObject();
      const customSelectableObject = createCustomSelectableObject();
      const source = new SelectableObjectSet();
      source.add([instanceKey11, instanceKey12, instanceKey2]);
      source.add(customSelectableObject);

      const target = new SelectableObjectSet(source);
      expect(target.size).to.eq(4);
      expect(target.has(instanceKey11)).to.be.true;
      expect(target.has(instanceKey12)).to.be.true;
      expect(target.has(instanceKey2)).to.be.true;
      expect(target.has(customSelectableObject)).to.be.true;
    });
  });

  describe("[get] guid", () => {
    it("returns a valid GUID", () => {
      const selectableObjectSet = new SelectableObjectSet();
      expect(Guid.isGuid(selectableObjectSet.guid)).to.be.true;
      expect(selectableObjectSet.guid).to.be.eq(Guid.empty);
    });
  });

  describe("[get] instanceKeys", () => {
    it("returns empty map when there are no selectable objects", () => {
      const set = new SelectableObjectSet();
      expect(set.instanceKeys.size).to.be.eq(0);
    });

    it("returns map with one entry when all selectable objects have same class name", () => {
      const set = new SelectableObjectSet([
        {
          className: "aaa",
          id: createRandomECInstanceId(),
        },
        {
          className: "aaa",
          id: createRandomECInstanceId(),
        },
      ]);
      expect(set.instanceKeys.size).to.be.eq(1);
    });

    it("returns map with multiple entries for each class name when selectable objects have different class names", () => {
      const set = new SelectableObjectSet([
        {
          className: "aaa",
          id: createRandomECInstanceId(),
        },
        {
          className: "bbb",
          id: createRandomECInstanceId(),
        },
      ]);
      expect(set.instanceKeys.size).to.be.eq(2);
    });
  });

  describe("[get] instanceKeysCount", () => {
    it("returns 0 when there are no selectable objects", () => {
      const set = new SelectableObjectSet();
      expect(set.instanceKeysCount).to.be.eq(0);
    });

    it("returns correct count when all selectable objects are of the same class", () => {
      const set = new SelectableObjectSet([
        {
          className: "aaa",
          id: createRandomECInstanceId(),
        },
        {
          className: "aaa",
          id: createRandomECInstanceId(),
        },
      ]);
      expect(set.instanceKeysCount).to.be.eq(2);
    });

    it("returns correct count when selectable objects are of different classes", () => {
      const set = new SelectableObjectSet([
        {
          className: "aaa",
          id: createRandomECInstanceId(),
        },
        {
          className: "bbb",
          id: createRandomECInstanceId(),
        },
      ]);
      expect(set.instanceKeysCount).to.be.eq(2);
    });
  });

  describe("[get] customSelectableObjects", () => {
    it("returns empty set when there are no selectable objects", () => {
      const set = new SelectableObjectSet();
      expect(set.customSelectableObjects.size).to.be.eq(0);
    });

    it("returns set with selectable objects", () => {
      const set = new SelectableObjectSet([createCustomSelectableObject(), createCustomSelectableObject()]);
      expect(set.customSelectableObjects.size).to.be.eq(2);
    });
  });

  describe("[get] customSelectableObjectsCount", () => {
    it("returns 0 when there are no selectable objects", () => {
      const set = new SelectableObjectSet();
      expect(set.customSelectableObjectsCount).to.be.eq(0);
    });

    it("returns count of selectable objects", () => {
      const set = new SelectableObjectSet([createCustomSelectableObject(), createCustomSelectableObject()]);
      expect(set.customSelectableObjectsCount).to.be.eq(2);
    });
  });

  describe("clear", () => {
    it("clears custom selectable objects", () => {
      const selectableObjects = [createCustomSelectableObject(), createCustomSelectableObject()];
      const set = new SelectableObjectSet(selectableObjects);
      expect(set.size).to.be.eq(2);
      const guidBefore = set.guid;
      set.clear();
      expect(set.size).to.be.eq(0);
      expect(set.guid).to.not.be.eq(guidBefore);
    });

    it("clears instance selectable objects", () => {
      const selectableObjects = [createRandomSelectableECInstanceObject(), createRandomSelectableECInstanceObject()];
      const set = new SelectableObjectSet(selectableObjects);
      expect(set.size).to.eq(2);
      const guidBefore = set.guid;
      set.clear();
      expect(set.size).to.be.eq(0);
      expect(set.guid).to.not.be.eq(guidBefore);
    });

    it("doesn't change `guid` if set was empty", () => {
      const set = new SelectableObjectSet();
      const guidBefore = set.guid;
      set.clear();
      expect(set.guid).to.be.eq(guidBefore);
    });
  });

  describe("add", () => {
    it("adds a custom selectable object", () => {
      const set = new SelectableObjectSet([createCustomSelectableObject()]);
      expect(set.size).to.eq(1);
      const guidBefore = set.guid;
      const selectableObject = createCustomSelectableObject();
      set.add(selectableObject);
      expect(set.size).to.eq(2);
      expect(set.customSelectableObjectsCount).to.eq(2);
      expect(set.has(selectableObject)).to.be.true;
      expect(set.guid).to.not.eq(guidBefore);
    });

    it("doesn't add the same custom selectable object", () => {
      const selectableObject = createCustomSelectableObject();
      const set = new SelectableObjectSet([selectableObject]);
      expect(set.size).to.eq(1);
      const guidBefore = set.guid;
      set.add(selectableObject);
      expect(set.size).to.eq(1);
      expect(set.guid).to.eq(guidBefore);
    });

    it("adds an array of selectable objects", () => {
      const set = new SelectableObjectSet([createCustomSelectableObject()]);
      expect(set.size).to.eq(1);
      const guidBefore = set.guid;
      const selectableObjects = [createCustomSelectableObject(), createCustomSelectableObject()];
      set.add(selectableObjects);
      expect(set.size).to.eq(3);
      expect(set.customSelectableObjectsCount).to.eq(3);
      expect(set.has(selectableObjects[0])).to.be.true;
      expect(set.has(selectableObjects[1])).to.be.true;
      expect(set.guid).to.not.eq(guidBefore);
    });

    it("doesn't add selectable objects if predicate returns false", () => {
      const set = new SelectableObjectSet();
      const guidBefore = set.guid;
      const selectableObject = createCustomSelectableObject();
      const pred = sinon.fake(() => false);
      set.add([selectableObject], pred);
      expect(pred).to.be.calledOnceWith(selectableObject);
      expect(set.size).to.eq(0);
      expect(set.guid).to.eq(guidBefore);
    });

    it("adds an instance selectable object", () => {
      const set = new SelectableObjectSet([createRandomSelectableECInstanceObject()]);
      expect(set.size).to.eq(1);
      const guidBefore = set.guid;
      const selectableObject = createRandomSelectableECInstanceObject();
      set.add(selectableObject);
      expect(set.size).to.eq(2);
      expect(set.instanceKeysCount).to.eq(2);
      expect(set.has(selectableObject)).to.be.true;
      expect(set.guid).to.not.eq(guidBefore);
    });

    it("doesn't add the same instance selectable object", () => {
      const selectableObject = createRandomSelectableECInstanceObject();
      const set = new SelectableObjectSet([selectableObject]);
      expect(set.size).to.eq(1);
      const guidBefore = set.guid;
      set.add(selectableObject);
      expect(set.size).to.eq(1);
      expect(set.guid).to.eq(guidBefore);
    });

    it("adds an array of instance selectable objects", () => {
      const set = new SelectableObjectSet([createRandomSelectableECInstanceObject()]);
      expect(set.size).to.eq(1);
      const guidBefore = set.guid;
      const selectableObjects = [createRandomSelectableECInstanceObject(), createRandomSelectableECInstanceObject()];
      set.add(selectableObjects);
      expect(set.size).to.eq(3);
      expect(set.instanceKeysCount).to.eq(3);
      expect(set.has(selectableObjects[0])).to.be.true;
      expect(set.has(selectableObjects[1])).to.be.true;
      expect(set.guid).to.not.eq(guidBefore);
    });

    it("doesn't add instance selectable objects if predicate returns false", () => {
      const set = new SelectableObjectSet();
      const guidBefore = set.guid;
      const selectableObject = createRandomSelectableECInstanceObject();
      const pred = sinon.fake(() => false);
      set.add([selectableObject], pred);
      expect(pred).to.be.calledOnceWith(selectableObject);
      expect(set.size).to.eq(0);
      expect(set.guid).to.eq(guidBefore);
    });

    it("doesn't add the same instance selectable objects when given className is of different capitalization", () => {
      const instanceKey1: InstanceKey = { className: "BisCore", id: Id64.invalid };
      const instanceKey2: InstanceKey = { className: "BISCORE", id: Id64.invalid };
      const set = new SelectableObjectSet([instanceKey1]);
      expect(set.size).to.eq(1);
      const guidBefore = set.guid;
      set.add(instanceKey2);
      expect(set.size).to.eq(1);
      expect(set.guid).to.eq(guidBefore);
    });

    it("adds a SelectableObjectSet", () => {
      const instanceKey1 = createRandomSelectableECInstanceObject();
      const customSelectableObject1 = createCustomSelectableObject();
      const set = new SelectableObjectSet();
      set.add(instanceKey1).add(customSelectableObject1);
      expect(set.size).to.eq(2);
      expect(set.has(instanceKey1)).to.be.true;
      expect(set.has(customSelectableObject1)).to.be.true;
      const guidBefore = set.guid;

      const instanceKey2 = createRandomSelectableECInstanceObject();
      const instanceKey3 = { className: instanceKey1.className, id: createRandomECInstanceId() };
      const customSelectableObject2 = createCustomSelectableObject();
      const source = new SelectableObjectSet();
      source.add([instanceKey2, instanceKey3]).add(customSelectableObject2);

      set.add(source);
      expect(set.size).to.eq(5);
      expect(set.has(instanceKey1)).to.be.true;
      expect(set.has(instanceKey2)).to.be.true;
      expect(set.has(instanceKey3)).to.be.true;
      expect(set.has(customSelectableObject1)).to.be.true;
      expect(set.has(customSelectableObject2)).to.be.true;
      expect(set.guid).to.not.eq(guidBefore);
    });

    it("doesn't add selectable objects from a SelectableObjectSet if predicate returns false", () => {
      const set = new SelectableObjectSet();
      const guidBefore = set.guid;
      const instanceKey = createRandomSelectableECInstanceObject();
      const customSelectableObject = createCustomSelectableObject();
      const selectableObjectSet = new SelectableObjectSet().add([instanceKey]).add(customSelectableObject);
      const pred = sinon.fake(() => false);
      set.add(selectableObjectSet, pred);
      expect(pred).to.be.calledTwice;
      expect(pred).to.be.calledWith(instanceKey);
      expect(pred).to.be.calledWith(customSelectableObject);
      expect(set.size).to.eq(0);
      expect(set.guid).to.eq(guidBefore);
    });

    it("doesn't add the same selectable objects from a SelectableObjectSet", () => {
      const instanceKey = createRandomSelectableECInstanceObject();
      const customSelectableObject = createCustomSelectableObject();
      const set = new SelectableObjectSet();
      set.add(instanceKey).add(customSelectableObject);
      expect(set.size).to.eq(2);
      expect(set.has(instanceKey)).to.be.true;
      expect(set.has(customSelectableObject)).to.be.true;
      const guidBefore = set.guid;

      const source = new SelectableObjectSet();
      set.add(instanceKey).add(customSelectableObject);

      set.add(source);
      expect(set.size).to.eq(2);
      expect(set.guid).to.eq(guidBefore);
    });

    it("handles invalid values", () => {
      const set = new SelectableObjectSet();
      const guidBefore = set.guid;
      expect(() => (set as any).add(undefined)).to.throw(PresentationError);
      expect(set.isEmpty).to.be.true;
      expect(() => (set as any).add(null)).to.throw(PresentationError);
      expect(set.isEmpty).to.be.true;
      expect(() => (set as any).add({})).to.throw(PresentationError);
      expect(set.isEmpty).to.be.true;
      expect(set.guid).to.eq(guidBefore);
    });
  });

  describe("delete", () => {
    it("deletes a custom selectable objects", () => {
      const selectableObjects = [createCustomSelectableObject(), createCustomSelectableObject(), createCustomSelectableObject()];
      const set = new SelectableObjectSet(selectableObjects);
      expect(set.size).to.eq(3);
      const guidBefore = set.guid;
      set.delete(selectableObjects[1]);
      expect(set.size).to.eq(2);
      expect(set.customSelectableObjectsCount).to.eq(2);
      expect(set.has(selectableObjects[1])).to.be.false;
      expect(set.guid).to.not.eq(guidBefore);
    });

    it("deletes an array of selectable objects", () => {
      const selectableObjects = [createCustomSelectableObject(), createCustomSelectableObject(), createCustomSelectableObject()];
      const set = new SelectableObjectSet(selectableObjects);
      expect(set.size).to.eq(3);
      const guidBefore = set.guid;
      set.delete([selectableObjects[1], selectableObjects[2]]);
      expect(set.size).to.eq(1);
      expect(set.customSelectableObjectsCount).to.eq(1);
      expect(set.has(selectableObjects[1])).to.be.false;
      expect(set.has(selectableObjects[2])).to.be.false;
      expect(set.guid).to.not.eq(guidBefore);
    });

    it("deletes an instance selectable object", () => {
      const selectableObjects = [createRandomSelectableECInstanceObject(), createRandomSelectableECInstanceObject(), createRandomSelectableECInstanceObject()];
      const set = new SelectableObjectSet(selectableObjects);
      expect(set.size).to.eq(3);
      const guidBefore = set.guid;
      set.delete(selectableObjects[1]);
      expect(set.size).to.eq(2);
      expect(set.instanceKeysCount).to.eq(2);
      expect(set.has(selectableObjects[1])).to.be.false;
      expect(set.guid).to.not.eq(guidBefore);
    });

    it("deletes an instance selectable object when given className is of different capitalization", () => {
      const instanceKey1: InstanceKey = { className: "BisCore", id: Id64.invalid };
      const instanceKey2: InstanceKey = { className: "BISCORE", id: Id64.invalid };
      const selectableObjects = [createRandomSelectableECInstanceObject(), instanceKey1, createRandomSelectableECInstanceObject()];
      const set = new SelectableObjectSet(selectableObjects);
      expect(set.size).to.eq(3);
      const guidBefore = set.guid;
      set.delete(instanceKey2);
      expect(set.size).to.eq(2);
      expect(set.instanceKeysCount).to.eq(2);
      expect(set.has(selectableObjects[1])).to.be.false;
      expect(set.guid).to.not.eq(guidBefore);
    });

    it("deletes an array of instance selectable objects", () => {
      const selectableObjects = [createRandomSelectableECInstanceObject(), createRandomSelectableECInstanceObject(), createRandomSelectableECInstanceObject()];
      const set = new SelectableObjectSet(selectableObjects);
      expect(set.size).to.eq(3);
      const guidBefore = set.guid;
      set.delete([selectableObjects[1], selectableObjects[2]]);
      expect(set.size).to.eq(1);
      expect(set.instanceKeysCount).to.eq(1);
      expect(set.has(selectableObjects[1])).to.be.false;
      expect(set.has(selectableObjects[2])).to.be.false;
      expect(set.guid).to.not.eq(guidBefore);
    });

    it("deletes selectable objects from a SelectableObjectSet", () => {
      const instanceKeys = [createRandomSelectableECInstanceObject(), createRandomSelectableECInstanceObject()];
      const customSelectableObjects = [createCustomSelectableObject(), createCustomSelectableObject()];
      const set = new SelectableObjectSet();
      set.add(instanceKeys).add(customSelectableObjects);
      expect(set.size).to.eq(4);
      expect(set.has(instanceKeys[0])).to.be.true;
      expect(set.has(instanceKeys[1])).to.be.true;
      expect(set.has(customSelectableObjects[0])).to.be.true;
      expect(set.has(customSelectableObjects[1])).to.be.true;
      const guidBefore = set.guid;

      const source = new SelectableObjectSet();
      source.add(instanceKeys[1]).add(customSelectableObjects[0]);

      set.delete(source);
      expect(set.size).to.eq(2);
      expect(set.has(instanceKeys[0])).to.be.true;
      expect(set.has(instanceKeys[1])).to.be.false;
      expect(set.has(customSelectableObjects[0])).to.be.false;
      expect(set.has(customSelectableObjects[1])).to.be.true;
      expect(set.guid).to.not.eq(guidBefore);
    });

    it("does nothing when trying to delete an instance selectable object from empty SelectableObjectSet", () => {
      const set = new SelectableObjectSet();
      const guidBefore = set.guid;
      set.delete(createRandomSelectableECInstanceObject());
      expect(set.size).to.eq(0);
      expect(set.guid).to.eq(guidBefore);
    });

    it("does nothing when trying to delete an non-existing instance selectable object", () => {
      const set = new SelectableObjectSet([createRandomSelectableECInstanceObject()]);
      expect(set.size).to.eq(1);
      const guidBefore = set.guid;
      set.delete(createRandomSelectableECInstanceObject());
      expect(set.size).to.eq(1);
      expect(set.guid).to.eq(guidBefore);
    });

    it("does nothing when trying to delete a custom selectable objects from empty SelectableObjectSet", () => {
      const set = new SelectableObjectSet();
      const guidBefore = set.guid;
      set.delete(createCustomSelectableObject());
      expect(set.size).to.eq(0);
      expect(set.guid).to.eq(guidBefore);
    });

    it("does nothing when trying to delete a non-existing custom selectable objects", () => {
      const set = new SelectableObjectSet([createCustomSelectableObject()]);
      expect(set.size).to.eq(1);
      const guidBefore = set.guid;
      set.delete(createCustomSelectableObject());
      expect(set.size).to.eq(1);
      expect(set.guid).to.eq(guidBefore);
    });

    it("does nothing when trying to delete a SelectableObjectSet from empty SelectableObjectSet", () => {
      const set = new SelectableObjectSet();
      const guidBefore = set.guid;
      set.delete(new SelectableObjectSet([createRandomSelectableECInstanceObject()]));
      expect(set.size).to.eq(0);
      expect(set.guid).to.eq(guidBefore);
    });

    it("does nothing when trying to delete a SelectableObjectSet with non-existing selectable objects", () => {
      const set = new SelectableObjectSet([createRandomSelectableECInstanceObject()]);
      expect(set.size).to.eq(1);
      const guidBefore = set.guid;
      set.delete(new SelectableObjectSet([createRandomSelectableECInstanceObject()]));
      expect(set.size).to.eq(1);
      expect(set.guid).to.eq(guidBefore);
    });

    it("handles invalid values", () => {
      const set = new SelectableObjectSet([createCustomSelectableObject()]);
      expect(() => (set as any).delete(undefined)).to.throw(PresentationError);
      expect(set.size).to.eq(1);
      expect(() => (set as any).delete(null)).to.throw(PresentationError);
      expect(set.size).to.eq(1);
      expect(() => (set as any).delete({})).to.throw(PresentationError);
      expect(set.size).to.eq(1);
    });
  });

  describe("has", () => {
    it("handles invalid values", () => {
      const set = new SelectableObjectSet([createCustomSelectableObject()]);
      expect(() => (set as any).has(undefined)).to.throw(PresentationError);
      expect(() => (set as any).has(null)).to.throw(PresentationError);
      expect(() => (set as any).has({})).to.throw(PresentationError);
    });
  });

  const selectableObjectTypes = [
    { name: "SelectableObjectSet", checkFactory: (selectableObjects: SelectableObject[]) => new SelectableObjectSet(selectableObjects) },
    { name: "SelectableObject[]", checkFactory: (selectableObjects: SelectableObject[]) => selectableObjects },
  ];

  describe("hasAll", () => {
    selectableObjectTypes.forEach((selectableObjectType) => {
      describe(selectableObjectType.name, () => {
        const createSelectableObjects = selectableObjectType.checkFactory;

        it("returns true when SelectableObjectSet has all values", () => {
          const instanceKey1 = createRandomSelectableECInstanceObject();
          const instanceKey2 = createRandomSelectableECInstanceObject();
          const customSelectableObject1 = createCustomSelectableObject();
          const customSelectableObject2 = createCustomSelectableObject();
          const set = new SelectableObjectSet([instanceKey1, instanceKey2, customSelectableObject1, customSelectableObject2]);
          expect(set.hasAll(createSelectableObjects([instanceKey1, customSelectableObject1]))).to.be.true;
        });

        it("returns true when SelectableObjectSet has all values with different capitalization", () => {
          const instanceKey1: InstanceKey = { className: "BisCore", id: Id64.invalid };
          const instanceKey2: InstanceKey = { className: "biscore", id: Id64.invalid };
          const instanceKey3: InstanceKey = { className: "BISCORE", id: Id64.invalid };
          const set = new SelectableObjectSet([instanceKey1]);
          expect(set.hasAll(createSelectableObjects([instanceKey2]))).to.be.true;
          expect(set.hasAll(createSelectableObjects([instanceKey3]))).to.be.true;
        });

        it("returns false when selectable objects count is smaller", () => {
          const customSelectableObject1 = createCustomSelectableObject();
          const customSelectableObject2 = createCustomSelectableObject();
          const set = new SelectableObjectSet([customSelectableObject1]);
          expect(set.hasAll(createSelectableObjects([customSelectableObject1, customSelectableObject2]))).to.be.false;
        });

        it("returns false when selectable objects are different", () => {
          const customSelectableObject1 = createCustomSelectableObject();
          const customSelectableObject2 = createCustomSelectableObject();
          const set = new SelectableObjectSet([customSelectableObject1]);
          expect(set.hasAll(createSelectableObjects([customSelectableObject2]))).to.be.false;
        });

        it("returns false when instance selectable objects count is smaller", () => {
          const instanceKey1 = createRandomSelectableECInstanceObject();
          const instanceKey2 = createRandomSelectableECInstanceObject();
          const set = new SelectableObjectSet([instanceKey1]);
          expect(set.hasAll(createSelectableObjects([instanceKey1, instanceKey2]))).to.be.false;
        });

        it("returns false when instance selectable object classes are different", () => {
          const instanceKey1 = createRandomSelectableECInstanceObject();
          const instanceKey2: InstanceKey = {
            className: `${instanceKey1.className}_different`,
            id: instanceKey1.id,
          };
          const set = new SelectableObjectSet([instanceKey1]);
          expect(set.hasAll(createSelectableObjects([instanceKey2]))).to.be.false;
        });

        it("returns false when instance selectable object ids", () => {
          const instanceKey1 = createRandomSelectableECInstanceObject();
          const instanceKey2: InstanceKey = {
            className: instanceKey1.className,
            id: createRandomECInstanceId(),
          };
          const set = new SelectableObjectSet([instanceKey1]);
          expect(set.hasAll(createSelectableObjects([instanceKey2]))).to.be.false;
        });
      });
    });

    it("handles invalid values", () => {
      const set = new SelectableObjectSet();
      expect(() => (set as any).hasAll(undefined)).to.throw(PresentationError);
      expect(() => (set as any).hasAll(null)).to.throw(PresentationError);
      expect(() => (set as any).hasAll({})).to.throw(PresentationError);
    });
  });

  describe("hasAny", () => {
    selectableObjectTypes.forEach((selectableObjectType) => {
      describe(selectableObjectType.name, () => {
        const createSelectableObjects = selectableObjectType.checkFactory;

        it("returns true when SelectableObjectSet has any custom selectable objects", () => {
          const customSelectableObject1 = createCustomSelectableObject();
          const customSelectableObject2 = createCustomSelectableObject();
          const set = new SelectableObjectSet([customSelectableObject1, customSelectableObject2]);
          expect(set.hasAny(createSelectableObjects([customSelectableObject2]))).to.be.true;
        });

        it("returns true when SelectableObjectSet has any instance selectable object", () => {
          const instanceKey1 = createRandomSelectableECInstanceObject();
          const instanceKey2 = createRandomSelectableECInstanceObject();
          const instanceKey3 = createRandomSelectableECInstanceObject();
          const set = new SelectableObjectSet([instanceKey1, instanceKey2]);
          expect(set.hasAny(createSelectableObjects([instanceKey2, instanceKey3]))).to.be.true;
        });

        it("returns true when SelectableObjectSet has any instance selectable object with different capitalization", () => {
          const instanceKey1: InstanceKey = { className: "BisCore", id: Id64.invalid };
          const instanceKey2: InstanceKey = { className: "biscore", id: Id64.invalid };
          const instanceKey3: InstanceKey = { className: "BISCORE", id: Id64.invalid };
          const instanceKey4: InstanceKey = { className: "Testing", id: Id64.invalid };
          const set = new SelectableObjectSet([instanceKey1, instanceKey4]);
          expect(set.hasAny(createSelectableObjects([instanceKey2]))).to.be.true;
          expect(set.hasAny(createSelectableObjects([instanceKey3]))).to.be.true;
        });

        it("returns false when SelectableObjectSet doesn't have any selectable object", () => {
          const set = new SelectableObjectSet([createRandomSelectableECInstanceObject(), createCustomSelectableObject()]);
          expect(set.hasAny(createSelectableObjects([createRandomSelectableECInstanceObject(), createCustomSelectableObject()]))).to.be.false;
        });
      });
    });

    it("handles invalid values", () => {
      const set = new SelectableObjectSet();
      expect(() => (set as any).hasAny(undefined)).to.throw(PresentationError);
      expect(() => (set as any).hasAny(null)).to.throw(PresentationError);
      expect(() => (set as any).hasAny({})).to.throw(PresentationError);
    });
  });

  describe("some", () => {
    it("returns true if callback returns true for instance selectable object", () => {
      const instanceKey = createRandomSelectableECInstanceObject();
      const set = new SelectableObjectSet([instanceKey]);
      const callback = sinon.stub();
      callback.returns(true);
      expect(set.some(callback)).to.be.true;
      expect(callback.callCount).to.eq(1);
      expect(callback).to.be.calledWith(instanceKey);
    });

    it("calls callback with the most recent className if the only difference in classnames is capitalization", () => {
      const instanceKey1: InstanceKey = { className: "BisCore", id: Id64.invalid };
      const instanceKey2: InstanceKey = { className: "BISCORE", id: Id64.invalid };
      const set = new SelectableObjectSet([instanceKey1, instanceKey2]);
      const callback = sinon.stub();
      callback.returns(true);
      expect(set.some(callback)).to.be.true;
      expect(callback.callCount).to.eq(1);
      expect(callback).to.be.calledWith(instanceKey2);
    });

    it("returns true if callback returns true for custom selectable objects", () => {
      const customSelectableObject = createCustomSelectableObject();
      const set = new SelectableObjectSet([customSelectableObject]);
      const callback = sinon.stub();
      callback.returns(true);
      expect(set.some(callback)).to.be.true;
      expect(callback.callCount).to.eq(1);
      expect(callback).to.be.calledWith(customSelectableObject);
    });

    it("returns false if callback returns false", () => {
      const instanceKeys = [createRandomSelectableECInstanceObject(), createRandomSelectableECInstanceObject()];
      const customSelectableObjects = [createCustomSelectableObject(), createCustomSelectableObject()];
      const set = new SelectableObjectSet([...instanceKeys, ...customSelectableObjects]);
      const callback = sinon.stub();
      callback.returns(false);
      expect(set.some(callback)).to.be.false;
      expect(callback.callCount).to.eq(4);
      expect(callback).to.be.calledWith(instanceKeys[0]);
      expect(callback).to.be.calledWith(instanceKeys[1]);
      expect(callback).to.be.calledWith(customSelectableObjects[0]);
      expect(callback).to.be.calledWith(customSelectableObjects[1]);
    });
  });

  describe("forEach", () => {
    it("calls callback for every selectable object in set", () => {
      const instanceKeys = [createRandomSelectableECInstanceObject(), createRandomSelectableECInstanceObject()];
      const customSelectableObjects = [createCustomSelectableObject(), createCustomSelectableObject()];
      const set = new SelectableObjectSet([...instanceKeys, ...customSelectableObjects]);
      const callback = sinon.spy();
      set.forEach(callback);
      expect(callback.callCount).to.eq(4);
      expect(callback).to.be.calledWith(instanceKeys[0]);
      expect(callback).to.be.calledWith(instanceKeys[1]);
      expect(callback).to.be.calledWith(customSelectableObjects[0]);
      expect(callback).to.be.calledWith(customSelectableObjects[1]);
    });

    it("calls callback for every selectable object in set with the most recent className if the only difference in classnames is capitalization", () => {
      const instanceKey1: InstanceKey = { className: "BisCore", id: Id64.invalid };
      const instanceKey2: InstanceKey = { className: "BISCORE", id: Id64.invalid };
      const instanceKeys = [instanceKey1, instanceKey2];
      const set = new SelectableObjectSet([...instanceKeys]);
      const callback = sinon.spy();
      set.forEach(callback);
      expect(callback.callCount).to.eq(1);
      expect(callback).to.be.calledWith(instanceKeys[1]);
    });
  });
});
