# @itwin/presentation-content

Copyright © Bentley Systems, Incorporated. All rights reserved. See LICENSE.md for license terms and full copyright notice.

The `@itwin/presentation-content` package provides APIs for loading property content from [iTwin.js iModels](https://www.itwinjs.org/learning/imodels/#imodel-overview). It implements a modular pipeline that resolves EC schemas, builds content descriptors describing available fields, and loads property values — all with clearly defined extension points at each stage.

The package doesn't depend on any backend, frontend, or UI specific packages, making it usable in both environments.

## Concepts

### Content target

A `ContentTarget` is the starting point for any content request. It specifies:

- A **primary EC class** whose properties you want to load.
- Optional **instance IDs** to narrow the request to specific instances.
- An optional **instance filter** (ECSQL expression) for further filtering.

### Content source

A `ContentSource` is the resolved join shape for a content target. It captures which EC classes need to be JOINed to retrieve available properties based on relationship paths declared by fields providers. Content sources are produced by the source resolution stage of the pipeline and serve as input to descriptor building.

### Content descriptor

A `ContentDescriptor` is the schema of the result — it describes all available fields, their metadata (labels, types, categories, read-only flags), and the sources they originate from. It is computed before loading any values, allowing consumers to inspect and customize what will be loaded.

### Fields

A `Field` represents a single loadable value in the content. There are three kinds:

- **`PropertyField`** — backed by a real EC property. Carries the source class, property name, and the relationship path from the target.
- **`CalculatedField`** — backed by an ECSQL expression that is evaluated during query execution.
- **`ExternalField`** — contributed by an external provider. Values are fetched from non-iModel sources (e.g., REST APIs, IoT systems).

### Content item

A `ContentItem` wraps the loaded values for a single instance together with a reference to the descriptor. It provides a `getValue(field)` accessor for retrieving individual field values.

### Pipeline stages

The content loading process is split into four stages:

| Stage                   | Purpose                                                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Source resolution**   | Queries the iModel to resolve declared relationship paths to concrete classes, producing `ContentSource` objects.  |
| **Descriptor building** | Reads EC schema metadata and consults fields providers to produce a `ContentDescriptor` with all available fields. |
| **Query building**      | Constructs an ECSQL query from the descriptor, applying any registered query filterers.                            |
| **Value loading**       | Executes the query and populates field values, calling external providers for non-iModel fields.                   |

Not all requests execute every stage. For example, `ContentProvider.getContentDescriptor()` only runs stages 1–2, and `getSize()` runs a simplified COUNT query after stage 1.

## Extension points

The package provides four extension mechanisms, each targeting a different stage of the pipeline:

- **`defineIModelFieldsProvider`** — contribute related properties and calculated fields by declaring relationship paths and ECSQL expressions. The provider is consulted during source resolution and descriptor building.

- **`defineDescriptorTransformer`** — customize the descriptor after all fields providers have contributed. Use this to hide fields, override labels, change categories, or apply any cross-cutting metadata adjustments.

- **`defineExternalFieldsProvider`** — declare fields whose values come from external sources. The provider specifies what input values it needs (from already-loaded iModel fields) and supplies values for its own fields in a batch callback.

- **`defineQueryFilterer`** — inject additional WHERE clauses or JOINs into the generated ECSQL query without modifying the descriptor.

All extension points are registered through the `ContentConfiguration` object passed to `resolveContentSources` and `createContentProvider`.
