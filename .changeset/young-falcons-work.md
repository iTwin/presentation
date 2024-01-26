---
"@itwin/presentation-components": minor
---

Property grid: Added an editor for editing values of properties with quantity / units information.

Editor works only if there is `SchemaMetadataContextProvider` in React component tree above property grid components. Otherwise simple numeric editor is used.

```tsx
// somewhere at the global level
import { IModelConnection } from "@itwin/core-frontend";
import { SchemaContext } from "@itwin/ecschema-metadata";
function getIModelSchemaContext(imodel: IModelConnection): SchemaContext {
  // return a cached instance of SchemaContext for given IModelConnection
}

// in the component render function
<SchemaMetadataContextProvider imodel={imodel} schemaContextProvider={getIModelSchemaContext}>
  <VirtualizedPropertyGridWithDataProvider {...props} />
</SchemaMetadataContextProvider>
```
