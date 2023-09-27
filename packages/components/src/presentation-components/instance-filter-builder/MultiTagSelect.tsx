/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Internal
 */

import "@itwin/itwinui-css/css/tag.css";
import "@itwin/itwinui-css/css/input.css";
import "@itwin/itwinui-css/css/button.css";
import "@itwin/itwinui-css/css/menu.css";
import classnames from "classnames";
import {
  ClearIndicatorProps,
  components,
  ControlProps,
  DropdownIndicatorProps,
  GroupBase,
  MenuProps,
  MultiValueGenericProps,
  MultiValueProps,
  MultiValueRemoveProps,
  OptionProps,
  ValueContainerProps,
} from "react-select";
import { AsyncPaginate, AsyncPaginateProps } from "react-select-async-paginate";
import { SvgCaretDownSmall, SvgCheckmarkSmall, SvgCloseSmall } from "@itwin/itwinui-icons-react";
import { translate, useResizeObserver } from "../common/Utils";

function TagSelectControl<TOption, IsMulti extends boolean = boolean>({ children, ...props }: ControlProps<TOption, IsMulti>) {
  return (
    <components.Control {...props} className="iui-select-button">
      {children}
    </components.Control>
  );
}

function TagSelectMenu<TOption, IsMulti extends boolean = boolean>({ children, ...props }: MenuProps<TOption, IsMulti>) {
  return (
    <components.Menu {...props} className="iui-menu">
      {children}
    </components.Menu>
  );
}

function TagSelectOption<TOption, IsMulti extends boolean = boolean>({ children: _, ...props }: OptionProps<TOption, IsMulti>) {
  const optionLabel = props.selectProps.getOptionLabel && props.selectProps.getOptionLabel(props.data);

  const className = classnames("iui-menu-item", {
    "iui-focused": props.isFocused,
    "iui-active": props.isSelected,
    "presentation-instance-filter-special-property-value": optionLabel === "",
  });

  return (
    <components.Option {...props} className={className}>
      <span>{optionLabel === "" ? translate("unique-values-property-editor.empty-value") : optionLabel}</span>
      {props.isSelected && (
        <span className="iui-icon" style={{ marginLeft: "auto" }}>
          <SvgCheckmarkSmall />
        </span>
      )}
    </components.Option>
  );
}

function TagSelectValueContainer<TOption, IsMulti extends boolean = boolean>({ children, ...props }: ValueContainerProps<TOption, IsMulti>) {
  return (
    <components.ValueContainer {...props} className="iui-tag-container">
      {children}
    </components.ValueContainer>
  );
}

function TagMultiValue<TOption, IsMulti extends boolean = boolean>({ children, ...props }: MultiValueProps<TOption, IsMulti>) {
  return (
    <components.MultiValue
      {...props}
      components={{
        Container: TagContainer,
        Label: TagLabel,
        Remove: TagRemove,
      }}
    >
      {children}
    </components.MultiValue>
  );
}

function TagContainer<TOption, IsMulti extends boolean = boolean>({ children, ...props }: MultiValueGenericProps<TOption, IsMulti>) {
  return (
    <components.MultiValueContainer {...props} innerProps={{ ...props.innerProps, className: "iui-select-tag" }}>
      {children}
    </components.MultiValueContainer>
  );
}

function TagLabel<TOption, IsMulti extends boolean = boolean>({ children, ...props }: MultiValueGenericProps<TOption, IsMulti>) {
  const className = classnames("iui-tag-label", {
    "presentation-instance-filter-special-property-value": children === "",
  });

  return (
    <components.MultiValueLabel {...props} innerProps={{ ...props.innerProps, className }}>
      {children === "" ? translate("unique-values-property-editor.empty-value") : children}
    </components.MultiValueLabel>
  );
}

function TagRemove<TOption, IsMulti extends boolean = boolean>(props: MultiValueRemoveProps<TOption, IsMulti>) {
  const innerProps = {
    ...props.innerProps,
    className: "iui-button iui-tag-button",
    ["data-iui-variant"]: "borderless",
    ["data-iui-size"]: "small",
    style: { background: "none" },
  };
  return (
    <components.MultiValueRemove {...props} innerProps={innerProps}>
      <SvgCloseSmall className="iui-button-icon" aria-hidden />
    </components.MultiValueRemove>
  );
}

function TagSelectDropdownIndicatorSmall<TOption, IsMulti extends boolean = boolean>({ children: _, ...props }: DropdownIndicatorProps<TOption, IsMulti>) {
  return (
    <components.DropdownIndicator {...props} className={classnames("iui-end-icon iui-actionable", { "iui-open": props.selectProps.menuIsOpen })}>
      <SvgCaretDownSmall />
    </components.DropdownIndicator>
  );
}

function TagSelectClearIndicator<TOption, IsMulti extends boolean = boolean>({ children: _, ...props }: ClearIndicatorProps<TOption, IsMulti>) {
  return (
    <components.ClearIndicator {...props}>
      <span data-testid="multi-tag-select-clearIndicator" className="iui-end-icon iui-actionable" style={{ padding: 0 }}>
        <SvgCloseSmall aria-hidden />
      </span>
    </components.ClearIndicator>
  );
}

export function AsyncMultiTagSelect<OptionType, Group extends GroupBase<OptionType>, Additional>(
  props: AsyncPaginateProps<OptionType, Group, Additional, true>,
) {
  const { ref: selectRef, width } = useResizeObserver();
  return (
    <div ref={selectRef}>
      <AsyncPaginate
        {...props}
        styles={{
          control: () => ({
            display: "grid",
            gridTemplateColumns: "auto auto",
            gridTemplateRows: "calc(var(--iui-size-l) + var(--iui-size-3xs))",
            height: "27px",
            minHeight: "27px",
            padding: "0 0 0 var(--iui-size-s)",
            gap: "2px",
          }),
          container: () => ({ width: "auto" }),
          menu: () => ({ position: "absolute", zIndex: 9999, width }),
          menuList: (style) => ({ ...style, padding: 0 }),
          option: () => ({ whiteSpace: "nowrap", width: "max-content", minWidth: "100%" }),
          valueContainer: (style) => ({
            ...style,
            padding: 0,
            flexWrap: "nowrap",
            gridTemplateRows: "calc(var(--iui-size-l) + var(--iui-size-3xs))",
            alignItems: "center",
            height: "27px",
          }),
          indicatorsContainer: () => ({ marginLeft: "auto", display: "flex", width: "calc(var(--iui-size-xl) + var(--iui-size-3xs))", marginRight: "1px" }),
          multiValue: () => ({ margin: 0 }),
          multiValueLabel: () => ({}),
          placeholder: (style) => ({
            ...style,
            color: "var(--iui-color-text-disabled)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            marginLeft: "0",
          }),
        }}
        components={{
          Control: TagSelectControl,
          Menu: TagSelectMenu,
          ValueContainer: TagSelectValueContainer,
          MultiValue: TagMultiValue,
          Option: TagSelectOption,
          DropdownIndicator: TagSelectDropdownIndicatorSmall,
          ClearIndicator: TagSelectClearIndicator,
          IndicatorSeparator: () => null,
          LoadingIndicator: () => null,
        }}
        isMulti={true}
      />
    </div>
  );
}
