/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Internal
 */

import "@itwin/itwinui-css/css/tag.css";
import "@itwin/itwinui-css/css/input.css";
import "@itwin/itwinui-css/css/menu.css";
import classnames from "classnames";
import { Children, forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import {
  components,
  ControlProps,
  DropdownIndicatorProps,
  IndicatorsContainerProps,
  MenuProps,
  OptionProps,
  SingleValue,
  ValueContainerProps,
} from "react-select";
import { AsyncPaginate } from "react-select-async-paginate";
import { PropertyDescription, PropertyRecord, PropertyValue, PropertyValueFormat } from "@itwin/appui-abstract";
import { PropertyEditorProps, PropertyValueRendererManager } from "@itwin/components-react";
import { IModelConnection } from "@itwin/core-frontend";
import { SvgCaretDownSmall } from "@itwin/itwinui-icons-react";
import { InstanceKey, LabelDefinition, NavigationPropertyInfo } from "@itwin/presentation-common";
import { mergeRefs, translate, useResizeObserver } from "../common/Utils";
import { NavigationPropertyTarget, useNavigationPropertyTargetsLoader, useNavigationPropertyTargetsRuleset } from "./UseNavigationPropertyTargetsLoader";

/** @internal */
export interface NavigationPropertyTargetSelectorAttributes {
  getValue: () => PropertyValue | undefined;
  divElement: HTMLDivElement | null;
}

/** @internal */
export interface NavigationPropertyTargetSelectorProps extends PropertyEditorProps {
  imodel: IModelConnection;
  getNavigationPropertyInfo: (property: PropertyDescription) => Promise<NavigationPropertyInfo | undefined>;
  propertyRecord: PropertyRecord;
}

/** @internal */
export const NavigationPropertyTargetSelector = forwardRef<NavigationPropertyTargetSelectorAttributes, NavigationPropertyTargetSelectorProps>((props, ref) => {
  const { imodel, getNavigationPropertyInfo, propertyRecord, onCommit, setFocus } = props;
  const targetsRuleset = useNavigationPropertyTargetsRuleset(getNavigationPropertyInfo, propertyRecord.property);
  const loadTargets = useNavigationPropertyTargetsLoader({ imodel, ruleset: targetsRuleset });

  const [selectedTarget, setSelectedTarget] = useState(() => getNavigationTargetFromPropertyRecord(propertyRecord));

  const onChange = useCallback(
    (target: SingleValue<NavigationPropertyTarget>) => {
      // istanbul ignore next
      setSelectedTarget(target === null ? undefined : target);
      target && onCommit && onCommit({ propertyRecord, newValue: getPropertyValue(target) });
    },
    [propertyRecord, onCommit],
  );

  const divRef = useRef<HTMLDivElement>(null);
  useImperativeHandle(
    ref,
    () => ({
      getValue: () => getPropertyValue(selectedTarget),
      divElement: divRef.current,
    }),
    [selectedTarget],
  );

  useEffect(() => {
    setSelectedTarget(getNavigationTargetFromPropertyRecord(propertyRecord));
  }, [propertyRecord]);

  const { ref: selectRef, width } = useResizeObserver();

  if (!targetsRuleset) return <ReadonlyNavigationPropertyTarget record={props.propertyRecord} />;

  return (
    <div ref={mergeRefs(divRef, selectRef)}>
      <AsyncPaginate
        isMulti={false}
        onChange={onChange}
        value={selectedTarget ?? null}
        getOptionLabel={(option: NavigationPropertyTarget) => option.label.displayValue}
        getOptionValue={(option: NavigationPropertyTarget) => option.key.id}
        hideSelectedOptions={false}
        debounceTimeout={500}
        loadOptions={async (inputValue, options) => loadTargets(inputValue, options.length)}
        cacheUniqs={[loadTargets]}
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus={setFocus}
        placeholder={<>{translate("navigation-property-editor.select-target-instance")}</>}
        loadingMessage={() => translate("navigation-property-editor.loading-target-instances")}
        styles={{
          control: () => ({ height: "27px" }),
          container: () => ({ width: "auto" }),
          valueContainer: () => ({ height: "27px", ["--_iui-select-padding-block"]: 0, ["--_iui-select-min-height"]: "var(--iui-component-height-small)" }),
          menu: () => ({ position: "absolute", zIndex: 9999, width }),
          menuList: (style: any) => ({ ...style, padding: 0 }),
          option: () => ({ whiteSpace: "nowrap", width: "max-content", minWidth: "100%" }),
          placeholder: (style: any) => ({ ...style, position: "relative", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }),
          dropdownIndicator: () => ({ backgroundColor: "var(--iui-color-background)" }),
        }}
        components={{
          Control: TargetSelectControl,
          ValueContainer: TargetSelectValueContainer,
          Menu: TargetSelectMenu,
          Option: TargetSelectOption,
          IndicatorsContainer: TargetSelectIndicatorsContainer,
          DropdownIndicator: TargetSelectDropdownIndicator,
        }}
      />
    </div>
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
  if (value.valueFormat !== PropertyValueFormat.Primitive || !value.value || !value.displayValue) return undefined;

  return { key: value.value as InstanceKey, label: LabelDefinition.fromLabelString(value.displayValue) };
}

function TargetSelectControl<TOption, IsMulti extends boolean = boolean>({ children, ...props }: ControlProps<TOption, IsMulti>) {
  return (
    <components.Control {...props} className="iui-input-with-icon">
      {children}
    </components.Control>
  );
}

function TargetSelectValueContainer<TOption, IsMulti extends boolean = boolean>({ children, ...props }: ValueContainerProps<TOption, IsMulti>) {
  return (
    <components.ValueContainer {...props} className="iui-select-button">
      {children}
    </components.ValueContainer>
  );
}

function TargetSelectMenu<TOption, IsMulti extends boolean = boolean>({ children, ...props }: MenuProps<TOption, IsMulti>) {
  return (
    <components.Menu {...props} className="iui-menu">
      {children}
    </components.Menu>
  );
}

function TargetSelectOption<TOption, IsMulti extends boolean = boolean>({ children: _, ...props }: OptionProps<TOption, IsMulti>) {
  const className = classnames("iui-menu-item", {
    "iui-focused": props.isFocused,
    "iui-active": props.isSelected,
  });

  return (
    <components.Option {...props} className={className}>
      {props.selectProps.getOptionLabel && props.selectProps.getOptionLabel(props.data)}
    </components.Option>
  );
}

function TargetSelectIndicatorsContainer<TOption, IsMulti extends boolean = boolean>({ children }: IndicatorsContainerProps<TOption, IsMulti>) {
  return <>{Children.toArray(children).pop()}</>;
}

function TargetSelectDropdownIndicator<TOption, IsMulti extends boolean = boolean>(props: DropdownIndicatorProps<TOption, IsMulti>) {
  return (
    <components.DropdownIndicator {...props} className="iui-end-icon iui-actionable">
      <SvgCaretDownSmall />
    </components.DropdownIndicator>
  );
}
