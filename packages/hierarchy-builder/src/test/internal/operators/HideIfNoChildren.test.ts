/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { from, of } from "rxjs";
import sinon from "sinon";
import { createHideIfNoChildrenOperator } from "../../../hierarchy-builder/internal/operators/HideIfNoChildren";
import { createTestNode, getObservableResult } from "../../Utils";

describe("hideIfNoChildrenOperator", () => {
  it("returns nodes that don't need hiding", async () => {
    const nodes = [createTestNode()];
    const result = await getObservableResult(from(nodes).pipe(createHideIfNoChildrenOperator(sinon.spy(), false)));
    expect(result).to.deep.eq(nodes);
  });

  it("doesn't return nodes that need hiding and have children determined as `false`", async () => {
    const nodes = [
      createTestNode({
        hideIfNoChildren: true,
        children: false,
      }),
    ];
    const result = await getObservableResult(from(nodes).pipe(createHideIfNoChildrenOperator(sinon.spy(), false)));
    expect(result).to.deep.eq([]);
  });

  it("returns nodes that need hiding and have children determined as `true`", async () => {
    const nodes = [
      createTestNode({
        hideIfNoChildren: true,
        children: true,
      }),
    ];
    const result = await getObservableResult(from(nodes).pipe(createHideIfNoChildrenOperator(sinon.spy(), false)));
    expect(result).to.deep.eq(nodes);
  });

  it("doesn't return nodes that need hiding and have children determined an empty array", async () => {
    const nodes = [
      createTestNode({
        hideIfNoChildren: true,
        children: [],
      }),
    ];
    const result = await getObservableResult(from(nodes).pipe(createHideIfNoChildrenOperator(sinon.spy(), false)));
    expect(result).to.deep.eq([]);
  });

  it("returns nodes that need hiding and have children determined as a non-empty array", async () => {
    const nodes = [
      createTestNode({
        hideIfNoChildren: true,
        children: [createTestNode()],
      }),
    ];
    const result = await getObservableResult(from(nodes).pipe(createHideIfNoChildrenOperator(sinon.spy(), false)));
    expect(result).to.deep.eq(nodes);
  });

  it("doesn't return nodes that need hiding, need children determined and don't have children", async () => {
    const nodes = [
      createTestNode({
        hideIfNoChildren: true,
        children: undefined,
      }),
    ];
    const hasNodes = sinon.fake(() => of(false));
    const result = await getObservableResult(from(nodes).pipe(createHideIfNoChildrenOperator(hasNodes, false)));
    expect(result).to.deep.eq([]);
  });

  it("returns nodes that need hiding, need children determined and do have children", async () => {
    const nodes = [
      createTestNode({
        hideIfNoChildren: true,
        children: undefined,
      }),
    ];
    const hasNodes = sinon.fake(() => of(true));
    const result = await getObservableResult(from(nodes).pipe(createHideIfNoChildrenOperator(hasNodes, false)));
    expect(result).to.deep.eq([{ ...nodes[0], children: true }]);
  });
});
