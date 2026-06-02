---
"@itwin/presentation-components": major
---

**Breaking:** `usePropertyDataProviderWithUnifiedSelection` now requires `selectionStorage` prop.

The `selectionStorage` prop in `PropertyDataProviderWithUnifiedSelectionProps` has been made required. Previously, when not provided, the hook fell back to the deprecated `SelectionManager` from `@itwin/presentation-frontend` package. Consumers must now explicitly supply a `SelectionStorage` instance from `@itwin/unified-selection`.

Before:

```tsx
const { isOverLimit, numSelectedElements } = usePropertyDataProviderWithUnifiedSelection({ dataProvider });
```

After:

```tsx
import { createStorage } from "@itwin/unified-selection";

const selectionStorage = createStorage(); // create once, share across all components

const { isOverLimit, numSelectedElements } = usePropertyDataProviderWithUnifiedSelection({ dataProvider, selectionStorage });
```
