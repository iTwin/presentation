---
"@itwin/presentation-hierarchies": minor
---

Add `createHierarchyProvider` utility function.

This function simplifies the creation of custom hierarchy providers by allowing developers to define only the necessary methods, while providing default implementations for the rest. This enhancement improves developer experience and reduces boilerplate code when working with custom hierarchy providers in the `@itwin/presentation-hierarchies` package.

**Before:**

```ts
const beforeAsPlainObject: HierarchyProvider = {
  hierarchyChanged: new BeEvent(),
  async *getNodes({ parentNode }) {
    // yield nodes...
  },
  async *getNodeInstanceKeys() {},
  setFormatter() {},
  setHierarchySearch() {},
};

const beforeAsClassObject = new (class implements HierarchyProvider {
  public hierarchyChanged: new BeEvent(),
  public async *getNodes({ parentNode }) {
    // yield nodes...
  },
  public async *getNodeInstanceKeys() {},
  public setFormatter(formatter: IPrimitiveValueFormatter | undefined) {
    // set formatter...
    hierarchyChanged.raiseEvent({ formatterChange: { newFormatter: formatter } });
  },
  public setHierarchySearch() {},
})();
```

**After:**

```ts
const afterAsPlainObject = createHierarchyProvider(() => ({
  async *getNodes({ parentNode }) {
    // yield nodes...
  },
}));

// or, provide implementation as a class instance:
const afterAsClassObject = createHierarchyProvider(
  ({ hierarchyChanged }) =>
    new (class implements Pick<HierarchyProvider, "getNodes" | "setFormatter"> {
      public async *getNodes({ parentNode }): ReturnType<HierarchyProvider["getNodes"]> {
        // yield nodes...
      }
      public setFormatter(formatter: IPrimitiveValueFormatter | undefined) {
        // set formatter...
        hierarchyChanged.raiseEvent({ formatterChange: { newFormatter: formatter } });
      }
    })(),
);
```
