/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
import { expect } from "chai";
import { EMPTY, from, of, Subject } from "rxjs";
import sinon from "sinon";
import { LogLevel } from "@itwin/core-bentley";
import { createHideIfNoChildrenOperator, LOGGING_NAMESPACE } from "../../../hierarchy-builder/internal/operators/HideIfNoChildren";
import { createTestProcessedCustomNode, getObservableResult, setupLogging, waitFor } from "../../Utils";

describe("HideIfNoChildrenOperator", () => {
  before(() => {
    setupLogging([{ namespace: LOGGING_NAMESPACE, level: LogLevel.Trace }]);
  });

  it("returns nodes that don't need hiding", async () => {
    const nodes = [createTestProcessedCustomNode()];
    const result = await getObservableResult(from(nodes).pipe(createHideIfNoChildrenOperator(sinon.spy(), false)));
    expect(result).to.deep.eq(nodes);
  });

  it("doesn't return nodes that need hiding and have children determined as `false`", async () => {
    const nodes = [
      createTestProcessedCustomNode({
        processingParams: { hideIfNoChildren: true },
        children: false,
      }),
    ];
    const result = await getObservableResult(from(nodes).pipe(createHideIfNoChildrenOperator(sinon.spy(), false)));
    expect(result).to.deep.eq([]);
  });

  it("returns nodes that need hiding and have children determined as `true`", async () => {
    const nodes = [
      createTestProcessedCustomNode({
        processingParams: { hideIfNoChildren: true },
        children: true,
      }),
    ];
    const result = await getObservableResult(from(nodes).pipe(createHideIfNoChildrenOperator(sinon.spy(), false)));
    expect(result).to.deep.eq(nodes);
  });

  it("doesn't return nodes that need hiding, need children determined and don't have children", async () => {
    const nodes = [
      createTestProcessedCustomNode({
        processingParams: { hideIfNoChildren: true },
        children: undefined,
      }),
    ];
    const hasNodes = sinon.fake(() => of(false));
    const result = await getObservableResult(from(nodes).pipe(createHideIfNoChildrenOperator(hasNodes, false)));
    expect(result).to.deep.eq([]);
  });

  it("returns nodes that need hiding, need children determined and do have children", async () => {
    const nodes = [
      createTestProcessedCustomNode({
        processingParams: { hideIfNoChildren: true },
        children: undefined,
      }),
    ];
    const hasNodes = sinon.fake(() => of(true));
    const result = await getObservableResult(from(nodes).pipe(createHideIfNoChildrenOperator(hasNodes, false)));
    expect(result).to.deep.eq([{ ...nodes[0], children: true }]);
  });

  it("checks children of all siblings at once when `stopOnFirstChild = false`", async () => {
    const nodeA = createTestProcessedCustomNode({
      processingParams: { hideIfNoChildren: true },
      label: "a",
      children: undefined,
    });
    const nodeB = createTestProcessedCustomNode({
      processingParams: { hideIfNoChildren: true },
      label: "b",
      children: undefined,
    });
    const aHasNodesSubject = new Subject<boolean>();
    const bHasNodesSubject = new Subject<boolean>();
    const hasNodes = sinon.fake((node) => {
      if (node === nodeA) {
        return aHasNodesSubject;
      }
      if (node === nodeB) {
        return bHasNodesSubject;
      }
      return EMPTY;
    });

    const promise = getObservableResult(from([nodeA, nodeB]).pipe(createHideIfNoChildrenOperator(hasNodes, false)));
    await waitFor(() => expect(hasNodes).to.be.calledTwice);
    expect(hasNodes.firstCall).to.be.calledWithExactly(nodeA);
    expect(hasNodes.secondCall).to.be.calledWithExactly(nodeB);

    aHasNodesSubject.next(true);
    aHasNodesSubject.complete();

    bHasNodesSubject.next(true);
    bHasNodesSubject.complete();

    const result = await promise;
    expect(result).to.deep.eq([
      { ...nodeA, children: true },
      { ...nodeB, children: true },
    ]);
  });

  it("checks children before siblings when `stopOnFirstChild = true`", async () => {
    const nodeA = createTestProcessedCustomNode({
      processingParams: { hideIfNoChildren: true },
      label: "a",
      children: undefined,
    });
    const nodeB = createTestProcessedCustomNode({
      processingParams: { hideIfNoChildren: true },
      label: "b",
      children: undefined,
    });
    const aHasNodesSubject = new Subject<boolean>();
    const bHasNodesSubject = new Subject<boolean>();
    const hasNodes = sinon.fake((node) => {
      if (node === nodeA) {
        return aHasNodesSubject;
      }
      if (node === nodeB) {
        return bHasNodesSubject;
      }
      return EMPTY;
    });

    const promise = getObservableResult(from([nodeA, nodeB]).pipe(createHideIfNoChildrenOperator(hasNodes, true)));

    await waitFor(() => expect(hasNodes).to.be.calledOnce);
    expect(hasNodes.firstCall).to.be.calledWithExactly(nodeA);
    aHasNodesSubject.next(true);
    aHasNodesSubject.complete();

    expect(hasNodes).to.be.calledTwice;
    expect(hasNodes.secondCall).to.be.calledWithExactly(nodeB);
    bHasNodesSubject.next(true);
    bHasNodesSubject.complete();

    const result = await promise;
    expect(result).to.deep.eq([
      { ...nodeA, children: true },
      { ...nodeB, children: true },
    ]);
  });

  it("subscribes to input observable once", async () => {
    const processedHierarchyNodesObservable = from([]);
    const subscriptionSpy = sinon.spy(processedHierarchyNodesObservable, "subscribe");
    const promise = processedHierarchyNodesObservable.pipe(createHideIfNoChildrenOperator(() => of(false), true));
    promise.subscribe();
    await waitFor(() => expect(subscriptionSpy).to.have.been.calledOnce);
  });
});
