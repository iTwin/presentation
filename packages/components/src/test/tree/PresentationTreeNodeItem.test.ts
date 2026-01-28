/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable @typescript-eslint/no-deprecated */

import { expect } from "chai";
import { PropertyRecord } from "@itwin/appui-abstract";
import { createTestECInstancesNodeKey } from "../_helpers/Hierarchy.js";
import {
  InfoTreeNodeItemType,
  isPresentationInfoTreeNodeItem,
  isPresentationTreeNodeItem,
} from "../../presentation-components/tree/PresentationTreeNodeItem.js";

import type { TreeNodeItem } from "@itwin/components-react";
import type { PresentationInfoTreeNodeItem, PresentationTreeNodeItem } from "../../presentation-components/tree/PresentationTreeNodeItem.js";

describe("isPresentationTreeNodeItem", () => {
  it("returns correct values", () => {
    const presentationItem: PresentationTreeNodeItem = {
      id: "presentation_item_id",
      key: createTestECInstancesNodeKey(),
      label: PropertyRecord.fromString("Presentation Item"),
    };
    const simpleItem: TreeNodeItem = {
      id: "simple_item_id",
      label: PropertyRecord.fromString("Simple Item"),
    };
    expect(isPresentationTreeNodeItem(presentationItem)).to.be.true;
    expect(isPresentationTreeNodeItem(simpleItem)).to.be.false;
  });
});

describe("isPresentationInfoTreeNodeItem", () => {
  it("returns correct values", () => {
    const presentationInfoItem: PresentationInfoTreeNodeItem = {
      id: "presentation_info_item_id",
      label: PropertyRecord.fromString("Presentation Item"),
      children: undefined,
      isSelectionDisabled: true,
      message: "Info message",
      type: InfoTreeNodeItemType.Unset,
    };
    const presentationItem: PresentationTreeNodeItem = {
      id: "presentation_item_id",
      key: createTestECInstancesNodeKey(),
      label: PropertyRecord.fromString("Presentation Item"),
    };
    const simpleItem: TreeNodeItem = {
      id: "simple_item_id",
      label: PropertyRecord.fromString("Simple Item"),
    };
    expect(isPresentationInfoTreeNodeItem(presentationInfoItem)).to.be.true;
    expect(isPresentationInfoTreeNodeItem(presentationItem)).to.be.false;
    expect(isPresentationInfoTreeNodeItem(simpleItem)).to.be.false;
  });
});
