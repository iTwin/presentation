# @itwin/presentation-shared

Copyright © Bentley Systems, Incorporated. All rights reserved. See LICENSE.md for license terms and full copyright notice.

The `@itwin/presentation-shared` package provides APIs shared across different Presentation packages.

Generally, it's expected for this package to be a regular dependency (not a peer) and it's types to possibly be exposed through other Presentation packages.

## EC & Metadata

The APIs in this group provide access to [iModels' EC metadata](https://www.itwinjs.org/bis/ec/). For the most part, the package delivers only type definitions for different EC types and a couple of utility functions.

### `EC` namespace

The namespace defines all the [EC](https://www.itwinjs.org/bis/ec/) types that Presentation packages need. The types mostly replicate the ones from [`@itwin/ecschema-metadata` package](https://www.npmjs.com/package/@itwin/ecschema-metadata), but provide an abstraction layer and, being interfaces rather than classes, better interoperability between packages and versions.

### `ECSchemaProvider` & `getClass`

- `ECSchemaProvider` is an interface for something that knows how to get an [ECSchema](https://www.itwinjs.org/bis/ec/ec-schema/) from an iModel. The package itself doesn't provide an implementation for this interface and instead relies on `@itwin/presentation-core-interop` to do that.

- `getClass` is an utility function that makes it easier to get an `EC.Class`, given an `ECSchemaProvider` and a full class name.

Example usage:

```ts
import { SchemaContext } from "@itwin/ecschema-metadata";
import { createECSchemaProvider } from "@itwin/presentation-core-interop";
import { ECSchemaProvider, getClass } from "@itwin/presentation-shared";

const schemas = new SchemaContext();
const schemaProvider: ECSchemaProvider = createECSchemaProvider(schemas);

// get schema and a class from it
const ecSchema = await schemaProvider.getSchema("MySchema");
const ecClassFromSchema = await ecSchema.getClass("MyClass");

// ... or use the `getClass` utility to get straight to the class
const ecClassFromUtility = await getClass(schemaProvider, "MySchema.MyClass");
```

### `ECClassHierarchyInspector` & `createCachingECClassHierarchyInspector`

- `ECClassHierarchyInspector` is an interface for something that knows how to check whether one `EC.Class` derives from another. While that can be achieved through `ECSchemaProvider` by getting an `EC.Class` and calling its `is` method, using this interface provides a more streamlined and, possibly, more efficient way to do the check. In addition, the `ECClassHierarchyInspector.classDerivesFrom` returns a `Promise<boolean> | boolean`, which lets the implementation return the result synchronously, if it's already known.

- `createCachingECClassHierarchyInspector` is a factory method that creates `ECClassHierarchyInspector` instance that uses a LRU cache to store the check results. In Presentation library use cases, class inheritance checks are done very frequently to warrant caching these results.

Example usage:

```ts
import { createCachingECClassHierarchyInspector, ECClassHierarchyInspector } from "@itwin/presentation-shared";

const classHierarchyInspector: ECClassHierarchyInspector = createCachingECClassHierarchyInspector({
  // provide `ECSchemaProvider` that will be used to access iModels schemas
  schemaProvider: getMetadataProvider(),
  // tell how many entries should be cached in LRU cache (0 or `undefined` stand for "no caching")
  cacheSize: 100,
});
const isGeometricElement = await classHierarchyInspector.classDerivesFrom("MySchema.MyClass", "BisCore.GeometricElement");
```

## ECSql

The APIs in ECSql group provide an abstraction layer over ECSQL query reader API [on the backend](https://www.itwinjs.org/reference/core-backend/imodels/imodeldb/createqueryreader/) and [on the frontend](https://www.itwinjs.org/reference/core-frontend/imodelconnection/imodelconnection/createqueryreader/).

### `ECSqlQueryExecutor` & related APIs

- `ECSqlBinding` is a union of type / value pairs for binding the values to parametrized ECSQL queries.

- `ECSqlQueryDef` defines the query content: [ctes](https://www.itwinjs.org/learning/commontableexp/), `ecsql` that contains the ECSQL query itself and the bindings (values) for parameters in the query.

- `ECSqlQueryReaderOptions` is a subset of [QueryOptions](https://www.itwinjs.org/reference/core-common/imodels/queryoptions/) and allows configuring how the query is run.

- `ECSqlQueryRow` matches [QueryRowProxy](https://www.itwinjs.org/reference/core-common/imodels/queryrowproxy/) and allows accessing the results by index (when row format is `Indexes`) or by name (when row format is `ECSqlPropertyNames`).

- `ECSqlQueryExecutor` is an interface for a query executor that takes `ECSqlQueryDef` with `ECSqlQueryReaderOptions` and returns `ECSqlQueryRow` objects. The package itself doesn't provide an implementation for this interface and instead relies on `@itwin/presentation-core-interop` to do that.

Example usage:

```ts
import { IModelDb } from "@itwin/core-backend";
import { createECSqlQueryExecutor } from "@itwin/presentation-core-interop";
import { ECSqlQueryExecutor } from "@itwin/presentation-shared";

const imodel: IModelDb = getIModelDb();
const queryExecutor = createECSqlQueryExecutor(imodel);
const queryReader = queryExecutor.createQueryReader(
  {
    ecsql: "SELECT * FROM BisCore.Element WHERE UserLabel = ?",
    bindings: [{ type: "string", value: "My element" }],
  },
  {
    rowFormat: "ECSqlPropertyNames",
  },
);
for await (const row of reader) {
  const instanceId = row["ECInstanceId"];
  const codeValue = row["CodeValue"];
}
```

### ECSql utilities

The ECSql utilities group contains a number of functions to help create complex ECSQL queries. All the functions in this group are exported under the `ECSql` namespace.

- `createNullableSelector` - creates a clause for returning `NULL` when `checkSelector` returns a falsy value, or result of `valueSelector` otherwise.

  Example usage:

  ```ts
  import { ECSql } from "@itwin/presentation-shared";

  const result = ECSql.createNullableSelector({ checkSelector: "CHECK_SELECTOR", valueSelector: "VALUE_SELECTOR" });
  // result = "IIF(CHECK_SELECTOR, VALUE_SELECTOR, NULL)"
  ```

- `createRawPropertyValueSelector` - creates an ECSQL selector for raw property value, or, optionally - it's component.

  Example usage:

  ```ts
  import { ECSql } from "@itwin/presentation-shared";

  const result = ECSql.createRawPropertyValueSelector("CLASS_ALIAS", "POINT_PROPERTY", "X");
  // result = "[CLASS_ALIAS].[POINT_PROPERTY].[X]"
  ```

- `createRawPrimitiveValueSelector` - creates an ECSQL selector for a raw primitive value.

  - `undefined` is selected as `NULL`.
  - `Date` values are selected in julian day format.
  - `Point2d` and `Point3d` values are selected as serialized JSON objects, e.g. `{ x: 1, y: 2, z: 3 }`.
  - Other kinds of values are selected as-is.

  Example usage:

  ```ts
  import { ECSql } from "@itwin/presentation-shared";
  const result = ECSql.createRawPrimitiveValueSelector("STRING VALUE");
  // result = "'STRING VALUE'"
  ```

- `createConcatenatedValueJsonSelector` - creates an ECSQL selector for a `ConcatenatedValue`. This allows handling results of each value selector individually when parsing query result.

  Example usage:

  ```ts
  import { ECSql } from "@itwin/presentation-shared";

  const selector = ECSql.createConcatenatedValueJsonSelector([
    {
      propertyClassName: "MySchema.MyClass",
      propertyClassAlias: "my_class",
      propertyName: "MyProperty",
    },
    {
      selector: "my_class.MyOtherProperty",
    },
    {
      value: 123.456,
      type: "Double",
    },
  ]);
  // selector = `json_array(
  //     json_object(
  //         'className', 'MySchema.MyClass',
  //         'propertyName', 'MyProperty',
  //         'value', [my_class].[MyProperty]
  //     ),
  //     my_class.MyOtherProperty,
  //     json_object(
  //         'value', 123.456,
  //         'type', 'Double'
  //     )
  // )`

  const queryReader = queryExecutor.createQueryReader(
    {
      ecsql: `SELECT ${selector} FROM MySchema.MyClass AS my_class`,
    },
    {
      rowFormat: "Indexes",
    },
  );
  for await (const row of reader) {
    const value: ConcatenatedValue = JSON.parse(row[0]);
  }
  ```

- `createConcatenatedValueStringSelector` - creates an ECSQL selector combined of multiple typed value selectors in a form of a string.

  Example usage:

  ```ts
  import { ECSql } from "@itwin/presentation-shared";

  const selector = ECSql.createConcatenatedValueStringSelector([
    {
      propertyClassName: "MySchema.MyClass",
      propertyClassAlias: "my_class",
      propertyName: "MyProperty",
    },
    {
      selector: "my_class.MyOtherProperty",
    },
    {
      value: 123.456,
      type: "Double",
    },
  ]);
  // selector = `[my_class].[MyProperty] || my_class.MyOtherProperty || 123.456`

  const queryReader = queryExecutor.createQueryReader(
    {
      ecsql: `SELECT ${selector} FROM MySchema.MyClass AS my_class`,
    },
    {
      rowFormat: "Indexes",
    },
  );
  for await (const row of reader) {
    const value: string = row[0];
  }
  ```

- `createRelationshipPathJoinClause` - creates an ECSQL JOIN snippet for given relationships' path.

  Example usage:

  ```ts
  import { ECSql } from "@itwin/presentation-shared";

  const selector = ECSql.createRelationshipPathJoinClause({
    schemaProvider,
    path: [
      {
        sourceAlias: "my_source",
        sourceClassName: "MySchema.MySourceClass",
        relationshipAlias: "my_relationship",
        relationshipName: "MySchema.MyRelationship",
        targetAlias: "my_target",
        targetClassName: "MySchema.MyTargetClass",
        joinType: "inner",
      },
    ],
  });
  // selector = `
  //   INNER JOIN [MySchema].[MyRelationship] [my_relationship] ON [my_relationship].[SourceECInstanceId] = [my_source].[ECInstanceId]`
  //   INNER JOIN [MySchema].[MyTargetClass] [my_target] ON [my_target].[ECInstanceId] = [my_relationship].[TargetECInstanceId]
  // `
  ```

## Values

The APIs in Values group contain various value types and utilities to work with them.

- `InstanceKey` - a pair of full ECClass name and ECInstance ID, uniquely identifying an ECInstance in an iModel.

- `PrimitiveValue` - a union of different supported primitive values. Also, a namespace, containing the following utilities:

  - `isPoint2d` - type guard to check if the given `PrimitiveValue` is a `Point2d`.
  - `isPoint3d` - type guard to check if the given `PrimitiveValue` is a `Point3d`.

- `TypedPrimitiveValue` - a union of all supported combinations of `PrimitiveValue` and its type, possibly with some extra metadata like extended type name or units-related information. Also, a namespace, containing the following utilities:

  - `create` - given a `PrimitiveValue`, its type and, optionally, extra information, validates the input and creates a `TypedPrimitiveValue`.

- `ConcatenatedValuePart` - a union of different types that may be used to create a single, combined value: primitive ECInstance property value, hardcoded primitive value or just plain string. Also, a namespace, containing the following utilities:

  - `isString` - type guard to check if the given `ConcatenatedValuePart` is a `string`.
  - `isPrimitive` - type guard to check if the given `ConcatenatedValuePart` is a `TypedPrimitiveValue`.
  - `isProperty` - type guard to check if the given `ConcatenatedValuePart` describes a primitive property value.

- `ConcatenatedValue` - an array of `ConcatenatedValuePart`. Also, a namespace containing the following utilities:

  - `serialize` - joins the given `ConcatenatedValue` parts using provided formatter and separator.

- `IPrimitiveValueFormatter` - an interface for a function that knows how to format a `TypedPrimitiveValue` into a string.

- `createDefaultValueFormatter` - a factory method that creates an `IPrimitiveValueFormatter` for formatting values into a user-friendly, but units-agnostic format. This is a good fallback, but for iTwin.js applications it's expected that a units aware formatter from `@itwin/presentation-core-interop` package is used.

- `formatConcatenatedValue` - an utility function, built on top of `ConcatenatedValue.serialize`, to serialize `ConcatenatedValue` into a string, but in this case - using the given `IPrimitiveValueFormatter`.

## Instance labels

- `IInstanceLabelSelectClauseFactory` is an interface for something that knows how to create an ECSQL selector for a label. The selector should be injected straight into an ECSQL query:

  ```ts
  const ecsql = `SELECT ${await factory.createSelectClause({ classAlias: "element" })} AS [Label] FROM [BisCore].[Element] AS [element]`;
  ```

  The generated label is expected to always be of string type, but it may be a serialized JSON string, representing a `ConcatenatedValue`.

- `parseInstanceLabel` utility function may be used to parse the label from query results, taking into account the possibility for the label to be either a string or a `ConcatenatedValue`. For example, the label from above query may be parsed like this:

  ```ts
  import { ConcatenatedValue, parseInstanceLabel } from "@itwin/presentation-shared";

  for await (const row of queryExecutor.createQueryReader({ ecsql }, { rowFormat: "ECSqlPropertyNames" })) {
    const label: string | ConcatenatedValue = parseInstanceLabel(row["Label"]);
    // see `formatConcatenatedValue` for creating a formatted label string from the above
  }
  ```

The package delivers 3 implementations of `IInstanceLabelSelectClauseFactory` that can be created using the following factory methods: `createDefaultInstanceLabelSelectClauseFactory`, `createClassBasedInstanceLabelSelectClauseFactory`, `createBisInstanceLabelSelectClauseFactory`.

### `createDefaultInstanceLabelSelectClauseFactory`

This label selectors factory creates instance labels in the form of `Class label [base36(briefcase id)-base36(local id)]`, where local and briefcase IDs are calculated based on ECInstance ID:

- `{briefcase id} = ECInstanceId >> 40`,
- `{local id} = ECInstanceId & (1 << 40 - 1)`.

This kind of label is a good fallback for when no better label can be produced - every ECInstance in an iModel always has an ECClass and an ECInstance ID and the combination of the two is guaranteed to be unique, which guarantees a unique instance label.

Example usage:

```ts
import { createDefaultInstanceLabelSelectClauseFactory } from "@itwin/presentation-shared";

const labelsFactory = createDefaultInstanceLabelSelectClauseFactory();
const ecsql = `SELECT ${await labelsFactory.createSelectClause({ classAlias: "element" })} AS [Label] FROM [BisCore].[Element] AS [element]`;
// ...
```

### `createClassBasedInstanceLabelSelectClauseFactory`

This label selectors factory doesn't create labels on its own, but allows assigning different selectors based on ECClass. This is convenient when different classes have different rules for calculating labels of their instances.

Example usage:

```ts
import { createClassBasedInstanceLabelSelectClauseFactory, ECClassHierarchyInspector } from "@itwin/presentation-shared";

const classHierarchyInspector: ECClassHierarchyInspector = getClassHierarchyInspector();
const labelsFactory = createClassBasedInstanceLabelSelectClauseFactory({
  classHierarchyInspector,
  clauses: [
    {
      className: "MySchema.MyClass",
      clause: ({ classAlias }) => ({ selector: `[${classAlias}].[MyLabelProperty]` }),
    },
    {
      className: "BisCore.GeometricElement",
      clause: () => ({ value: "Geometric element", type: "String" }),
    },
    {
      className: "BisCore.Element",
      clause: ({ classAlias }) => ({ selector: `'Element: ' || [${classAlias}].[CodeValue]` }),
    },
  ],
});
const ecsql = `SELECT ${await labelsFactory.createSelectClause({ classAlias: "element" })} AS [Label] FROM [BisCore].[Element] AS [element]`;
// ...
```

### `createBisInstanceLabelSelectClauseFactory`

This label selectors factory creates labels according to [BIS instance label rules](https://www.itwinjs.org/presentation/advanced/defaultbisrules/#label-overrides). It's the recommended factory to use when consistent labels are needed across iTwin.js applications.

Example usage:

```ts
import { createBisInstanceLabelSelectClauseFactory, ECClassHierarchyInspector } from "@itwin/presentation-shared";

const classHierarchyInspector: ECClassHierarchyInspector = getClassHierarchyInspector();
const labelsFactory = createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector });
const ecsql = `SELECT ${await labelsFactory.createSelectClause({ classAlias: "element" })} AS [Label] FROM [BisCore].[Element] AS [element]`;
// ...
```

## Logging

The APIs in logging category define types and interfaces required for creating a logger. The package itself only delivers a `NOOP_LOGGER`, which does what it says - nothing. Besides that, we expect the `@itwin/presentation-core-interop` package to be used for creating a logger that forwards all logging to [iTwin.js `Logger`](https://www.itwinjs.org/reference/core-bentley/logging/logger/).

Example usage:

```ts
import { Logger as ITwinJsLogger } from "@itwin/core-bentley";
import { createLogger } from "@itwin/presentation-core-interop";
import { ILogger } from "@itwin/presentation-shared";
import { setLogger as setHierarchiesLogger } from "@itwin/presentation-hierarchies";

// create an `ILogger` from iTwin.js `Logger`
const logger: ILogger = createLogger(ITwinJsLogger);

// the logger may be used directly
logger.logInfo("MyApp.Feature", "This is a log message");

// it may also be passed to other Presentation packages which will then use it for logging
setHierarchiesLogger(logger);
```

## Utilities

The package also delivers a number of utility types and functions:

### Types

- `ArrayElement` - given an array, constructs a type of the array item:

  ```ts
  type MyArray = Array<number>;
  type MyArrayItem = ArrayElement<MyArray>; // number
  ```

- `OmitOverUnion` - similar to TypeScript's `Omit`, but also works on union types:

  ```ts
  type MyUnionType = { x: number; y: string } | { y: string; z: boolean };
  type MyUnionWithoutY = OmitOverUnion<MyUnionType, "y">; // { x: number } | { z: boolean }
  ```

### Functions

- `normalizeFullClassName` - given a full class name with a schema - class names' separator being either `:` or `.`, returns a full class name with `.` separator:

  ```ts
  // returns "BisCore.Element"
  const normalizedClassName = normalizeFullClassName("BisCore:Element");
  ```

- `parseFullClassName` - given a full class name with a schema - class names' separator being either `:` or `.`, returns a parsed object with schema and class names separated:

  ```ts
  // returns `{ schemaName: "BisCore", className: "Element" }`
  const { schemaName, className } = parseFullClassName("BisCore:Element");
  ```

- `trimWhitespace` - trims all extra whitespace from the given string, including:

  - consecutive spaces,
  - spaces before closing parentheses and comma,
  - spaces after opening parentheses,
  - spaces at the beginning and end of the string.

- `releaseMainThread` - returns a promise that immediately resolves. Awaiting on the returned promise releases the main thread and allows other tasks to run.

- `createMainThreadReleaseOnTimePassedHandler` - returns a `releaseMainThread` promise if the given amount of time has passed since the handler was created or the main thread was last released using this handler. Otherwise, returns `undefined`.

  ```ts
  const releaseMainThread = createMainThreadReleaseOnTimePassedHandler();
  for (const value of someVeryLargeArray) {
    await releaseMainThread();
    // do something with value
  }
  ```
