/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import "./LabelEditor.css";

import { useEffect, useId, useRef, useState } from "react";
import { FormHelperText, IconButton, TextField, Typography } from "@mui/material";
import { Icon } from "@stratakit/mui";
import { useTranslation } from "../LocalizationContext.js";

import checkmarkSvg from "@stratakit/icons/checkmark.svg";
import dismissSvg from "@stratakit/icons/dismiss.svg";

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
