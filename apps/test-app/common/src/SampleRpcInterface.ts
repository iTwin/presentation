/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { IModelConnectionProps, RpcInterface, RpcManager, RpcOperation, RpcRequestTokenSupplier_T } from "@itwin/core-common";

const localDeploymentOnly: RpcRequestTokenSupplier_T = () => ({ iModelId: "none", key: "" });

/** Sample RPC interface. */
export abstract class SampleRpcInterface extends RpcInterface {
  /** The immutable name of the interface. */
  public static readonly interfaceName = "SampleRpcInterface";

  /** The version of the interface. */
  public static interfaceVersion = "1.0.0";

  public static getClient(): SampleRpcInterface {
    return RpcManager.getClientForInterface(SampleRpcInterface);
  }

  @RpcOperation.setRoutingProps(localDeploymentOnly)
  public async getSampleImodels(): Promise<string[]> {
    return this.forward(arguments);
  }

  @RpcOperation.setRoutingProps(localDeploymentOnly)
  public async getAvailableRulesets(): Promise<string[]> {
    return this.forward(arguments);
  }

  @RpcOperation.setRoutingProps(localDeploymentOnly)
  public async getConnectionProps(_imodelName: string): Promise<IModelConnectionProps> {
    return this.forward(arguments);
  }

  @RpcOperation.setRoutingProps(localDeploymentOnly)
  public async closeConnection(_imodelName: string): Promise<void> {
    return this.forward(arguments);
  }

  @RpcOperation.setRoutingProps(localDeploymentOnly)
  public async getRssFeed(_: { url: string }): Promise<string> {
    return this.forward(arguments);
  }
}
