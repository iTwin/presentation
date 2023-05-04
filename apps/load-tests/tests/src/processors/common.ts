/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { EventEmitter, Next, ScenarioContext } from "artillery";
import { Guid } from "@itwin/core-bentley";

export function createClientId(context: ScenarioContext, _ee: EventEmitter, next: Next) {
  context.vars.clientId = Guid.createValue();
  next();
}
