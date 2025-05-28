---
"@itwin/presentation-hierarchies": minor
---

`createChildNodePropsAsync` function, returned by `createHierarchyFilteringHelper`, may now return either a Promise, or the value synchronously. Either way, the result may be awaited, but for cases when the `createChildNodePropsAsync` function is called many times, not having to await on it provides performance improvement.

**Before:**

```ts
const childNodeProps = await createHierarchyFilteringHelper(undefined, undefined).createChildNodePropsAsync({
  pathMatcher: (identifier): boolean | Promise<boolean> => {
    return false;
  },
});
```

**After:**

- **Option A:** check if it's a Promise before awaiting:

  Use this when you want to get slightly better performance by avoiding unnecessary `await`.

  ```ts
  const childNodePropsPossiblyPromise = createHierarchyFilteringHelper(undefined, undefined).createChildNodePropsAsync({
    pathMatcher: (identifier): boolean | Promise<boolean> => {
      return false;
    },
  });
  const childNodeProps = childNodePropsPossiblyPromise instanceOf Promise ? await childNodePropsPossiblyPromise : childNodePropsPossiblyPromise;
  ```

- **Option B:** always await

  Use this if pathMatcher always returns a Promise or you prefer a simpler pattern.

  ```ts
  const childNodeProps = await createHierarchyFilteringHelper(undefined, undefined).createChildNodePropsAsync({
    pathMatcher: async (identifier): Promise<boolean> => {
      return false;
    },
  });
  ```
