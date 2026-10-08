---
"@itwin/presentation-hierarchies": major
---

Adjust `HierarchyDefinition` and `createMergedIModelHierarchyProvider` APIs for better usability with hierarchy definitions that require iModel access outside of their `defineHierarchyLevel` method.

- `createMergedIModelHierarchyProvider`: Replaced `hierarchyDefinition` with `getHierarchyDefinition(imodelAccess)`, which creates a hierarchy definition for each iModel version. The latest version's definition handles pre-processing and post-processing of merged nodes.
- Removed `imodelAccess` from `DefineHierarchyLevelProps`. Definitions that need iModel access must capture it when they are created instead of reading it from `defineHierarchyLevel` props.

Before:

```ts
createMergedIModelHierarchyProvider({
	imodels,
	hierarchyDefinition: {
		async defineHierarchyLevel({ imodelAccess, parentNode }) {
			return parentNode ? [] : [{ node: { key: "imodel", label: imodelAccess.imodelKey } }];
		},
	},
});
```

After:

```ts
createMergedIModelHierarchyProvider({
	imodels,
	getHierarchyDefinition: (imodelAccess) => ({
		async defineHierarchyLevel({ parentNode }) {
			return parentNode ? [] : [{ node: { key: "imodel", label: imodelAccess.imodelKey } }];
		},
	}),
});
```
