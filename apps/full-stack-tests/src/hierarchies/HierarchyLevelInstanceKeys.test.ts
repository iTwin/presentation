/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { collect } from "presentation-test-utilities";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { HierarchyNode } from "@itwin/presentation-hierarchies";
import { InstanceKey } from "@itwin/presentation-shared";
import { buildTestECDb } from "../ECDbUtils.js";
import { initialize, terminate } from "../IntegrationTests.js";
import { importSchema } from "../SchemaUtils.js";
import { createProvider } from "./Utils.js";

import type { HierarchyDefinition } from "@itwin/presentation-hierarchies";

describe("Hierarchies", () => {
  describe("Hierarchy level instance keys", () => {
    beforeAll(async () => {
      await initialize();
    });

    afterAll(async () => {
      await terminate();
    });

    it("gets instance keys for root hierarchy level", async () => {
      using setup = await buildTestECDb(async (builder, testName) => {
        const s = await importSchema(
          testName,
          builder,
          `
            <ECEntityClass typeName="X">
              <ECProperty propertyName="CodeValue" typeName="string" />
            </ECEntityClass>
          `,
        );
        const x1 = builder.insertInstance(s.items.X.fullName, { codeValue: "root" });
        return { schema: s, x1 };
      });
      const { ecdb, schema, ...keys } = setup;
      const hierarchy: HierarchyDefinition = {
        async defineHierarchyLevel({ createSelectClause }) {
          return [
            {
              fullClassName: schema.items.X.fullName,
              query: {
                ecsql: `
                  SELECT ${await createSelectClause({
                    ecClassId: { selector: `this.ECClassId` },
                    ecInstanceId: { selector: `this.ECInstanceId` },
                    nodeLabel: { selector: `this.CodeValue` },
                  })}
                  FROM ${schema.items.X.fullName} AS this
                `,
              },
            },
          ];
        },
      };
      const provider = createProvider({ ecdb, hierarchy });
      const instanceKeys = await collect(provider.getNodeInstanceKeys({ parentNode: undefined }));
      expect(instanceKeys).toMatchObject([{ className: schema.items.X.fullName, id: keys.x1.id }]);
    });

    it("gets instance keys for instance node's child hierarchy level", async () => {
      using setup = await buildTestECDb(async (builder, testName) => {
        const s = await importSchema(
          testName,
          builder,
          `
            <ECEntityClass typeName="X">
              <ECProperty propertyName="CodeValue" typeName="string" />
            </ECEntityClass>
            <ECEntityClass typeName="Y">
              <ECProperty propertyName="Label" typeName="string" />
            </ECEntityClass>
            <ECRelationshipClass typeName="XY" strength="referencing" strengthDirection="forward" modifier="None">
              <Source multiplicity="(0..1)" roleLabel="owns" polymorphic="false">
                <Class class="X" />
              </Source>
              <Target multiplicity="(0..*)" roleLabel="owned by" polymorphic="false">
                <Class class="Y" />
              </Target>
            </ECRelationshipClass>
          `,
        );
        const x1 = builder.insertInstance(s.items.X.fullName, { codeValue: "parent" });
        const y1 = builder.insertInstance(s.items.Y.fullName, { label: "child1" });
        const y2 = builder.insertInstance(s.items.Y.fullName, { label: "child2" });
        builder.insertRelationship(s.items.XY.fullName, x1.id, y1.id);
        builder.insertRelationship(s.items.XY.fullName, x1.id, y2.id);
        return { schema: s, x1, y1, y2 };
      });
      const { ecdb, schema, ...keys } = setup;
      const hierarchy: HierarchyDefinition = {
        async defineHierarchyLevel({ parentNode, createSelectClause }) {
          if (
            parentNode &&
            HierarchyNode.isInstancesNode(parentNode) &&
            parentNode.key.instanceKeys.some((ik) => InstanceKey.equals(ik, keys.x1))
          ) {
            return [
              {
                fullClassName: schema.items.Y.fullName,
                query: {
                  ecsql: `
                    SELECT ${await createSelectClause({
                      ecClassId: { selector: `this.ECClassId` },
                      ecInstanceId: { selector: `this.ECInstanceId` },
                      nodeLabel: { selector: `this.Label` },
                    })}
                    FROM ${schema.items.Y.fullName} AS this
                    JOIN ${schema.items.XY.fullName} AS rel ON rel.TargetECInstanceId = this.ECInstanceId
                    WHERE rel.SourceECInstanceId = ?
                  `,
                  bindings: [{ type: "id", value: keys.x1.id }],
                },
              },
            ];
          }
          return [];
        },
      };
      const xNode = {
        key: { type: "instances" as const, instanceKeys: [keys.x1] },
        parentKeys: [],
        label: "parent",
        children: true,
      };
      const provider = createProvider({ ecdb, hierarchy });
      const instanceKeys = await collect(provider.getNodeInstanceKeys({ parentNode: xNode }));
      expect(instanceKeys).toMatchObject([
        { className: schema.items.Y.fullName, id: keys.y1.id },
        { className: schema.items.Y.fullName, id: keys.y2.id },
      ]);
    });

    it("gets instance keys for generic node's child hierarchy level", async () => {
      using setup = await buildTestECDb(async (builder, testName) => {
        const s = await importSchema(
          testName,
          builder,
          `
            <ECEntityClass typeName="X">
              <ECProperty propertyName="CodeValue" typeName="string" />
            </ECEntityClass>
          `,
        );
        const x1 = builder.insertInstance(s.items.X.fullName, { codeValue: "root" });
        return { schema: s, x1 };
      });
      const { ecdb, schema, ...keys } = setup;
      const hierarchy: HierarchyDefinition = {
        async defineHierarchyLevel({ parentNode, createSelectClause }) {
          if (parentNode && HierarchyNode.isGeneric(parentNode) && parentNode.key.id === "test") {
            return [
              {
                fullClassName: schema.items.X.fullName,
                query: {
                  ecsql: `
                    SELECT ${await createSelectClause({
                      ecClassId: { selector: `this.ECClassId` },
                      ecInstanceId: { selector: `this.ECInstanceId` },
                      nodeLabel: { selector: `this.CodeValue` },
                    })}
                    FROM ${schema.items.X.fullName} AS this
                  `,
                },
              },
            ];
          }
          return [];
        },
      };
      const testCustomNode: HierarchyNode = {
        key: { type: "generic", id: "test" },
        parentKeys: [],
        label: "custom parent node",
        children: true,
      };
      const provider = createProvider({ ecdb, hierarchy });
      const instanceKeys = await collect(provider.getNodeInstanceKeys({ parentNode: testCustomNode }));
      expect(instanceKeys).toMatchObject([{ className: schema.items.X.fullName, id: keys.x1.id }]);
    });

    it("gets instance keys for hidden instance node's child hierarchy level", async () => {
      using setup = await buildTestECDb(async (builder, testName) => {
        const s = await importSchema(
          testName,
          builder,
          `
            <ECEntityClass typeName="X">
              <ECProperty propertyName="CodeValue" typeName="string" />
            </ECEntityClass>
            <ECEntityClass typeName="Y">
              <ECProperty propertyName="Label" typeName="string" />
            </ECEntityClass>
            <ECRelationshipClass typeName="XY" strength="referencing" strengthDirection="forward" modifier="None">
              <Source multiplicity="(0..1)" roleLabel="owns" polymorphic="false">
                <Class class="X" />
              </Source>
              <Target multiplicity="(0..*)" roleLabel="owned by" polymorphic="false">
                <Class class="Y" />
              </Target>
            </ECRelationshipClass>
          `,
        );
        const x1 = builder.insertInstance(s.items.X.fullName, { codeValue: "parent" });
        const y1 = builder.insertInstance(s.items.Y.fullName, { label: "child1" });
        const y2 = builder.insertInstance(s.items.Y.fullName, { label: "child2" });
        builder.insertRelationship(s.items.XY.fullName, x1.id, y1.id);
        builder.insertRelationship(s.items.XY.fullName, x1.id, y2.id);
        return { schema: s, x1, y1, y2 };
      });
      const { ecdb, schema, ...keys } = setup;
      const hierarchy: HierarchyDefinition = {
        async defineHierarchyLevel({ parentNode, createSelectClause }) {
          if (!parentNode) {
            return [
              {
                fullClassName: schema.items.X.fullName,
                query: {
                  ecsql: `
                    SELECT ${await createSelectClause({
                      ecClassId: { selector: `this.ECClassId` },
                      ecInstanceId: { selector: `this.ECInstanceId` },
                      nodeLabel: { selector: `this.CodeValue` },
                      hideNodeInHierarchy: true,
                    })}
                    FROM ${schema.items.X.fullName} AS this
                  `,
                },
              },
            ];
          }
          if (
            HierarchyNode.isInstancesNode(parentNode) &&
            parentNode.key.instanceKeys.some((ik) => ik.id === keys.x1.id)
          ) {
            return [
              {
                fullClassName: schema.items.Y.fullName,
                query: {
                  ecsql: `
                    SELECT ${await createSelectClause({
                      ecClassId: { selector: `this.ECClassId` },
                      ecInstanceId: { selector: `this.ECInstanceId` },
                      nodeLabel: { selector: `this.Label` },
                    })}
                    FROM ${schema.items.Y.fullName} AS this
                    JOIN ${schema.items.XY.fullName} AS rel ON rel.TargetECInstanceId = this.ECInstanceId
                    WHERE rel.SourceECInstanceId = ?
                  `,
                  bindings: [{ type: "id", value: keys.x1.id }],
                },
              },
            ];
          }
          return [];
        },
      };
      const provider = createProvider({ ecdb, hierarchy });
      const instanceKeys = await collect(provider.getNodeInstanceKeys({ parentNode: undefined }));
      expect(instanceKeys).toMatchObject([
        { className: schema.items.Y.fullName, id: keys.y1.id },
        { className: schema.items.Y.fullName, id: keys.y2.id },
      ]);
    });

    it("gets instance keys for hidden generic node's child hierarchy level", async () => {
      using setup = await buildTestECDb(async (builder, testName) => {
        const s = await importSchema(
          testName,
          builder,
          `
            <ECEntityClass typeName="X">
              <ECProperty propertyName="CodeValue" typeName="string" />
            </ECEntityClass>
          `,
        );
        const x1 = builder.insertInstance(s.items.X.fullName, { codeValue: "root" });
        return { schema: s, x1 };
      });
      const { ecdb, schema, ...keys } = setup;
      const hierarchy: HierarchyDefinition = {
        async defineHierarchyLevel({ parentNode, createSelectClause }) {
          if (!parentNode) {
            return [
              { node: { key: "test", label: "hidden custom node", processingParams: { hideInHierarchy: true } } },
            ];
          }
          if (HierarchyNode.isGeneric(parentNode) && parentNode.key.id === "test") {
            return [
              {
                fullClassName: schema.items.X.fullName,
                query: {
                  ecsql: `
                    SELECT ${await createSelectClause({
                      ecClassId: { selector: `this.ECClassId` },
                      ecInstanceId: { selector: `this.ECInstanceId` },
                      nodeLabel: { selector: `this.CodeValue` },
                    })}
                    FROM ${schema.items.X.fullName} AS this
                  `,
                },
              },
            ];
          }
          return [];
        },
      };
      const provider = createProvider({ ecdb, hierarchy });
      const instanceKeys = await collect(provider.getNodeInstanceKeys({ parentNode: undefined }));
      expect(instanceKeys).toMatchObject([{ className: schema.items.X.fullName, id: keys.x1.id }]);
    });
  });
});
