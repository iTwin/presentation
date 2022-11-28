/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { LabelCompositeValue, LabelCompositeValueJSON, LabelDefinition, LabelDefinitionJSON } from "@itwin/presentation-common";

export function createTestLabelDefinition(label?: Partial<LabelDefinition>): LabelDefinition {
  return {
    displayValue: label?.displayValue ?? "test label",
    rawValue: label?.rawValue ?? "test_label",
    typeName: label?.typeName ?? "string",
  };
}

export function createTestLabelDefinitionJSON(label?: Partial<LabelDefinitionJSON>): LabelDefinitionJSON {
  return {
    displayValue: label?.displayValue ?? "test label",
    rawValue: label?.rawValue ?? "test_label",
    typeName: "string",
  };
}

export function createTestLabelCompositeValue(value?: Partial<LabelCompositeValue>): LabelCompositeValue {
  return {
    separator: value?.separator ?? "-",
    values: value?.values ?? [createTestLabelDefinition(), createTestLabelDefinition()],
  };
}

export function createTestLabelCompositeValueJSON(value?: Partial<LabelCompositeValueJSON>): LabelCompositeValueJSON {
  return {
    separator: value?.separator ?? "-",
    values: value?.values ?? [createTestLabelDefinitionJSON(), createTestLabelDefinitionJSON()],
  };
}
