/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { collect, createAsyncIterator } from "presentation-test-utilities";
import sinon from "sinon";
import { InstanceKey } from "@itwin/presentation-shared";
import { NonGroupingHierarchyNode } from "../hierarchies/HierarchyNode";
import { HierarchyProvider, mergeProviders } from "../hierarchies/HierarchyProvider";
import { createTestGenericNode, createTestGenericNodeKey } from "./Utils";

describe("mergeProviders", () => {
  it("returns nodes from all providers", async () => {
    const providers = [
      createTestProvider({
        nodes: [
          createTestGenericNode({ key: createTestGenericNodeKey({ id: "1", source: "s1" }), label: "1" }),
          createTestGenericNode({ key: createTestGenericNodeKey({ id: "x", source: "s1" }), label: "x" }),
        ],
      }),
      createTestProvider({
        nodes: [
          createTestGenericNode({ key: createTestGenericNodeKey({ id: "2", source: "s2" }), label: "2" }),
          createTestGenericNode({ key: createTestGenericNodeKey({ id: "x", source: "s2" }), label: "x" }),
        ],
      }),
    ];
    const mergedProvider = mergeProviders({ providers });
    expect(await collect(mergedProvider.getNodes({ parentNode: undefined }))).to.deep.eq([
      createTestGenericNode({ key: createTestGenericNodeKey({ id: "1", source: "s1" }), label: "1" }),
      createTestGenericNode({ key: createTestGenericNodeKey({ id: "2", source: "s2" }), label: "2" }),
      createTestGenericNode({ key: createTestGenericNodeKey({ id: "x", source: "s2" }), label: "x" }),
      createTestGenericNode({ key: createTestGenericNodeKey({ id: "x", source: "s1" }), label: "x" }),
    ]);
    providers.forEach((provider) => expect(provider.getNodes.callCount).to.eq(1));
  });

  it("returns instance keys from all providers", async () => {
    const providers = [
      createTestProvider({
        instanceKeys: [
          { className: "1", id: "1" },
          { className: "x", id: "x" },
        ],
      }),
      createTestProvider({
        instanceKeys: [{ className: "2", id: "2" }],
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

  it("disposes all disposable providers", async () => {
    const providers = [createTestProvider({ disposable: true }), createTestProvider()];
    const mergedProvider = mergeProviders({ providers });
    mergedProvider.dispose();
    providers.forEach((provider) => provider.dispose && expect(provider.dispose).to.be.calledOnce);
  });
});

function createTestProvider(props?: { nodes?: Partial<NonGroupingHierarchyNode>[]; instanceKeys?: InstanceKey[]; disposable?: boolean }) {
  const nodes = props?.nodes ?? [];
  const instanceKeys = props?.instanceKeys ?? [];
  return {
    getNodes: sinon
      .stub<Parameters<HierarchyProvider["getNodes"]>>()
      .callsFake(() => createAsyncIterator(nodes.map((partial) => createTestGenericNode(partial)))),
    getNodeInstanceKeys: sinon.stub<Parameters<HierarchyProvider["getNodeInstanceKeys"]>>().callsFake(() => createAsyncIterator(instanceKeys)),
    setFormatter: sinon.stub(),
    setHierarchyFilter: sinon.stub(),
    ...(props?.disposable ? { dispose: sinon.stub() } : {}),
  };
}
