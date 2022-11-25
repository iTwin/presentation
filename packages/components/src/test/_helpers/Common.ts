/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { It } from "typemoq";
import { BeDuration } from "@itwin/core-bentley";
import {
  ClassInfo, InstanceKey, Keys, KeySet, PropertyInfo, RelatedClassInfo, RelatedClassInfoWithOptionalRelationship, Ruleset,
} from "@itwin/presentation-common";

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
  while (length--)
    path.push(createTestRelatedClassInfo());
  return path;
};

export function isKeySet(expectedKeys: Keys) {
  const expected = new KeySet(expectedKeys);
  return It.is<KeySet>((actual: KeySet) => (actual.size === expected.size && actual.hasAll(expected)));
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
  const pred = () => handlers.some((h) => (h.pendingAsyncs.size > 0));
  await recursiveWait(pred, async () => waitForAllAsyncs(handlers));
};

export const waitForPendingAsyncs = async (handler: { pendingAsyncs: Set<string> }) => {
  const initialAsyncs = [...handler.pendingAsyncs];
  const pred = () => initialAsyncs.filter((initial) => handler.pendingAsyncs.has(initial)).length > 0;
  const recursiveWaitInternal = async (): Promise<void> => recursiveWait(pred, recursiveWaitInternal);
  await recursiveWaitInternal();
};
