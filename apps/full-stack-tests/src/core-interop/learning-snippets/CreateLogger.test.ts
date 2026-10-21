/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable no-duplicate-imports */

import { LogLevel } from "@itwin/core-bentley";
// __PUBLISH_EXTRACT_START__ Presentation.CoreInterop.CreateLogger.Imports
import { Logger as CoreLogger } from "@itwin/core-bentley";
import { createLogger as createPresentationLogger } from "@itwin/presentation-core-interop";
import { setLogger as setPresentationLogger } from "@itwin/presentation-hierarchies";
// __PUBLISH_EXTRACT_END__
import { getLogger as getPresentationLogger } from "@itwin/presentation-hierarchies";
import { describe, expect, it, vi } from "vitest";

describe("Core interop", () => {
  describe("Learning snippets", () => {
    describe("createLogger", () => {
      it("forwards log calls to iTwin.js Core logger", async function () {
        const logSpy = vi.fn();
        CoreLogger.initialize(logSpy, logSpy, logSpy, logSpy);
        CoreLogger.setLevelDefault(LogLevel.Info);

        // __PUBLISH_EXTRACT_START__ Presentation.CoreInterop.CreateLogger.Example
        setPresentationLogger(createPresentationLogger(CoreLogger));
        // __PUBLISH_EXTRACT_END__

        getPresentationLogger().logInfo("MyCategory", "This is an info message");
        expect(logSpy).toHaveBeenCalledWith("MyCategory", "This is an info message", undefined);
      });
    });
  });
});
