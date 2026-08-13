/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable no-duplicate-imports */

import { describe, expect, it, vi } from "vitest";
// __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.Logging.Imports
import { Logger } from "@itwin/core-bentley";
import { createLogger } from "@itwin/presentation-core-interop";
import { setLogger } from "@itwin/presentation-hierarchies";
// __PUBLISH_EXTRACT_END__
import { getLogger } from "@itwin/presentation-hierarchies";

describe("Hierarchies", () => {
  describe("Learning snippets", () => {
    describe("Logging", () => {
      it("forwards logs to itwinjs-core `Logger`", async () => {
        // __PUBLISH_EXTRACT_START__ Presentation.Hierarchies.Logging.ForwardingLogsToCoreBentleyLogger
        // create a logger that forwards all logs to Logger from @itwin/core-bentley
        const logger = createLogger(Logger);
        // set the logger for use by @itwin/presentation-hierarchies
        setLogger(logger);
        // __PUBLISH_EXTRACT_END__

        const spy = vi.spyOn(Logger, "logTrace");
        getLogger().logTrace("test category", "test message");
        expect(spy).toHaveBeenCalledExactlyOnceWith("test category", "test message");
      });
    });
  });
});
