# API Open Questions

## RelatedFieldGroup — keep or flatten?

`RelatedFieldGroup` provides a pre-built tree structure grouping fields by their relationship path. However, each `PropertyField` already carries `pathFromTarget: RelationshipPath`, making the grouping information redundant.

**Arguments for keeping:**

- Pre-computed display metadata (`label`, `defaultCategoryId`) for groups
- Ready-made tree for hierarchical UI rendering

**Arguments for flattening (single `fields: Field[]` on descriptor):**

- `pathFromTarget` already encodes the same path — consumers can group by it
- Fields wouldn't exist in two places (direct vs nested), simplifying iteration
- Simpler descriptor serialization/comparison
- Less complex descriptor schema

**Decision:** TBD

## Field identity encoding for related property fields

A `PropertyField`'s identity must be unique within the descriptor. Since the same class + property can appear multiple times (joined through different relationship paths from the target), the path **must** be part of the identity.

Naively encoding the full path (e.g., `SourceClass.Prop/Rel1/Class2/Rel2/Class3/...`) can get very long for deeply nested related properties.

**Options:**

1. **Full path string** — maximally debuggable, but could be extremely long for distant related classes
2. **Hash the path, keep the leaf readable** — e.g., `hash(pathSteps).ClassName.PropertyName` — fixed length, still partially debuggable
3. **Hash only when exceeding a threshold** — short paths stay readable, long ones get hashed
4. **Stable integer/index** — assigned during descriptor build, compact but requires the descriptor to interpret

**Constraints:**

- Must be unique within a descriptor (same property via different paths → different identities)
- Must be deterministic for the same descriptor inputs (so rebuilding a descriptor matches already-loaded values within the same session)
- Used as keys in `ContentValues.values` map (client-side only, not in SQL)
- Cross-session stability is **not required** — identities are not persisted to storage.
- This means index-based or order-dependent schemes are viable as long as the ordering algorithm is deterministic for the same inputs.

**Decision:** TBD

## Multi-source property fields

When multiple content target classes share a property with the same name and type (e.g., `UserLabel` defined on both `BisCore.PhysicalElement` and `BisCore.SpatialElement`), should they merge into a single field in the descriptor?

Currently `PropertyField` has a single `sourceClassName: EC.FullClassName`. This means two classes with the same property produce two separate fields — potentially confusing in a property grid that shows them side-by-side.

**Options:**

1. **Array of sources** — change `sourceClassName` to `sourceClassNames: EC.FullClassName[]` (or add a secondary property). The pipeline merges matching properties into one field.
2. **Keep separate, merge in UI** — leave the descriptor flat and let the UI layer detect and merge duplicates by property name + type.
3. **Explicit merge declaration** — consumers/providers declare merge rules (e.g., "treat these N fields as one").

**Considerations:**

- Merging at descriptor level simplifies consumers but complicates identity (which source class does the identity reference?)
- Separate fields are simpler but push complexity to every consumer
- The existing native implementation merges them — do we want to preserve that behavior?

**Decision:** TBD

## Blanket property overrides in `ClassPropertySpec`

`ClassPropertySpec.overrides` is keyed by property name (`Record<string, PropertyOverrides>`), requiring each property to be listed individually. There's no way to say "apply this override to all selected properties."

**Options:**

1. **`defaultOverrides?: PropertyOverrides`** — a separate field applied to all selected properties unless individually overridden via `overrides[propName]`.
2. **Wildcard key `"*"`** — treated as a catch-all in the existing `overrides` record. Simpler schema (no new field) but not type-safe and relies on convention.
3. **Do nothing** — providers list the same override for each property individually. Slightly verbose but keeps the API simple with no special semantics.

**Considerations:**

- Option 1 is explicit and type-safe but adds a second field with overlapping purpose.
- Option 2 keeps a single field but introduces magic-string semantics.
- Either way, per-property entries should take precedence over the blanket override.

**Decision:** TBD
