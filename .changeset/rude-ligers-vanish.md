---
"@itwin/presentation-hierarchies": minor
---

Extended `createPredicateBasedHierarchyDefinition` props to accept `HierarchyDefinition` functions: `parseNode`, `preProcessNode` and `postProcessNode`.

The change allows creating a fully capable `HierarchyDefinition` with all the custom behaviors provided by those functions.
