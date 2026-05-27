# TS Content Rewrite

## Goal

Replace the native-backed presentation content pipeline with a pure TypeScript implementation that:

- Keeps the same conceptual model (target → sources → descriptor → values) but makes each stage independently extensible.
- Allows consumers to participate at well-defined points (descriptor shaping, query augmentation, result transformation) without needing to understand the full pipeline.
- Separates "what fields exist" from "how values are loaded" so that cheap operations (size, keys) never pay the cost of property resolution.

---

## Core Concepts

### Content target

The starting point for a content request, scoped to a **single EC class**. Answers the question: "what am I getting properties _for_?"

A content target specifies:

- The **EC class** (the primary class whose properties we want).
- Optionally, a set of **instance IDs** of that class (to scope to specific instances rather than all instances of the class).
- Optionally, an **instance filter** (a predicate to further restrict which instances are in scope, beyond explicit IDs).

When a consumer selects multiple instances of _different_ classes, this becomes multiple content targets — one per distinct class. The higher-level consumer API accepts a mixed collection and groups by class internally.

The distinction between "class only" and "class + instance IDs" matters for source resolution: when instance IDs are provided, the system queries only those specific instances to determine which relationship paths are relevant (e.g., only include a path to an aspect class if at least one of the specified instances actually _has_ an aspect of that class). Without instance IDs, the system must query all instances of the target class to discover which related classes exist in the data.

### Relationship path

This concept is already defined as `RelationshipPath` in the `@itwin/presentation-shared` package (see `RelationshipPathStep` in `packages/shared/src/shared/Metadata.ts`). In the current codebase, each step specifies the source class, target class, relationship class, and whether the direction is reversed.

A sequence of steps describing how to navigate from one class to another through EC relationships. In the current shared type, each step specifies:

- The relationship class to traverse.
- The direction (forward = source→target, backward = target→source).
- The source and target classes at that step.

For this rewrite, we may want to extend the step shape with optional per-step filters, such as:

- An optional **instance filter** on the relationship class (to restrict which relationship instances are traversed).
- An optional **instance filter** on the target class (to restrict which target instances are reached).

Paths are the fundamental building block for:

- Defining the JOINs in a content source (how to get from the target to related classes).
- Identifying which class a field belongs to (a field carries its path, so the system knows how to JOIN to that class when building the query).

Note: EC relationship classes can themselves have properties. A path step's relationship class is joined as part of the traversal, so fields can be declared against it just like any other class along the path.

A path with zero steps means "same class as the target" (direct properties — no traversal needed, properties come from the target itself).

### Content source

The resolved join shape for a **single content target**. A 1:1 output of source resolution. Contains:

- The **content target** (the primary table — class, optional instance IDs, optional instance filter).
- **Resolved declaration groups** — one group per provider declaration that produced concrete paths during resolution. Each group carries a reference back to the originating provider (`providerId` + `declarationIndex`), allowing Stage 2 to re-fetch the declaration's property specs, cardinality hint, and other metadata without storing them on the cached source.

The content source is purely structural — it records only the expensive-to-compute resolved paths and their provenance. Provider-specific interpretation metadata (property specs, cardinality hints) lives on the provider declarations and is re-derived cheaply in Stage 2 by re-calling providers.

Fields declared against the target class itself require no relationship path (zero-step path — no traversal needed).

A content source defines everything needed to construct the FROM + JOINs of an ECSQL query for one target class. The SELECT clause (which columns) is determined later by Stage 2, which re-calls providers for property specs and reads EC schema metadata to generate fields.

Which relationship paths are included depends on both the target class _and_ the target instance IDs:

- Without instance IDs: paths are determined by querying all instances of the target class to find which related classes actually exist in the data.
- With instance IDs: paths are determined by querying only the specified instances (e.g., only include a path to `ElementUniqueAspect` subclass X if at least one of the given instances actually has an aspect of that class).

In both cases, source resolution requires data queries — it cannot be done from schema metadata alone.

Multiple content sources (from multiple targets) are fed together into descriptor building to produce a unified descriptor.

### Content descriptor

The schema of the content result. Computed _before_ loading any values. Describes _what fields exist_ — it is purely structural and does not carry request-level concerns like sorting, filtering, or paging. Contains:

- The list of **content sources** that were used to compute it (one per target class).
- The full list of fields, organized as a two-level structure:
  - **Direct fields** — property fields and calculated fields that belong to the target class directly (no relationship path).
  - **Related field groups** — containers that group fields loaded via a specific relationship path. Each group carries its relationship path. Groups can nest for multi-step paths. Fields inside a group that have no explicit category are implicitly categorized by the group's target class (its display label becomes the category label). Groups are purely organizational — they carry no value themselves; values in content items are keyed by leaf field ID as usual.

The descriptor is the contract between the "what exists" phase and the "load values" phase. Consumers can inspect and modify it (hide fields, remove fields, override categories) before passing it to value loading. Display ordering of fields is a UI concern handled after the pipeline.

Sorting, filtering, and paging are **request options** passed alongside the descriptor when loading values — they are not part of the descriptor itself. This keeps the descriptor cacheable and reusable across different queries against the same schema.

### Field (property descriptor)

Describes a single data column in the content result. Key attributes:

- **ID** — a stable key that uniquely identifies this field across descriptor rebuilds. Must survive label changes and category moves. Derived from: source class + property name + path (for related), or a stable name for calculated fields.
- **Label** — display name shown to the user.
- **Value type** — primitive type, struct, array, or navigation.
- **Relationship path** — which relationship path this field comes from, and which class along that path the field belongs to. Empty path means the field belongs to the target class directly. The path tells the query builder how to JOIN to the field's class; the class identifies which table the column lives in.
- **Category** — logical grouping for UI display.
- **Flags** — read-only, hidden (still queried but not displayed in UI), etc.

Field kinds:

1. **Property field** — backed by a real EC property. Carries the property's class and name.
2. **SQL calculated field** — carries an ECSQL expression evaluated in the query. The query builder includes it in the SELECT clause; the value comes back from the database like any other column. Can participate in sorting, filtering, and distinct values.

Note: The current system's "related content field" (a field that contains child fields) is replaced by **related field groups** in the descriptor structure (see Content descriptor above). Groups are organizational containers, not fields — they don't have a value type or appear as columns in content items.

### Content values and content item

**Content values (`ContentValues`)** — the raw data for one row of the content result:

