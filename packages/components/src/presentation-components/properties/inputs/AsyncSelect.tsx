/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import "./AsyncSelect.scss";
import classnames from "classnames";
import { Children, Ref, useRef, useState } from "react";
import {
  ClearIndicatorProps,
  components,
  ContainerProps,
  ControlProps,
  DropdownIndicatorProps,
  GroupBase,
  IndicatorsContainerProps,
  MenuListProps,
  MultiValueProps,
  NoticeProps,
  OptionProps,
  ValueContainerProps,
} from "react-select";
import { AsyncPaginate, AsyncPaginateProps, wrapMenuList } from "react-select-async-paginate";
import { SvgCaretDownSmall, SvgCheckmarkSmall, SvgCloseSmall } from "@itwin/itwinui-icons-react";
import { List, ListItem, Tag, TagContainer } from "@itwin/itwinui-react";
import { usePortalTargetContext } from "../../common/PortalTargetContext";
import { translate, useMergedRefs, useResizeObserver } from "../../common/Utils";

const MAX_SELECT_MENU_HEIGHT = 300;

function SelectContainer<TOption, IsMulti extends boolean = boolean>({ children, ...props }: ContainerProps<TOption, IsMulti>) {
  return (
    <components.SelectContainer {...props} className="presentation-async-select-container">
      {children}
    </components.SelectContainer>
  );
}

function Control<TOption, IsMulti extends boolean = boolean>({ children, ...props }: ControlProps<TOption, IsMulti>) {
  return (
    <components.Control {...props} className="presentation-async-select-control">
      {children}
    </components.Control>
  );
}

function CustomMenuList<TOption, IsMulti extends boolean = boolean, Group extends GroupBase<TOption> = GroupBase<TOption>>({
  children,
  ...props
}: MenuListProps<TOption, IsMulti, Group>) {
  return (
    <List className="presentation-async-select-dropdown" ref={props.innerRef} {...props.innerProps} as="div">
      {children}
    </List>
  );
}

function Option<TOption, IsMulti extends boolean = boolean>({ children: _, ...props }: OptionProps<TOption, IsMulti>) {
  const optionLabel = props.selectProps.getOptionLabel && props.selectProps.getOptionLabel(props.data);
  const optionValue = props.selectProps.getOptionValue && props.selectProps.getOptionValue(props.data);
  const className = classnames({ "presentation-async-select-special-option": optionValue === "" });

  return (
    <ListItem ref={props.innerRef} {...props.innerProps} className={className} focused={props.isFocused} active={props.isSelected} as="div">
      <ListItem.Content>{optionLabel}</ListItem.Content>
      {props.isSelected ? (
        <ListItem.Icon>
          <SvgCheckmarkSmall />
        </ListItem.Icon>
      ) : null}
    </ListItem>
  );
}

function NoOptionsMessage<TOption, IsMulti extends boolean = boolean>({ children: _, ...props }: NoticeProps<TOption, IsMulti>) {
  return <components.NoOptionsMessage {...props}>{translate("unique-values-property-editor.no-values")}</components.NoOptionsMessage>;
}

function ValueContainer<TOption, IsMulti extends boolean = boolean>({ children, ...props }: ValueContainerProps<TOption, IsMulti>) {
  const childrenArray = Children.toArray(children);
  const selectedCount = props.getValue().length;
  const values = childrenArray.slice(0, selectedCount);
  const nonValues = childrenArray.slice(selectedCount);
  return (
    <div className="presentation-async-select-values-container">
      {nonValues}
      {props.selectProps.menuIsOpen && props.selectProps.inputValue.length !== 0 ? undefined : (
        <TagContainer {...props.innerProps} className="presentation-async-select-tag-container" overflow="truncate" as={"div"}>
          {values}
        </TagContainer>
      )}
    </div>
  );
}

function MultiValue<TOption, IsMulti extends boolean = boolean>({ children: _, ...props }: MultiValueProps<TOption, IsMulti>) {
  const label = props.selectProps.getOptionLabel && props.selectProps.getOptionLabel(props.data);

  return (
    <Tag {...props.innerProps} className="presentation-async-select-value" as={"div"}>
      {label}
    </Tag>
  );
}

