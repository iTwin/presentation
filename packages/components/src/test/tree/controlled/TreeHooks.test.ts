/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it, vi } from "vitest";
import { AbstractTreeNodeLoaderWithProvider } from "@itwin/components-react";
import { LabelDefinition, Node, StandardNodeTypes } from "@itwin/presentation-common";
import { useControlledPresentationTreeFiltering } from "../../../presentation-components/tree/controlled/TreeHooks.js";
import { IPresentationTreeDataProvider } from "../../../presentation-components/tree/IPresentationTreeDataProvider.js";
import { renderHook, waitFor } from "../../TestUtils.js";

/* eslint-disable @typescript-eslint/no-deprecated */

describe("useControlledPresentationTreeFiltering", () => {
  const getFilteredNodePathsStub = vi.fn<IPresentationTreeDataProvider["getFilteredNodePaths"]>();
  const dataProvider = { getFilteredNodePaths: getFilteredNodePathsStub } as unknown as IPresentationTreeDataProvider;
  const nodeLoader = { dataProvider } as AbstractTreeNodeLoaderWithProvider<IPresentationTreeDataProvider>;

  beforeEach(() => {
    getFilteredNodePathsStub.mockReset();
  });

  it("returns original node loader if filter is not provided", () => {
    const { result } = renderHook(useControlledPresentationTreeFiltering, { initialProps: { nodeLoader } });
    expect(result.current.filteredNodeLoader).toBe(nodeLoader);
  });

  it("returns filtered node loader when tree is filtered", async () => {
    const node = createNode("root");
    getFilteredNodePathsStub.mockResolvedValue([
      { children: [], index: 0, node, filteringData: { matchesCount: 1, childMatchesCount: 0 }, isMarked: true },
    ]);

    const { result } = renderHook(useControlledPresentationTreeFiltering, {
      initialProps: { nodeLoader, filter: "test" },
    });

    await waitFor(() => {
      expect(result.current.isFiltering).toBe(false);
      expect(result.current.filteredNodeLoader).not.toBe(nodeLoader);
      expect(result.current.matchesCount).toBe(1);
    });
  });
});

function createNode(label: string): Node {
  return {
    key: { version: 2, type: StandardNodeTypes.ECInstancesNode, instanceKeys: [], pathFromRoot: [label] },
    label: LabelDefinition.fromLabelString(label),
  };
}
