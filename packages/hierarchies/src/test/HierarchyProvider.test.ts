/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { collect, createAsyncIterator } from "presentation-test-utilities";
import { describe, expect, it, vi } from "vitest";
import { BeEvent } from "@itwin/core-bentley";
import { InstanceKey, Props } from "@itwin/presentation-shared";
import { HierarchyNode, NonGroupingHierarchyNode } from "../hierarchies/HierarchyNode.js";
import { HierarchyProvider, mergeProviders } from "../hierarchies/HierarchyProvider.js";
import { createTestGenericNode, createTestGenericNodeKey } from "./Utils.js";

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
    expect(await collect(mergedProvider.getNodes({ parentNode: undefined }))).toEqual([
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
    expect(nodes1).toEqual([createTestGenericNode({ key: createTestGenericNodeKey({ id: "1", source: "s1" }), label: "1", children: true })]);

    const nodes2 = await collect(mergedProvider.getNodes({ parentNode: nodes1[0] }));
    expect(nodes2).toEqual([createTestGenericNode({ key: createTestGenericNodeKey({ id: "2", source: "s1" }), label: "2", children: true })]);

    const nodes3 = await collect(mergedProvider.getNodes({ parentNode: nodes2[0] }));
    expect(nodes3).toEqual([createTestGenericNode({ key: createTestGenericNodeKey({ id: "3", source: "s2" }), label: "3", children: false })]);
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
    const instanceKeys = await collect(mergedProvider.getNodeInstanceKeys({ parentNode: undefined }));
    expect(instanceKeys).toHaveLength(3);
    expect(instanceKeys).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ className: "1", id: "1" }),
        expect.objectContaining({ className: "x", id: "x" }),
        expect.objectContaining({ className: "2", id: "2" }),
      ]),
    );
    providers.forEach((provider) => expect(provider.getNodeInstanceKeys.mock.calls).toHaveLength(1));
  });

  it("sets formatter on all providers", async () => {
    const providers = [createTestProvider(), createTestProvider()];
    const mergedProvider = mergeProviders({ providers });
    const formatter = {} as any;
    mergedProvider.setFormatter(formatter);
    providers.forEach((provider) => expect(provider.setFormatter).toHaveBeenCalledExactlyOnceWith(formatter));
  });

  it("sets hierarchy filter on all providers", async () => {
    const providers = [createTestProvider(), createTestProvider()];
    const mergedProvider = mergeProviders({ providers });
    const filter = {} as any;
    mergedProvider.setHierarchyFilter(filter);
    providers.forEach((provider) => expect(provider.setHierarchyFilter).toHaveBeenCalledExactlyOnceWith(filter));
  });

  it("raises `hierarchyChanged` event when one of the merged providers raises it", async () => {
    const providers = [createTestProvider(), createTestProvider()];
    const mergedProvider = mergeProviders({ providers });
    const spy = vi.fn();
    mergedProvider.hierarchyChanged.addListener(spy);

    providers[0].hierarchyChanged.raiseEvent();
    expect(spy).toHaveBeenCalledOnce();

    providers[1].hierarchyChanged.raiseEvent();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("disposes all disposable providers", async () => {
    const providers = [createTestProvider({ disposable: "yes" }), createTestProvider({ disposable: "deprecated" }), createTestProvider()];
    const mergedProvider = mergeProviders({ providers });
    mergedProvider[Symbol.dispose]();
    providers.forEach((provider) => {
      provider.dispose && expect(provider.dispose).toHaveBeenCalledOnce();
      provider[Symbol.dispose] && expect(provider[Symbol.dispose]).toHaveBeenCalledOnce();
    });
  });
});

function createTestProvider(props?: {
  nodes?: (props: Props<HierarchyProvider["getNodes"]>) => Partial<NonGroupingHierarchyNode>[];
  instanceKeys?: (props: Props<HierarchyProvider["getNodeInstanceKeys"]>) => InstanceKey[];
  disposable?: "yes" | "deprecated" | "no";
}) {
  return {
    hierarchyChanged: new BeEvent(),
    getNodes: vi
      .fn()
      .mockImplementation((getNodesProps) =>
        createAsyncIterator(props?.nodes ? props.nodes(getNodesProps).map((partial) => createTestGenericNode(partial)) : []),
      ),
    getNodeInstanceKeys: vi
      .fn()
      .mockImplementation((getNodeInstanceKeysProps) => createAsyncIterator(props?.instanceKeys ? props.instanceKeys(getNodeInstanceKeysProps) : [])),
    setFormatter: vi.fn(),
    setHierarchyFilter: vi.fn(),
    ...(props?.disposable === "yes" ? { [Symbol.dispose]: vi.fn() } : {}),
    ...(props?.disposable === "deprecated" ? { dispose: vi.fn() } : {}),
  };
}
