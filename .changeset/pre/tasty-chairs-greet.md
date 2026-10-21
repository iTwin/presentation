---
"@itwin/presentation-tree-definitions": patch
---

Narrowed the `className` type in search paths and search trees returned by `createModelsTree`, `createCategoriesTree` and `createClassificationsTree`.

`createInstanceKeyPaths` now yields `ModelsTreeSearchPath` / `CategoriesTreeSearchPath` / `ClassificationsTreeSearchPath`, and `createSearchTree` resolves to `ModelsTreeSearchTree[]` / `CategoriesTreeSearchTree[]` / `ClassificationsTreeSearchTree[]`. In these types, `className` is a string union of the classes that specific hierarchy can return, so it can be switched on in a type-safe way without casting:

- Models tree: `"BisCore.Subject" | "BisCore.GeometricModel3d" | "BisCore.SpatialCategory" | "BisCore.GeometricElement3d"`
- Categories tree: `"BisCore.DefinitionContainer" | "BisCore.SpatialCategory" | "BisCore.DrawingCategory" | "BisCore.SubCategory" | "BisCore.GeometricModel3d" | "BisCore.GeometricModel2d" | "BisCore.GeometricElement3d" | "BisCore.GeometricElement2d"`
- Classifications tree: `"ClassificationSystems.Classification" | "ClassificationSystems.ClassificationTable" | "BisCore.GeometricElement3d"`
