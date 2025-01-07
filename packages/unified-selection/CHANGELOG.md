# @itwin/unified-selection

## 1.2.1

### Patch Changes

- [#828](https://github.com/iTwin/presentation/pull/828): Polyfill `Symbol.dispose` and `Symbol.asyncDispose` to make sure that code using the upcoming JS recource management API works in all environments.

## 1.2.0

### Minor Changes

- [#800](https://github.com/iTwin/presentation/pull/800): Add support for Models and SubCategories selection that's going to be available in `@itwin/core-frontend` version `5`.

  The changes in `@itwin/core-frontend` allow us to stop manually syncing `HiliteSet` with `SelectionSet` and rely on automatic syncing instead.

- [#800](https://github.com/iTwin/presentation/pull/800): `computeSelection`: Broadened the type of `elementIds` prop from `Id64String[]` to `Id64Arg`.
- [#802](https://github.com/iTwin/presentation/pull/802): Prefer `Symbol.dispose` over `dispose` for disposable objects.

  The package contained a number of types for disposable objects, that had a requirement of `dispose` method being called on them after they are no longer needed. In conjunction with the `using` utility from `@itwin/core-bentley`, usage of such objects looked like this:

  ```ts
  class MyDisposable() {
    dispose() {
      // do some cleanup
    }
  }
  using(new MyDisposable(), (obj) => {
    // do something with obj, it'll get disposed when the callback returns
  });
  ```

  In version `5.2`, TypeScript [introduced](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-2.html#using-declarations-and-explicit-resource-management) `Disposable` type and `using` declarations (from the upcoming [Explicit Resource Management](https://github.com/tc39/proposal-explicit-resource-management) feature in ECMAScript). Now we're making use of those new utilities in this package (while still supporting the old `dispose` method), which allows using `MyDisposable` from the above snippet like this:

  ```ts
  using obj = new MyDisposable();
  // do something with obj, it'll get disposed when it goes out of scope
  ```

## 1.1.2

### Patch Changes

- Updated dependencies:
  - @itwin/presentation-shared@1.2.0

## 1.1.1

### Patch Changes

- [#765](https://github.com/iTwin/presentation/pull/765): Fixed transient element keys handling in unified selection storage.

## 1.1.0

### Minor Changes

- [#740](https://github.com/iTwin/presentation/pull/740): Define `type` and `exports` attributes in `package.json`.

  The change moves this package a step closer towards dropping CommonJS support - it's now transpiled from ESM to CommonJS instead of the opposite.

  In addition, the `exports` attribute has been added to `package.json` to prohibit access to APIs that are not intended to be used by external consumers.

### Patch Changes

- [#758](https://github.com/iTwin/presentation/pull/758): Promote `@beta` APIs to `@public`.
- Updated dependencies:
  - @itwin/presentation-shared@1.1.0

## 1.0.1

### Patch Changes

- [#730](https://github.com/iTwin/presentation/pull/730): Fix provider returned by `createHiliteSetProvider` in some cases not caching class hierarchy check results, resulting in duplicate checks for the same classes.

## 1.0.0

### Major Changes

- [#727](https://github.com/iTwin/presentation/pull/727): 1.0 release.

  The APIs are now considered stable and ready for production use.

### Patch Changes

- Updated dependencies:
  - @itwin/presentation-shared@1.0.0

## 0.5.1

### Patch Changes

- Updated dependencies:
  - @itwin/presentation-shared@0.5.0

## 0.5.0

### Minor Changes

- [#693](https://github.com/iTwin/presentation/pull/693): Selection events API cleanup:

  - Remove the second `StorageSelectionChangesListener` argument, which represented the `SelectionStorage` where the selection change happened. As a replacement, added it as a property to `StorageSelectionChangeEventArgs`, which is the first and now the only argument of the listener.
  - Remove `SelectionChangeEvent` interface in favor of `Event<StorageSelectionChangesListener>`.

### Patch Changes

- [#693](https://github.com/iTwin/presentation/pull/693): API documentation improvements:

  - Add warnings to interfaces which are not supposed to be extended or implemented by consumers. Objects of such interfaces are only supposed to be created by functions in this package. As such, adding required members to these interfaces is not considered a breaking change.
  - Changed `string` to `Id64String` where appropriate, to make it clear that the string is expected to be a valid Id64 string. Note that this is not a breaking change, as `Id64String` is just a type alias for `string`.

- [#695](https://github.com/iTwin/presentation/pull/695): Bump `iTwin.js` core package dependency versions to `4.8.0`
- Updated dependencies:
  - @itwin/presentation-shared@0.4.1

## 0.4.6

### Patch Changes

- Updated dependencies:
  - @itwin/presentation-shared@0.4.0

## 0.4.5

### Patch Changes

- [#657](https://github.com/iTwin/presentation/pull/657): Updated `enableUnifiedSelectionSyncWithIModel` to batch iModel selection changes before synchronizing with `SelectionStorage`.
- [#655](https://github.com/iTwin/presentation/pull/655): Remove exposed internal APIs.
- Updated dependencies:
  - @itwin/presentation-shared@0.3.2

## 0.4.4

### Patch Changes

- Updated dependencies:
  - @itwin/presentation-shared@0.3.1

## 0.4.3

### Patch Changes

- Updated dependencies:
  - @itwin/presentation-shared@0.3.0

## 0.4.2

### Patch Changes

- [#581](https://github.com/iTwin/presentation/pull/581): Bump `itwinjs-core` dependencies to `^4.6.0`
- [#570](https://github.com/iTwin/presentation/pull/570): Reduced main thread blocking when computing hilite sets and selection based on selection scope.
- Updated dependencies:
  - @itwin/presentation-shared@0.2.0

## 0.4.1

### Patch Changes

- Updated dependencies:
  - @itwin/presentation-shared@0.1.1

## 0.4.0

### Minor Changes

- [#558](https://github.com/iTwin/presentation/pull/558): Switched from `ECSchemaProvider` to `ECClassHierarchyInspector`, where appropriate.

  Some of the APIs were accepting `ECSchemaProvider` as a parameter and used it to only inspect class hierarchy. This change switches them to accept `ECClassHierarchyInspector` instead - this reduces the surface area of the API and makes it more clear that only class hierarchy is being inspected, while also possibly improving performance.

  This is a breaking change for the following APIs:

  - `createHiliteSetProvider` prop `imodelAccess`.
  - `createCachingHiliteSetProvider` prop `imodelProvider`.
  - `enableUnifiedSelectionSyncWithIModel` prop `imodelAccess`.

  Migration example:

  ```ts
  import { createECSqlQueryExecutor, createECSchemaProvider } from "@itwin/presentation-core-interop";
  import { createCachingECClassHierarchyInspector } from "@itwin/presentation-shared";
  import { createHiliteSetProvider } from "@itwin/unified-selection";

  // before:
  const hiliteProvider = createHiliteSetProvider({
    imodelAccess: {
      ...createECSqlQueryExecutor(imodel),
      ...createECSchemaProvider(MyAppFrontend.getSchemaContext(imodel)),
    },
  });

  // after:
  const hiliteProvider = createHiliteSetProvider({
    imodelAccess: {
      ...createECSqlQueryExecutor(imodel),
      ...createCachingECClassHierarchyInspector({
        schemaProvider: createECSchemaProvider(MyAppFrontend.getSchemaContext(imodel)),
        cacheSize: 100,
      }),
    },
  });
  ```

### Patch Changes

- [#557](https://github.com/iTwin/presentation/pull/557): Fixed `computeSelection` returning duplicate selectables when using `Functional` selection scope and non-3D elements.

## 0.3.0

### Minor Changes

- [#530](https://github.com/iTwin/presentation/pull/530): Added `enableUnifiedSelectionSyncWithIModel` for enabling synchronization between iModel's tool selection and unified selection storage.
- [#544](https://github.com/iTwin/presentation/pull/544): Breaking API changes

  - The type of ECSQL query executor's `createQueryReader` function was changed from:

    ```ts
    // createQueryReader(ecsql: string, bindings?: ECSqlBinding[], config?: ECSqlQueryReaderOptions): ECSqlQueryReader;
    // usage:
    const reader = executor.createQueryReader(
      `
        WITH RECURSIVE
        ChildElements(ECInstanceId) AS (
          SELECT ECInstanceId FROM bis.Element WHERE Parent.Id = ?
          UNION ALL
          SELECT c.ECInstanceId FROM bis.Element c JOIN ChildElements p ON c.Parent.Id = p.ECInstanceId
        )
        SELECT * FROM ChildElements
      `,
      [{ type: "id", value: "0x1" }],
      { rowFormat: "Indexes" },
    );
    ```

    to:

    ```ts
    // createQueryReader(query: { ctes?: string; ecsql: string; bindings?: ECSqlBinding[] }, config?: ECSqlQueryReaderOptions): ECSqlQueryReader;
    // usage:
    const reader = executor.createQueryReader(
      {
        ctes: [
          `
          ChildElements(ECInstanceId) AS (
              SELECT ECInstanceId FROM bis.Element WHERE Parent.Id = ?
              UNION ALL
              SELECT c.ECInstanceId FROM bis.Element c JOIN ChildElements p ON c.Parent.Id = p.ECInstanceId
          )
        `,
        ],
        ecsql: "SELECT * FROM ChildElements",
        bindings: [{ type: "id", value: "0x1" }],
      },
      { rowFormat: "Indexes" },
    );
    ```

    This makes the API consistent with other Presentation packages and allows additional manipulation on ECSQL, which was not possible previously when ECSQL contained CTEs.

    The change affects the following public APIs:

    - `computeSelection` (`queryExecutor` prop),
    - `createHiliteSetProvider` (previously `queryExecutor` prop, now `imodelAccess` prop),
    - `createCachingHiliteSetProvider` (`iModelProvider` prop).

  - `createHiliteSetProvider` function props `queryExecutor` and `schemaProvider` were merged into a single `imodelAccess` prop with merged type.

    Previously:

    ```ts
    createHiliteSetProvider({
      queryExecutor: createECSqlQueryExecutor(iModel),
      schemaProvider: createECSchemaProvider(iModel),
    });
    ```

    Now:

    ```ts
    createHiliteSetProvider({
      imodelAccess: {
        ...createECSqlQueryExecutor(iModel),
        ...createECSchemaProvider(iModel),
      },
    });
    ```

  - `createCachingHiliteSetProvider` function prop `iModelProvider` was changed to return an object of merged type `ECSchemaProvider & ECSqlQueryExecutor` rather than `{ queryExecutor: ECSqlQueryExecutor; schemaProvider: ECSchemaProvider }`.

    Previously:

    ```ts
    createCachingHiliteSetProvider({
      selectionStorage,
      iModelProvider: (key) => ({
        queryExecutor: createECSqlQueryExecutor(iModel),
        schemaProvider: createECSchemaProvider(iModel),
      }),
    });
    ```

    Now:

    ```ts
    createCachingHiliteSetProvider({
      selectionStorage,
      iModelProvider: (key) => ({
        ...createECSqlQueryExecutor(iModel),
        ...createECSchemaProvider(iModel),
      }),
    });
    ```

- [#551](https://github.com/iTwin/presentation/pull/551): Changed `iModel` in attribute names to `imodel`. The change was made to be consistent with other Presentation packages and affects the following APIs:

  - `SelectionStorage` methods now accept `imodelKey` prop rather than `iModelKey`. It's `selectionChangeEvent` is also now raised with `imodelKey` prop in `StorageSelectionChangeEventArgs`.
  - `CachingHiliteSetProvider.getHiliteSet` now accepts an `imodelKey` prop rather than `iModelKey`.
  - `createCachingHiliteSetProvider` props now accept `imodelProvider` callback rather than `iModelProvider`.

- [#553](https://github.com/iTwin/presentation/pull/553): Expose types from `@itwin/presentation-shared` rather than having our own copies.

### Patch Changes

- Updated dependencies:
  - @itwin/presentation-shared@0.1.0

## 0.2.0

### Minor Changes

- [#488](https://github.com/iTwin/presentation/pull/488): Added API for getting hilite sets for `Selectables` and active `SelectionStorage` selection.

### Patch Changes

- [#495](https://github.com/iTwin/presentation/pull/495): Added license field to `package.json`.

## 0.1.0

### Minor Changes

- [#491](https://github.com/iTwin/presentation/pull/491): Initial package release.
