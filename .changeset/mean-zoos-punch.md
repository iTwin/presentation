---
"@itwin/presentation-hierarchies": minor
---

Added `onlyIfNotHandled` flag to hierarchy level definitions that are passed to `createClassBasedHierarchyDefinition`.
This flag allows to skip instance node hierarchy level definitions if previous ones have defined hierarchy levels for a more specific class.
This can help to reduce repetition having to check if class doesn't match those of the more specific definitions.

Before:

```ts
createClassBasedHierarchyDefinition({
  classHierarchyInspector: inspector,
  hierarchy: {
    childNodes: [
      {
        parentNodeClassName: "BisCore.PhysicalElement",
        definitions: async ({ parentNode }) => getPhysicalElementChildren(parentNode),
      },
      {
        parentNodeClassName: "BisCore.SpatialElement",
        definitions: async ({ parentNode, parentNodeClassName }) => {
          if (await inspector.classDerivesFrom(parentNodeClassName, "BisCore.PhysicalElement")) {
            return [];
          }

          return getSpatialElementChildren(parentNode);
        },
      },
      {
        parentNodeClassName: "BisCore.GeometricElement3d",
        definitions: async ({ parentNode, parentNodeClassName }) => {
          if (await inspector.classDerivesFrom(parentNodeClassName, "BisCore.PhysicalElement")) {
            return [];
          }

          if (await inspector.classDerivesFrom(parentNodeClassName, "BisCore.SpatialElement")) {
            return [];
          }

          return getGeometricElement3dChildren(parentNode);
        },
      },
    ]
  }
});
```

After:

```ts
createClassBasedHierarchyDefinition({
  classHierarchyInspector,
  hierarchy: {
    childNodes: [
      {
        parentNodeClassName: "BisCore.PhysicalElement",
        definitions: async ({ parentNode }) => getPhysicalElementChildren(parentNode),
      },
      {
        parentNodeClassName: "BisCore.SpatialElement",
        onlyIfNotHandled: true,
        definitions: async ({ parentNode }) => getSpatialElementChildren(parentNode),
      },
      {
        parentNodeClassName: "BisCore.GeometricElement3d",
        onlyIfNotHandled: true,
        definitions: async ({ parentNode }) => getGeometricElement3dChildren(parentNode),
      },
    ]
  }
});
```
