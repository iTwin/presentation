/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, DropdownMenu, LabeledSelect, MenuExtraContent, ToggleSwitch } from "@itwin/itwinui-react";
import { DiagnosticsLoggerSeverity } from "@itwin/presentation-common";
import { DiagnosticsProps } from "@itwin/presentation-components";
import { consoleDiagnosticsHandler } from "@itwin/presentation-frontend";

export interface DiagnosticsSelectorProps {
  onDiagnosticsOptionsChanged: (diagnosticsOptions: DiagnosticsProps) => void;
}

export function DiagnosticsSelector(props: DiagnosticsSelectorProps) {
  const { onDiagnosticsOptionsChanged } = props;

  const [shouldMeasurePerformance, toggleMeasurePerformance] = useState(false);
  const [editorSeverity, setEditorSeverity] = useState("error");
  const [devSeverity, setDevSeverity] = useState("error");
  const result = useMemo((): DiagnosticsProps => ({
    ruleDiagnostics: {
      severity: editorSeverity as DiagnosticsLoggerSeverity,
      handler: consoleDiagnosticsHandler,
    },
    devDiagnostics: {
      perf: shouldMeasurePerformance,
      severity: devSeverity as DiagnosticsLoggerSeverity,
      handler: consoleDiagnosticsHandler,
    },
  }), [shouldMeasurePerformance, editorSeverity, devSeverity]);

  useEffect(() => {
    onDiagnosticsOptionsChanged(result);
    // note: intentionally empty dependency list - we only want `onDiagnosticsOptionsChanged` to be called on first render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleMeasurePerformanceChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    toggleMeasurePerformance(e.target.checked);
  }, []);

  const menuItems = () => [
    <MenuExtraContent key={0}>
      <LabeledSelect
        label="Editor severity"
        options={[
          { value: "error", label: "Error" },
          { value: "warning", label: "Warning" },
          { value: "info", label: "Info" },
        ]}
        value={editorSeverity}
        onChange={(newValue: string) => setEditorSeverity(newValue)}
        size="small"
      />
      <LabeledSelect
        label="Dev severity"
        options={[
          { value: "error", label: "Error" },
          { value: "warning", label: "Warning" },
          { value: "info", label: "Info" },
          { value: "debug", label: "Debug" },
          { value: "trace", label: "Trace" },
        ]}
        value={devSeverity}
        onChange={(newValue: string) => setDevSeverity(newValue)}
        size="small"
      />
      <ToggleSwitch label="Measure performance" labelPosition="right" checked={shouldMeasurePerformance} onChange={handleMeasurePerformanceChange} />
    </MenuExtraContent>
  ];

  return (
    <DropdownMenu menuItems={menuItems} onClickOutside={() => {}} onHide={() => onDiagnosticsOptionsChanged(result)}>
      <Button size="small">Diagnostics</Button>
    </DropdownMenu>
  );
}
