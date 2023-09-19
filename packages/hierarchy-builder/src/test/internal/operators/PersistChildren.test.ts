/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import { from } from "rxjs";
import sinon from "sinon";
// import sinon from "sinon";
import { Logger, LogLevel } from "@itwin/core-bentley";
import { HierarchyNode } from "../../../hierarchy-builder/HierarchyNode";
import { createPersistChildrenOperator, LOGGING_NAMESPACE } from "../../../hierarchy-builder/internal/operators/PersistChildren";
import { createTestNode, getObservableResult } from "../../Utils";

describe("PersistChildren", () => {
  before(() => {
    Logger.initializeToConsole();
    Logger.turnOffCategories();
    Logger.setLevel(LOGGING_NAMESPACE, LogLevel.Trace);
  });

  it("returns input observable if parent has children array", async () => {
    const node: HierarchyNode = {
      key: "custom",
      label: "custom",
      children: [],
    };
    const input = from([]);
    const output = createPersistChildrenOperator(node)(input);
    expect(output).to.eq(input);
  });

  it("sets children on parent node", async () => {
    const node: HierarchyNode = {
      key: "custom",
      label: "custom",
      children: true,
    };
    const children: HierarchyNode[] = [createTestNode(), createTestNode()];
    await getObservableResult(from(children).pipe(createPersistChildrenOperator(node)));
    expect(node.children).to.deep.eq(children);
  });

  it("doesn't attempt to set children on parent node if it's not extensible", async () => {
    const node: HierarchyNode = {
      key: "custom",
      label: "custom",
      children: true,
    };
    const children: HierarchyNode[] = [createTestNode(), createTestNode()];
    sinon.stub(Object, "isExtensible").returns(false);
    await getObservableResult(from(children).pipe(createPersistChildrenOperator(node)));
    expect(node.children).to.eq(true);
  });
});
