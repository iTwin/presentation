---
"@itwin/presentation-hierarchies": minor
---

Expose rxjs types in FilteringHierarchyDefinition. Return type of `createHierarchyFilteringHelper.createChildNodePropsAsync` has been to `Promise<Pick<HierarchyNode, "filtering" | "autoExpand"> | undefined> | Pick<HierarchyNode, "filtering" | "autoExpand"> | undefined` instead of `Promise<Pick<HierarchyNode, "filtering" | "autoExpand"> | undefined>`. This allows using the API in two different ways:

Before:

```ts
const childNodeProps = await createHierarchyFilteringHelper(undefined, undefined).createChildNodePropsAsync({
    pathMatcher: (identifier): boolean | Promise<boolean> => {
        return false;
    },
});
```

After:

`Option A` - await only when Promise is returned:
```ts
const childNodePropsPossiblyPromise = createHierarchyFilteringHelper(undefined, undefined).createChildNodePropsAsync({
    pathMatcher: (identifier): boolean | Promise<boolean> => {
        return false;
    },
});
const childNodeProps = childNodePropsPossiblyPromise instanceOf Promise ? await childNodePropsPossiblyPromise : childNodePropsPossiblyPromise;
```

`Option B` - always await:
```ts
const childNodeProps = await createHierarchyFilteringHelper(undefined, undefined).createChildNodePropsAsync({
    pathMatcher: (identifier): boolean | Promise<boolean> => {
        return false;
    },
});
```
