// /*---------------------------------------------------------------------------------------------
//  * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
//  * See LICENSE.md in the project root for license terms and full copyright notice.
//  *--------------------------------------------------------------------------------------------*/
// /* eslint-disable no-duplicate-imports */
// /* eslint-disable @typescript-eslint/no-unused-vars */

// import { expect } from "chai";
// import { insertPhysicalModelWithPartition } from "presentation-test-utilities";
// // __PUBLISH_EXTRACT_START__ Presentation.HierarchiesReact.iModelAccess.Imports
// import { IModelConnection } from "@itwin/core-frontend";
// import { SchemaContext } from "@itwin/ecschema-metadata";
// import { ECSchemaRpcLocater } from "@itwin/ecschema-rpcinterface-common";
// import { createCachingECClassHierarchyInspector } from "@itwin/presentation-shared";
// import { createECSchemaProvider, createECSqlQueryExecutor, createIModelKey } from "@itwin/presentation-core-interop";
// import { createLimitingECSqlQueryExecutor, createNodesQueryClauseFactory, HierarchyDefinition } from "@itwin/presentation-hierarchies";
// // __PUBLISH_EXTRACT_END__
// // __PUBLISH_EXTRACT_START__ Presentation.HierarchiesReact.SelectionStorage.Imports
// import { TreeRenderer, useIModelUnifiedSelectionTree } from "@itwin/presentation-hierarchies-react";
// import { createStorage, SelectionStorage } from "@itwin/unified-selection";
// import { useEffect, useState } from "react";
// // __PUBLISH_EXTRACT_END__
// // __PUBLISH_EXTRACT_START__ Presentation.HierarchiesReact.CustomTreeExample.Imports
// import { createBisInstanceLabelSelectClauseFactory, Props } from "@itwin/presentation-shared";
// // __PUBLISH_EXTRACT_END__
// import { buildIModel } from "../../IModelUtils.js";
// import { initialize, terminate } from "../../IntegrationTests.js";
// import { render, waitFor } from "../../RenderUtils.js";
// import { stubVirtualization } from "../../Utils.js";

// // __PUBLISH_EXTRACT_START__ Presentation.HierarchiesReact.iModelAccess
// // Not really part of the package, but we need SchemaContext to create the tree state. It's
// // recommended to cache the schema context and reuse it across different application's components to
// // avoid loading and storing same schemas multiple times.
// const imodelSchemaContextsCache = new Map<string, SchemaContext>();

// function getIModelSchemaContext(imodel: IModelConnection) {
//   const imodelKey = createIModelKey(imodel);
//   let context = imodelSchemaContextsCache.get(imodelKey);
//   if (!context) {
//     context = new SchemaContext();
//     context.addLocater(new ECSchemaRpcLocater(imodel.getRpcProps()));
//     imodelSchemaContextsCache.set(imodelKey, context);
//     imodel.onClose.addListener(() => imodelSchemaContextsCache.delete(imodelKey));
//   }
//   return context;
// }

// function createIModelAccess(imodel: IModelConnection) {
//   const schemaProvider = createECSchemaProvider(getIModelSchemaContext(imodel));
//   return {
//     imodelKey: createIModelKey(imodel),
//     ...schemaProvider,
//     // while caching for hierarchy inspector is not mandatory, it's recommended to use it to improve performance
//     ...createCachingECClassHierarchyInspector({ schemaProvider, cacheSize: 100 }),
//     // the second argument is the maximum number of rows the executor will return - this allows us to
//     // avoid creating hierarchy levels of insane size (expensive to us and useless to users)
//     ...createLimitingECSqlQueryExecutor(createECSqlQueryExecutor(imodel), 1000),
//   };
// }
// // __PUBLISH_EXTRACT_END__

// describe("Hierarchies React", () => {
//   describe("Learning snippets", () => {
//     describe("Readme example", () => {
//       stubVirtualization();
//       let iModel: IModelConnection;

