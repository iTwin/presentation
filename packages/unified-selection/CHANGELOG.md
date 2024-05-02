# @itwin/unified-selection

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
