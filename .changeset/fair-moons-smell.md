---
"@itwin/presentation-hierarchies": minor
---

Remove the option to specify `ecClassId` and `ecInstanceId` in `NodesQueryClauseFactory.createSelectClause` as `Id64String`. Now they can only be specified as a selector object, e.g. `{ selector: "this.ECClassId" }`. In case a static string is needed, the selector can return one.
