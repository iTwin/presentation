---
name: imodel-hierarchical-data-ui
description: Instructions and best practices for building/modifying a UI Tree component displaying iModel data in a hierarchical way
---

# Goal

Build/modify UI Tree component displaying iModel data in a hierarchical way defined by the user.

## How to build tree component

The tree component should be built in two parts: a data generation layer and a UI layer. The data generation layer is responsible for pulling data from the iModel. The UI layer is responsible for rendering the tree structure based on the data provided by the data generation layer.

To pull data from iModel, use `@itwin/presentation-hierarchies` library. This library provides a way to define how data should be pulled for each level of the tree.

To render the tree structure in the UI, use `@itwin/presentation-hierarchies-react` library. This library provides React components that can be used to render the tree structure based on the data provided by the data generation part.

Documentation for `@itwin/presentation-hierarchies` library can be found here - https://github.com/iTwin/presentation/blob/master/packages/hierarchies/README.md
Documentation for `@itwin/presentation-hierarchies-react` library can be found here - https://github.com/iTwin/presentation/blob/master/packages/hierarchies-react/README.md

Prefer placing the data generation part in a separate file from the UI part. This will allow for better separation of concerns and make it easier to maintain the code.

## iModel data structure

Data in iModel is structured based on ECSchemas and can be pulled using ECSQL queries. All ECSchemas are based on primitives defined in the BisCore schema (BIS).

Documentation for ECSQL queries can be found here - https://www.itwinjs.org/learning/
Documentation for ECSchemas can be found here - https://www.itwinjs.org/bis/ec/

## ECSchemas

Different domains can have their own ECSchema based on BisCore. For example, for structural engineering domain, there is a StructuralAnalysis ECSchema that defines classes related to structural analysis.

Schemas are defined in .ecschema.xml files and can be found here - https://github.com/iTwin/bis-schemas/tree/master/Domains

## Performance tips

- Prefer using ECNavigation property over ECRelationshipClass when joining related instances in ECSQL
