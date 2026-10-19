---
"@itwin/presentation-hierarchies-react": major
---

Additional requirements were added to the `EC` metadata types returned by `ECSchemaProvider`, which is part of the `imodelAccess` prop passed to the iModel tree hooks (`useIModelTree`, `useIModelUnifiedSelectionTree`).

Consumers that build `imodelAccess` using `@itwin/presentation-core-interop` only need to bump that package. Consumers that implement these `EC` metadata objects themselves must add the new members: `getCustomAttributes()` on `EC.Schema`, `EC.Class` and `EC.Property`, and `baseClass` / `getDerivedClasses()` on `EC.Class`.
