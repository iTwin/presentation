---
"@itwin/presentation-content": patch
---

Add `createFieldsProviderFromContentModifierRule` factory for creating an `IModelFieldsProvider` from a `ContentModifierRule` specification.

The factory checks `requiredSchemas` (with full schema version comparison), polymorphically matches the target class against the rule's `class`, and maps `relatedProperties`, `calculatedProperties`, and `propertyCategories` into a fields provider contribution. It returns `undefined` from `getContribution` when the rule produces no fields or categories.
