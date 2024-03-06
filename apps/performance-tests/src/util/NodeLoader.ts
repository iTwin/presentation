// /*---------------------------------------------------------------------------------------------
//  * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
//  * See LICENSE.md in the project root for license terms and full copyright notice.
//  *--------------------------------------------------------------------------------------------*/
// import { expand, filter, from, mergeAll, of, tap } from "rxjs";

// // const ENABLE_REQUEST_LOGGING = false;
// // const logRequest = ENABLE_REQUEST_LOGGING ? console.debug : undefined;

// export interface NodeProvider<TNode> {
//   getChildren(parent: TNode | undefined): Promise<TNode[]>;
//   initialHasChildren(node: TNode): boolean;
//   fullHasChildren(node: TNode): boolean;
// }

// export class NodeLoader<TNode> {
//   constructor(
//     private readonly _provider: NodeProvider<TNode>,
//     private readonly _nodeRequestLimit?: number,
//   ) {}

//   public async loadInitialHierarchy(): Promise<void> {
//     await this.loadNodes((node) => this._provider.initialHasChildren(node));
//   }

//   public async loadFullHierarchy(): Promise<void> {
//     await this.loadNodes((node) => this._provider.fullHasChildren(node));
//   }

//   private async loadNodes(nodeHasChildren: (node: TNode) => boolean) {
//     let nodesCreated = 0;
//     let nodesScheduled = 0;
//     const timer = setInterval(() => nodesScheduled && console.log(`Nodes scheduled ${nodesScheduled}`), 1000);

//     await new Promise<void>((resolve, reject) => {
//       const nodesObservable = of<TNode | undefined>(undefined).pipe(
//         expand((parentNode) => {
//           ++nodesScheduled;
//           return from(this._provider.getChildren(parentNode)).pipe(
//             tap(() => --nodesScheduled),
//             mergeAll(),
//             filter((node) => nodeHasChildren(node)),
//           );
//         }, this._nodeRequestLimit),
//       );
//       nodesObservable.subscribe({
//         next() {
//           ++nodesCreated;
//         },
//         complete: resolve,
//         error: reject,
//       });
//     }).finally(() => clearInterval(timer));
//     console.log(`Total nodes created: ${nodesCreated}`);
//   }
// }
