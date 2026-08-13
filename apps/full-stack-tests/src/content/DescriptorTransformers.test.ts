/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { defineDescriptorTransformer } from "@itwin/presentation-content";
import { buildTestECDb } from "../ECDbUtils.js";
import { initialize, terminate } from "../IntegrationTests.js";
import { importSchema } from "../SchemaUtils.js";
import {
  buildDescriptor,
  createContentIModelAccess,
  getFieldCategory,
  getPropertyFieldByName,
  getPropertyFields,
  getPropertyFieldsByName,
} from "./Utils.js";

/** The transformable descriptor view a `DescriptorTransformer` receives. */
type TransformView = Parameters<Parameters<typeof defineDescriptorTransformer>[0]["transform"]>[0]["descriptor"];

/** Finds a field in the transformer view by property name (throws when missing). */
function findField(view: TransformView, propertyName: string) {
  const match = Object.values(view.fields).find((f) => f.kind === "property" && f.propertyName === propertyName);
  if (!match) {
    throw new Error(`No property field named "${propertyName}".`);
  }
  return match;
}

describe("Content", () => {
  describe("Descriptor transformers", () => {
    beforeAll(async () => {
      await initialize();
    });

    afterAll(async () => {
      await terminate();
    });

    async function buildTwoFieldClass() {
      const setup = await buildTestECDb(async (builder, testName) => {
        const s = await importSchema(
          testName,
          builder,
          `
            <ECEntityClass typeName="A">
              <ECProperty propertyName="Keep" typeName="string" />
              <ECProperty propertyName="Remove" typeName="string" />
            </ECEntityClass>
          `,
        );
        builder.insertInstance(s.items.A.fullName, { keep: "k", remove: "r" });
        return { schema: s };
      });
      return setup;
    }

    it("removes a field", async () => {
      using setup = await buildTwoFieldClass();
      const imodelAccess = createContentIModelAccess(setup.ecdb);
      const transformer = defineDescriptorTransformer({
        async transform({ descriptor: view }) {
          view.removeField(findField(view, "Remove").id);
        },
      });
      const descriptor = await buildDescriptor({
        imodelAccess,
        targets: [{ primaryClass: setup.schema.items.A.fullName }],
        config: { descriptorTransformers: [transformer] },
      });

      getPropertyFieldByName(descriptor, "Keep");
      expect(getPropertyFieldsByName(descriptor, "Remove")).toHaveLength(0);
    });

    it("overrides field label, hidden and readOnly metadata", async () => {
      using setup = await buildTwoFieldClass();
      const imodelAccess = createContentIModelAccess(setup.ecdb);
      const transformer = defineDescriptorTransformer({
        async transform({ descriptor: view }) {
          const keepField = findField(view, "Keep");
          keepField.label = "Renamed";
          keepField.hidden = true;
          keepField.readOnly = true;
        },
      });
      const descriptor = await buildDescriptor({
        imodelAccess,
        targets: [{ primaryClass: setup.schema.items.A.fullName }],
        config: { descriptorTransformers: [transformer] },
      });

      const keep = getPropertyFieldByName(descriptor, "Keep");
      expect(keep.label).toBe("Renamed");
      expect(keep.hidden).toBe(true);
      expect(keep.readOnly).toBe(true);
    });

    it("reassigns a field's category", async () => {
      using setup = await buildTwoFieldClass();
      const imodelAccess = createContentIModelAccess(setup.ecdb);
      const transformer = defineDescriptorTransformer({
        async transform({ descriptor: view }) {
          view.categories.custom = { id: "custom", label: "Custom Category" };
          findField(view, "Keep").categoryId = "custom";
        },
      });
      const descriptor = await buildDescriptor({
        imodelAccess,
        targets: [{ primaryClass: setup.schema.items.A.fullName }],
        config: { descriptorTransformers: [transformer] },
      });

      const keep = getPropertyFieldByName(descriptor, "Keep");
      expect(keep.categoryId).toBe("custom");
      expect(getFieldCategory(descriptor, keep)?.label).toBe("Custom Category");
    });

    it("runs transformers in ascending priority order", async () => {
      using setup = await buildTwoFieldClass();
      const imodelAccess = createContentIModelAccess(setup.ecdb);
      const first = defineDescriptorTransformer({
        priority: 1,
        async transform({ descriptor: view }) {
          findField(view, "Keep").label = "First";
        },
      });
      const second = defineDescriptorTransformer({
        priority: 2,
        async transform({ descriptor: view }) {
          findField(view, "Keep").label = "Second";
        },
      });
      const descriptor = await buildDescriptor({
        imodelAccess,
        targets: [{ primaryClass: setup.schema.items.A.fullName }],
        config: { descriptorTransformers: [second, first] },
      });

      // Higher priority runs last and wins.
      expect(getPropertyFieldByName(descriptor, "Keep").label).toBe("Second");
    });

    it("forks a field for a subset of its value-supplier classes", async () => {
      using setup = await buildTestECDb(async (builder, testName) => {
        const s = await importSchema(
          testName,
          builder,
          `
            <ECEntityClass typeName="A">
              <ECProperty propertyName="Prop" typeName="string" />
            </ECEntityClass>
            <ECEntityClass typeName="B">
              <BaseClass>A</BaseClass>
            </ECEntityClass>
            <ECEntityClass typeName="C">
              <BaseClass>A</BaseClass>
            </ECEntityClass>
          `,
        );
        builder.insertInstance(s.items.B.fullName, { prop: "b" });
        builder.insertInstance(s.items.C.fullName, { prop: "c" });
        return { schema: s };
      });
      const imodelAccess = createContentIModelAccess(setup.ecdb);
      const transformer = defineDescriptorTransformer({
        async transform({ descriptor: view }) {
          const prop = findField(view, "Prop");
          const forkedField = view.forkField(prop.id, [setup.schema.items.B.fullName]);
          forkedField.label = "Only B";
        },
      });
      const descriptor = await buildDescriptor({
        imodelAccess,
        targets: [{ primaryClass: setup.schema.items.A.fullName }],
        config: { descriptorTransformers: [transformer] },
      });

      const propFields = getPropertyFields(descriptor).filter((f) => f.propertyName === "Prop");
      expect(propFields).toHaveLength(2);
      const forked = propFields.find((f) => f.label === "Only B");
      expect(forked?.valueClassNames).toEqual([setup.schema.items.B.fullName]);
      const original = propFields.find((f) => f.label !== "Only B");
      expect(original?.valueClassNames).toEqual([setup.schema.items.C.fullName]);
    });
  });
});
