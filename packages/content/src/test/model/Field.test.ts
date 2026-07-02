/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { PropertyField } from "../../content/model/Field.js";

describe("PropertyField", () => {
  describe("computeId", () => {
    it("computes id from class name and property name", () => {
      const result = PropertyField.computeId({ propertyClassName: "BisCore:Element", propertyName: "CodeValue" });
      expect(result).to.equal("BisCore.Element.CodeValue");
    });

    it("normalizes colon notation to dot notation", () => {
      const result = PropertyField.computeId({
        propertyClassName: "BisCore:GeometricElement",
        propertyName: "UserLabel",
      });
      expect(result).to.equal("BisCore.GeometricElement.UserLabel");
    });

    it("does not append path when pathFromTarget is undefined", () => {
      const result = PropertyField.computeId({
        propertyClassName: "BisCore.Element",
        propertyName: "CodeValue",
        pathFromTarget: undefined,
      });
      expect(result).to.equal("BisCore.Element.CodeValue");
    });

    it("does not append path when pathFromTarget is empty", () => {
      const result = PropertyField.computeId({
        propertyClassName: "BisCore.Element",
        propertyName: "CodeValue",
        pathFromTarget: [],
      });
      expect(result).to.equal("BisCore.Element.CodeValue");
    });

    it("appends single-step forward path in parentheses", () => {
      const result = PropertyField.computeId({
        propertyClassName: "BisCore:ElementAspect",
        propertyName: "Value",
        pathFromTarget: [
          {
            sourceClassName: "BisCore:Element",
            targetClassName: "BisCore:ElementAspect",
            relationshipName: "BisCore:ElementOwnsUniqueAspect",
          },
        ],
      });
      expect(result).to.equal(
        "BisCore.ElementAspect.Value(BisCore.Element-[BisCore.ElementOwnsUniqueAspect]->BisCore.ElementAspect)",
      );
    });

    it("appends single-step reverse path with reverse arrows", () => {
      const result = PropertyField.computeId({
        propertyClassName: "BisCore:Model",
        propertyName: "Name",
        pathFromTarget: [
          {
            sourceClassName: "BisCore:Element",
            targetClassName: "BisCore:Model",
            relationshipName: "BisCore:ModelContainsElements",
            relationshipReverse: true,
          },
        ],
      });
      expect(result).to.equal("BisCore.Model.Name(BisCore.Element-[!BisCore.ModelContainsElements]->BisCore.Model)");
    });

    it("appends multi-step path", () => {
      const result = PropertyField.computeId({
        propertyClassName: "BisCore:Element",
        propertyName: "UserLabel",
        pathFromTarget: [
          {
            sourceClassName: "BisCore:Element",
            targetClassName: "BisCore:Model",
            relationshipName: "BisCore:ModelContainsElements",
            relationshipReverse: true,
          },
          {
            sourceClassName: "BisCore:Model",
            targetClassName: "BisCore:Element",
            relationshipName: "BisCore:ModelModelsElement",
          },
        ],
      });
      expect(result).to.equal(
        "BisCore.Element.UserLabel(BisCore.Element-[!BisCore.ModelContainsElements]->BisCore.Model-[BisCore.ModelModelsElement]->BisCore.Element)",
      );
    });

    it("appends fork key as a suffix", () => {
      const result = PropertyField.computeId({
        propertyClassName: "BisCore:Element",
        propertyName: "CodeValue",
        forkKey: "Stuff.Door",
      });
      expect(result).to.equal("BisCore.Element.CodeValue#Stuff.Door");
    });

    it("appends fork key after the path", () => {
      const result = PropertyField.computeId({
        propertyClassName: "BisCore:ElementAspect",
        propertyName: "Value",
        pathFromTarget: [
          {
            sourceClassName: "BisCore:Element",
            targetClassName: "BisCore:ElementAspect",
            relationshipName: "BisCore:ElementOwnsUniqueAspect",
          },
        ],
        forkKey: "BisCore.ElementAspectX",
      });
      expect(result).to.equal(
        "BisCore.ElementAspect.Value(BisCore.Element-[BisCore.ElementOwnsUniqueAspect]->BisCore.ElementAspect)#BisCore.ElementAspectX",
      );
    });

    it("does not append fork key when provided as an empty string", () => {
      const result = PropertyField.computeId({
        propertyClassName: "BisCore.Element",
        propertyName: "CodeValue",
        forkKey: "",
      });
      expect(result).to.equal("BisCore.Element.CodeValue");
    });

    it("produces the same id for the same fork key", () => {
      const props = { propertyClassName: "BisCore.Element" as const, propertyName: "CodeValue", forkKey: "Stuff.Door" };
      expect(PropertyField.computeId(props)).to.equal(PropertyField.computeId(props));
    });
  });
});
