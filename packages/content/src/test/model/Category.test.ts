/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { CategoryDefinition } from "../../content/model/Category.js";

describe("CategoryDefinition", () => {
  describe("computeId", () => {
    it("throws for empty path", () => {
      expect(() => CategoryDefinition.computeId({ path: [] })).to.throw(
        "Cannot compute category ID from an empty relationship path.",
      );
    });

    it("computes id for single-step forward path", () => {
      const result = CategoryDefinition.computeId({
        path: [
          {
            sourceClassName: "BisCore:Element",
            targetClassName: "BisCore:ElementAspect",
            relationshipName: "BisCore:ElementOwnsUniqueAspect",
          },
        ],
      });
      expect(result).to.equal("BisCore.Element-[BisCore.ElementOwnsUniqueAspect]->BisCore.ElementAspect");
    });

    it("computes id for single-step reverse path", () => {
      const result = CategoryDefinition.computeId({
        path: [
          {
            sourceClassName: "BisCore:Element",
            targetClassName: "BisCore:Model",
            relationshipName: "BisCore:ModelContainsElements",
            relationshipReverse: true,
          },
        ],
      });
      expect(result).to.equal("BisCore.Element-[!BisCore.ModelContainsElements]->BisCore.Model");
    });

    it("computes id for multi-step path", () => {
      const result = CategoryDefinition.computeId({
        path: [
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
        "BisCore.Element-[!BisCore.ModelContainsElements]->BisCore.Model-[BisCore.ModelModelsElement]->BisCore.Element",
      );
    });

    it("uses forward arrow when relationshipReverse is undefined", () => {
      const result = CategoryDefinition.computeId({
        path: [{ sourceClassName: "S:A", targetClassName: "S:B", relationshipName: "S:Rel" }],
      });
      expect(result).to.equal("S.A-[S.Rel]->S.B");
    });
  });

  describe("create", () => {
    it("creates definition with computed id from path", () => {
      const result = CategoryDefinition.create({
        path: [{ sourceClassName: "S:A", targetClassName: "S:B", relationshipName: "S:Rel" }],
        label: "Related B",
      });
      expect(result).to.deep.equal({ id: "S.A-[S.Rel]->S.B", label: "Related B" });
    });

    it("includes parentId when provided", () => {
      const result = CategoryDefinition.create({
        parentId: "parent-cat",
        path: [{ sourceClassName: "S:A", targetClassName: "S:B", relationshipName: "S:Rel" }],
        label: "Related B",
      });
      expect(result).to.deep.equal({ id: "S.A-[S.Rel]->S.B", label: "Related B", parentId: "parent-cat" });
    });

    it("includes description when provided", () => {
      const result = CategoryDefinition.create({
        path: [{ sourceClassName: "S:A", targetClassName: "S:B", relationshipName: "S:Rel" }],
        label: "Related B",
        description: "Some description",
      });
      expect(result).to.deep.equal({ id: "S.A-[S.Rel]->S.B", label: "Related B", description: "Some description" });
    });

    it("omits parentId and description when not provided", () => {
      const result = CategoryDefinition.create({
        path: [{ sourceClassName: "S:A", targetClassName: "S:B", relationshipName: "S:Rel" }],
        label: "Test",
      });
      expect(result).not.to.have.property("parentId");
      expect(result).not.to.have.property("description");
    });
  });
});
