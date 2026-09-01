# @itwin/presentation-core-interop

## 2.0.0-alpha.4

### Major Changes

- [#1394](https://github.com/iTwin/presentation/pull/1394): Changed `createECSchemaProvider` to take an object exposing the iModel's `getSchemaView` and `createQueryReader` functions instead of a `SchemaContext`. An `IModelDb` or `IModelConnection` satisfies this shape directly, so you can now pass the iModel itself; you can also pass any object that provides just those two functions.

  Typical migration:

  ```ts
  const iModel: IModelDb | IModelConnection = ...;

  // previously:
  const schemaProvider = createECSchemaProvider(iModel.schemaContext);

  // now (pass the iModel directly):
  const schemaProvider = createECSchemaProvider(iModel);

  // or provide only the required functions:
  const schemaProvider = createECSchemaProvider({
    getSchemaView: iModel.getSchemaView.bind(iModel),
    createQueryReader: iModel.createQueryReader.bind(iModel),
  });
  ```

- [#1494](https://github.com/iTwin/presentation/pull/1494): `createValueFormatter`: Changed to take a `formatsProvider`, a `unitsProvider` and the iModel instead of a `SchemaContext`.

  `SchemaContext` is inefficient on iModels with large domain schemas, so the function no longer depends on it. Sourcing formats from a `FormatsProvider` also lets the consuming application register its own formatting overrides (per organization, per iModel, per user, etc.), achieving cohesive formatting across the whole application - something a bare `SchemaContext` couldn't provide.

  Additionally, when a kind of quantity can’t be resolved (e.g. missing schema/KoQ or an unsupported persistence unit name), `createValueFormatter` now falls back to the `baseFormatter` instead of throwing.

  Migration: the `schemaContext` prop is removed, provide `formatsProvider`, `unitsProvider` and `imodel` instead:

  ```ts
  // previously:
  const formatter = createValueFormatter({
    schemaContext: imodel.schemaContext,
    unitSystem: "metric",
  });

  // now, on the frontend:
  const formatter = createValueFormatter({
    formatsProvider: IModelApp.formatsProvider,
    unitsProvider: IModelApp.quantityFormatter,
    imodel,
    unitSystem: "metric",
  });
  ```

  On the backend, where there's no `IModelApp`, construct equivalent providers from the iModel's `SchemaContext`, e.g. `formatsProvider: new SchemaFormatsProvider(schemaContext)` and `unitsProvider: new SchemaUnitProvider(schemaContext)` from `@itwin/ecschema-metadata`, ideally caching them per iModel.

- [#1394](https://github.com/iTwin/presentation/pull/1394): `EC` namespace interfaces in `@itwin/presentation-shared` no longer use `Promise` wrappers — once a schema is loaded via the still-async `ECSchemaProvider.getSchema`, all further navigation (`baseClass`, `is()`, `getProperty()`, `getProperties()`, `kindOfQuantity`, `relationshipClass`, `enumeration`, `abstractConstraint`) is synchronous.

  Additional changes:

  - The `EC.Class.getDerivedClasses()` method was replaced with `getDerivedClassNames(props?: { onlyDirect?: boolean })`. `ECSchemaProvider` can be used to load the derived classes by name, if needed.
  - The `getCustomAttributes()` method has been removed from `EC.Schema`, `EC.Class`, and `EC.Property` and replaced with an `isHidden: boolean` property. `EC.CustomAttributeSet` and `EC.CustomAttribute` types have been removed.
  - Added an `EC.Class.getOwnProperties()` method that returns only the properties defined on the class itself, without inherited properties.
  - Added an `EC.EntityClass.getMixins()` method that returns all mixins applied to the entity class.
  - Added an optional `EC.Property.category` attribute.
  - Added a required `EC.RelationshipConstraint.constraintClasses` attribute.
  - Added missing optional `description` attributes to `EC.Schema` and `EC.Property`.

### Minor Changes

- [#1493](https://github.com/iTwin/presentation/pull/1493): Expose access to enumerations, kind-of-quantities and property categories through `EC.Schema`, and extend `EC.KindOfQuantity` with `relativeError` and `persistenceUnit` attributes. Schemas returned by `createECSchemaProvider` now implement the new getters.

  - `EC.Schema` now requires `getEnumeration`, `getKindOfQuantity` and `getPropertyCategory` methods (mirroring the existing `getClass`). Consumers that only use `EC.Schema` are unaffected, but custom implementations of the interface must add these getters:

    ```ts
    const schema: EC.Schema = {
      name,
      version,
      isHidden,
      getClass: (className) => classes.get(className),
      // added:
      getEnumeration: (enumName) => enumerations.get(enumName),
      getKindOfQuantity: (koqName) => kindOfQuantities.get(koqName),
      getPropertyCategory: (categoryName) => categories.get(categoryName),
    };
    ```

  - `EC.KindOfQuantity` now requires `relativeError` (`number`) and `persistenceUnit` (`string`) attributes. Custom implementations must provide them.

  - `createECSchemaProvider`: The `EC.Schema` returned by the provider now implements the new getters, giving access to enumerations, kind-of-quantities and property categories in addition to classes. Existing code keeps working without changes and can now read these additional schema items:

    ```ts
    const schemaProvider = createECSchemaProvider(imodel);
    const schema = await schemaProvider.getSchema("BisCore");
    const enumeration = schema?.getEnumeration("MySchema.MyEnum");
    const koq = schema?.getKindOfQuantity("MySchema.MyKoq");
    const category = schema?.getPropertyCategory("MySchema.MyCategory");
    ```

- [#1491](https://github.com/iTwin/presentation/pull/1491): `ECSchemaProvider`: Added a `classDerivesFrom` method for checking whether one ECClass is the same as, or derives from, another. `createECSchemaProvider` (in `@itwin/presentation-core-interop`) implements it using the class hierarchy information it already loads, so the answer is returned synchronously once the hierarchy has been loaded and no additional round-trips to the iModel are needed.

  Also, `ECClassHierarchyInspector` and `createCachingECClassHierarchyInspector` have been deprecated. Because `ECSchemaProvider` now exposes `classDerivesFrom` directly, a separate class hierarchy inspector is no longer needed when setting up iModel access:

  ```ts
  // Before:
  import { createCachingECClassHierarchyInspector } from "@itwin/presentation-shared";
  import {
    createECSchemaProvider,
    createECSqlQueryExecutor,
  } from "@itwin/presentation-core-interop";

  const schemaProvider = createECSchemaProvider(imodel);
  const imodelAccess = {
    ...schemaProvider,
    ...createCachingECClassHierarchyInspector({ schemaProvider }),
    ...createECSqlQueryExecutor(imodel),
  };

  // After:
  import {
    createECSchemaProvider,
    createECSqlQueryExecutor,
  } from "@itwin/presentation-core-interop";

  const imodelAccess = {
    ...createECSchemaProvider(imodel), // now also provides `classDerivesFrom`
    ...createECSqlQueryExecutor(imodel),
  };
  ```

  **Breaking changes:**

  - `ECSchemaProvider` now requires a `classDerivesFrom` method. Objects created via `createECSchemaProvider` get it automatically, so most consumers don't need to change anything. Only custom, hand-written `ECSchemaProvider` implementations need to add the method.

  - Renamed the `classHierarchyInspector` prop to `imodelAccess` on `createClassBasedInstanceLabelSelectClauseFactory`, `createBisInstanceLabelSelectClauseFactory` (both in `@itwin/presentation-shared`) and `createPredicateBasedHierarchyDefinition` (in `@itwin/presentation-hierarchies`). The prop's type is unchanged, so the value passed to it doesn't need to change - only the prop name:

    ```ts
    // Before:
    const classHierarchyInspector = createCachingECClassHierarchyInspector({
      schemaProvider: createECSchemaProvider(imodel),
    });
    createPredicateBasedHierarchyDefinition({
      classHierarchyInspector,
      hierarchy,
    });

    // After:
    const imodelAccess = createECSchemaProvider(imodel);
    createPredicateBasedHierarchyDefinition({ imodelAccess, hierarchy });
    ```

### Patch Changes

- [#1495](https://github.com/iTwin/presentation/pull/1495): Fix `createECSchemaProvider` to set `EC.Property.class` to the class that declares or contributes the property (the base class for an inherited property, or the mixin for a mixin-contributed property), instead of the class the property was queried or enumerated through.
- [#1511](https://github.com/iTwin/presentation/pull/1511): Fixed a performance regression that made property grouping of large hierarchies dramatically slower.

  `createECSchemaProvider` now caches resolved schemas and the `EC.Class` objects built from them, so repeated `getSchema`/`getClass` calls and `EC.Property.class` accesses no longer trigger a new native schema view request or rebuild the class each time. Cached schemas are reused until the underlying schema view becomes outdated, at which point they are refreshed on next access. In addition, property grouping now resolves each properties class once instead of once per grouped node.

- Updated dependencies:
  - @itwin/presentation-shared@2.0.0-alpha.13

## 2.0.0-alpha.3

### Major Changes

- [#1454](https://github.com/iTwin/presentation/pull/1454): Dropped CommonJS support. These packages are now published as ES modules (ESM) only.

### Minor Changes

- [#1446](https://github.com/iTwin/presentation/pull/1446): `EC.EntityClass`: Added `getMixins` method that returns the mixins applied directly to the entity class.

### Patch Changes

- Updated dependencies:
  - @itwin/presentation-shared@2.0.0-alpha.12

## 2.0.0-alpha.2

### Minor Changes

- [#1445](https://github.com/iTwin/presentation/pull/1445): `EC.Class`: Added `getOwnProperties` method that returns only the properties defined directly on the class, excluding those inherited from base classes.
- [#1350](https://github.com/iTwin/presentation/pull/1350): `createECSqlQueryExecutor`: Updated to handle both positional and named bindings when creating query readers.
- [#1444](https://github.com/iTwin/presentation/pull/1444): `EC.Property`: Added `category` attribute that provides access to the property's `EC.PropertyCategory`. Also added a `description` attribute to `EC.SchemaItem`.
- [#1363](https://github.com/iTwin/presentation/pull/1363): `createECSchemaProvider`: Populate `version` property on `EC.Schema` objects from the underlying `@itwin/ecschema-metadata` schema version fields.

### Patch Changes

- [#1377](https://github.com/iTwin/presentation/pull/1377): `createECSqlQueryExecutor`: queries are now automatically cancelled when consumers break out of iteration.
- Updated dependencies:
  - @itwin/presentation-shared@2.0.0-alpha.11

## 2.0.0-alpha.1

### Patch Changes

- Updated dependencies:
  - @itwin/presentation-shared@2.0.0-alpha.10

## 2.0.0-alpha.0

### Major Changes

- [#1262](https://github.com/iTwin/presentation/pull/1262): Drop support for iTwin.js Core v4.

### Patch Changes

- [#1256](https://github.com/iTwin/presentation/pull/1256): Fix `alpha` dependencies being specified with a range (`^`), allowing package manager to use higher versions, possibly with breaking changes.

## 1.4.0-alpha.8

### Patch Changes

- [#1250](https://github.com/iTwin/presentation/pull/1250): React to changes in `@itwin/presentation-shared`.
- Updated dependencies:
  - @itwin/presentation-shared@2.0.0-alpha.9

## 1.4.0-alpha.7

### Patch Changes

- [#1229](https://github.com/iTwin/presentation/pull/1229): Version bump
- Updated dependencies:
  - @itwin/presentation-shared@2.0.0-alpha.8

## 1.4.0-alpha.6

### Patch Changes

- [#1200](https://github.com/iTwin/presentation/pull/1200): Removed unnecessary, always-truthy condition checks.
- Updated dependencies:
  - @itwin/presentation-shared@2.0.0-alpha.7

## 1.4.0-alpha.5

### Patch Changes

- [#1180](https://github.com/iTwin/presentation/pull/1180): Version bump
- Updated dependencies:
  - @itwin/presentation-shared@2.0.0-alpha.6

## 1.4.0-alpha.4

### Patch Changes

- [#1143](https://github.com/iTwin/presentation/pull/1143): Bump dependencies
- Updated dependencies:
  - @itwin/presentation-shared@2.0.0-alpha.5

## 1.4.0-alpha.3

### Patch Changes

- [#1042](https://github.com/iTwin/presentation/pull/1042): Version bump
- Updated dependencies:
  - @itwin/presentation-shared@2.0.0-alpha.2

## 1.4.0-alpha.2

### Patch Changes

- [#985](https://github.com/iTwin/presentation/pull/985): Add support for `itwinjs-core@5`
- Updated dependencies:
  - @itwin/presentation-shared@2.0.0-alpha.1

## 1.4.0-alpha.1

### Patch Changes

- [#963](https://github.com/iTwin/presentation/pull/963): Fix support for `itwinjs-core@5.0-rc`.

## 1.4.0-alpha.0

### Minor Changes

- [#954](https://github.com/iTwin/presentation/pull/954): Add additional requirements for types in `EC` metadata namespace, whose objects are returned by `ECSchemaProvider`.

  - `EC.Schema`, `EC.Class` and `EC.Property` now all have an async `getCustomAttributes()` method that returns an `EC.CustomAttributeSet`, allowing consumers to access custom attributes of these schema items.
  - `EC.Class` now additionally has these members:
    - `baseClass: Promise<Class | undefined>`
    - `getDerivedClasses(): Promise<Class[]>`

  While this is an addition, it's considered a breaking change, because objects of the updated types are expected to be supplied to us by consumers.

  In reality, consumers will likely use `@itwin/presentation-core-interop` package for creating them, and the package has been updated to handle the change, so reacting to the breaking change is as simple as bumping the version of `@itwin/presentation-core-interop` package in the consumer's `package.json`.

### Patch Changes

- Updated dependencies:
  - @itwin/presentation-shared@2.0.0-alpha.0

## 1.3.13

### Patch Changes

- [#1338](https://github.com/iTwin/presentation/pull/1338): Bump iTwin.js core dependencies to `^5.9.1`.
- Updated dependencies:
  - @itwin/presentation-shared@1.2.13

## 1.3.12

### Patch Changes

- [#1313](https://github.com/iTwin/presentation/pull/1313): Bump dependencies.
- Updated dependencies:
  - @itwin/presentation-shared@1.2.12

## 1.3.11

### Patch Changes

- [#1286](https://github.com/iTwin/presentation/pull/1286): Bump dependencies.
- Updated dependencies:
  - @itwin/presentation-shared@1.2.11

## 1.3.10

### Patch Changes

- [#1242](https://github.com/iTwin/presentation/pull/1242): Bump dependencies.
- Updated dependencies:
  - @itwin/presentation-shared@1.2.10

## 1.3.9

### Patch Changes

- [#1215](https://github.com/iTwin/presentation/pull/1215): Update dependencies.
- Updated dependencies:
  - @itwin/presentation-shared@1.2.9

## 1.3.8

### Patch Changes

- [#1168](https://github.com/iTwin/presentation/pull/1168): Bump dependencies.
- [#1161](https://github.com/iTwin/presentation/pull/1161): Bump iTwin.js dependencies to `^5.5.0`.
- Updated dependencies:
  - @itwin/presentation-shared@1.2.7

## 1.3.7

### Patch Changes

- [#1152](https://github.com/iTwin/presentation/pull/1152): Bump dependencies.
- Updated dependencies:
  - @itwin/presentation-shared@1.2.6

## 1.3.6

### Patch Changes

- [#1139](https://github.com/iTwin/presentation/pull/1139): Bump dependencies.
- Updated dependencies:
  - @itwin/presentation-shared@1.2.5

## 1.3.5

### Patch Changes

- [#1124](https://github.com/iTwin/presentation/pull/1124): Bump dependencies.
- Updated dependencies:
  - @itwin/presentation-shared@1.2.4

## 1.3.4

### Patch Changes

- Updated dependencies:
  - @itwin/presentation-shared@1.2.3

## 1.3.3

### Patch Changes

- [#982](https://github.com/iTwin/presentation/pull/982): Update itwinjs-core dependencies to v5.0.0
- Updated dependencies:
  - @itwin/presentation-shared@1.2.2

## 1.3.2

### Patch Changes

- [#958](https://github.com/iTwin/presentation/pull/958): Fix support for `itwinjs-core@5.0-rc`.

## 1.3.1

### Patch Changes

- Updated dependencies:
  - @itwin/presentation-shared@1.2.1

## 1.3.0

### Minor Changes

- [#834](https://github.com/iTwin/presentation/pull/834): Updated peer dependencies to support iTwin.js Core v5 packages.

## 1.2.0

### Minor Changes

- [#814](https://github.com/iTwin/presentation/pull/814): Add a `createIModelKey` function to safely create an identifier for an `IModel` in different situations.

  Example:

  ```ts
  import { IModelConnection } from "@itwin/core-frontend";
  import { createIModelKey } from "@itwin/presentation-core-interop";

  IModelConnection.onOpen.addListener((imodel: IModelConnection) => {
    const key = createIModelKey(imodel);
    console.log(`IModel opened: "${key}"`);
  });
  ```

## 1.1.2

### Patch Changes

- Updated dependencies:
  - @itwin/presentation-shared@1.2.0

## 1.1.1

### Patch Changes

- [#760](https://github.com/iTwin/presentation/pull/760): Added missing `package.json` file under `cjs` folder. It is needed for package to work as commonjs module.

## 1.1.0

### Minor Changes

- [#740](https://github.com/iTwin/presentation/pull/740): Define `type` and `exports` attributes in `package.json`.

  The change moves this package a step closer towards dropping CommonJS support - it's now transpiled from ESM to CommonJS instead of the opposite.

  In addition, the `exports` attribute has been added to `package.json` to prohibit access to APIs that are not intended to be used by external consumers.

### Patch Changes

- [#758](https://github.com/iTwin/presentation/pull/758): Promote `@beta` APIs to `@public`.
- Updated dependencies:
  - @itwin/presentation-shared@1.1.0

## 1.0.0

### Major Changes

- [#727](https://github.com/iTwin/presentation/pull/727): 1.0 release.

  The APIs are now considered stable and ready for production use.

### Patch Changes

- Updated dependencies:
  - @itwin/presentation-shared@1.0.0

## 0.2.7

### Patch Changes

- Updated dependencies:
  - @itwin/presentation-shared@0.5.0

## 0.2.6

### Patch Changes

- Updated dependencies:
  - @itwin/presentation-shared@0.4.1

## 0.2.5

### Patch Changes

- Updated dependencies:
  - @itwin/presentation-shared@0.4.0

## 0.2.4

### Patch Changes

- Updated dependencies:
  - @itwin/presentation-shared@0.3.2

## 0.2.3

### Patch Changes

- Updated dependencies:
  - @itwin/presentation-shared@0.3.1

## 0.2.2

### Patch Changes

- Updated dependencies:
  - @itwin/presentation-shared@0.3.0

## 0.2.1

### Patch Changes

- [#623](https://github.com/iTwin/presentation/pull/623): Avoid repeated schema requests from `SchemaContext` - otherwise we're downloading the same schema from the backend multiple times.

## 0.2.0

### Minor Changes

- [#582](https://github.com/iTwin/presentation/pull/582): Updated `ECSqlQueryExecutor` to pass `restartToken` options to the underlying ECSql reader.

### Patch Changes

- [#585](https://github.com/iTwin/presentation/pull/585): `createQueryReader`: Remove extra whitespace from executed queries
- [#592](https://github.com/iTwin/presentation/pull/592): Do not publish source files to the npm
- Updated dependencies:
  - @itwin/presentation-shared@0.2.0

## 0.1.2

### Patch Changes

- Updated dependencies:
  - @itwin/presentation-shared@0.1.1

## 0.1.1

### Patch Changes

- [#558](https://github.com/iTwin/presentation/pull/558): Fixed `createECSchemaProvider` to create a provider that returns `undefined` instead of throwing, when the requested schema is not found.

## 0.1.0

### Minor Changes

- [#554](https://github.com/iTwin/presentation/pull/554): Initial package release.

### Patch Changes

- Updated dependencies:
  - @itwin/presentation-shared@0.1.0
