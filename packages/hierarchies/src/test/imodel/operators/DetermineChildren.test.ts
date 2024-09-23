/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { collect } from "presentation-test-utilities";
import { from, of } from "rxjs";
import sinon from "sinon";
import { LogLevel } from "@itwin/core-bentley";
import { createDetermineChildrenOperator, LOGGING_NAMESPACE } from "../../../hierarchies/imodel/operators/DetermineChildren";
import { createTestProcessedCustomNode, setupLogging } from "../../Utils";

describe("DetermineChildren", () => {
  before(() => {
    setupLogging([{ namespace: LOGGING_NAMESPACE, level: LogLevel.Trace }]);
  });

  it("doesn't check children if node has children determined", async () => {
    const node = createTestProcessedCustomNode({
      children: false,
    });
    const hasNodes = sinon.spy();
    const result = await collect(from([node]).pipe(createDetermineChildrenOperator(hasNodes)));
    expect(hasNodes).to.not.be.called;
    expect(result).to.deep.eq([node]);
  });

  it("determines node children", async () => {
    const node = createTestProcessedCustomNode({
      children: undefined,
    });
    const hasNodes = sinon.stub().returns(of(true));
    const result = await collect(from([node]).pipe(createDetermineChildrenOperator(hasNodes)));
    expect(hasNodes).to.be.calledOnceWith(node);
    expect(result).to.deep.eq([{ ...node, children: true }]);
  });
});
