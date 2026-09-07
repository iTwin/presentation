/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import "./LabelEditor.css";

import { useEffect, useId, useRef, useState } from "react";
import { FormHelperText, IconButton, Paper, TextField, Typography } from "@mui/material";
import { Icon } from "@stratakit/mui";
import { useTranslation } from "../LocalizationContext.js";

import checkmarkSvg from "@stratakit/icons/checkmark.svg";
import dismissSvg from "@stratakit/icons/dismiss.svg";

import type { CSSProperties } from "react";
import type { TreeNode } from "../TreeNode.js";
import type { RenameParameters } from "./TreeNodeRenameAction.js";

/**
 * Renders the label editor for the node whose rename is in progress. It's rendered once at the tree
 * level and positioned at the given node's location, so individual rows don't pay the cost of
 * mounting a popover.
 *
 * @internal
 */
export function TreeNodeLabelEditorOverlay({
  node,
  renameParameters,
  onCancel,
  style,
}: {
  node: TreeNode;
  renameParameters: RenameParameters;
  onCancel?: () => void;
  /** Placement of the overlay, generally an offset to the node's location within the tree. */
  style?: CSSProperties;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // like a popover, dismiss when the user interacts outside the editor
    const handlePointerDown = (e: PointerEvent) => {
      if (!overlayRef.current?.contains(e.target as Node)) {
        onCancel?.();
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [onCancel]);
  return (
    <Paper ref={overlayRef} elevation={8} className="phr-node-label-editor-overlay" style={style}>
      <LabelEditor
        initialLabel={node.label}
        onChange={renameParameters.commit}
        onCancel={onCancel}
        labelValidationHint={renameParameters.labelValidationHint}
        validate={renameParameters.validate}
      />
    </Paper>
  );
}

interface LabelEditorProps {
  initialLabel: string;
  labelValidationHint?: string;
  onChange?: (newLabel: string) => void;
  onCancel?: () => void;
  validate?: (newLabel: string) => boolean;
}

/**
 * An editor for changing a tree node's label, rendered in a popover when node rename is initiated.
 *
 * @internal
 */
export function LabelEditor({ initialLabel, labelValidationHint, onChange, onCancel, validate }: LabelEditorProps) {
  const translate = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [newLabelValue, setNewLabelValue] = useState(initialLabel);
  const [hasError, setHasError] = useState<boolean>(false);
  const handleLabelChange = () => {
    if (validate && !validate(newLabelValue)) {
      setHasError(true);
      return;
    }

    if (initialLabel !== newLabelValue) {
      onChange?.(newLabelValue);
      return;
    }
    onCancel?.();
  };

  const cancelLabelChange = () => {
    setNewLabelValue(initialLabel);
    onCancel?.();
  };

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, []);

  const canRename = newLabelValue && newLabelValue !== initialLabel && !hasError;
  const inputId = useId();

  return (
    <div key={initialLabel} className="phr-node-label-editor">
      <div className="phr-node-label-editor-input-row">
        <TextField
          fullWidth
          error={hasError}
          size="small"
          id={inputId}
          inputRef={inputRef}
          slotProps={{ htmlInput: { "aria-label": translate("newLabel") } }}
          value={newLabelValue}
          onChange={(event) => {
            setNewLabelValue(event.target.value);
            setHasError(false);
          }}
          onKeyUp={(event) => {
            if (event.key === "Enter") {
              handleLabelChange();
            } else if (event.key === "Escape") {
              cancelLabelChange();
            }
          }}
        />
        <IconButton aria-label={translate("cancel")} onClick={cancelLabelChange} size="small">
          <Icon href={dismissSvg} />
        </IconButton>
        <IconButton aria-label={translate("confirm")} onClick={handleLabelChange} disabled={!canRename} size="small">
          <Icon href={checkmarkSvg} />
        </IconButton>
      </div>
      {labelValidationHint !== undefined ? (
        <FormHelperText error={hasError} style={{ display: "flex" }}>
          <Typography variant="caption-md">{labelValidationHint}</Typography>
        </FormHelperText>
      ) : undefined}
    </div>
  );
}
