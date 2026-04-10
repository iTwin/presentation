/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { collect } from "presentation-test-utilities";
import { from, of } from "rxjs";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { LogLevel } from "@itwin/core-bentley";
import {
  createDetermineChildrenOperator,
  LOGGING_NAMESPACE,
} from "../../../hierarchies/imodel/operators/DetermineChildren.js";
import { createTestProcessedGenericNode, setupLogging } from "../../Utils.js";

describe("DetermineChildren", () => {
  beforeAll(() => {
    setupLogging([{ namespace: LOGGING_NAMESPACE, level: LogLevel.Trace }]);
  });

  it("doesn't check children if node has children determined", async () => {
    const node = createTestProcessedGenericNode({ children: false });
    const hasNodes = vi.fn();
    const result = await collect(from([node]).pipe(createDetermineChildrenOperator(hasNodes)));
    expect(hasNodes).not.toHaveBeenCalled();
    expect(result).toEqual([node]);
  });

  it("determines node children", async () => {
    const node = createTestProcessedGenericNode({ children: undefined });
    const hasNodes = vi.fn().mockReturnValue(of(true));
    const result = await collect(from([node]).pipe(createDetermineChildrenOperator(hasNodes)));
    expect(hasNodes).toHaveBeenCalledExactlyOnceWith(node);
    expect(result).toEqual([{ ...node, children: true }]);
  });
});
