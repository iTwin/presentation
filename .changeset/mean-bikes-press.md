---
"@itwin/unified-selection": minor
---

Breaking API changes

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

- `createHiliteSetProvider` function props `queryExecutor` and `metadataProvider` were merged into a single `imodelAccess` prop with merged type.

  Previously:

  ```ts
  createHiliteSetProvider({
    queryExecutor: createECSqlQueryExecutor(iModel),
    metadataProvider: createMetadataProvider(iModel),
  });
  ```

  Now:

  ```ts
  createHiliteSetProvider({
    imodelAccess: {
      ...createECSqlQueryExecutor(iModel),
      ...createMetadataProvider(iModel),
    },
  });
  ```

- `createCachingHiliteSetProvider` function prop `iModelProvider` was changed to return an object of merged type `IMetadataProvider & IECSqlQueryExecutor` rather than `{ queryExecutor: IECSqlQueryExecutor; metadataProvider: IMetadataProvider }`.

  Previously:

  ```ts
  createCachingHiliteSetProvider({
    selectionStorage,
    iModelProvider: (key) => ({
      queryExecutor: createECSqlQueryExecutor(iModel),
      metadataProvider: createMetadataProvider(iModel),
    }),
  });
  ```

  Now:

  ```ts
  createCachingHiliteSetProvider({
    selectionStorage,
    iModelProvider: (key) => ({
      ...createECSqlQueryExecutor(iModel),
      ...createMetadataProvider(iModel),
    }),
  });
  ```
