/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { collect } from "presentation-test-utilities";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createContentProvider,
  defineIModelFieldsProvider,
  getDistinctFieldValues,
  resolveContentSources,
} from "@itwin/presentation-content";
import { buildTestECDb } from "../ECDbUtils.js";
import { initialize, terminate } from "../IntegrationTests.js";
import { importSchema } from "../SchemaUtils.js";
import { createContentIModelAccess, getCalculatedFieldByLabel, getPropertyFieldByName } from "./Utils.js";

import type { ContentConfiguration, ContentTarget } from "@itwin/presentation-content";
import type { EC, RelationshipPath } from "@itwin/presentation-shared";

async function createProvider(props: {
  imodelAccess: ReturnType<typeof createContentIModelAccess>;
  targets: ContentTarget[];
  config?: ContentConfiguration;
}) {
  const sources = await resolveContentSources(props);
  return createContentProvider({ imodelAccess: props.imodelAccess, sources, config: props.config });
}

/** Pumps (and a pump subclass) and walls under one base class; every instance may have a note. */
async function buildPumpsAndWalls() {
  return buildTestECDb("Class-scoped provider contributions", async (builder, testName) => {
    const schema = await importSchema(
      testName,
      builder,
      `
        <ECEntityClass typeName="Base" modifier="Abstract">
          <ECCustomAttributes>
            <ClassMap xmlns="ECDbMap.02.00.01">
              <MapStrategy>TablePerHierarchy</MapStrategy>
            </ClassMap>
          </ECCustomAttributes>
        </ECEntityClass>
        <ECEntityClass typeName="Pump">
          <BaseClass>Base</BaseClass>
          <ECProperty propertyName="FlowRate" typeName="double" />
        </ECEntityClass>
        <ECEntityClass typeName="BigPump">
          <BaseClass>Pump</BaseClass>
        </ECEntityClass>
        <ECEntityClass typeName="Wall">
          <BaseClass>Base</BaseClass>
          <ECProperty propertyName="Height" typeName="double" />
        </ECEntityClass>
        <ECEntityClass typeName="Note">
          <ECProperty propertyName="Text" typeName="string" />
        </ECEntityClass>
        <ECRelationshipClass typeName="BaseHasNote" strength="referencing" modifier="None">
          <Source multiplicity="(0..*)" roleLabel="has" polymorphic="true">
            <Class class="Base" />
          </Source>
          <Target multiplicity="(0..1)" roleLabel="is of" polymorphic="true">
            <Class class="Note" />
          </Target>
        </ECRelationshipClass>
      `,
    );
    const addNote = (ownerId: string, text: string) => {
      const note = builder.insertInstance(schema.items.Note.fullName, { text });
      builder.insertRelationship(schema.items.BaseHasNote.fullName, ownerId, note.id);
    };
    const pump = builder.insertInstance(schema.items.Pump.fullName, { flowRate: 2 });
    const bigPump = builder.insertInstance(schema.items.BigPump.fullName, { flowRate: 3 });
    const wall = builder.insertInstance(schema.items.Wall.fullName, { height: 10 });
    const bareWall = builder.insertInstance(schema.items.Wall.fullName, { height: 20 });
    addNote(pump.id, "pump note");
    addNote(bigPump.id, "big pump note");
    addNote(wall.id, "wall note");
    return { schema, pump, bigPump, wall, bareWall };
  });
}

