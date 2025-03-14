/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { IModelReadRpcInterface, IModelTileRpcInterface } from "@itwin/core-common";
import { ECSchemaRpcInterface } from "@itwin/ecschema-rpcinterface-common";
// __PUBLISH_EXTRACT_START__ Presentation.Common.RpcInterface.Imports
import { PresentationRpcInterface } from "@itwin/presentation-common";
// __PUBLISH_EXTRACT_END__
import { SampleRpcInterface } from "./SampleRpcInterface.js";

const otherRpcInterfaces = [IModelTileRpcInterface, IModelReadRpcInterface, ECSchemaRpcInterface, SampleRpcInterface];
// __PUBLISH_EXTRACT_START__ Presentation.Common.RpcInterface
const rpcInterfaces = [...otherRpcInterfaces, PresentationRpcInterface];
// __PUBLISH_EXTRACT_END__

export { rpcInterfaces };
