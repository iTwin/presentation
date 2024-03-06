/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { Guid } from "@itwin/core-bentley";
import {
  HierarchyRpcRequestOptions,
  Node,
  NodeJSON,
  PagedResponse,
  PresentationError,
  PresentationRpcResponseData,
  PresentationStatus,
} from "@itwin/presentation-common";
import RULESET_ModelsTree from "../rulesets/ModelsTree-GroupedByClass.PresentationRuleSet.json";
import { NodeProvider } from "./NodeLoader";
import { RequestHandler } from "./RequestHandler";

export class DefaultHierarchyProvider implements NodeProvider<Node> {
  private readonly _clientId = Guid.createValue();

  constructor(private readonly _iModelPath: string) {}

  public async getChildren(parent: Node | undefined): Promise<Node[]> {
    const requestBody = JSON.stringify([
      {
        iTwinId: Guid.empty,
        iModelId: Guid.empty,
        key: this._iModelPath,
        changeset: { index: 0, id: "" },
      },
      {
        clientId: this._clientId,
        rulesetOrId: RULESET_ModelsTree,
        sizeLimit: 1000,
        parentKey: parent?.key,
      } as HierarchyRpcRequestOptions,
    ]);

    return this.requestRepeatedly(requestBody);
  }

  private async requestRepeatedly(requestBody: string): Promise<Node[]> {
    while (true) {
      const response = await RequestHandler.doRequest("PresentationRpcInterface-4.0.0-getPagedNodes", requestBody);
      // eslint-disable-next-line deprecation/deprecation
      const responseBody = response as PresentationRpcResponseData<PagedResponse<NodeJSON>>;
      switch (responseBody.statusCode) {
        case PresentationStatus.Canceled:
        case PresentationStatus.ResultSetTooLarge:
          return [];
        case PresentationStatus.BackendTimeout:
          break;
        case PresentationStatus.Success:
          // eslint-disable-next-line deprecation/deprecation
          return responseBody.result!.items.map(Node.fromJSON);
        default:
          throw new PresentationError(responseBody.statusCode, responseBody.errorMessage);
      }
    }
  }

  public initialHasChildren = (node: Node) => !!node.hasChildren && !!node.isExpanded;

  public fullHasChildren = (node: Node) => !!node.hasChildren;
}
