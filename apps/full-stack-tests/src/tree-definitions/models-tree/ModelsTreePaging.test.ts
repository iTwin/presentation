/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import {
  insertPhysicalElement,
  insertPhysicalModelWithPartition,
  insertPhysicalSubModel,
  insertSpatialCategory,
  insertSubject,
} from "presentation-test-utilities";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { withEditTxn } from "@itwin/core-backend";
import { IModel } from "@itwin/core-common";
import { createPagingHierarchyProvider } from "@itwin/presentation-hierarchies";
import { createModelsTree } from "@itwin/presentation-tree-definitions";
import { initialize, terminate } from "../../IntegrationTests.js";
import { collect, createIModelAccess } from "../Common.js";
import { buildIModel } from "../IModelUtils.js";

import type { PagedHierarchyNode, PagingHierarchyProvider } from "@itwin/presentation-hierarchies";

describe("Models tree with paging hierarchy provider", () => {
  beforeAll(async () => {
    await initialize();
  });

  afterAll(async () => {
    await terminate();
  });

  it("loads the same hierarchy in pages of 2 as without paging and continues from any node", async () => {
    await using buildIModelResult = await buildIModel(async (imodel, testSchema) =>
      withEditTxn(imodel, (txn) => {
        const childSubject = insertSubject({ txn, codeValue: "child subject", parentId: IModel.rootSubjectId });
        insertSubject({ txn, codeValue: "empty subject", parentId: IModel.rootSubjectId });
        const models = ["model 1", "model 2", "model 3"].map((codeValue) =>
          insertPhysicalModelWithPartition({ txn, codeValue, partitionParentId: IModel.rootSubjectId }),
        );
        const childSubjectModels = ["model 4", "model 5"].map((codeValue) =>
          insertPhysicalModelWithPartition({ txn, codeValue, partitionParentId: childSubject.id }),
        );
        const categories = ["category 1", "category 2", "category 3"].map((codeValue) =>
          insertSpatialCategory({ txn, codeValue }),
        );
        // model 1 has 3 elements in each category; element 1.1 has 3 child elements and element 2.1 is sub-modeled
        // by a model with 3 elements - the sub-model is hidden in the hierarchy, so its categories are shown directly
        // under the element
        categories.forEach((category, categoryIndex) => {
          for (let i = 1; i <= 3; ++i) {
            const isSubModeled = categoryIndex === 1 && i === 1;
            const element = insertPhysicalElement({
              txn,
              userLabel: `element ${categoryIndex + 1}.${i}`,
              modelId: models[0].id,
              categoryId: category.id,
              ...(isSubModeled ? { classFullName: testSchema.items.SubModelablePhysicalObject.fullName } : undefined),
            });
            if (categoryIndex === 0 && i === 1) {
              for (let j = 1; j <= 3; ++j) {
                insertPhysicalElement({
                  txn,
                  userLabel: `child element ${j}`,
                  modelId: models[0].id,
                  categoryId: category.id,
                  parentId: element.id,
                });
              }
            }
            if (isSubModeled) {
              const subModel = insertPhysicalSubModel({ txn, modeledElementId: element.id });
              for (let j = 1; j <= 3; ++j) {
                insertPhysicalElement({
                  txn,
                  userLabel: `sub-model element ${j}`,
                  modelId: subModel.id,
                  categoryId: categories[2].id,
                });
              }
            }
          }
        });
        // other models have a single element
        [...models.slice(1), ...childSubjectModels].forEach((model, i) =>
          insertPhysicalElement({
            txn,
            userLabel: `element of model ${i + 2}`,
            modelId: model.id,
            categoryId: categories[0].id,
          }),
        );
      }),
    );
    const { imodelConnection } = buildIModelResult;
    const imodelAccess = createIModelAccess(imodelConnection);
    const { hierarchyDefinition } = createModelsTree({
      imodelAccess,
      hierarchyConfig: { subjects: { root: "exclude" } },
    });
    const createQueryReaderSpy = vi.spyOn(imodelAccess, "createQueryReader");

    using pagingProvider = createPagingHierarchyProvider({ imodelAccess, hierarchyDefinition, pageSize: 2 });
    const pagedHierarchy = await loadHierarchy(pagingProvider);
    // the provider doesn't sort nodes, so compare labels in sorted order
    expect(toSortedLabels(pagedHierarchy)).toEqual([
      {
        label: "child subject",
        children: [
          { label: "model 4", children: [{ label: "category 1", children: ["element of model 4"] }] },
          { label: "model 5", children: [{ label: "category 1", children: ["element of model 5"] }] },
        ],
      },
      {
        label: "model 1",
        children: [
          {
            label: "category 1",
            children: [
              { label: "element 1.1", children: ["child element 1", "child element 2", "child element 3"] },
              "element 1.2",
              "element 1.3",
            ],
          },
          {
            label: "category 2",
            children: [
              {
                label: "element 2.1",
                children: [
                  {
                    label: "category 3",
                    children: ["sub-model element 1", "sub-model element 2", "sub-model element 3"],
                  },
                ],
              },
              "element 2.2",
              "element 2.3",
            ],
          },
          { label: "category 3", children: ["element 3.1", "element 3.2", "element 3.3"] },
        ],
      },
      { label: "model 2", children: [{ label: "category 1", children: ["element of model 2"] }] },
      { label: "model 3", children: [{ label: "category 1", children: ["element of model 3"] }] },
    ]);
    // levels of 3 or more nodes need more than one page
    expect(createQueryReaderSpy.mock.calls.some(([query]) => query.ecsql.includes("LIMIT 2 OFFSET 2"))).toBe(true);

    // paging doesn't affect the result - neither the nodes, nor their order or continuation tokens
    using nonPagingProvider = createPagingHierarchyProvider({ imodelAccess, hierarchyDefinition });
    expect(await loadHierarchy(nonPagingProvider)).toEqual(pagedHierarchy);

    for (const { parentNode, nodes } of getLevels(pagedHierarchy)) {
      for (let i = 0; i < nodes.length; ++i) {
        const continuedNodes = await collect(
          pagingProvider.getNodes({ parentNode, continuationToken: nodes[i].continuationToken }),
        );
        expect(continuedNodes).toEqual(nodes.slice(i + 1));
      }
    }
  });
});