- **`primaryKey`** — `{ className, id }` identifying which instance this row represents.
- **`values`** — a map of field ID → raw value. All fields (property, SQL calculated, and external) are populated by the pipeline.

This is a plain data bag — serializable, no behavior, no reference to the descriptor.

**Content item (`ContentItem`)** — an accessor that pairs a descriptor with a `ContentValues` instance, providing ergonomic access, e.g.:

- `getValue(field: Field): unknown` — retrieve a value by field reference.
- `getFieldsByGroup(path): Array<{ field, value }>` — iterate related field groups with field+value pairs.
- Access to `primaryKey` and the underlying `descriptor`.

The pipeline's async iterator yields `ContentItem` instances. Consumers work with `ContentItem`; `ContentValues` is an internal/serialization-level concept (used by external fields providers' `resolve` function, export utilities, etc.).

Not part of the content item:

- **Labels** — handled by a separate labels API. No need to duplicate here.
- **Display values** — formatting is a frontend concern, done from raw values at render time.
- **Merged field names** — property merging (collapsing multiple instances into one record with "varies" markers) is a UI-level concern handled by components that care about it (e.g., property grid), not the content pipeline.

---

## Pipeline

Content is produced through a multi-stage pipeline. Each stage has a clear input/output contract and extension points.

### Stage 1: Source resolution

**Input:** Content target (singular — one class with optional instance IDs and optional instance filter).
**Output:** Content source (target + resolved declaration groups).

This stage:

1. Calls each applicable iModel fields provider, which returns **related properties declarations** — relationship paths (possibly generic, e.g., targeting `ElementAspect` base class) with optional per-step property specifications — and optionally calculated field declarations.
2. Resolves generic paths to **concrete paths** by querying the data. For example, a generic path to `ElementAspect` is expanded into separate paths for each concrete subclass (`MyCustomAspect`, `PhysicalMaterialAspect`, etc.) that actually exists for the target instances.
3. Groups the resolved concrete paths by their originating declaration, recording the provider ID and declaration index for each group.

When instance IDs are provided, resolution queries only those specific instances to narrow the set of concrete paths. Without instance IDs, the system queries all instances of the target class.

The result is one content source — the resolved paths grouped by declaration, with back-references to the originating providers. Property specs and cardinality hints are NOT stored on the content source — they remain on the provider declarations and are re-fetched cheaply in Stage 2.

The higher-level API runs source resolution once per target class and collects the results into a list of content sources for descriptor building.

### Stage 2: Descriptor building

**Input:** Content source[] (one or more content sources, from one or more targets).
**Output:** Content descriptor (unified field list with metadata).

iModel fields providers are called again in this stage (via `getContribution`) to retrieve their full declarations — **related properties declarations** (for property specs and cardinality hints), **calculated field declarations**, and **category definitions**. This call is cheap — providers return static declaration objects without performing data queries. The system uses the `declarationIndex` on each resolved group to look up the originating declaration and apply its property specs and cardinality hint to the concrete paths in that group.

For each resolved declaration group, the system:

1. Looks up the originating declaration (by `providerId` + `declarationIndex`) from the re-called provider contribution.
2. For each concrete path in the group, reads EC schema metadata for the classes along the path.
3. Applies the declaration's property specs — which properties to include/exclude, label overrides, category assignments, etc. If no property specs were provided, all properties from the final step's target class are included by default.
4. Generates field objects with full metadata (ID, label, type, path, category, flags).

Additionally, calculated field declarations from providers are collected and turned into field objects, and any registered external fields providers contribute their declared fields to the descriptor at this point.

Descriptor transformers then run to apply further customizations (hide fields, override categories, etc.).

**Provider property specs vs. descriptor transformers:** Both can customize field metadata (labels, categories, display flags), but they serve different purposes:

- **Provider property specs** are **local** — they express knowledge intrinsic to the path being declared. The provider knows the domain semantics of its path and sets initial metadata accordingly (e.g., "call `UserLabel` → `Name`", or define a `source_information` category and assign properties to it). This metadata is always appropriate when this path is included. Categories are defined as lightweight objects (`{ id, label, description? }`) at the provider contribution level — this is domain knowledge, not UI layout.
- **Descriptor transformers** are **global** — they see the full field list across all providers and make cross-cutting decisions that no single provider could make (e.g., "hide all read-only fields", "move all `BisCore` fields to a System category").

Provider specs are applied first (the system uses them during field generation to set initial metadata), then transformers run second (after all fields are collected). If a transformer overrides metadata that was set by a provider spec, the transformer wins — it has full context.

### Stage 3: Query building

**Input:** Content descriptor (possibly modified by the consumer or by descriptor transformers).
**Output:** ECSQL query (or queries).

This stage translates the descriptor into one or more ECSQL queries. It selects columns for all fields present in the descriptor, including hidden ones (hidden fields are still queried — their values exist in content items but are flagged for UI to skip). Only fields that have been **removed** from the descriptor entirely are not queried. SQL calculated fields carry their ECSQL expression as metadata — the query builder includes that expression in the SELECT clause like any other column. Query filterers can inject additional WHERE clauses or JOINs at this point.

### Stage 4: Value loading

**Input:** Built query + request options (sorting, filtering, paging).
**Output:** `AsyncIterable<ContentItem>` (descriptor-aware accessors wrapping raw values).

Executes the ECSQL and materializes rows into content items. The value loader maps query result columns to fields using the descriptor's field structure. After SQL-backed fields are populated, the pipeline calls any registered **external fields providers** in bulk with the page of items — they read existing field values (e.g., an external ID) and populate their declared fields with data fetched from external sources.

**Not all stages run for every request:**

