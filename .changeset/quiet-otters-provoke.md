---
"@itwin/presentation-content": patch
---

`resolveContentSources`: added `ContentSource.resolvedPrimaryClasses` listing the concrete primary classes discovered under each target's `primaryClass`.

When a target's `primaryClass` is polymorphic, source resolution now runs a data-driven distinct-class scan (respecting the target's `instanceIds` / `instanceFilter`) to enumerate the concrete subclasses that actually have instances in scope. Leaf classes skip the scan and resolve to the normalized primary class. This provenance is what later stages use to scope a direct field's value-supplier classes below a polymorphic base.
