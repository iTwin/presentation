/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { useState } from "react";
import { SelectionScope } from "@itwin/unified-selection";

interface SelectionScopePickerProps {
  onSelectionScopeChanged: (scope: SelectionScope) => void;
}

export function SelectionScopePicker(props: SelectionScopePickerProps) {
  const [activeScopeId, setActiveScopeId] = useState<keyof typeof SELECTION_SCOPES>("element");
  const onSelectedScopeChanged = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const scopeId = e.target.value as keyof typeof SELECTION_SCOPES;
    setActiveScopeId(scopeId);
    if (props.onSelectionScopeChanged) {
      props.onSelectionScopeChanged(SELECTION_SCOPES[scopeId].scope);
    }
  };
  return (
    <div className="SelectionScopePicker">
      <select onChange={onSelectedScopeChanged} value={activeScopeId}>
        {Object.entries(SELECTION_SCOPES).map(([id, { label }]) => (
          <option value={id} key={id}>
            {label}
          </option>
        ))}
      </select>
    </div>
  );
}

const SELECTION_SCOPES: { [id: string]: { scope: SelectionScope; label: string } } = {
  element: {
    scope: { id: "element" },
    label: "Element",
  },
  assembly: {
    scope: { id: "element", ancestorLevel: 1 },
    label: "Assembly",
  },
  "top-assembly": {
    scope: { id: "element", ancestorLevel: -1 },
    label: "Top assembly",
  },
  "functional-element": {
    scope: { id: "functional" },
    label: "Functional element",
  },
  "functional-assembly": {
    scope: { id: "functional", ancestorLevel: 1 },
    label: "Functional assembly",
  },
  "functional-top-assembly": {
    scope: { id: "functional", ancestorLevel: -1 },
    label: "Functional top assembly",
  },
  model: {
    scope: { id: "model" },
    label: "Model",
  },
  category: {
    scope: { id: "category" },
    label: "Category",
  },
};