interface LoadedNode {
  node: PagedHierarchyNode;
  children: LoadedNode[];
}

async function loadHierarchy(
  provider: PagingHierarchyProvider,
  parentNode?: PagedHierarchyNode,
): Promise<LoadedNode[]> {
  const nodes = await collect(provider.getNodes({ parentNode }));
  return Promise.all(
    nodes.map(async (node) => ({ node, children: node.children ? await loadHierarchy(provider, node) : [] })),
  );
}

type SortedLabels = Array<string | { label: string; children: SortedLabels }>;
function toSortedLabels(hierarchy: LoadedNode[]): SortedLabels {
  // element labels are suffixed with element's id, e.g. `element 1.1 [0-5]` - drop the suffix to keep expectations stable
  const getLabel = (node: PagedHierarchyNode) => node.label.replace(/ \[[^\]]+\]$/, "");
  return [...hierarchy]
    .sort((lhs, rhs) => getLabel(lhs.node).localeCompare(getLabel(rhs.node)))
    .map(({ node, children }) =>
      children.length ? { label: getLabel(node), children: toSortedLabels(children) } : getLabel(node),
    );
}

function* getLevels(
  hierarchy: LoadedNode[],
  parentNode?: PagedHierarchyNode,
): Generator<{ parentNode: PagedHierarchyNode | undefined; nodes: PagedHierarchyNode[] }> {
  yield { parentNode, nodes: hierarchy.map(({ node }) => node) };
  for (const { node, children } of hierarchy) {
    if (children.length) {
      yield* getLevels(children, node);
    }
  }
}
