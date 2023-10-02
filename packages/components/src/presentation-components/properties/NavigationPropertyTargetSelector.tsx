/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Internal
 */

import "./NavigationPropertyTargetSelector.scss";
import classNames from "classnames";
import { ChangeEvent, forwardRef, KeyboardEvent, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { components, ControlProps, MenuListProps, OptionProps, SingleValue } from "react-select";
import { AsyncPaginate } from "react-select-async-paginate";
import { PropertyDescription, PropertyRecord, PropertyValue, PropertyValueFormat } from "@itwin/appui-abstract";
import { PropertyEditorProps, PropertyValueRendererManager } from "@itwin/components-react";
import { IModelConnection } from "@itwin/core-frontend";
import { SvgCaretDownSmall } from "@itwin/itwinui-icons-react";
import { Input, List, ListItem } from "@itwin/itwinui-react";
import { InstanceKey, LabelDefinition, NavigationPropertyInfo } from "@itwin/presentation-common";
import { translate, useMergedRefs, useResizeObserver } from "../common/Utils";
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
  const { imodel, getNavigationPropertyInfo, propertyRecord, onCommit } = props;
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
  const mergedRefs = useMergedRefs(divRef, selectRef);

  if (!targetsRuleset) {
    return <ReadonlyNavigationPropertyTarget record={props.propertyRecord} />;
  }

  return (
    <div ref={mergedRefs}>
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
        backspaceRemovesValue={false}
        tabSelectsValue={false}
        loadingMessage={() => translate("navigation-property-editor.loading-target-instances")}
        styles={{
          control: () => ({}),
          container: () => ({}),
          valueContainer: () => ({}),
          menuPortal: (base) => ({ ...base, zIndex: 9999, width }),
          menuList: () => ({}),
          menu: () => ({}),
          option: () => ({}),
          dropdownIndicator: () => ({}),
        }}
        components={{
          Control: TargetSelectControl,
          MenuList: TargetSelectMenuList,
          Option: TargetSelectOption,
        }}
        menuPortalTarget={divRef.current?.ownerDocument.body.querySelector(".iui-root") ?? divRef.current?.ownerDocument.body}
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
  if (value.valueFormat !== PropertyValueFormat.Primitive || !value.value || !value.displayValue) {
    return undefined;
  }

  return { key: value.value as InstanceKey, label: LabelDefinition.fromLabelString(value.displayValue) };
}

function TargetSelectControl<TOption, IsMulti extends boolean = boolean>(props: ControlProps<TOption, IsMulti>) {
  const { getValue, selectProps } = props;
  const selectedValue = getValue()[0];
  const label = selectedValue ? selectProps.getOptionLabel(selectedValue) : "";
  const [inputValue, setInputValue] = useState<string>(() => label);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setInputValue(label);
  }, [label]);

  const handleMenuOpen = () => {
    if (!selectProps.menuIsOpen) {
      selectProps.onMenuOpen();
    }
    inputRef.current?.focus();
    selectProps.onInputChange("", { action: "input-change", prevInputValue: inputValue });
  };

  const handleInputBlur = () => {
    setInputValue(label);
    selectProps.onInputChange(label, { action: "input-blur", prevInputValue: inputValue });
    selectProps.onMenuClose();
  };

  const handleDropdownButtonClick = () => {
    if (selectProps.menuIsOpen) {
      selectProps.onMenuClose();
      inputRef.current?.blur();
    } else {
      handleMenuOpen();
    }
  };

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (!selectProps.menuIsOpen) {
      selectProps.onMenuOpen();
    }
    setInputValue(event.target.value);
    selectProps.onInputChange(event.target.value, { action: "input-change", prevInputValue: inputValue });
  };

  /** This function is used to cancel overriden react-select keyboard events. */
  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.code === "Space" || event.code === "Home" || event.code === "End") {
      event.stopPropagation();
    }
    if (event.key === "Tab") {
      selectProps.onMenuClose();
    }
  };

  return (
    <components.Control {...props} className="presentation-navigation-property-select-control">
      <Input
        ref={inputRef}
        className="presentation-navigation-property-select-input"
        value={inputValue}
        onBlur={handleInputBlur}
        onFocus={handleMenuOpen}
        onChange={handleInputChange}
        onKeyDown={handleInputKeyDown}
        size="small"
        placeholder={translate("navigation-property-editor.select-target-instance")}
        role="combobox"
      />
      <components.DropdownIndicator
        {...props}
        className={classNames("presentation-navigation-property-select-input-icon", { open: props.menuIsOpen })}
        innerProps={{ onClick: handleDropdownButtonClick }}
      >
        <SvgCaretDownSmall />
      </components.DropdownIndicator>
    </components.Control>
  );
}

function TargetSelectMenuList<TOption, IsMulti extends boolean = boolean>({ children, ...props }: MenuListProps<TOption, IsMulti>) {
  return (
    <List className="presentation-navigation-property-select-dropdown" ref={props.innerRef} {...props.innerProps} as="div">
      {children}
    </List>
  );
}

function TargetSelectOption<TOption, IsMulti extends boolean = boolean>({ children: _, ...props }: OptionProps<TOption, IsMulti>) {
  return (
    <ListItem focused={props.isFocused} active={props.isSelected} ref={props.innerRef} {...props.innerProps} as="div">
      {props.selectProps.getOptionLabel && props.selectProps.getOptionLabel(props.data)}
    </ListItem>
  );
}