- `getSize` only needs Stage 1 (for the join shape) + a simplified query build (COUNT over the join shape — no descriptor or field enumeration needed).
- `getInstanceKeys` only needs Stage 1 + a simplified query build (SELECT keys from the join shape — no descriptor needed).
- `getDescriptor` only needs stages 1–2.
- `getDistinctValues` needs a simplified query build from a single field's metadata (the field already carries its path and class — combined with the content target, that's enough to build the DISTINCT query directly). Returns raw values; a consumer utility groups them by formatted display string (see Key Design Decisions context in resolved Open Questions #8).
- `getItems` runs stages 1–4.

The pipeline ends at raw content items. Any post-processing (formatting, merging, label resolution) is the consumer’s responsibility, aided by composable utility functions (see Consumer Utilities below).

### Example: pipeline walkthrough

Suppose the consumer selects a single `Pump` element (class `ProcessPhysical:Pump`, instance ID `0x3a`).

**Stage 1 — Source resolution:**

```
Input:  ContentTarget { class: "ProcessPhysical:Pump", instanceIds: ["0x3a"] }

iModel fields provider ("pump-fields_v1") returns:
  relatedProperties: [
    {                                                         // declaration index 0
      path: [Pump → PumpType via TypeDefinition],
      properties: [{ stepIndex: 0, target: { select: { include: ["Manufacturer", "Model"] },
                                             overrides: { "Model": { label: "Type Model" } } } }],
      cardinalityHint: "one"
    }
    { path: [Pump → ElementAspect (generic)] }               // declaration index 1
  ]
  calculatedFields: [
    { id: "flowRate_gpm", expression: "this.FlowRate * 15850.3", label: "Flow Rate (GPM)" }
  ]

System resolves generic paths by querying instance 0x3a:
  Declaration 0: [Pump → PumpType] already concrete → [Pump → PumpType]
  Declaration 1: [Pump → ElementAspect] resolves to → [Pump → OperatingParametersAspect]

Output: ContentSource {
  target: { class: "ProcessPhysical:Pump", instanceIds: ["0x3a"] }
  resolvedDeclarations: [
    { providerId: "pump-fields_v1", declarationIndex: 0, concretePaths: [[Pump → PumpType]] }
    { providerId: "pump-fields_v1", declarationIndex: 1, concretePaths: [[Pump → OperatingParametersAspect]] }
  ]
}

(Property specs, cardinality hints, and calculated fields are NOT stored on ContentSource —
they are re-derived cheaply by re-calling the provider in Stage 2.)
```

**Stage 2 — Descriptor building:**

```
Input:  ContentSource (from above)

System re-calls provider "pump-fields_v1" to get declarations (cheap — no data queries):
  → relatedProperties[0]: properties = [{ stepIndex: 0, target: { select: { include: ["Manufacturer", "Model"] },
                                                                   overrides: { "Model": { label: "Type Model" } } } }]
                           cardinalityHint = "one"
  → relatedProperties[1]: properties = undefined (default: all properties from final step)
  → calculatedFields: [{ id: "flowRate_gpm", ... }]

Processing resolvedDeclarations[0] (concretePaths: [[Pump → PumpType]]):
  - Looks up declaration at index 0 → has property spec for step 0
  - Reads EC metadata for PumpType: has properties [Manufacturer, Model, Weight, Material, ...]
  - Applies spec: select = { include: ["Manufacturer", "Model"] } → only those two
  - Applies override: "Model" label → "Type Model"
  - cardinalityHint = "one" → values inlined (no array nesting)

Processing resolvedDeclarations[1] (concretePaths: [[Pump → OperatingParametersAspect]]):
  - Looks up declaration at index 1 → no property spec (default)
  - Default behavior: all properties from final step's target class
  - Reads EC metadata for OperatingParametersAspect: [MaxPressure, MaxTemp]
  - All properties included with default labels

Additionally, a registered external fields provider contributes IoT sensor fields:
  ExternalFieldsProvider {
    categories: [
      { id: "iot_sensors", label: "IoT Sensors" }
    ]
    fields: [
      { id: "iot.currentFlow", label: "Current Flow (GPM)", type: double, categoryId: "iot_sensors" }
      { id: "iot.lastMaintenance", label: "Last Maintenance", type: dateTime, categoryId: "iot_sensors" }
    ]
    inputs: {
      pumpName: { className: "ProcessPhysical:Pump", propertyName: "Name" }
    }
    getValues: async ({ items }) => {
      const names = items.map(i => i.inputValues.pumpName);
      const data = await fetchFromIoTService(names);
      return items.map((_, i) => ({
        "iot.currentFlow": data[i].flow,
        "iot.lastMaintenance": data[i].lastMaintenance,
      }));
    }
  }

Final field list:

  Direct fields (from Pump):
    - "Pump.Name"         (string)
    - "Pump.FlowRate"     (double)
    - "flowRate_gpm"      (double, SQL calculated)

  Related field group [→ PumpType]:
    - "PumpType.Manufacturer"  (string)
    - "PumpType.Model"         (string, label: "Type Model")  ← label override from spec

  Related field group [→ OperatingParametersAspect]:
    - "OperatingParametersAspect.MaxPressure"  (double)
    - "OperatingParametersAspect.MaxTemp"      (double)

  External fields:
    - "iot.currentFlow"       (double, external)
    - "iot.lastMaintenance"   (dateTime, external)

  Input resolution:
    - "pumpName" input → matches existing field "Pump.Name" → pinned (stays visible)
    - (If no matching field existed, pipeline would add it as hidden)

Descriptor transformer runs (e.g., "hide all read-only fields"):
  - "Pump.FlowRate" is marked read-only in EC metadata → transformer hides it
  - All other fields remain visible

Output: ContentDescriptor { fields: [9 fields, "Pump.FlowRate" hidden], sources: [...] }
```

**Stage 3 — Query building:**

```
Input:  ContentDescriptor + request options (no filter, sort by Pump.Name ASC, page size 100)

Note: external fields are NOT part of the ECSQL query — they have no SQL expression.
      Only iModel-backed fields (property + SQL calculated) are queried.
      Hidden fields ("Pump.FlowRate") ARE still queried — hidden ≠ removed.

Query filterer runs (e.g., spatial filter — only elements in building zone A):
  - Injects: WHERE ... AND pump.ECInstanceId IN (SELECT SourceId FROM ...)

Output (simplified ECSQL):
  SELECT
    pump.$,
    pumpType.$,
    aspect.$,
    (pump.FlowRate * 15850.3) AS [flowRate_gpm]
  FROM ProcessPhysical.Pump pump
  JOIN ProcessPhysical.PumpType pumpType ON ...
  JOIN ProcessPhysical.OperatingParametersAspect aspect ON ...
  WHERE pump.ECInstanceId = 0x3a
    AND pump.ECInstanceId IN (SELECT SourceId FROM ...)   ← from query filterer
  ORDER BY pump.Name ASC
```

**Stage 4 — Value loading:**

```
Input:  Built query + paging cursor

Query returns 1 row. Value loader maps columns to iModel fields.
Then pipeline calls external fields provider's getValues({ items }):
  - Each item has inputValues.pumpName = "Main Circulation Pump"
  - Provider fetches sensor data from IoT service using pump names
  - Returns [{ "iot.currentFlow": 187.3, "iot.lastMaintenance": "2026-04-22T08:00:00Z" }]
  - Pipeline merges external values into the content item

Output: ContentValues {
  primaryKey: { className: "ProcessPhysical:Pump", id: "0x3a" },
  values: {
    "Pump.Name":              "Main Circulation Pump",
    "Pump.FlowRate":          12.5,
    "flowRate_gpm":           198131.25,
    "PumpType.Manufacturer":  "Siemens",
    "PumpType.Model":         "CR 95-3",
    "OperatingParametersAspect.MaxPressure": 25.0,
    "OperatingParametersAspect.MaxTemp":     180.0,
    "iot.currentFlow":        187.3,
    "iot.lastMaintenance":    "2026-04-22T08:00:00Z",
  }
}

The consumer iterates ContentItem accessors (descriptor + ContentValues),
which expose typed value access per field.
```

---

## Extension Points

### iModel fields provider

Responsible for contributing fields for a given target. A provider is called once during source resolution (Stage 1) and returns a **fields provider contribution** — a combination of related properties declarations, calculated field declarations, and category definitions.

Each provider:

- Has a stable **`id`** (format: `${string}_v${number}`, e.g., `"presentation-rules_v3"`, `"my-aspects_v1"`). The version suffix must be incremented whenever the provider's implementation changes (different paths, specs, etc.). This ID is used as part of the content source cache key.
- Specifies which content targets it handles (by class, by schema, by all, etc.).
- Returns a contribution containing:
  - **Related properties declarations** (optional) — each one describes a relationship path to navigate and which properties to load from the classes along it.
  - **Calculated field declarations** (optional) — fields whose values are ECSQL expressions (e.g., arithmetic on schema properties, string concatenation, CASE expressions).
  - **Category definitions** (optional) — lightweight metadata objects (`{ id, label, description? }`) that group properties for display. Both related properties specs and calculated fields reference categories by ID. Categories are domain metadata ("these aspect properties belong in a Source Information group"), not UI layout.

Each related properties declaration consists of:

- A **relationship path** (possibly generic — e.g., targeting a base class like `ElementAspect`).
- Optional **per-step property specifications** — at each step in the path, the provider can specify which properties to include from the **target class** and/or the **relationship class** at that step. This includes include/exclude lists, label overrides, display flags, etc.

**Default behavior (common case):** A related properties declaration with no property specs means "take all properties from the final step's target class." No properties are taken from intermediate target classes or relationship classes along the path.

**Custom behavior:** The provider annotates specific steps with property specs to control which properties are loaded. This allows:

- Taking properties from **intermediate classes** in a multi-step path (not just the final target).
- Taking properties from **relationship classes** (EC relationships can have their own properties).
- Excluding a step's target entirely (`select: "none"`) while continuing navigation to further steps.
- Overriding labels and display flags for specific properties.
- Assigning properties to provider-defined categories.

**Provider contribution shape:**

```ts
interface FieldsProviderContribution {
  relatedProperties?: RelatedPropertiesDeclaration[];
  calculatedFields?: CalculatedFieldDeclaration[];
  categories?: Record<string, CategoryDefinition>; // keyed by category ID, referenced by both relatedProperties and calculatedFields
}

interface CalculatedFieldDeclaration {
  id: string; // stable ID
  label: string;
  expression: string; // ECSQL expression
  type: FieldType;
  categoryId?: string; // references a CategoryDefinition.id
}

interface RelatedPropertiesDeclaration {
  path: RelationshipPath;
  properties?: StepPropertySpec[]; // sparse — only steps needing customization
  cardinalityHint?: "one" | "many";
}

interface StepPropertySpec {
  stepIndex: number; // 0-based position in the path
  target?: ClassPropertySpec; // properties from the target class at this step
  relationship?: ClassPropertySpec; // properties from the relationship class at this step
}

interface ClassPropertySpec {
  select?: "all" | "none" | { include: string[] } | { exclude: string[] };
  overrides?: Record<string, PropertyOverrides>; // keyed by property name
}

interface PropertyOverrides {
  label?: string;
  categoryId?: string; // references a CategoryDefinition.id
  readOnly?: boolean;
}
```

Design notes:

- **`properties` is sparse** — only list steps that need customization. Steps without a spec use defaults: final step = `"all"`, earlier steps = `"none"`.
- **`select` and `overrides` are orthogonal.** `select: "all"` + an override on one property means "include everything, but tweak this one." `select: { include: [...] }` + overrides means "only these properties, and tweak some."
- **`include` and `exclude` are mutually exclusive** on `select`. `include` = only these; `exclude` = all except these.
- **`target` vs `relationship`** are separate because each step involves two classes. Most providers only need `target`.

**Possible future syntactic sugar:**

- Allow a bare `RelationshipPath` as a related properties declaration (union type) — equivalent to `{ path: myPath }` with no specs.
- When the path is a single step, allow specifying it as a step object rather than a 1-element array — avoids the `[{ ... }]` wrapper for the most common case.

These shorthands can be added later without breaking the canonical object form.

**Resolution flow:** The system takes the provider's (possibly generic) related properties declarations, resolves them to concrete classes by querying the data (Stage 1), and stores the concrete paths grouped by declaration (with back-references to the provider). In Stage 2, the provider is called again (cheap — no data queries) to re-fetch the declaration's property specs, which are then applied to the concrete paths when enumerating fields from EC schema metadata.

**Provider-controlled resolution:** A provider can optionally supply a `resolve` callback on a related properties declaration. When present, the system delegates resolution of that path to the callback instead of using its default discovery logic. The callback receives the iModel accessor (for running ECSQL queries) and the content target, and returns concrete paths. This lets providers that know the most efficient query for their domain avoid the system's generic resolution query.

```ts
interface RelatedPropertiesDeclaration {
  path: RelationshipPath;
  resolve?: (iModel: IModelAccess, target: ContentTarget) => Promise<RelationshipPath[]>;
  // ... other fields as before
}
```

- If `resolve` is provided, the system calls it and uses the returned concrete paths (grouped under this declaration in the content source).
- If `resolve` is omitted, the system resolves the path using its default ECSQL-based discovery.
- The callback is expected to return only paths to concrete classes that actually have data for the target — same contract as the default resolver, just a different (provider-optimized) implementation.
- In both cases, the declaration's property specs and cardinality hint remain on the declaration object (re-fetched in Stage 2) — they are not stored on the content source.

Multiple providers can contribute to the same request. Their contributions are _additive_ — related properties declarations from all applicable providers are collected and their resulting fields are merged into a single descriptor.

**Conflict resolution:** If two providers' declarations produce the same field (same source class + property name + path), they are deduplicated. If they produce conflicting metadata (e.g., different categories), the provider with higher priority wins.

**Provider priority:** Providers are registered with a numeric priority. Higher priority wins on metadata conflicts for deduplicated fields. The built-in iModel fields provider has a default priority; custom providers can be registered above or below it.

**Built-in provider:** An "iModel fields provider" implementation that reads presentation rules from the iModel's ECSchemas and content modifier rules to determine available paths, property specs, and calculated properties.

Inspiration: [RelatedPropertiesSpecification](https://www.itwinjs.org/presentation/content/relatedpropertiesspecification/), [CalculatedPropertiesSpecification](https://www.itwinjs.org/presentation/content/calculatedpropertiesspecification/).

### Descriptor transformer

Modifies the descriptor _after_ all providers have contributed their fields. Use cases:

- Hiding specific fields based on user preferences or component needs.
- Overriding field labels, categories, priorities.
- Cross-provider decisions that no single provider can make (e.g., "move all `BisCore` fields to a System category").

Multiple transformers run sequentially in priority order. Each receives the descriptor as modified by previous transformers.

**Rule:** Transformers may hide, remove, or modify field metadata. They must not change field ID (the stable key). They do not add new fields — field contribution is the iModel fields provider's (or external fields provider's) responsibility. They do not reorder fields — display order is a UI concern handled by consumers after the pipeline.

Inspiration: [PropertySpecification](https://www.itwinjs.org/presentation/content/propertyspecification/), [PropertyCategorySpecification](https://www.itwinjs.org/presentation/content/propertycategoryspecification/).

### Query filterer

Modifies the built ECSQL query before execution. Query filterers have a single, narrow purpose: **injecting additional WHERE clauses** (and any JOINs needed by those WHERE clauses). They do not add SELECT columns.

Use cases:

- Spatial filtering (e.g., only include elements within a bounding box).
- App-specific business logic filters that apply across all content requests.

**Rule:** Query filterers must not add or remove SELECT columns. They may only add WHERE clauses and JOINs needed to support those clauses.

Computed columns are handled differently: **SQL calculated fields** (declared by a provider) carry their ECSQL expression as metadata. The query builder includes those expressions in the SELECT clause, and the value loader reads them like any other field. This keeps the invariant that every column in the query corresponds to a field in the descriptor.

### External fields provider

A self-contained extension that both declares new fields and populates them with data from outside the iModel. A single registration covers the full lifecycle — no separate transformer needed.

An external fields provider declares:

- **Output fields** — field declarations (ID, label, type, category, etc.) that the provider will populate. The pipeline adds these to the descriptor during Stage 2.
- **Input dependencies** (optional) — a static record of property declarations specifying the iModel properties the provider needs as input data for its `getValues` function. Each entry declares the property by class name, property name, and optional relationship path. The keys of the record become the typed accessor names available in `items[].inputValues` within `getValues`. The pipeline ensures each declared property is queried and its value is pre-extracted into `inputValues` for each item in the batch.
- **Value population function (`getValues`)** — receives a batch of items (with pre-extracted `inputValues`) after SQL-backed fields are populated, and returns output field values for each item.

**Why static declarations instead of a dynamic callback:**

The plan originally proposed `inputs?: (descriptor: Descriptor) => string[]` — a callback that receives the finalized descriptor and returns field ID strings. This was rejected because:

1. **External fields providers cannot know what fields exist** — The descriptor's field set depends on which iModel fields providers are registered and what schema the iModel has. An external provider has no way to predict field IDs at registration time, and making it search the descriptor by class + property + path is fragile (what if the field isn't there?).
2. **Static declarations are self-describing** — The provider declares exactly what it needs (`className`, `propertyName`, `path?`). The pipeline takes responsibility for ensuring the property is queried — either by finding an existing field that matches, or by adding a hidden field. The provider never needs to "find" anything in the descriptor.
3. **Type safety** — Static declarations enable compile-time type inference. The record keys become the typed `inputValues` accessor names in `getValues`, so TypeScript catches typos and missing inputs at compile time. A dynamic callback returning `string[]` provides no such guarantee.
4. **Decouples from field ID encoding** — Field IDs are an internal encoding concern (class + property + path hash, etc.). Static declarations use semantic coordinates (class name + property name + path) — stable, readable, and independent of ID encoding strategy.

```ts
interface ExternalFieldsProvider<TInputKeys, TOutputFieldIds> {
  // Descriptor contribution (applied during Stage 2)
  fields: ExternalFieldDeclaration<TOutputFieldIds>[]; // fields this provider will populate
  categories?: Record<string, CategoryDefinition>;

  // Input declarations (static — evaluated by pipeline during Stage 2)
  inputs?: { [K in TInputKeys]: InputPropertyDeclaration };

  // Value population (called during Stage 4)
  getValues(props: {
    items: Array<{ inputValues: { [K in TInputKeys]: Value } }>;
  }): Promise<Array<{ [F in TOutputFieldIds]: Value }>>;
}

interface InputPropertyDeclaration {
  className: EC.FullClassName; // class that owns the property
  propertyName: string; // the EC property name
  path?: RelationshipPath; // path from target to property's class (omit for direct)
}
```

**Input field visibility rule:** For each declared input property, the pipeline checks whether a matching field already exists in the descriptor (same class + property + path). If yes, it pins the field (prevents removal by transformers). If no, it adds the property as a hidden field (queried but not displayed). The provider never observes the descriptor directly — it just declares what it needs and the pipeline handles the rest.

External fields providers run during Stage 4, after query execution but before items are emitted to the consumer. They enable external data to be first-class in the descriptor — their declared fields appear in the field list, carry categories and metadata, and can be hidden/shown like any other field.

**Constraints:**

- External fields cannot participate in SQL-level sorting, filtering, or distinct values (their data doesn't exist in the query).
- External fields providers must not modify fields they don't own.

**Example:** An external fields provider declares `inputs: { externalId: { className: "BisCore:Element", propertyName: "CodeValue" } }`. It declares `fields: [{ id: "externalName", ... }, { id: "externalStatus", ... }]`. Since no iModel fields provider independently declared `CodeValue`, the pipeline adds it as a hidden field (queried but not displayed). During Stage 4, the provider's `getValues` function reads `item.inputValues.externalId` from each item, calls an external service once with all values, and returns `externalName` and `externalStatus` for each item in the batch.

### Registration and ordering

All extension points — iModel fields providers, descriptor transformers, query filterers, and external fields providers — are registered on the pipeline instance with a numeric priority. The pipeline calls them in priority order (iModel fields providers are collected additively, transformers and filterers run sequentially, external fields providers contribute fields during Stage 2 and run their resolve function in order during Stage 4). This registration mechanism is intentionally left unspecified at the conceptual level — concrete API design will define the exact registration surface.

### Consumer utilities

The pipeline outputs raw content items and stops. Post-processing is not a pipeline stage — it’s the consumer’s responsibility. The system provides composable utility functions that consumers can chain as needed:

- **`map`** (per-item transformation) — transform a single content item independently. Use cases: formatting raw values into display strings, computing derived values, resolving display labels.
- **`reduce`** (cross-item aggregation) — accumulate across multiple content items to produce a combined result. Use cases: merging multi-instance rows into one record with “varies” markers, computing aggregates.

Consumers compose these based on their needs:

- **Property grid:** `items → map(format) → reduce(merge)` — format values, then merge multiple instances into one record.
- **Table/export:** `items → map(format)` — format values, no merging.
- **Size/keys queries:** no utilities needed — the pipeline doesn’t even produce content items.

This keeps the pipeline simple (it only deals with raw data) and gives consumers full control over what transformations they apply and in what order.

---

## Key Design Decisions

### Descriptor is the contract boundary

The descriptor is the single artifact that flows between "what exists" and "load values". This means:

- Consumers can cache descriptors independently from values.
- The same descriptor can be used for multiple value requests (different pages, different sort orders, different filters).
- Cheap operations (size, keys) only need the content sources (stored on the descriptor), not the full field list.
- Consumers can modify the descriptor (hide fields, remove fields) and the value loader will respect those changes. Hidden fields are still queried (values available programmatically); removed fields are not queried (no column, no value).

### Descriptor caching

The expensive work in building a descriptor is **path resolution (Stage 1)** — ECSQL queries against the iModel to resolve generic paths to concrete ones. This can take tens of seconds. Stage 2 (field enumeration from EC metadata) is fast — schema metadata is already loaded in memory.

**What to cache:** Only the **content sources** — the output of Stage 1 (resolved declaration groups with concrete paths per target). Property specs, cardinality hints, calculated fields, and categories are NOT cached — they are re-derived cheaply by re-calling providers in Stage 2. The descriptor itself is not cached.

**Why cache only Stage 1:** Stage 2 is cheap (re-call providers for declarations + in-memory metadata reads), so re-running it from cached sources adds negligible cost. This avoids all complexity around "restoring" a descriptor:

- No partial re-application of external fields.
- No "delta" transformer pass.
- Transformers, external fields providers, and iModel field metadata all run fresh and uniformly on every descriptor build.

**Cache persistence:** The cache is persistent across sessions (disk-backed).

**Restore flow:**

1. Deserialize cached content sources (resolved declaration groups with concrete paths + provider/declaration references).
2. Run Stage 2 fresh — re-call providers for property specs/cardinality/calculated fields/categories, enumerate fields from EC schema metadata, append external fields, call `inputs`, run transformers.
3. Descriptor is ready for Stage 3/4.

**Cache key:** `(content target, iModel data version, sorted iModel fields provider ID set)`.

- **Content target** — the full content target as provided by the consumer (class, optional instance IDs, optional instance filter). Different targets produce different cache entries.
- **iModel data version** — changeset ID or a monotonic counter incremented on write transactions. Path resolution depends on actual relationship instances (e.g., associating a new aspect to an element adds fields), not just schema structure.
- **Sorted provider ID set** — each iModel fields provider has a stable `id` (format: `${string}_v${number}`). The version suffix is bumped when the provider's implementation changes, causing a natural cache miss without explicit invalidation logic.

**Cache invalidation:** A cache entry is invalid when any component of its key no longer matches the current state:

- iModel data changes (changeset applied, write transaction) → data version advances → miss on all prior entries.
- Provider implementation changes → provider bumps its version suffix → different ID set → miss.
- Provider added or removed → different ID set → miss.
- Transformer and external fields provider changes do **not** invalidate the cache — they run fresh on every descriptor build.

### Providers are additive, transformers are sequential

This avoids the need for complex conflict resolution:

- Multiple providers can contribute fields without knowing about each other.
- Transformers have full visibility of the accumulated descriptor and can make cross-cutting decisions.

### Formatting is a frontend concern

The content pipeline returns raw values only. Formatting (converting raw values to display strings) is done on the frontend by consumers. This means:

- The backend pipeline is simpler — no formatting logic or locale handling.
- Export use cases (CSV, JSON) consume raw values directly.
- UI components format values using their own formatting utilities (e.g., quantity formatters, date formatters) at render time.

### Renderer and editor selection is a view-model concern

The pipeline field describes _what_ the data is (type, ID, category); it does not carry renderer or editor hints. Consumers decide _how_ to render or edit values based on their own configuration (type-based defaults, class + property mappings, explicit overrides in UI component props, etc.). This keeps the field data model purely about data semantics and avoids coupling the pipeline to any particular UI framework or rendering strategy.

### No pipeline-level computed fields

We considered a third field kind — "computed fields" — that would carry a TS function evaluated per-item during value loading. This was rejected because it doesn't fill a gap that isn't already covered:

- **Anything expressible in ECSQL** → use an SQL calculated field (participates in sorting/filtering).
- **Per-item value derivation from raw values** → use the consumer `map` utility (parsing, reformatting, combining fields). This is the consumer's responsibility, same as formatting.
- **External data from APIs/services** → use an external fields provider (bulk async fetches, not per-item sync derivation). See "External fields provider" in Extension Points.

Keeping computed fields out of the pipeline simplifies the field model (only two kinds: property fields and SQL calculated fields), eliminates ambiguity about what can participate in SQL operations, and keeps Stage 4 simple (pure query result materialization, no TS function evaluation).

### Related content loading strategy depends on cardinality

For **1:1 relationships** (e.g., element → unique aspect, element → type definition), JOINing into the main query is straightforward — related properties appear as extra columns with no row duplication.

For **1:many relationships** (e.g., element → multi aspects of the same class), naive JOINing causes row explosion — if an element has 1000 aspects, the JOIN produces 1000 rows, each duplicating all element properties. The loading strategy for 1:many needs careful consideration (see Implementation Notes).

**Cardinality cannot be trusted from the schema alone.** EC relationship definitions frequently declare `many-to-many` even when the actual data invariant is `1:1` (e.g., `ElementOwnsUniqueAspect` is declared `(1:N)` but each element has at most one unique aspect per class). Therefore:

- **Providers can supply a cardinality hint** on their related properties declarations (e.g., "this step is always 1:1 in practice"). The system trusts the hint and uses it to choose the loading strategy.
- **For paths without hints**, the system can determine effective cardinality during path resolution (Stage 1) — the same query that resolves concrete classes can also check whether any primary instance has more than one related instance along the path. This is a data-driven check, not a schema-driven one.

### Multi-target behavior

When the consumer provides instances of multiple different classes, the system creates multiple content targets (one per class), resolves one content source per target, and feeds them all into descriptor building. The result:

- The descriptor is the **union** of all fields across all content sources/targets.
- Each content item represents one primary instance — one row per instance.
- Fields that don't apply to a given instance's class have `undefined` values (not errors).
- Each field carries metadata about which content source(s) it belongs to.

Merging (collapsing multiple instances into one record, marking conflicting values as "varies") is not part of this API. It is a consumer-level concern — components like the property grid perform merging on their own from the per-instance content items.

**Example:** Consumer selects a `Pump` (0x3a) and a `Valve` (0x4b):

```
Targets:
  ContentTarget { class: "ProcessPhysical:Pump", instanceIds: ["0x3a"] }
  ContentTarget { class: "ProcessPhysical:Valve", instanceIds: ["0x4b"] }

Stage 1 resolves each independently:
  ContentSource for Pump → paths: [Pump → PumpType, Pump → OperatingParametersAspect]
  ContentSource for Valve → paths: [Valve → ValveType]

Stage 2 builds a unified descriptor (union of all fields):
  - "Element.Name"              (string)  ← shared (both Pump and Valve inherit from Element)
  - "Pump.FlowRate"             (double)  ← Pump only
  - "PumpType.Manufacturer"     (string)  ← Pump only
  - "OperatingParametersAspect.MaxPressure" (double) ← Pump only
  - "Valve.NominalDiameter"     (double)  ← Valve only
  - "ValveType.ConnectionType"  (string)  ← Valve only

Stage 3 builds two queries (one per content source) selecting columns for all
fields in the descriptor. Non-applicable columns SELECT NULL.

Stage 4 executes the queries and produces two ContentValues:
  ContentValues (Pump 0x3a):
    {
      primaryKey: { className: "ProcessPhysical:Pump", id: "0x3a" },
      values: {
        "Element.Name":                           "Main Circulation Pump",
        "Pump.FlowRate":                          12.5,
        "PumpType.Manufacturer":                  "Siemens",
        "OperatingParametersAspect.MaxPressure":  25.0,
        "Valve.NominalDiameter":                  undefined,  ← not applicable
        "ValveType.ConnectionType":               undefined,  ← not applicable
      }
    }

  ContentValues (Valve 0x4b):
    {
      primaryKey: { className: "ProcessPhysical:Valve", id: "0x4b" },
      values: {
        "Element.Name":                           "Inlet Valve",
        "Pump.FlowRate":                          undefined,  ← not applicable
        "PumpType.Manufacturer":                  undefined,  ← not applicable
        "OperatingParametersAspect.MaxPressure":  undefined,  ← not applicable
        "Valve.NominalDiameter":                  150.0,
        "ValveType.ConnectionType":               "Flanged",
      }
    }

The consumer iterates ContentItem accessors (descriptor + ContentValues), which expose typed value access per field.
```

### Field ID must be stable

A field's ID must not change when:

- Its label is overridden by a transformer.
- Its category is moved.
- The descriptor is rebuilt after a schema change (as long as the underlying property still exists).

The ID is derived from: `sourceClassName + propertyAccessPath` for schema properties, or a declared stable name for calculated fields.

When using the ECSQL `$` selector (which returns all properties as a JSON blob), values are keyed by property name within the blob. The query builder assigns a deterministic alias to each JOINed table that encodes the path and step (e.g., `p0_s1` = path 0, step 1) and selects `alias.$` for each. The value loader uses the column alias to identify which path step the blob belongs to, then uses property names within the JSON to map values to fields. Together, `columnAlias (→ path + step + className) + jsonKey (→ propertyName)` reconstruct the full field ID.

---

## Categories

Categories provide logical grouping of fields for UI display. They form a tree (parent references).

Built-in category assignment:

- Direct properties: no class-based category by default. If a property has a **property category** assigned in the EC schema, that schema category is used directly.
- Related properties: grouped by the related class by default. If a property has a **property category** assigned in the EC schema, that schema category is used as a sub-category under the class-based category. A custom category defined by the provider overrides this.
- Calculated properties: assigned to a category by the provider that declared them.

EC schema property categories can be overridden by property provider specs or descriptor transformers — the same precedence rules apply (provider specs first, transformers win on conflict).

Providers define categories as part of their contribution — each category is a lightweight metadata object (`{ id, label, description? }`). Both related properties specs and calculated field declarations reference categories by ID. Descriptor transformers can reassign fields to different categories, define new categories, or restructure the category tree.

**Cross-provider category sharing:** Categories are deduplicated by ID across all providers (iModel fields providers and external fields providers alike). If multiple providers declare a `CategoryDefinition` with the same `id`, the system treats them as the same category — fields from all those providers end up grouped together. No separate registry or coordination API is needed; providers that want to share a category simply use the same ID (which can be a well-known exported constant). If conflicting metadata (label, description) is declared for the same ID, the higher-priority provider's definition wins.

---

## Display Labels

Labels are handled by a separate API, not by the content pipeline. The existing `createIModelInstanceLabelSelectClauseFactory` provides SQL clause generation for label retrieval and should continue to be used independently.

The content pipeline does not include labels in content items — consumers that need labels alongside property values should call the labels API separately.

---

## Request Options

Request options are passed alongside the descriptor when loading values. They control _how_ to query, not _what fields exist_. The same descriptor can be reused with different request options (e.g., different pages, different sort orders, different filters).

### Sorting

By field ID + direction (ascending/descending). Applied as ORDER BY in the generated query.

### Filtering

Two levels, applied at different stages:

- **Instance filter** — part of the content target definition. Applied during **Stage 1 (source resolution)**. Restricts which primary instances are in scope _before_ discovering relationship paths. This affects which paths and fields end up in the descriptor (e.g., if only wall elements pass the filter, only aspect classes that exist on walls are discovered). Changing the instance filter invalidates the descriptor — it must be rebuilt.
- **Value filter** — a request option applied during **Stage 3 (query building)**. Adds a WHERE clause to the final query. Does not affect which fields exist in the descriptor — only which rows are returned. The descriptor remains valid across different value filters.

Distinct values (for filter dropdowns) are a specialized query that groups by one field and returns unique values.

### Paging

Applies to the final content items (after joins, after related content resolution). Does _not_ page at the source-instance level.

The pipeline exposes an **async iterator** — consumers `for await` over content items without managing pages. Internally, the pipeline pages using efficient cursor-based strategies (e.g., keyset pagination rather than `OFFSET`), fetching the next batch transparently when the iterator advances past the current page.

- Total count available via `getSize` (same descriptor + same filters, count query).
- Paging is orthogonal to sorting — the consumer specifies both on the same request.

---

## Open Questions

1. ~~**Calculated fields at query vs. post-processing level:**~~ **Resolved.** Only **SQL calculated fields** exist as a pipeline-level concept (ECSQL expression, evaluated in query, participates in sorting/filtering). Per-item value derivation from already-loaded data is handled by consumer utilities (`map`). See "No pipeline-level computed fields" in Key Design Decisions.

2. ~~**Descriptor caching and invalidation:**~~ **Resolved.** Consumer's responsibility. The pipeline does not track descriptor staleness or versioning — consumers decide when to rebuild (e.g., after schema changes or user actions).

3. ~~**Streaming vs. paging for large result sets:**~~ **Resolved.** The pipeline exposes an async iterator to consumers. Internally, it pages using efficient cursor-based strategies (e.g., keyset pagination rather than `OFFSET`) hidden behind the iterator. Consumers simply `for await` over content items without worrying about page boundaries or paging strategy.

4. ~~**Cross-iModel content:**~~ **Resolved.** No need identified. The pipeline targets a single iModel. Consumers that need data from multiple iModels can run separate pipelines and combine results themselves.

5. ~~**Undo/redo interaction:**~~ **Resolved.** Consumer's responsibility. The pipeline treats the descriptor as an opaque input — it does not track modification history or support undo.

6. ~~**External value sources (non-iModel data):**~~ **Resolved.** Two-phase loading with **external fields providers**. After ECSQL materializes rows, registered external fields providers are called in bulk with the page of items. Each provider declares which fields it populates, reads input values from existing (potentially hidden) fields, calls external services in batch, and fills in its fields. This keeps external data first-class in the descriptor while keeping the pipeline in control of value population. See "External fields provider" in Extension Points.

7. ~~**1:many related content loading strategy:**~~ Moved to Implementation Notes — this is an internal implementation concern, not an API design question.

8. ~~**Distinct values: raw vs. formatted:**~~ **Resolved.** `getDistinctValues` returns raw values only (consistent with "formatting is a frontend concern"). A reduce-like consumer utility accepts a formatter function and collapses the raw values into a `Map<formattedValue, rawValue[]>` — grouping raw values that format to the same display string. This keeps deduplication logic out of the pipeline while giving consumers a one-liner for the common "filter dropdown" use case.

9. ~~**SQLite/ECSQL query limits:**~~ Moved to Implementation Notes — this is an internal implementation concern, not an API design question.

---

## Implementation Notes

These are internal implementation concerns — they don't affect the consumer-facing API but need to be resolved during development.

### 1:many related content loading strategy

For 1:1 relationships, JOINing into the main query is fine. For 1:many, naive JOINs cause row explosion. Options:

- **A) Separate queries + stitch:** Run a separate query per 1:many path, keyed by primary instance ID. Stitch results into content items during value loading. Clean separation, but multiple round-trips and complexity in Stage 4.
- **B) `GROUP_CONCAT` / aggregation in SQL:** Use SQLite's `GROUP_CONCAT` (or `json_group_array`) to aggregate 1:many values into a single column per row. Single query, no row explosion, but parsing aggregated values adds complexity and there may be limits on column size.
- **C) Hybrid:** Use aggregation for small cardinalities and separate queries for large ones, with a threshold.

