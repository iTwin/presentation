/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import * as moq from "typemoq";
import { PrimitiveValue, PropertyDescription, PropertyRecord, PropertyValueFormat } from "@itwin/appui-abstract";
import { DelayLoadedTreeNodeItem } from "@itwin/components-react";
import { BeEvent } from "@itwin/core-bentley";
import { NodeKey, RegisteredRuleset, Ruleset, VariableValue } from "@itwin/presentation-common";
import {
  IModelContentChangeEventArgs,
  IModelHierarchyChangeEventArgs,
  PresentationManager,
  RulesetManager,
  RulesetVariablesManager,
} from "@itwin/presentation-frontend";
import { PresentationTreeNodeItem } from "../../presentation-components/tree/PresentationTreeNodeItem";
import { createTestECInstancesNodeKey } from "./Hierarchy";

export function createTestTreeNodeItem(key?: NodeKey, partialNode?: Partial<DelayLoadedTreeNodeItem>): PresentationTreeNodeItem {
  const node = {
    id: partialNode?.id ?? "node_id",
    parentId: partialNode?.parentId,
    label: partialNode?.label ?? PropertyRecord.fromString("Node Label"),
    description: partialNode?.description ?? "Test Node Description",
    hasChildren: partialNode?.hasChildren ?? false,
    key: key ? key : createTestECInstancesNodeKey(),
  };
  return node;
}

export function createTestPropertyRecord(value?: Partial<PrimitiveValue>, property?: Partial<PropertyDescription>): PropertyRecord {
  const recordValue: PrimitiveValue = {
    valueFormat: PropertyValueFormat.Primitive,
    value: "test_prop_value",
    displayValue: "test_prop_displayValue",
    ...value,
  };
  const descr: PropertyDescription = {
    typename: "string",
    name: "test_prop",
    displayLabel: "TestProp",
    ...property,
  };
  return new PropertyRecord(recordValue, descr);
}

export function mockPresentationManager() {
  const onRulesetModified = new BeEvent<(curr: RegisteredRuleset, prev: Ruleset) => void>();
  const rulesetManagerMock = moq.Mock.ofType<RulesetManager>();
  rulesetManagerMock.setup((x) => x.onRulesetModified).returns(() => onRulesetModified);

  const onRulesetVariableChanged = new BeEvent<(variableId: string, prevValue: VariableValue, currValue: VariableValue) => void>();
  const rulesetVariablesManagerMock = moq.Mock.ofType<RulesetVariablesManager>();
  rulesetVariablesManagerMock.setup((x) => x.onVariableChanged).returns(() => onRulesetVariableChanged);

  const onIModelHierarchyChanged = new BeEvent<(args: IModelHierarchyChangeEventArgs) => void>();
  const onIModelContentChanged = new BeEvent<(args: IModelContentChangeEventArgs) => void>();
  const presentationManagerMock = moq.Mock.ofType<PresentationManager>();
  presentationManagerMock.setup((x) => x.onIModelHierarchyChanged).returns(() => onIModelHierarchyChanged);
  presentationManagerMock.setup((x) => x.onIModelContentChanged).returns(() => onIModelContentChanged);
  presentationManagerMock.setup((x) => x.rulesets()).returns(() => rulesetManagerMock.object);
  presentationManagerMock.setup((x) => x.vars(moq.It.isAny())).returns(() => rulesetVariablesManagerMock.object);

  return {
    rulesetsManager: rulesetManagerMock,
    rulesetVariablesManager: rulesetVariablesManagerMock,
    presentationManager: presentationManagerMock,
  };
}
