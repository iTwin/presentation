/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { collect, createAsyncIterator } from "presentation-test-utilities";
import sinon from "sinon";
import { BeEvent } from "@itwin/core-bentley";
import { InstanceKey } from "@itwin/presentation-shared";
import { HierarchyNode, NonGroupingHierarchyNode } from "../hierarchies/HierarchyNode";
import { HierarchyProvider, mergeProviders } from "../hierarchies/HierarchyProvider";
import { createTestGenericNode, createTestGenericNodeKey } from "./Utils";

describe("mergeProviders", () => {
  it("returns nodes from all providers", async () => {
    const providers = [
      createTestProvider({
        nodes: ({ parentNode }) =>
          !parentNode
            ? [
                createTestGenericNode({ key: createTestGenericNodeKey({ id: "1", source: "s1" }), label: "1" }),
                createTestGenericNode({ key: createTestGenericNodeKey({ id: "x", source: "s1" }), label: "x" }),
              ]
            : [],
      }),
      createTestProvider({
        nodes: ({ parentNode }) =>
          !parentNode
            ? [
                createTestGenericNode({ key: createTestGenericNodeKey({ id: "2", source: "s2" }), label: "2" }),
                createTestGenericNode({ key: createTestGenericNodeKey({ id: "x", source: "s2" }), label: "x" }),
              ]
            : [],
      }),
    ];
    const mergedProvider = mergeProviders({ providers });
    expect(await collect(mergedProvider.getNodes({ parentNode: undefined }))).to.deep.eq([
      createTestGenericNode({ key: createTestGenericNodeKey({ id: "1", source: "s1" }), label: "1" }),
      createTestGenericNode({ key: createTestGenericNodeKey({ id: "2", source: "s2" }), label: "2" }),
      createTestGenericNode({ key: createTestGenericNodeKey({ id: "x", source: "s2" }), label: "x" }),
      createTestGenericNode({ key: createTestGenericNodeKey({ id: "x", source: "s1" }), label: "x" }),
    ]);
  });

  it("creates hierarchy from multiple providers", async () => {
    const providers = [
      createTestProvider({
        nodes: ({ parentNode }) => {
          if (!parentNode) {
            return [createTestGenericNode({ key: createTestGenericNodeKey({ id: "1", source: "s1" }), label: "1", children: true })];
          }
          if (HierarchyNode.isGeneric(parentNode) && parentNode.key.id === "1") {
            return [createTestGenericNode({ key: createTestGenericNodeKey({ id: "2", source: "s1" }), label: "2", children: false })];
          }
          return [];
        },
      }),
      createTestProvider({
        nodes: ({ parentNode }) =>
          parentNode && HierarchyNode.isGeneric(parentNode) && parentNode.key.id === "2"
            ? [createTestGenericNode({ key: createTestGenericNodeKey({ id: "3", source: "s2" }), label: "3", children: false })]
            : [],
      }),
    ];
    const mergedProvider = mergeProviders({ providers });

    const nodes1 = await collect(mergedProvider.getNodes({ parentNode: undefined }));
    expect(nodes1).to.deep.eq([createTestGenericNode({ key: createTestGenericNodeKey({ id: "1", source: "s1" }), label: "1", children: true })]);

    const nodes2 = await collect(mergedProvider.getNodes({ parentNode: nodes1[0] }));
    expect(nodes2).to.deep.eq([createTestGenericNode({ key: createTestGenericNodeKey({ id: "2", source: "s1" }), label: "2", children: true })]);

    const nodes3 = await collect(mergedProvider.getNodes({ parentNode: nodes2[0] }));
    expect(nodes3).to.deep.eq([createTestGenericNode({ key: createTestGenericNodeKey({ id: "3", source: "s2" }), label: "3", children: false })]);
  });

  it("returns instance keys from all providers", async () => {
    const providers = [
      createTestProvider({
        instanceKeys: () => [
          { className: "1", id: "1" },
          { className: "x", id: "x" },
        ],
      }),
      createTestProvider({
        instanceKeys: () => [{ className: "2", id: "2" }],
      }),
    ];
    const mergedProvider = mergeProviders({ providers });
    expect(await collect(mergedProvider.getNodeInstanceKeys({ parentNode: undefined })))
      .to.have.lengthOf(3)
      .and.to.containSubset([
        { className: "1", id: "1" },
        { className: "x", id: "x" },
        { className: "2", id: "2" },
      ]);
    providers.forEach((provider) => expect(provider.getNodeInstanceKeys.callCount).to.eq(1));
  });

  it("sets formatter on all providers", async () => {
    const providers = [createTestProvider(), createTestProvider()];
    const mergedProvider = mergeProviders({ providers });
    const formatter = {} as any;
    mergedProvider.setFormatter(formatter);
    providers.forEach((provider) => expect(provider.setFormatter).to.be.calledOnceWith(formatter));
  });

  it("sets hierarchy filter on all providers", async () => {
    const providers = [createTestProvider(), createTestProvider()];
    const mergedProvider = mergeProviders({ providers });
    const filter = {} as any;
    mergedProvider.setHierarchyFilter(filter);
    providers.forEach((provider) => expect(provider.setHierarchyFilter).to.be.calledOnceWith(filter));
  });

  it("raises `hierarchyChanged` event when one of the merged providers raises it", async () => {
    const providers = [createTestProvider(), createTestProvider()];
    const mergedProvider = mergeProviders({ providers });
    const spy = sinon.spy();
    mergedProvider.hierarchyChanged.addListener(spy);

    providers[0].hierarchyChanged.raiseEvent();
    expect(spy).to.be.calledOnce;

    providers[1].hierarchyChanged.raiseEvent();
    expect(spy).to.be.calledTwice;
  });

  it("disposes all disposable providers", async () => {
    const providers = [createTestProvider({ disposable: true }), createTestProvider()];
    const mergedProvider = mergeProviders({ providers });
    mergedProvider.dispose();
    providers.forEach((provider) => provider.dispose && expect(provider.dispose).to.be.calledOnce);
  });
});

function createTestProvider(props?: {
  nodes?: (props: Parameters<HierarchyProvider["getNodes"]>[0]) => Partial<NonGroupingHierarchyNode>[];
  instanceKeys?: (props: Parameters<HierarchyProvider["getNodeInstanceKeys"]>[0]) => InstanceKey[];
  disposable?: boolean;
}) {
  return {
    hierarchyChanged: new BeEvent(),
    getNodes: sinon
      .stub<Parameters<HierarchyProvider["getNodes"]>>()
      .callsFake((getNodesProps) => createAsyncIterator(props?.nodes ? props.nodes(getNodesProps).map((partial) => createTestGenericNode(partial)) : [])),
    getNodeInstanceKeys: sinon
      .stub<Parameters<HierarchyProvider["getNodeInstanceKeys"]>>()
      .callsFake((getNodeInstanceKeysProps) => createAsyncIterator(props?.instanceKeys ? props.instanceKeys(getNodeInstanceKeysProps) : [])),
    setFormatter: sinon.stub(),
    setHierarchyFilter: sinon.stub(),
    ...(props?.disposable ? { dispose: sinon.stub() } : {}),
  };
}
