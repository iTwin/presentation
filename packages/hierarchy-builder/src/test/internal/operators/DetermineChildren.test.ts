/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { from, of } from "rxjs";
import sinon from "sinon";
import { LogLevel } from "@itwin/core-bentley";
import { HierarchyNode } from "../../../hierarchy-builder/HierarchyNode";
import { createDetermineChildrenOperator, LOGGING_NAMESPACE } from "../../../hierarchy-builder/internal/operators/DetermineChildren";
import { getObservableResult, setupLogging } from "../../Utils";

describe("DetermineChildren", () => {
  before(() => {
    setupLogging([{ namespace: LOGGING_NAMESPACE, level: LogLevel.Trace }]);
  });

  it("doesn't check children if node has children determined", async () => {
    const node: HierarchyNode = {
      key: "custom",
      label: "custom",
      children: false,
    };
    const hasNodes = sinon.spy();
    const result = await getObservableResult(from([node]).pipe(createDetermineChildrenOperator(hasNodes)));
    expect(hasNodes).to.not.be.called;
    expect(result).to.deep.eq([node]);
  });

  it("determines node children", async () => {
    const node: HierarchyNode = {
      key: "custom",
      label: "custom",
      children: undefined,
    };
    const hasNodes = sinon.stub().returns(of(true));
    const result = await getObservableResult(from([node]).pipe(createDetermineChildrenOperator(hasNodes)));
    expect(hasNodes).to.be.calledOnceWith(node);
    expect(result).to.deep.eq([{ ...node, children: true }]);
  });
});
