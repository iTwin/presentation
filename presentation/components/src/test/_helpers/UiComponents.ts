/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/* tslint:disable:no-direct-imports */

import * as faker from "faker";
import { NodeKey } from "@bentley/presentation-common";
import { createRandomECInstancesNodeKey } from "@bentley/presentation-common/lib/test/_helpers/random";
import { PrimitiveValue, PropertyDescription, PropertyRecord, PropertyValueFormat } from "@bentley/ui-abstract";
import { DelayLoadedTreeNodeItem } from "@bentley/ui-components";
import { PRESENTATION_TREE_NODE_KEY } from "../../presentation-components/tree/Utils";

export const createRandomTreeNodeItem = (key?: NodeKey, parentId?: string): DelayLoadedTreeNodeItem => {
  const node = {
    id: faker.random.uuid(),
    parentId,
    label: PropertyRecord.fromString(faker.random.word()),
    description: faker.random.words(),
    hasChildren: faker.random.boolean(),
  };
  (node as any)[PRESENTATION_TREE_NODE_KEY] = key ? key : createRandomECInstancesNodeKey();
  return node;
};

export const createRandomPropertyRecord = (): PropertyRecord => {
  const value: PrimitiveValue = {
    valueFormat: PropertyValueFormat.Primitive,
    value: faker.random.word(),
    displayValue: faker.random.words(),
  };
  const descr: PropertyDescription = {
    typename: "string",
    name: faker.random.word(),
    displayLabel: faker.random.word(),
  };
  return new PropertyRecord(value, descr);
};