function IndicatorsContainer<TOption, IsMulti extends boolean = boolean>({ children, ...props }: IndicatorsContainerProps<TOption, IsMulti>) {
  return (
    <components.IndicatorsContainer {...props} className="presentation-async-select-input-icons">
      {children}
    </components.IndicatorsContainer>
  );
}

function DropdownIndicator<TOption, IsMulti extends boolean = boolean>({ children: _, ...props }: DropdownIndicatorProps<TOption, IsMulti>) {
  return (
    <components.DropdownIndicator {...props} className={classnames("presentation-async-select-input-icon", { open: props.selectProps.menuIsOpen })}>
      <SvgCaretDownSmall />
    </components.DropdownIndicator>
  );
}

function ClearIndicator<TOption, IsMulti extends boolean = boolean>({ children: _, ...props }: ClearIndicatorProps<TOption, IsMulti>) {
  return props.selectProps.inputValue.length !== 0 ? null : (
    <components.ClearIndicator {...props} className={classnames("presentation-async-select-input-icon", "clear-indicator")}>
      <SvgCloseSmall />
    </components.ClearIndicator>
  );
}

// Wrap custom menu as a workaround for some internal bugs of react-select
const MenuList = wrapMenuList(CustomMenuList);

/** @internal */
export function AsyncSelect<OptionType, Group extends GroupBase<OptionType>, Additional>(props: AsyncPaginateProps<OptionType, Group, Additional, true>) {
  const { ref: resizeRef, width } = useResizeObserver();
  const { portalTarget } = usePortalTargetContext();
  const { ref, ...menuProps } = useSelectMenuPlacement();

  return (
    <div ref={useMergedRefs(ref, resizeRef)}>
      <AsyncPaginate
        {...props}
        styles={{
          control: () => ({}),
          container: () => ({}),
          menuPortal: (base) => ({ ...base, zIndex: 9999, width, pointerEvents: "auto" }),
          menu: (base) => ({ ...base, margin: 0 }),
          indicatorsContainer: () => ({}),
          indicatorSeparator: (base) => ({ ...base, marginTop: undefined, marginBottom: undefined, margin: "0 var(--iui-size-xs)" }),
          clearIndicator: () => ({}),
          dropdownIndicator: () => ({}),
          placeholder: () => ({
            height: "var(--iui-component-height-small)",
            width: "100%",
            display: "block",
            whiteSpace: "nowrap",
            textOverflow: "ellipsis",
            overflow: "hidden",
            position: "absolute",
            marginTop: "1px",
          }),
          input: () => ({ height: "var(--iui-component-height-small)", position: "absolute", marginTop: "1px" }),
        }}
        components={{
          Control,
          MenuList,
          ValueContainer,
          MultiValue,
          Option,
          DropdownIndicator,
          IndicatorsContainer,
          ClearIndicator,
          LoadingIndicator: () => null,
          SelectContainer,
          NoOptionsMessage,
        }}
        menuPortalTarget={portalTarget}
        isMulti={true}
        {...menuProps}
      />
    </div>
  );
}

/** @internal */
export function useSelectMenuPlacement(): {
  ref: Ref<HTMLElement>;
  onMenuOpen: () => void;
  menuPlacement: "top" | "bottom";
  menuPosition: "fixed";
} {
  const [dropdownUp, setDropdownUp] = useState(false);
  const divRef = useRef<HTMLElement>(null);

  const onMenuOpen = () => {
    // istanbul ignore if
    if (!divRef.current) {
      return;
    }
    const { top, height } = divRef.current.getBoundingClientRect();
    const space = window.innerHeight - top - height;
    setDropdownUp(space < MAX_SELECT_MENU_HEIGHT);
  };

  return {
    ref: divRef,
    onMenuOpen,
    menuPlacement: dropdownUp ? "top" : "bottom",
    menuPosition: "fixed",
  };
}
