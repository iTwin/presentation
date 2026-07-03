---
"@itwin/presentation-content": patch
---

Added support for scoping content property fields to specific value-supplier classes.

- `PropertyField` now carries a required `valueClassNames` list describing the concrete classes of the instances that supply the field's value (the primary classes for a direct property, or the terminal related-instance classes for a related property). The list is always non-empty, normalized, de-duplicated, and sorted.

- `PropertyField.computeId` accepts an optional `forkKey` that is appended to the field ID, so a field carved for a subset of its value-supplier classes gets a distinct, stable ID. Omitting it keeps the previous ID unchanged.

- `TransformableDescriptor.forkField(id, valueClassNames)` lets descriptor transformers carve a property field for a subset of its value-supplier classes: the given classes are removed from the original field and a clone scoped to exactly that subset is returned (idempotent, and a no-op fork when the subset covers all of the field's classes).
