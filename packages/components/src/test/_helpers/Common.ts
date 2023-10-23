/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { Component } from "react";
import sinon from "sinon";
import { It } from "typemoq";
import { BeDuration } from "@itwin/core-bentley";
import {
  ClassInfo,
  InstanceKey,
  Keys,
  KeySet,
  PropertyInfo,
  RelatedClassInfo,
  RelatedClassInfoWithOptionalRelationship,
  Ruleset,
} from "@itwin/presentation-common";
import { render as renderRTL } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createTestCategoryDescription, createTestPropertiesContentField } from "./Content";
import { PresentationInstanceFilterPropertyInfo } from "../../presentation-components/instance-filter-builder/PresentationFilterBuilder";

export function createTestECInstanceKey(key?: Partial<InstanceKey>): InstanceKey {
  return {
    className: key?.className ?? "TestSchema:TestClass",
    id: key?.id ?? "0x1",
  };
}

export const createTestECClassInfo = (props?: Partial<ClassInfo>) => ({
  id: "0x1",
  name: "SchemaName:ClassName",
  label: "Class Label",
  ...props,
});

export const createTestPropertyInfo = (props?: Partial<PropertyInfo>) => ({
  classInfo: createTestECClassInfo(),
  name: "PropertyName",
  type: "string",
  ...props,
});

export const createTestRelatedClassInfo = (props?: Partial<RelatedClassInfo>) => ({
  sourceClassInfo: createTestECClassInfo({ id: "0x1", name: "source:class", label: "Source" }),
  targetClassInfo: createTestECClassInfo({ id: "0x2", name: "target:class", label: "Target" }),
  isPolymorphicTargetClass: false,
  relationshipInfo: createTestECClassInfo({ id: "0x3", name: "relationship:class", label: "Relationship" }),
  isForwardRelationship: false,
  isPolymorphicRelationship: false,
  ...props,
});

export const createTestRelatedClassInfoWithOptionalRelationship = (props?: Partial<RelatedClassInfoWithOptionalRelationship>) => ({
  sourceClassInfo: createTestECClassInfo({ id: "0x1", name: "source:class", label: "Source" }),
  targetClassInfo: createTestECClassInfo({ id: "0x2", name: "target:class", label: "Target" }),
  isPolymorphicTargetClass: false,
  ...props,
});

export const createTestRelationshipPath = (length: number = 2) => {
  const path = new Array<RelatedClassInfo>();
  while (length--) {
    path.push(createTestRelatedClassInfo());
  }
  return path;
};

export function isKeySet(expectedKeys: Keys) {
  const expected = new KeySet(expectedKeys);
  return It.is<KeySet>((actual: KeySet) => actual.size === expected.size && actual.hasAll(expected));
}

export function createTestRuleset(ruleset?: Partial<Ruleset>): Ruleset {
  return {
    id: ruleset?.id ?? "Test",
    rules: ruleset?.rules ?? [],
  };
}

const recursiveWait = async (pred: () => boolean, repeater: () => Promise<void>) => {
  if (pred()) {
    await BeDuration.wait(0);
    await repeater();
  }
};

export const waitForAllAsyncs = async (handlers: Array<{ pendingAsyncs: Set<string> }>) => {
  const pred = () => handlers.some((h) => h.pendingAsyncs.size > 0);
  await recursiveWait(pred, async () => waitForAllAsyncs(handlers));
};

export const waitForPendingAsyncs = async (handler: { pendingAsyncs: Set<string> }) => {
  const initialAsyncs = [...handler.pendingAsyncs];
  const pred = () => initialAsyncs.filter((initial) => handler.pendingAsyncs.has(initial)).length > 0;
  const recursiveWaitInternal = async (): Promise<void> => recursiveWait(pred, recursiveWaitInternal);
  await recursiveWaitInternal();
};

