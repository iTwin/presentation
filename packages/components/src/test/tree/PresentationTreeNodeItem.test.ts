/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable @typescript-eslint/no-deprecated */

import { describe, expect, it } from "vitest";
import { PropertyRecord } from "@itwin/appui-abstract";
import {
  InfoTreeNodeItemType,
  isPresentationInfoTreeNodeItem,
  isPresentationTreeNodeItem,
} from "../../presentation-components/tree/PresentationTreeNodeItem.js";
import { createTestECInstancesNodeKey } from "../_helpers/Hierarchy.js";

import type { TreeNodeItem } from "@itwin/components-react";
import type {
  PresentationInfoTreeNodeItem,
  PresentationTreeNodeItem,
} from "../../presentation-components/tree/PresentationTreeNodeItem.js";

describe("isPresentationTreeNodeItem", () => {
  it("returns correct values", () => {
    const presentationItem: PresentationTreeNodeItem = {
      id: "presentation_item_id",
      key: createTestECInstancesNodeKey(),
      label: PropertyRecord.fromString("Presentation Item"),
    };
    const simpleItem: TreeNodeItem = { id: "simple_item_id", label: PropertyRecord.fromString("Simple Item") };
    expect(isPresentationTreeNodeItem(presentationItem)).toBe(true);
    expect(isPresentationTreeNodeItem(simpleItem)).toBe(false);
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
    const simpleItem: TreeNodeItem = { id: "simple_item_id", label: PropertyRecord.fromString("Simple Item") };
    expect(isPresentationInfoTreeNodeItem(presentationInfoItem)).toBe(true);
    expect(isPresentationInfoTreeNodeItem(presentationItem)).toBe(false);
    expect(isPresentationInfoTreeNodeItem(simpleItem)).toBe(false);
  });
});
