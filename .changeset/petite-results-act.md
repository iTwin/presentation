---
"@itwin/presentation-components": major
---

**Breaking:** `usePresentationTableWithUnifiedSelection` now requires `selectionStorage` prop.

The `selectionStorage` prop in `UsePresentationTableWithUnifiedSelectionProps` has been made required. Previously, when not provided, the hook fell back to the deprecated `SelectionManager` from `@itwin/presentation-frontend` package. Consumers must now explicitly supply a `SelectionStorage` instance from `@itwin/unified-selection`.

Before:

```tsx
const { rows, columns } = usePresentationTableWithUnifiedSelection({ imodel, ruleset, columnMapper, rowMapper });
```

After:

```tsx
import { createStorage } from "@itwin/unified-selection";

const selectionStorage = createStorage(); // create once, share across all components

const { rows, columns } = usePresentationTableWithUnifiedSelection({ imodel, ruleset, columnMapper, rowMapper, selectionStorage });
```
