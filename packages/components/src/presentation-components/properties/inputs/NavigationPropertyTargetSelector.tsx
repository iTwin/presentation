/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import "./NavigationPropertyTargetSelector.scss";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { PropertyDescription, PropertyRecord, PropertyValue, PropertyValueFormat } from "@itwin/appui-abstract";
import { PropertyEditorProps, PropertyValueRendererManager } from "@itwin/components-react";
import { IModelConnection } from "@itwin/core-frontend";
import { ComboBox, SelectOption } from "@itwin/itwinui-react";
import { InstanceKey, LabelDefinition, NavigationPropertyInfo } from "@itwin/presentation-common";
import { translate } from "../../common/Utils.js";
import { PropertyEditorAttributes } from "../editors/Common.js";
import { FILTER_WARNING_OPTION, VALUE_BATCH_SIZE } from "./ItemsLoader.js";
import { NavigationPropertyTarget, useNavigationPropertyTargetsLoader, useNavigationPropertyTargetsRuleset } from "./UseNavigationPropertyTargetsLoader.js";

/** @internal */
export interface NavigationPropertyTargetSelectorProps extends PropertyEditorProps {
  imodel: IModelConnection;
  getNavigationPropertyInfo: (property: PropertyDescription) => Promise<NavigationPropertyInfo | undefined>;
  propertyRecord: PropertyRecord;
}

/** @internal */
export const NavigationPropertyTargetSelector = forwardRef<PropertyEditorAttributes, NavigationPropertyTargetSelectorProps>((props, ref) => {
  const { imodel, getNavigationPropertyInfo, propertyRecord, onCommit } = props;
  const [selectedTarget, setSelectedTarget] = useState(() => getNavigationTargetFromPropertyRecord(propertyRecord));
  const [searchInput, setSearchInput] = useState<string | undefined>();
  const targetsRuleset = useNavigationPropertyTargetsRuleset(getNavigationPropertyInfo, propertyRecord.property);
  const { selectOptions, loadedOptions, isLoading } = useNavigationPropertyTargetsLoader({
    imodel,
    ruleset: targetsRuleset,
    filterText: searchInput,
    initialSelectedTarget: selectedTarget?.label.displayValue,
  });
  const divRef = useRef<HTMLDivElement>(null);

  const emptyContent = useMemo(() => {
    return isLoading ? translate("navigation-property-editor.loading-target-instances") : translate("navigation-property-editor.no-target-instances");
  }, [isLoading]);

  const onChange = useCallback(
    (newValue?: string) => {
      const newSelectedTarget = loadedOptions.find((loadedOption) => loadedOption.label.displayValue === newValue);
      setSelectedTarget(newSelectedTarget);
      newSelectedTarget && onCommit && onCommit({ propertyRecord, newValue: getPropertyValue(newSelectedTarget) });
    },
    [loadedOptions, onCommit, propertyRecord],
  );

  useImperativeHandle(
    ref,
    () => ({
      getValue: () => getPropertyValue(selectedTarget),
      htmlElement: divRef.current,
    }),
    [selectedTarget],
  );

  useEffect(() => {
    setSelectedTarget(getNavigationTargetFromPropertyRecord(propertyRecord));
  }, [propertyRecord]);

  if (!targetsRuleset) {
    return <ReadonlyNavigationPropertyTarget record={props.propertyRecord} />;
  }

  return (
    <ComboBox
      multiple={false}
      enableVirtualization={true}
      options={selectOptions}
      onChange={onChange}
      filterFunction={(options: SelectOption<string>[], inputValue: string) => {
        const filteredOptions = options
          .filter((option) => option.label.toLowerCase().includes(inputValue.toLowerCase()) && option.value !== FILTER_WARNING_OPTION.value)
          .slice(0, VALUE_BATCH_SIZE);

        if (filteredOptions.length >= VALUE_BATCH_SIZE) {
          filteredOptions.push(FILTER_WARNING_OPTION);
        }

        return filteredOptions;
      }}
      emptyStateMessage={emptyContent}
      value={selectedTarget?.label.displayValue}
      inputProps={{
        placeholder: translate("navigation-property-editor.select-target-instance"),
        size: "small",
        onChange: (e) => {
          setSearchInput(e.target.value);
        },
      }}
    />
  );
});
NavigationPropertyTargetSelector.displayName = "NavigationPropertyTargetSelector";

/** @internal */
export interface ReadonlyNavigationPropertyTargetProps {
  record: PropertyRecord;
}

/** @internal */
export function ReadonlyNavigationPropertyTarget(props: ReadonlyNavigationPropertyTargetProps) {
  const { record } = props;
  return <>{PropertyValueRendererManager.defaultManager.render(record)}</>;
}

function getPropertyValue(target?: NavigationPropertyTarget): PropertyValue {
  return { valueFormat: PropertyValueFormat.Primitive, value: target?.key, displayValue: target?.label.displayValue };
}

function getNavigationTargetFromPropertyRecord(record: PropertyRecord): NavigationPropertyTarget | undefined {
  const value = record.value;
  if (value.valueFormat !== PropertyValueFormat.Primitive || !value.value || !value.displayValue) {
    return undefined;
  }

  return { key: value.value as InstanceKey, label: LabelDefinition.fromLabelString(value.displayValue) };
}
