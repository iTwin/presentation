# Merged iModel hierarchies

The library provides the `mergeProviders` function to create a merged hierarchy from arbitrary hierarchy providers (see [Merged hierarchies](../MergedHierarchies.md) learning page), however it doesn't account for iModel-specific aspects such as grouping.

To support merging iModel hierarchies, the library provides `createMergedIModelHierarchyProvider` function (as opposed to `createIModelHierarchyProvider` for creating a hierarchy from a single iModel). It accepts an array of `IModelAccess` objects pointing to **different versions of the same iModel**, ordered from oldest to newest, and creates a hierarchy provider that combines the hierarchies from all specified iModel versions. It's important to note that provided iModels can't be completely independent - for the full merge to work, the library relies on several assumptions, that only apply to versions of the same iModel:

- Elements with the same `ECInstanceId` across different iModel versions represent the same logical entity, even if their properties differ.
- Non-breaking metadata (schema) changes may happen in a newer version, but never an older one. E.g. a new schema may be introduced in a newer version, but an existing schema won't be removed.

## Example

The below example demonstrates how to create a merged iModel hierarchy provider that merges two iModel versions. The hierarchy that's being merged is a simple model-element hierarchy.

First, we define the hierarchy definition:

<!-- [[include: [Presentation.Hierarchies.MergedIModelHierarchies.Imports, Presentation.Hierarchies.MergedIModelHierarchies.Example], ts]] -->
<!-- BEGIN EXTRACTION -->

```ts
import {
  createIModelHierarchyProvider,
  createMergedIModelHierarchyProvider,
  createNodesQueryClauseFactory,
  createPredicateBasedHierarchyDefinition,
  DefineInstanceNodeChildHierarchyLevelProps,
} from "@itwin/presentation-hierarchies";
import { createBisInstanceLabelSelectClauseFactory } from "@itwin/presentation-shared";

// Each version of the iModel already has an open `IModelConnection`. Create iModel access objects for
// both versions - `base` and `changeset1`. The order is important - we want the changesets to be from oldest to
// newest.
const imodels = [{ imodelAccess: createIModelAccess(changesets.base.imodel) }, { imodelAccess: createIModelAccess(changesets.changeset1.imodel) }];

// Define an utility for creating instance nodes query definitions, that we'll use in our hierarchy definition.
async function createInstanceNodesQueryDefinition({
  imodelAccess,
  fullClassName,
  whereClauseFactory,
}: {
  imodelAccess: DefineInstanceNodeChildHierarchyLevelProps["imodelAccess"];
  fullClassName: string;
  whereClauseFactory?: (props: { alias: string }) => Promise<string>;
}) {
  const labelsFactory = createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess });
  const queryClauseFactory = createNodesQueryClauseFactory({
    imodelAccess,
    instanceLabelSelectClauseFactory: labelsFactory,
  });
  const whereClause = whereClauseFactory ? await whereClauseFactory({ alias: "this" }) : undefined;
  return {
    fullClassName,
    query: {
      ecsql: `
        SELECT ${await queryClauseFactory.createSelectClause({
          ecClassId: { selector: "this.ECClassId" },
          ecInstanceId: { selector: "this.ECInstanceId" },
          nodeLabel: { selector: await labelsFactory.createSelectClause({ classAlias: "this", className: fullClassName }) },
        })}
        FROM ${fullClassName} AS this
        ${whereClause ? `WHERE ${whereClause}` : ""}
      `,
    },
  };
}

// Create a simple hierarchy definition that uses `BisCore.PhysicalModel` for root nodes and
// `BisCore.PhysicalElement` for each model's child nodes.
const hierarchyDefinition = createPredicateBasedHierarchyDefinition({
  // Note: we use the latest version of the iModel as our class hierarchy inspector - that
  // ensures we can find all classes even if they were not present in the base iModel
  classHierarchyInspector: imodels[imodels.length - 1].imodelAccess,
  hierarchy: {
    rootNodes: async ({ imodelAccess }) => [await createInstanceNodesQueryDefinition({ imodelAccess, fullClassName: "BisCore.PhysicalModel" })],
    childNodes: [
      {
        parentInstancesNodePredicate: "BisCore.PhysicalModel",
        definitions: async ({ imodelAccess, parentNodeInstanceIds }: DefineInstanceNodeChildHierarchyLevelProps) => [
          await createInstanceNodesQueryDefinition({
            imodelAccess,
            fullClassName: "BisCore.PhysicalElement",
            whereClauseFactory: async ({ alias }) => `${alias}.Model.Id IN (${parentNodeInstanceIds.join(", ")})`,
          }),
        ],
      },
    ],
  },
});
```

<!-- END EXTRACTION -->

The above hierarchy definition creates the following hierarchy for each of the iModel versions individually:

<!-- [[include: [Presentation.Hierarchies.MergedIModelHierarchies.Example.Version1Hierarchy, Presentation.Hierarchies.MergedIModelHierarchies.Example.Version2Hierarchy], ts]] -->
<!-- BEGIN EXTRACTION -->

```ts
// The first iModel version has 3 elements in "Model 1". The resulting hierarchy:
[
  {
    label: "Model 1",
    children: [{ label: "Element 1" }, { label: "Element 2" }, { label: "Element 3" }],
  },
],

// The second iModel version has the following changes:
// - "Element 2" was deleted
// - "Element 3" was updated to "Updated element 3"
// - "Element 4" was added under "Model 1"
// - "Model 2" with "Element 5" was added
//
// The resulting hierarchy:
[
  {
    label: "Model 1",
    children: [{ label: "Element 1" }, { label: "Element 4" }, { label: "Updated element 3" }],
  },
  {
    label: "Model 2",
    children: [{ label: "Element 5" }],
  },
],
```

<!-- END EXTRACTION -->

To merge the hierarchies, we create a hierarchy provider using `createMergedIModelHierarchyProvider`:

<!-- [[include: [Presentation.Hierarchies.MergedIModelHierarchies.Example.MergedHierarchyProvider], ts]] -->
<!-- BEGIN EXTRACTION -->

```ts
const mergedHierarchyProvider = createMergedIModelHierarchyProvider({
  imodels,
  hierarchyDefinition,
});
```

<!-- END EXTRACTION -->

The resulting merged hierarchy looks like this:

<!-- [[include: [Presentation.Hierarchies.MergedIModelHierarchies.Example.MergedHierarchy], ts]] -->
<!-- BEGIN EXTRACTION -->

```ts
[
  // "Model 1" exists in both iModel versions - its elements are merged
  {
    label: "Model 1",
    children: [
      // "Element 1" exists in both iModel versions
      { label: "Element 1" },
      // "Element 2" exists only in the 1st iModel version (deleted in the 2nd)
      { label: "Element 2" },
      // "Element 4" exists only in the 2nd iModel version (added in the 2nd)
      { label: "Element 4" },
      // "Element 3" exists in both iModel versions, but was updated in the 2nd version
      // to have a different label ("Element 3" -> "Updated element 3")
      { label: "Updated element 3" },
    ],
  },
  // "Model 2" and its "Element 5" come from the 2nd iModel version
  {
    label: "Model 2",
    children: [{ label: "Element 5" }],
  },
],
```

<!-- END EXTRACTION -->