/**
 * Custom render function that wraps around `render` function from `@testing-library/react` and additionally
 * setup `userEvent` from `@testing-library/user-event`.
 *
 * It should be used when test need to do interactions with rendered components.
 */
export function render(...args: Parameters<typeof renderRTL>): ReturnType<typeof renderRTL> & { user: ReturnType<(typeof userEvent)["setup"]> } {
  const user = userEvent.setup();
  return {
    ...renderRTL(...args),
    user,
  };
}

/**
 * Stubs global 'requestAnimationFrame' and 'cancelAnimationFrame' functions.
 * This is needed for tests using 'react-select' component.
 */
export function stubRaf() {
  const raf = global.requestAnimationFrame;
  const caf = global.cancelAnimationFrame;

  before(() => {
    Object.defineProperty(global, "requestAnimationFrame", {
      writable: true,
      value: (cb: FrameRequestCallback) => {
        return setTimeout(cb, 0);
      },
    });
    Object.defineProperty(global, "cancelAnimationFrame", {
      writable: true,
      value: (handle: number) => {
        clearTimeout(handle);
      },
    });
  });

  after(() => {
    Object.defineProperty(global, "requestAnimationFrame", {
      writable: true,
      value: raf,
    });
    Object.defineProperty(global, "cancelAnimationFrame", {
      writable: true,
      value: caf,
    });
  });
}

export const createTestPresentationInstanceFilterPropertyInfo = (props?: Partial<PresentationInstanceFilterPropertyInfo>) => ({
  sourceClassId: "0x1",
  field: createTestPropertiesContentField({ properties: [{ property: createTestPropertyInfo() }], category: createTestCategoryDescription() }),
  propertyDescription: {
    name: "TestName",
    displayLabel: "TestDisplayLabel",
    typename: "string",
  },
  className: "testSchema:testClass",
  ...props,
});

/**
 * Stubs global 'DOMMatrix' interface.
 * 'DOMMatrix' is needed for tests using draggable 'Dialog'.
 */
export function stubDOMMatrix() {
  const domMatrix = global.DOMMatrix;

  before(() => {
    Object.defineProperty(global, "DOMMatrix", {
      writable: true,
      value: sinon.fake(() => ({ m41: 0, m42: 0 })),
    });
  });

  after(() => {
    Object.defineProperty(global, "DOMGlobal", {
      writable: true,
      value: domMatrix,
    });
  });
}

/** Props for `TestErrorBoundary` */
export interface TestErrorBoundaryProps {
  children: React.ReactNode;
  onError: (error: Error, componentStack: any) => void;
}
/** Internal state of `TestErrorBoundary` */
export interface TestErrorBoundaryState {
  hasError?: boolean;
}
/**
 * A component for testing component's error reporting. React error boundaries only capture errors thrown
 * in React's lifecycle and render methods. Errors thrown outside of that (e.g. in async callbacks) aren't captured.
 * The purpose of this component is to help test is the errors are thrown correctly.
 *
 * Example usage:
 * ```tsx
 * const errorSpy = sinon.spy();
 * render(
 *   <TestErrorBoundary onError={errorSpy}>
 *     <TestComponent />
 *   </TestErrorBoundary>
 * );
 * await waitFor(() => {
 *   expect(errorSpy).to.be.calledOnce.and.calledWith(sinon.match((error: Error) => error.message === "test error"));
 * });
 * ```
 */
export class TestErrorBoundary extends Component<TestErrorBoundaryProps, TestErrorBoundaryState> {
  public constructor(props: TestErrorBoundaryProps) {
    super(props);
    this.state = {};
  }
  // eslint-disable-next-line @typescript-eslint/explicit-member-accessibility
  static getDerivedStateFromError(): TestErrorBoundaryState {
    return { hasError: true };
  }
  public override componentDidCatch(error: Error, info: any) {
    this.props.onError(error, info.componentStack);
  }
  public override render() {
    if (this.state.hasError) {
      return null;
    }
    return this.props.children;
  }
}
