/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { LabelCompositeValue, LabelDefinition } from "@itwin/presentation-common";

export function createTestLabelDefinition(label?: Partial<LabelDefinition>): LabelDefinition {
  return {
    displayValue: label?.displayValue ?? "test label",
    rawValue: label?.rawValue ?? "test_label",
    typeName: label?.typeName ?? "string",
  };
}

export function createTestLabelCompositeValue(value?: Partial<LabelCompositeValue>): LabelCompositeValue {
  return {
    separator: value?.separator ?? "-",
    values: value?.values ?? [createTestLabelDefinition(), createTestLabelDefinition()],
  };
}
