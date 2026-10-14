---
"@itwin/presentation-hierarchies": patch
---

Fix `HiddenSchema` and `HiddenClass` custom attributes not being taken into account when creating ECSQL query for hierarchies.

This is achieved through a `createFilterClauses` function change in `NodesQueryClauseFactory` implementation, created by `createNodesQueryClauseFactory` factory. Now the implementation checks the custom attributes of content class' derived classes and includes appropriate filters in the returned `where` clause.