Need to evaluate trade-offs around query count, parsing complexity, paging interaction, and typical cardinalities in real iModels.

### SQLite/ECSQL query limits

SQLite imposes hard limits that directly constrain the queries this pipeline can generate. The most relevant ones:

- **64 tables in a JOIN** (hard limit, cannot be raised) — each relationship path step adds at least one JOIN. A content source with many related classes can exhaust this quickly.
- **2000 columns in a SELECT** (default `SQLITE_MAX_COLUMN`) — wide schemas with many properties per class can hit this, especially when multiple paths are JOINed into one query.
- **500 compound SELECT terms** (default `SQLITE_MAX_COMPOUND_SELECT`) — limits how many queries can be UNIONed together.
- **32766 bind parameters** (default `SQLITE_MAX_VARIABLE_NUMBER` since SQLite 3.32) — limits how many instance IDs can be passed in a single `WHERE id IN (?, ?, ...)` clause.

**Column count mitigation via `$` selector:** ECSQL supports `SELECT $` which returns all properties of a class instance as a single JSON column. Instead of selecting N columns per JOINed class (one per property), the query can select one `$` blob per class and extract individual property values in TypeScript by parsing the JSON. This reduces column usage from hundreds to roughly one per JOINed class, effectively eliminating the 2000-column limit as a concern. Trade-off: JSON parsing overhead vs. direct column access. The `$->[PropName]` syntax also allows selecting specific properties as individual columns when needed (e.g., for ORDER BY or WHERE on a specific field).

**JOIN count mitigation — splitting and stitching:** The query builder must detect when a single query would exceed the 64-table JOIN limit and automatically split into multiple queries. The value loader then merges results from all sub-queries into a unified stream of content items. This splitting is transparent to consumers — they see a single result set regardless of how many queries were needed internally.

**Stitching:** When the query is split, each sub-query covers a different subset of JOINed paths but selects from the same primary instances. The results must be stitched back together — matching rows across sub-queries by primary key and combining their column values into a single content item. Each sub-query returns values for some fields; the stitcher assembles the full row. Fields not covered by a given sub-query are `undefined` in that sub-query's result and filled in from the sub-query that owns them.
