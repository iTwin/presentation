---
"@itwin/presentation-content": minor
---

`resolveContentSources`: each resolved relationship path now carries the concrete content-target classes it applies to.

Added the `ResolvedPath` interface (`{ path, targetClassNames }`) and changed `ResolvedDeclarationGroup.paths` from `RelationshipPath[]` to `ResolvedPath[]`. During source resolution, path discovery now also captures the concrete near-end primary classes (a subset of `ContentSource.resolvedPrimaryClasses`) that actually connect to each path, so later stages can scope related fields to the concrete content-target classes. Accordingly, a `RelatedPropertiesDeclaration.resolve` callback must now return `ResolvedPath[]` instead of `RelationshipPath[]`.
