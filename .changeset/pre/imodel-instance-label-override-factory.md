---
"@itwin/presentation-shared": minor
---

Add `createIModelInstanceLabelSelectClauseFactory` — a new `IInstanceLabelSelectClauseFactory` implementation that applies `InstanceLabelOverride` rules stored in the iModel.

Rules are read from `PresentationRules.Ruleset` elements (top-level `rules[]` only) by querying the iModel via `ECSqlQueryExecutor`. All `InstanceLabelOverride` value specification types are supported: `String`, `Property`, `ClassName`, `ClassLabel`, `BriefcaseId`, `LocalId`, and `Composite`. Path-based specs (`RelatedInstanceLabel`, `Property` with `propertySource`) degrade silently to the next available value.

When the `PresentationRules` schema is not imported into the iModel, the factory falls back transparently to the provided `defaultClauseFactory` (defaults to `createBisInstanceLabelSelectClauseFactory`).
