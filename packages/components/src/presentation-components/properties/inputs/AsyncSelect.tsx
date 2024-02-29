/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import "./AsyncSelect.scss";
import classnames from "classnames";
import { useRef, useState } from "react";
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
  SelectInstance,
  ValueContainerProps,
} from "react-select";
import { AsyncPaginate, AsyncPaginateProps } from "react-select-async-paginate";
import { SvgCaretDownSmall, SvgCheckmarkSmall, SvgCloseSmall } from "@itwin/itwinui-icons-react";
import { List, ListItem, Tag, TagContainer } from "@itwin/itwinui-react";
import { translate, useMergedRefs, useResizeObserver } from "../../common/Utils";

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

function MenuList<TOption, IsMulti extends boolean = boolean>({ children, ...props }: MenuListProps<TOption, IsMulti>) {
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
  return (
    <TagContainer {...props.innerProps} className="presentation-async-select-values-container" as={"div"}>
      {children}
    </TagContainer>
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
  return (
    <components.ClearIndicator {...props} className="presentation-async-select-input-icon">
      <SvgCloseSmall />
    </components.ClearIndicator>
  );
}

/** @internal */
export function AsyncSelect<OptionType, Group extends GroupBase<OptionType>, Additional>(props: AsyncPaginateProps<OptionType, Group, Additional, true>) {
  const [dropdownUp, setDropdownUp] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const menuObserver = useRef<IntersectionObserver>();
  const selectRef = useRef<SelectInstance<OptionType, true, Group>>(null);
  const divRef = useRef<HTMLDivElement>(null);
  const { ref: resizeRef, width } = useResizeObserver();

  const onMenuOpen = () => {
    const observeOnscreen: IntersectionObserverCallback = (entries: IntersectionObserverEntry[]) => {
      const { boundingClientRect, intersectionRect } = entries[0];
      const isOffscreen = boundingClientRect.height > intersectionRect.height;

      setDropdownUp(isOffscreen);
      setIsLoading(false);
    };

    setTimeout(() => {
      const menuList = selectRef.current!.menuListRef as Element;
      menuObserver.current = new IntersectionObserver(observeOnscreen);
      menuObserver.current.observe(menuList);
    }, 1);
  };

  const onMenuClose = () => {
    setIsLoading(true);
    setDropdownUp(false);
    menuObserver.current && menuObserver.current.disconnect();
  };

  return (
    <div ref={useMergedRefs(divRef, resizeRef)}>
      <AsyncPaginate
        {...props}
        styles={{
          control: () => ({}),
          container: () => ({}),
          menuPortal: (base) => ({ ...base, zIndex: 9999, width, pointerEvents: "auto", visibility: isLoading ? "hidden" : "visible" }),
          menu: (base) => (dropdownUp ? { ...base, top: "auto", bottom: "100%" } : {}),
          indicatorsContainer: () => ({}),
          indicatorSeparator: (base) => ({ ...base, marginTop: undefined, marginBottom: undefined, margin: "0 var(--iui-size-xs)" }),
          clearIndicator: () => ({}),
          dropdownIndicator: () => ({}),
          placeholder: () => ({ width: "100%", display: "block", whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }),
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
        selectRef={selectRef}
        onMenuOpen={onMenuOpen}
        onMenuClose={onMenuClose}
        menuPortalTarget={divRef.current?.ownerDocument.body.querySelector(".presentation-instance-filter-dialog")}
        menuPlacement={dropdownUp ? "top" : "bottom"}
        isMulti={true}
      />
    </div>
  );
}
