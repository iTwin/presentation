/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module InstancesFilter
 */

import "./PresentationInstanceFilterDialog.scss";
import { useEffect, useState } from "react";
import { PropertyValueFormat, StandardTypeNames } from "@itwin/appui-abstract";
import {
  defaultPropertyFilterBuilderRuleValidator,
  isPropertyFilterBuilderRuleGroup,
  PropertyFilterBuilderRule,
  PropertyFilterBuilderRuleGroupItem,
  usePropertyFilterBuilder,
} from "@itwin/components-react";
import { IModelConnection } from "@itwin/core-frontend";
import { Button, Dialog, ProgressRadial } from "@itwin/itwinui-react";
import { Descriptor } from "@itwin/presentation-common";
import { translate, useDelay } from "../common/Utils";
import { InstanceFilterBuilder, usePresentationInstanceFilteringProps } from "./InstanceFilterBuilder";
import { PresentationInstanceFilterInfo } from "./Types";
import { convertPresentationFilterToPropertyFilter, createPresentationInstanceFilter } from "./Utils";

/**
 * Props for [[PresentationInstanceFilterDialog]] component.
 * @beta
 */
export interface PresentationInstanceFilterDialogProps {
  /** iModel connection to pull data from. */
  imodel: IModelConnection;
  /** Specifies how deep rule groups can be nested. */
  ruleGroupDepthLimit?: number;
  /** Specifies whether dialog is open or not. */
  isOpen: boolean;
  /** Callback that is invoked when 'Apply' button is clicked. */
  onApply: (filter: PresentationInstanceFilterInfo) => void;
  /** Callback that is invoked when 'Close' button is clicked or dialog is closed. */
  onClose: () => void;
  /**
   * [Descriptor]($presentation-common) that will be used in [[InstanceFilterBuilder]] component rendered inside this dialog.
   *
   * This property can be set to function in order to lazy load [Descriptor]($presentation-common) when dialog is opened.
   */
  descriptor: (() => Promise<Descriptor>) | Descriptor;
  /** Renderer that renders count of results for currently built filter. */
  filterResultCountRenderer?: (filter?: PresentationInstanceFilterInfo) => React.ReactNode;
  /** Dialog title. */
  title?: React.ReactNode;
  /** Initial filter that will be show when component is mounted. */
  initialFilter?: PresentationInstanceFilterInfo;
}

/**
 * Dialog component that renders [[InstanceFilterBuilder]] inside.
 * @beta
 */
export function PresentationInstanceFilterDialog(props: PresentationInstanceFilterDialogProps) {
  const { isOpen, onClose, title, ...restProps } = props;
  const descriptor = useDelayLoadedDescriptor(props.descriptor);

  return (
    <Dialog
      className="presentation-instance-filter-dialog"
      isOpen={isOpen}
      onClose={onClose}
      closeOnEsc={false}
      preventDocumentScroll={true}
      trapFocus={true}
      isDraggable
      isResizable
    >
      <Dialog.Backdrop />
      <Dialog.Main className="presentation-instance-filter-dialog-content-container">
        <Dialog.TitleBar className="presentation-instance-filter-title" titleText={title ? title : translate("instance-filter-builder.filter")} />
        {descriptor ? <PresentationInstanceFilterDialogContent {...restProps} descriptor={descriptor} onClose={onClose} /> : <DelayedCenteredProgressRadial />}
      </Dialog.Main>
    </Dialog>
  );
}

function useDelayLoadedDescriptor(descriptorOrGetter: Descriptor | (() => Promise<Descriptor>)) {
  const [descriptor, setDescriptor] = useState<Descriptor | undefined>(() => (descriptorOrGetter instanceof Descriptor ? descriptorOrGetter : undefined));

  useEffect(() => {
    let disposed = false;
    void (async () => {
      if (!(descriptorOrGetter instanceof Descriptor)) {
        const newDescriptor = await descriptorOrGetter();
        // istanbul ignore else
        if (!disposed) {
          setDescriptor(newDescriptor);
        }
      }
    })();
    return () => {
      disposed = true;
    };
  }, [descriptorOrGetter]);

  return descriptor;
}

interface PresentationInstanceFilterDialogContentProps extends Omit<PresentationInstanceFilterDialogProps, "isOpen" | "title" | "descriptor"> {
  descriptor: Descriptor;
}

function PresentationInstanceFilterDialogContent(props: PresentationInstanceFilterDialogContentProps) {
  const { onApply, initialFilter, descriptor, imodel, ruleGroupDepthLimit, filterResultCountRenderer, onClose } = props;
  const [initialPropertyFilter] = useState(() => (initialFilter ? convertPresentationFilterToPropertyFilter(descriptor, initialFilter.filter) : undefined));

  const { rootGroup, actions, buildFilter } = usePropertyFilterBuilder({
    initialFilter: initialPropertyFilter,
    ruleValidator: numericInputValidator,
  });

  const filteringProps = usePresentationInstanceFilteringProps(descriptor, imodel, initialFilter?.usedClasses);

  const applyButtonHandle = () => {
    const filter = buildFilter();
    if (!filter) {
      return;
    }
    const presentationInstanceFilter = createPresentationInstanceFilter(descriptor, filter);
    if (!presentationInstanceFilter) {
      return;
    }
    onApply({ filter: presentationInstanceFilter, usedClasses: filteringProps.selectedClasses });
  };

  const hasNonEmptyRule = (item: PropertyFilterBuilderRuleGroupItem) => {
    if (isPropertyFilterBuilderRuleGroup(item)) {
      return item.items.some(hasNonEmptyRule);
    }
    return item.operator !== undefined;
  };

  const isDisabled = !hasNonEmptyRule(rootGroup);

  return (
    <>
      <Dialog.Content className="presentation-instance-filter-content">
        <InstanceFilterBuilder
          {...filteringProps}
          rootGroup={rootGroup}
          actions={actions}
          ruleGroupDepthLimit={ruleGroupDepthLimit}
          imodel={imodel}
          descriptor={descriptor}
        />
      </Dialog.Content>
      <div className="presentation-instance-filter-dialog-bottom-container">
        <div>{filterResultCountRenderer && filterResultCountRenderer()}</div>
        <Dialog.ButtonBar className="presentation-instance-filter-button-bar">
          <Button className="presentation-instance-filter-dialog-apply-button" styleType="high-visibility" onClick={applyButtonHandle} disabled={isDisabled}>
            {translate("instance-filter-builder.apply")}
          </Button>
          <Button className="presentation-instance-filter-dialog-close-button" onClick={onClose}>
            {translate("instance-filter-builder.cancel")}
          </Button>
        </Dialog.ButtonBar>
      </div>
    </>
  );
}

function DelayedCenteredProgressRadial() {
  const show = useDelay();

  if (!show) {
    return null;
  }

  return (
    <div className="presentation-instance-filter-dialog-progress">
      <ProgressRadial indeterminate={true} size="large" />
    </div>
  );
}

function numericInputValidator(item: PropertyFilterBuilderRule) {
  if (
    item.value &&
    item.value.valueFormat === PropertyValueFormat.Primitive &&
    item.property &&
    isTypenameNumeric(item.property.typename) &&
    item.value.value === undefined &&
    item.value.displayValue !== ""
  ) {
    return translate("instance-filter-builder.error-messages.notANumber");
  }
  return defaultPropertyFilterBuilderRuleValidator(item);
}

function isTypenameNumeric(typename: string) {
  return (
    typename === StandardTypeNames.Number || typename === StandardTypeNames.Int || typename === StandardTypeNames.Float || typename === StandardTypeNames.Double
  );
}