describe("Content", () => {
  describe("Class-scoped provider contributions", () => {
    let setup: Awaited<ReturnType<typeof buildPumpsAndWalls>>;

    beforeAll(async () => {
      await initialize();
      setup = await buildPumpsAndWalls();
      return () => {
        setup[Symbol.dispose]();
      };
    });

    afterAll(async () => {
      await terminate();
    });

    describe("related properties", () => {
      function createNotesProvider(sourceClassName: EC.FullClassNameDotNotation) {
        const path: RelationshipPath = [
          {
            sourceClassName,
            targetClassName: setup.schema.items.Note.fullName,
            relationshipName: setup.schema.items.BaseHasNote.fullName,
          },
        ];
        return defineIModelFieldsProvider({
          id: "notes_v1",
          async getContribution() {
            return { relatedProperties: [{ path, cardinalityHint: "one" }] };
          },
        });
      }

      it("loads related values only for instances of the declared source class under a base target", async () => {
        const imodelAccess = createContentIModelAccess(setup.ecdb);
        const provider = await createProvider({
          imodelAccess,
          targets: [{ primaryClass: setup.schema.items.Base.fullName }],
          config: { imodelFieldsProviders: [createNotesProvider(setup.schema.items.Pump.fullName)] },
        });

        const textField = getPropertyFieldByName(await provider.getContentDescriptor(), "Text");
        expect(textField.primaryClassNames).toEqual([
          setup.schema.items.BigPump.fullName,
          setup.schema.items.Pump.fullName,
        ]);

        const items = await collect(provider.getItems());
        // The wall has a note too, but the declaration only applies to pumps. Walls are still returned.
        expect(items).toHaveLength(4);
        const textById = new Map(items.map((item) => [item.primaryKey.id, item.getValue(textField)]));
        expect(textById.get(setup.pump.id)).toBe("pump note");
        expect(textById.get(setup.bigPump.id)).toBe("big pump note");
        expect(textById.get(setup.wall.id)).toBeUndefined();
        expect(textById.get(setup.bareWall.id)).toBeUndefined();
      });

      it("loads related values for every instance when the declared source is the base class", async () => {
        const imodelAccess = createContentIModelAccess(setup.ecdb);
        const provider = await createProvider({
          imodelAccess,
          targets: [{ primaryClass: setup.schema.items.Base.fullName }],
          config: { imodelFieldsProviders: [createNotesProvider(setup.schema.items.Base.fullName)] },
        });

        const textField = getPropertyFieldByName(await provider.getContentDescriptor(), "Text");
        const items = await collect(provider.getItems());
        expect(new Map(items.map((item) => [item.primaryKey.id, item.getValue(textField)]))).toEqual(
          new Map([
            [setup.pump.id, "pump note"],
            [setup.bigPump.id, "big pump note"],
            [setup.wall.id, "wall note"],
            [setup.bareWall.id, undefined],
          ]),
        );
      });

      it("keeps the target's instance IDs when the declared source is narrower", async () => {
        const imodelAccess = createContentIModelAccess(setup.ecdb);
        const provider = await createProvider({
          imodelAccess,
          targets: [{ primaryClass: setup.schema.items.Base.fullName, instanceIds: [setup.bigPump.id, setup.wall.id] }],
          config: { imodelFieldsProviders: [createNotesProvider(setup.schema.items.Pump.fullName)] },
        });

        const textField = getPropertyFieldByName(await provider.getContentDescriptor(), "Text");
        const items = await collect(provider.getItems());
        expect(new Map(items.map((item) => [item.primaryKey.id, item.getValue(textField)]))).toEqual(
          new Map([
            [setup.bigPump.id, "big pump note"],
            [setup.wall.id, undefined],
          ]),
        );
      });

      it("filters by a related value without dropping the pumps' siblings' scope", async () => {
        const imodelAccess = createContentIModelAccess(setup.ecdb);
        const provider = await createProvider({
          imodelAccess,
          targets: [{ primaryClass: setup.schema.items.Base.fullName }],
          config: { imodelFieldsProviders: [createNotesProvider(setup.schema.items.Pump.fullName)] },
        });
        const textField = getPropertyFieldByName(await provider.getContentDescriptor(), "Text");

        // Only the pump's note matches; the wall's "wall note" is outside the declaration's scope.
        const filters = [{ field: textField, operator: "like" as const, value: "%note" }];
        const items = await collect(provider.getItems({ filters }));
        expect(items.map((item) => item.primaryKey.id).sort()).toEqual([setup.pump.id, setup.bigPump.id].sort());
        await expect(provider.getSize({ filters })).resolves.toBe(2);
      });
    });

    describe("calculated fields", () => {
      function createFlowProvider() {
        return defineIModelFieldsProvider({
          id: "flow_v1",
          async getContribution() {
            return {
              calculatedFields: [
                {
                  id: "flow",
                  label: "Flow per minute",
                  sourceClassName: setup.schema.items.Pump.fullName,
                  expression: "this.FlowRate * 60",
                  type: { kind: "primitive", type: "Double" },
                },
                {
                  id: "constant",
                  label: "Pump constant",
                  sourceClassName: setup.schema.items.Pump.fullName,
                  expression: "7",
                  type: { kind: "primitive", type: "Integer" },
                },
              ],
            };
          },
        });
      }

      async function createFlowContent() {
        const imodelAccess = createContentIModelAccess(setup.ecdb);
        const provider = await createProvider({
          imodelAccess,
          targets: [{ primaryClass: setup.schema.items.Base.fullName }],
          config: { imodelFieldsProviders: [createFlowProvider()] },
        });
        const descriptor = await provider.getContentDescriptor();
        return {
          imodelAccess,
          provider,
          flowField: getCalculatedFieldByLabel(descriptor, "Flow per minute"),
          constantField: getCalculatedFieldByLabel(descriptor, "Pump constant"),
        };
      }

      it("evaluates a subclass-only expression for its instances and returns every other item without a value", async () => {
        const { provider, flowField, constantField } = await createFlowContent();
        expect(flowField.sourceClassName).toBe(setup.schema.items.Pump.fullName);
        expect(flowField.primaryClassNames).toEqual([
          setup.schema.items.BigPump.fullName,
          setup.schema.items.Pump.fullName,
        ]);

        const items = await collect(provider.getItems());
        expect(items).toHaveLength(4);
        expect(new Map(items.map((item) => [item.primaryKey.id, item.getValue(flowField)]))).toEqual(
          new Map([
            [setup.pump.id, 120],
            [setup.bigPump.id, 180],
            [setup.wall.id, undefined],
            [setup.bareWall.id, undefined],
          ]),
        );
        // A constant must not be manufactured for instances outside the declared class either.
        expect(new Map(items.map((item) => [item.primaryKey.id, item.getValue(constantField)]))).toEqual(
          new Map([
            [setup.pump.id, 7],
            [setup.bigPump.id, 7],
            [setup.wall.id, undefined],
            [setup.bareWall.id, undefined],
          ]),
        );
      });

      it.each(["asc", "desc"] as const)("sorts by a subclass-only calculated field (%s)", async (direction) => {
        const { provider, flowField } = await createFlowContent();
        const items = await collect(provider.getItems({ sorting: [{ field: flowField, direction }] }));
        expect(items).toHaveLength(4);
        const values = items.map((item) => item.getValue(flowField));
        expect(values).toEqual(
          direction === "asc" ? [undefined, undefined, 120, 180] : [180, 120, undefined, undefined],
        );
      });

      it("filters, counts and lists instance keys by a subclass-only calculated field", async () => {
        const { provider, flowField } = await createFlowContent();
        const filters = [{ field: flowField, operator: "greater-than" as const, value: 150 }];

        const items = await collect(provider.getItems({ filters }));
        expect(items.map((item) => item.primaryKey.id)).toEqual([setup.bigPump.id]);

        await expect(provider.getSize({ filters })).resolves.toBe(1);

        const keys = await collect(provider.getInstanceKeys({ filters }));
        expect(keys.map((key) => key.id)).toEqual([setup.bigPump.id]);
      });

      it("gets distinct values only over the classes the field applies to", async () => {
        const { imodelAccess, flowField } = await createFlowContent();
        const values = await collect(getDistinctFieldValues({ imodelAccess, field: flowField }));
        expect(values.slice().sort()).toEqual([120, 180]);
      });

      it("omits a field whose source class is unrelated to the target's instances", async () => {
        const imodelAccess = createContentIModelAccess(setup.ecdb);
        const provider = await createProvider({
          imodelAccess,
          targets: [{ primaryClass: setup.schema.items.Wall.fullName }],
          config: { imodelFieldsProviders: [createFlowProvider()] },
        });
        const descriptor = await provider.getContentDescriptor();
        expect(Object.values(descriptor.fields).filter((field) => field.kind === "calculated")).toEqual([]);
        const items = await collect(provider.getItems());
        expect(items.map((item) => item.primaryKey.id).sort()).toEqual([setup.wall.id, setup.bareWall.id].sort());
      });
    });
  });
});
