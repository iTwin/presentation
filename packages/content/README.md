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

A `ContentDescriptor` is the public schema of the result — it describes all available fields, their metadata (labels, types, categories, read-only flags), and the sources they originate from. It does not expose query columns or field-to-column bindings; the provider keeps those loading details private. The descriptor is computed before loading any values, allowing consumers to inspect and customize what will be loaded.

### Fields

A `Field` represents a single loadable value in the content. There are three kinds:

- **`PropertyField`** — backed by a real EC property. Carries the source class, property name, and the relationship path from the target.
- **`CalculatedField`** — backed by an ECSQL expression that is evaluated during query execution.
- **`ExternalField`** — contributed by an external provider. Values are fetched from non-iModel sources (e.g., REST APIs, IoT systems).

### Content item

A `ContentItem` wraps the loaded values for a single instance together with a reference to the descriptor. It provides a `getValue(field)` accessor for retrieving individual field values, and a `getRelatedInstances({ pathFromTarget })` accessor for retrieving the related instances reached over a relationship path, each paired with a scoped `getValue(field)` for that instance's own values.

### Pipeline stages

The content loading process is split into four stages:

| Stage                   | Purpose                                                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Source resolution**   | Queries the iModel to resolve declared relationship paths to concrete classes, producing `ContentSource` objects.  |
| **Descriptor building** | Reads EC schema metadata and consults fields providers to produce a `ContentDescriptor` with all available fields. |
| **Query building**      | Constructs ECSQL from provider-owned loading requirements.                                                         |
| **Value loading**       | Executes the query and populates field values, calling external providers for non-iModel fields.                   |

Not all requests execute every stage. For example, `ContentProvider.getContentDescriptor()` only runs stages 1–2, and `getSize()` runs a simplified COUNT query after stage 1.

## Extension points

The package provides three extension mechanisms, each targeting a different stage of the pipeline:

- **`defineIModelFieldsProvider`** — contribute related properties and calculated fields by declaring relationship paths and ECSQL expressions. The provider is consulted during source resolution and descriptor building.

- **`defineDescriptorTransformer`** — customize the descriptor after all fields providers have contributed. Use this to hide fields, override labels, change categories, or apply any cross-cutting metadata adjustments.

- **`defineExternalFieldsProvider`** — declare fields whose values come from external sources. The provider specifies which iModel properties it needs as inputs and supplies values for its own fields in a batch callback. Direct inputs pass through the property's value unchanged. Related inputs specify `related.path`, which must be nonempty, and an optional `related.cardinalityHint`. A `"many"` hint supplies an array with one value per related instance.

All extension points are registered through the `ContentConfiguration` object passed to `resolveContentSources` and `createContentProvider`.

## Transforming content

The pipeline returns raw values: one `ContentItem` per primary instance. The values aren't formatted, and many-cardinality related fields hold arrays. A content transformer turns a descriptor and its items into an intermediate format, `ContentRecords`, that UI components map into their own shape, such as property grid records.

`ContentRecords` holds a list of entries in display order. A `FieldEntry` pairs a field with its raw values, one per item. A `RelatedInstancesEntry` groups the fields of a many-cardinality relationship path by related instance.

**`createDefaultContentTransformer`** covers the common case of showing content of one or more selected instances as a single record set, such as in a property grid. Its transformer:

- Drops fields marked `hidden`.
- Keeps only fields that apply to every item's primary class. Pass `fields: "all"` to keep all fields instead. Content is usually requested with one target per selected class, and each target's related property paths start at its own class, so the same related property is split into one field per class. Such fields are combined into one before filtering, so the property is still kept.
- Unwraps many-cardinality related values when every item reaches at most one related instance. Otherwise it groups them into a `RelatedInstancesEntry`.
- Marks entries as merged when their values differ between the items they apply to.
