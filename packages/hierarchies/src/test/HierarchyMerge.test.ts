/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { collect, createAsyncIterator } from "presentation-test-utilities";
import { describe, expect, it, vi } from "vitest";
import { BeEvent } from "@itwin/core-bentley";
import { mergeProviders } from "../hierarchies/HierarchyMerge.js";
import { HierarchyNode } from "../hierarchies/HierarchyNode.js";
import { createTestGenericNode, createTestGenericNodeKey } from "./Utils.js";

import type { EventListener, InstanceKey, Props } from "@itwin/presentation-shared";
import type { NonGroupingHierarchyNode } from "../hierarchies/HierarchyNode.js";
import type { HierarchyProvider } from "../hierarchies/HierarchyProvider.js";

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
            return [
              createTestGenericNode({
                key: createTestGenericNodeKey({ id: "1", source: "s1" }),
                label: "1",
                children: true,
              }),
            ];
          }
          if (HierarchyNode.isGeneric(parentNode) && parentNode.key.id === "1") {
            return [
              createTestGenericNode({
                key: createTestGenericNodeKey({ id: "2", source: "s1" }),
                label: "2",
                children: false,
              }),
            ];
          }
          return [];
        },
      }),
      createTestProvider({
        nodes: ({ parentNode }) =>
          parentNode && HierarchyNode.isGeneric(parentNode) && parentNode.key.id === "2"
            ? [
                createTestGenericNode({
                  key: createTestGenericNodeKey({ id: "3", source: "s2" }),
                  label: "3",
                  children: false,
                }),
              ]
            : [],
      }),
    ];
    const mergedProvider = mergeProviders({ providers });

    const nodes1 = await collect(mergedProvider.getNodes({ parentNode: undefined }));
    expect(nodes1).toEqual([
      createTestGenericNode({ key: createTestGenericNodeKey({ id: "1", source: "s1" }), label: "1", children: true }),
    ]);

    const nodes2 = await collect(mergedProvider.getNodes({ parentNode: nodes1[0] }));
    expect(nodes2).toEqual([
      createTestGenericNode({ key: createTestGenericNodeKey({ id: "2", source: "s1" }), label: "2", children: true }),
    ]);

    const nodes3 = await collect(mergedProvider.getNodes({ parentNode: nodes2[0] }));
    expect(nodes3).toEqual([
      createTestGenericNode({ key: createTestGenericNodeKey({ id: "3", source: "s2" }), label: "3", children: false }),
    ]);
  });

  it("returns instance keys from all providers", async () => {
    const providers = [
      createTestProvider({
        instanceKeys: () => [
          { className: "s.one", id: "one" },
          { className: "s.two", id: "two" },
        ],
      }),
      createTestProvider({ instanceKeys: () => [{ className: "s.three", id: "three" }] }),
    ];
    const mergedProvider = mergeProviders({ providers });
    const keys = await collect(mergedProvider.getNodeInstanceKeys({ parentNode: undefined }));
    expect(keys).toHaveLength(3);
    expect(keys).toEqual(
      expect.arrayContaining([
        { className: "s.one", id: "one" },
        { className: "s.two", id: "two" },
        { className: "s.three", id: "three" },
      ]),
    );
    providers.forEach((provider) => expect(provider.getNodeInstanceKeys).toHaveBeenCalledOnce());
  });

  it("sets formatter on all providers", async () => {
    const providers = [createTestProvider(), createTestProvider()];
    const mergedProvider = mergeProviders({ providers });
    const formatter = {} as any;
    mergedProvider.setFormatter(formatter);
    providers.forEach((provider) => expect(provider.setFormatter).toHaveBeenCalledExactlyOnceWith(formatter));
  });

  it("sets hierarchy search on all providers", async () => {
    const providers = [createTestProvider(), createTestProvider()];
    const mergedProvider = mergeProviders({ providers });
    const search = {} as any;
    mergedProvider.setHierarchySearch(search);
    providers.forEach((provider) => expect(provider.setHierarchySearch).toHaveBeenCalledExactlyOnceWith(search));
  });

  it("raises `hierarchyChanged` event when one of the merged providers raises it", async () => {
    const providers = [createTestProvider(), createTestProvider()];
    const mergedProvider = mergeProviders({ providers });
    const spy = vi.fn();
    mergedProvider.hierarchyChanged.addListener(spy);

    providers[0].hierarchyChanged.raiseEvent({});
    expect(spy).toHaveBeenCalledOnce();

    providers[1].hierarchyChanged.raiseEvent({});
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("disposes all disposable providers", async () => {
    const providers = [
      createTestProvider({ disposable: "yes" }),
      createTestProvider({ disposable: "deprecated" }),
      createTestProvider(),
    ];
    const mergedProvider = mergeProviders({ providers });
    mergedProvider[Symbol.dispose]();
    providers.forEach((provider) => {
      provider.dispose && expect(provider.dispose).toHaveBeenCalledOnce();
      provider[Symbol.dispose] && expect(provider[Symbol.dispose]).toHaveBeenCalledOnce();
    });
  });
});

function createTestProvider(
  props: (
    | { nodes: (props: Props<HierarchyProvider["getNodes"]>) => Partial<NonGroupingHierarchyNode>[] }
    | {
        rootNodes?: (
          props: Omit<Props<HierarchyProvider["getNodes"]>, "parentNode">,
        ) => Partial<NonGroupingHierarchyNode>[];
      }
  ) & {
    instanceKeys?: (props: Props<HierarchyProvider["getNodeInstanceKeys"]>) => InstanceKey[];
    disposable?: "yes" | "deprecated" | "no";
  } = {},
) {
  return {
    hierarchyChanged: new BeEvent<EventListener<HierarchyProvider["hierarchyChanged"]>>(),
    getNodes: vi
      .fn<HierarchyProvider["getNodes"]>()
      .mockImplementation((getNodesProps) =>
        createAsyncIterator(
          ("nodes" in props
            ? props.nodes(getNodesProps)
            : props.rootNodes && getNodesProps.parentNode
              ? props.rootNodes(getNodesProps)
              : []) as NonGroupingHierarchyNode[],
        ),
      ),
    getNodeInstanceKeys: vi
      .fn<HierarchyProvider["getNodeInstanceKeys"]>()
      .mockImplementation((getNodeInstanceKeysProps) =>
        createAsyncIterator(props.instanceKeys ? props.instanceKeys(getNodeInstanceKeysProps) : []),
      ),
    setFormatter: vi.fn(),
    setHierarchySearch: vi.fn(),
    ...(props.disposable === "yes" ? { [Symbol.dispose]: vi.fn() } : {}),
    ...(props.disposable === "deprecated" ? { dispose: vi.fn() } : {}),
  };
}