//       beforeEach(async function () {
//         await initialize();
//         iModel = (
//           await buildIModel(this, async (builder) => {
//             insertPhysicalModelWithPartition({ builder, codeValue: "My Model A" });
//             insertPhysicalModelWithPartition({ builder, codeValue: "My Model B" });
//           })
//         ).imodel;
//       });

//       afterEach(async () => {
//         await terminate();
//       });

//       it("Tree", async function () {
//         // __PUBLISH_EXTRACT_START__ Presentation.HierarchiesReact.SelectionStorage
//         // Not part of the package - this should be created once and reused across different components of the application.
//         const unifiedSelectionStorage = createStorage();

//         /** Component providing the selection storage and access to iModel. Usually this is done in a top-level component. */
//         function MyTreeComponent({ imodel }: { imodel: IModelConnection }) {
//           const [imodelAccess, setIModelAccess] = useState<IModelAccess>();
//           useEffect(() => {
//             setIModelAccess(createIModelAccess(imodel));
//           }, [imodel]);

//           if (!imodelAccess) {
//             return null;
//           }

//           return <MyTreeComponentInternal imodelAccess={imodelAccess} selectionStorage={unifiedSelectionStorage} />;
//         }
//         // __PUBLISH_EXTRACT_END__
//         // __PUBLISH_EXTRACT_START__ Presentation.HierarchiesReact.CustomTreeExample
//         type IModelAccess = Props<typeof useIModelUnifiedSelectionTree>["imodelAccess"];

//         // The hierarchy definition describes the hierarchy using ECSQL queries; here it just returns all `BisCore.PhysicalModel` instances
//         function getHierarchyDefinition({ imodelAccess }: { imodelAccess: IModelAccess }): HierarchyDefinition {
//           // Create a factory for building labels SELECT query clauses according to BIS conventions
//           const labelsQueryFactory = createBisInstanceLabelSelectClauseFactory({ classHierarchyInspector: imodelAccess });
//           // Create a factory for building nodes SELECT query clauses in a format understood by the provider
//           const nodesQueryFactory = createNodesQueryClauseFactory({ imodelAccess, instanceLabelSelectClauseFactory: labelsQueryFactory });
//           return {
//             defineHierarchyLevel: async () => [
//               {
//                 fullClassName: "BisCore.PhysicalModel",
//                 query: {
//                   ecsql: `
//                     SELECT
//                       ${await nodesQueryFactory.createSelectClause({
//                         ecClassId: { selector: "this.ECClassId" },
//                         ecInstanceId: { selector: "this.ECInstanceId" },
//                         nodeLabel: {
//                           selector: await labelsQueryFactory.createSelectClause({ classAlias: "this", className: "BisCore.PhysicalModel" }),
//                         },
//                         hasChildren: false,
//                       })}
//                     FROM BisCore.PhysicalModel this
//                   `,
//                 },
//               },
//             ],
//           };
//         }

//         /** Internal component that creates and renders tree state. */
//         function MyTreeComponentInternal({ imodelAccess, selectionStorage }: { imodelAccess: IModelAccess; selectionStorage: SelectionStorage }) {
//           const { rootNodes, setFormatter, isLoading, ...state } = useIModelUnifiedSelectionTree({
//             // the unified selection storage used by all app components let them share selection state
//             selectionStorage,
//             // the source name is used to distinguish selection changes being made by different components
//             sourceName: "MyTreeComponent",
//             // iModel access is used to build the hierarchy
//             imodelAccess,
//             // supply the hierarchy definition
//             getHierarchyDefinition,
//           });
//           if (!rootNodes) {
//             return "Loading...";
//           }
//           return <TreeRenderer {...state} rootNodes={rootNodes} />;
//         }
//         // __PUBLISH_EXTRACT_END__

//         const { getByRole, getByText } = render(<MyTreeComponent imodel={iModel} />);
//         await waitFor(() => getByRole("tree"));

//         expect(getByText("My Model A")).to.not.be.null;
//         expect(getByText("My Model B")).to.not.be.null;
//       });
//     });
//   });
// });
