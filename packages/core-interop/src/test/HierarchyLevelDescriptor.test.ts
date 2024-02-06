/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { from } from "rxjs";
import { eachValueFrom } from "rxjs-for-await";
import sinon from "sinon";
import {
  ContentDescriptorRequestOptions,
  ContentRule,
  DefaultContentDisplayTypes,
  Descriptor,
  DescriptorSource,
  KeySet,
  Ruleset,
} from "@itwin/presentation-common";
import {
  DefineHierarchyLevelProps,
  ECSqlQueryDef,
  HierarchyNode,
  HierarchyProvider,
  InstanceKey,
  InstancesNodeKey,
} from "@itwin/presentation-hierarchy-builder";
import { createHierarchyLevelDescriptor } from "../core-interop/HierarchyLevelDescriptor";

describe("createHierarchyLevelDescriptor", () => {
  it("returns `undefined` from descriptor builder", async () => {
    const hierarchyDefinition = {
      defineHierarchyLevel: sinon.stub().resolves([]),
    };
    const queryExecutor = {
      createQueryReader: sinon.stub(),
    };
    const hierarchyProvider = new HierarchyProvider({
      metadataProvider: {
        getSchema: async (_schemaName) => undefined,
      },
      queryExecutor,
      hierarchyDefinition,
    });
    const descriptorBuilder = {
      getContentDescriptor: sinon.stub().resolves(undefined),
    };
    const descriptor = await createHierarchyLevelDescriptor({
      imodel: {} as any,
      hierarchyProvider,
      descriptorBuilder,
      parentNode: undefined,
    });
    expect(hierarchyDefinition.defineHierarchyLevel).to.be.calledOnceWith(
      sinon.match((props: DefineHierarchyLevelProps) => {
        return props.parentNode === undefined;
      }),
    );
    expect(queryExecutor.createQueryReader).to.not.be.called;
    expect(descriptorBuilder.getContentDescriptor).to.be.calledOnceWith(
      sinon.match((props: ContentDescriptorRequestOptions<any, KeySet, any>) => {
        return props.keys.isEmpty;
      }),
    );
    expect(descriptor).to.be.undefined;
  });

  it("requests descriptor for hierarchy level instances", async () => {
    const hierarchyDefinition = {
      defineHierarchyLevel: sinon.stub().resolves([
        {
          fullClassName: "schema.class1",
          query: {
            ecsql: `query 1`,
          },
        },
        {
          fullClassName: "schema.class2",
          query: {
            ecsql: `query 2`,
          },
        },
      ]),
    };
    const queryExecutor = {
      createQueryReader: sinon.fake((query: ECSqlQueryDef) => {
        if (query.ecsql.includes("query 1")) {
          return eachValueFrom(from([["schema.class1", "0x123", false]]));
        }
        if (query.ecsql.includes("query 2")) {
          return eachValueFrom(from([["schema.class2", "0x456", false]]));
        }
        return eachValueFrom(from([]));
      }),
    };
    const hierarchyProvider = new HierarchyProvider({
      metadataProvider: {
        getSchema: async (_schemaName) => undefined,
      },
      queryExecutor,
      hierarchyDefinition,
    });
    const descriptorResponse = createTestDescriptorSource() as Descriptor;
    const descriptorBuilder = {
      getContentDescriptor: sinon.stub().resolves(descriptorResponse),
    };
    const imodel = {} as any;
    const parentNode = {} as HierarchyNode & { key: InstancesNodeKey };
    const descriptor = await createHierarchyLevelDescriptor({
      imodel,
      hierarchyProvider,
      descriptorBuilder,
      parentNode,
    });
    expect(hierarchyDefinition.defineHierarchyLevel).to.be.calledOnceWith(
      sinon.match((props: DefineHierarchyLevelProps) => {
        return props.parentNode === parentNode;
      }),
    );
    expect(queryExecutor.createQueryReader)
      .to.be.calledTwice.and.to.be.calledWith(sinon.match((query: ECSqlQueryDef) => query.ecsql.includes("query 1")))
      .and.to.be.calledWith(sinon.match((query: ECSqlQueryDef) => query.ecsql.includes("query 2")));
    expect(descriptorBuilder.getContentDescriptor).to.be.calledOnceWith(
      sinon.match((props: ContentDescriptorRequestOptions<any, KeySet, any>) => {
        return (
          props.imodel === imodel &&
          props.keys.size === 2 &&
          props.keys.hasAll([
            { className: "schema.class1", id: "0x123" },
            { className: "schema.class2", id: "0x456" },
          ]) &&
          ((props.rulesetOrId as Ruleset).rules[0] as ContentRule).specifications[0].specType === "SelectedNodeInstances" &&
          props.displayType === DefaultContentDisplayTypes.PropertyPane
        );
      }),
    );
    expect(descriptor).to.be.instanceOf(Descriptor);
    expect(descriptor?.ruleset).to.eq(descriptorBuilder.getContentDescriptor.firstCall.args[0].rulesetOrId);
  });

  it("requests descriptor for hierarchy level instances with hidden intermediate hierarchy levels", async () => {
    const hierarchyDefinition = {
      defineHierarchyLevel: sinon.fake(async ({ parentNode }) => {
        if (!parentNode) {
          return [
            {
              fullClassName: "schema.class1",
              query: {
                ecsql: `hidden nodes query`,
              },
            },
          ];
        }
        return [
          {
            fullClassName: "schema.class2",
            query: {
              ecsql: `visible nodes query`,
            },
          },
        ];
      }),
    };
    const queryExecutor = {
      createQueryReader: sinon.fake((query: ECSqlQueryDef) => {
        if (query.ecsql.includes("hidden nodes query")) {
          return eachValueFrom(from([["schema.class1", "0x111", true]]));
        }
        if (query.ecsql.includes("visible nodes query")) {
          return eachValueFrom(from([["schema.class2", "0x999", false]]));
        }
        return eachValueFrom(from([]));
      }),
    };
    const hierarchyProvider = new HierarchyProvider({
      metadataProvider: {
        getSchema: async (_schemaName) => undefined,
      },
      queryExecutor,
      hierarchyDefinition,
    });
    const descriptorResponse = createTestDescriptorSource() as Descriptor;
    const descriptorBuilder = {
      getContentDescriptor: sinon.stub().resolves(descriptorResponse),
    };
    const imodel = {} as any;
    const descriptor = await createHierarchyLevelDescriptor({
      imodel,
      hierarchyProvider,
      descriptorBuilder,
      parentNode: undefined,
    });
    expect(hierarchyDefinition.defineHierarchyLevel)
      .to.be.calledTwice.and.to.be.calledWith(sinon.match((props: DefineHierarchyLevelProps) => props.parentNode === undefined))
      .and.to.be.calledWith(
        sinon.match((props: DefineHierarchyLevelProps) => {
          return (
            props.parentNode &&
            HierarchyNode.isInstancesNode(props.parentNode) &&
            InstanceKey.equals(props.parentNode.key.instanceKeys[0], { className: "schema.class1", id: "0x111" })
          );
        }),
      );
    expect(queryExecutor.createQueryReader)
      .to.be.calledTwice.and.to.be.calledWith(sinon.match((query: ECSqlQueryDef) => query.ecsql.includes("hidden nodes query")))
      .and.to.be.calledWith(sinon.match((query: ECSqlQueryDef) => query.ecsql.includes("visible nodes query")));
    expect(descriptorBuilder.getContentDescriptor).to.be.calledOnceWith(
      sinon.match((props: ContentDescriptorRequestOptions<any, KeySet, any>) => {
        return (
          props.imodel === imodel &&
          props.keys.size === 1 &&
          props.keys.hasAll([{ className: "schema.class2", id: "0x999" }]) &&
          ((props.rulesetOrId as Ruleset).rules[0] as ContentRule).specifications[0].specType === "SelectedNodeInstances" &&
          props.displayType === DefaultContentDisplayTypes.PropertyPane
        );
      }),
    );
    expect(descriptor).to.be.instanceOf(Descriptor);
    expect(descriptor?.ruleset).to.eq(descriptorBuilder.getContentDescriptor.firstCall.args[0].rulesetOrId);
  });

  it("merges instance keys of hidden hierarchy levels by class when requesting child instance keys", async () => {
    const hierarchyDefinition = {
      defineHierarchyLevel: sinon.fake(async ({ parentNode }) => {
        if (!parentNode) {
          return [
            {
              fullClassName: "",
              query: {
                ecsql: `hidden nodes query`,
              },
            },
          ];
        }
        return [
          {
            fullClassName: "",
            query: {
              ecsql: `visible nodes query ${parentNode.key.instanceKeys.length}`,
            },
          },
        ];
      }),
    };
    const queryExecutor = {
      createQueryReader: sinon.fake((query: ECSqlQueryDef) => {
        if (query.ecsql.includes("hidden nodes query")) {
          return eachValueFrom(
            from([
              ["schema.class1", "0x111", true],
              ["schema.class1", "0x222", true],
              ["schema.class2", "0x333", true],
            ]),
          );
        }
        if (query.ecsql.includes("visible nodes query 1")) {
          return eachValueFrom(from([["schema.class3", "0x333", false]]));
        }
        if (query.ecsql.includes("visible nodes query 2")) {
          return eachValueFrom(from([["schema.class4", "0x444", false]]));
        }
        return eachValueFrom(from([]));
      }),
    };
    const hierarchyProvider = new HierarchyProvider({
      metadataProvider: {
        getSchema: async (_schemaName) => undefined,
      },
      queryExecutor,
      hierarchyDefinition,
    });
    const descriptorResponse = createTestDescriptorSource() as Descriptor;
    const descriptorBuilder = {
      getContentDescriptor: sinon.stub().resolves(descriptorResponse),
    };
    const imodel = {} as any;
    const descriptor = await createHierarchyLevelDescriptor({
      imodel,
      hierarchyProvider,
      descriptorBuilder,
      parentNode: undefined,
    });
    expect(hierarchyDefinition.defineHierarchyLevel)
      .to.be.calledThrice.and.to.be.calledWith(sinon.match((props: DefineHierarchyLevelProps) => props.parentNode === undefined))
      .and.to.be.calledWith(
        sinon.match((props: DefineHierarchyLevelProps) => {
          return (
            props.parentNode &&
            HierarchyNode.isInstancesNode(props.parentNode) &&
            props.parentNode.key.instanceKeys.length === 2 &&
            InstanceKey.equals(props.parentNode.key.instanceKeys[0], { className: "schema.class1", id: "0x111" }) &&
            InstanceKey.equals(props.parentNode.key.instanceKeys[1], { className: "schema.class1", id: "0x222" })
          );
        }),
      )
      .and.to.be.calledWith(
        sinon.match((props: DefineHierarchyLevelProps) => {
          return (
            props.parentNode &&
            HierarchyNode.isInstancesNode(props.parentNode) &&
            props.parentNode.key.instanceKeys.length === 1 &&
            InstanceKey.equals(props.parentNode.key.instanceKeys[0], { className: "schema.class2", id: "0x333" })
          );
        }),
      );
    expect(queryExecutor.createQueryReader)
      .to.be.calledThrice.and.to.be.calledWith(sinon.match((query: ECSqlQueryDef) => query.ecsql.includes("hidden nodes query")))
      .and.to.be.calledWith(sinon.match((query: ECSqlQueryDef) => query.ecsql.includes("visible nodes query 1")))
      .and.to.be.calledWith(sinon.match((query: ECSqlQueryDef) => query.ecsql.includes("visible nodes query 2")));
    expect(descriptorBuilder.getContentDescriptor).to.be.calledOnceWith(
      sinon.match((props: ContentDescriptorRequestOptions<any, KeySet, any>) => {
        return (
          props.imodel === imodel &&
          props.keys.size === 2 &&
          props.keys.hasAll([
            { className: "schema.class3", id: "0x333" },
            { className: "schema.class4", id: "0x444" },
          ]) &&
          ((props.rulesetOrId as Ruleset).rules[0] as ContentRule).specifications[0].specType === "SelectedNodeInstances" &&
          props.displayType === DefaultContentDisplayTypes.PropertyPane
        );
      }),
    );
    expect(descriptor).to.be.instanceOf(Descriptor);
    expect(descriptor?.ruleset).to.eq(descriptorBuilder.getContentDescriptor.firstCall.args[0].rulesetOrId);
  });
});

function createTestDescriptorSource(): DescriptorSource {
  return {
    displayType: "",
    categories: [],
    contentFlags: 0,
    fields: [],
    selectClasses: [],
  };
}
