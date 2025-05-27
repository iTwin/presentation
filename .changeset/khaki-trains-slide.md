---
"@itwin/presentation-hierarchies": minor
---

`createHierarchyFilteringHelper.createChildNodePropsAsync` now also might return a synchronous value (not just a Promise). This was added as a small performance improvement.


Before:

```ts
const childNodeProps = await createHierarchyFilteringHelper(undefined, undefined).createChildNodePropsAsync({
    pathMatcher: (identifier): boolean | Promise<boolean> => {
        return false;
    },
});
```

After:

**Option A` - check if it's a Promise before awaiting:**

Use this when you want to get slightly better performance by avoiding unnecessary `await`.

```ts
const childNodePropsPossiblyPromise = createHierarchyFilteringHelper(undefined, undefined).createChildNodePropsAsync({
    pathMatcher: (identifier): boolean | Promise<boolean> => {
        return false;
    },
});
const childNodeProps = childNodePropsPossiblyPromise instanceOf Promise ? await childNodePropsPossiblyPromise : childNodePropsPossiblyPromise;
```

**`Option B` - always await:**

Use this if pathMatcher always returns a Promise or you prefer a simpler pattern.

```ts
const childNodeProps = await createHierarchyFilteringHelper(undefined, undefined).createChildNodePropsAsync({
    pathMatcher: async (identifier): Promise<boolean> => {
        return false;
    },
});
```
