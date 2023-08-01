/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module InstancesFilter
 */

import "./PresentationInstanceFilterDialog.scss";
import { useEffect, useRef, useState } from "react";
import { isPropertyFilterBuilderRuleGroup, PropertyFilter, usePropertyFilterBuilder } from "@itwin/components-react";
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

function useDelayLoadedDescriptor(descr: Descriptor | (() => Promise<Descriptor>)) {
  const [descriptor, setDescriptor] = useState<Descriptor | (() => Promise<Descriptor>)>(() => descr);

  useEffect(() => {
    let disposed = false;
    void (async () => {
      if (descriptor && !(descriptor instanceof Descriptor)) {
        const newDescriptor = await descriptor();
        // istanbul ignore else
        if (!disposed) {
          setDescriptor(newDescriptor);
        }
      }
    })();
    return () => {
      disposed = true;
    };
  }, [descr]); // eslint-disable-line react-hooks/exhaustive-deps

  return descriptor instanceof Descriptor ? descriptor : undefined;
}

interface PresedntationInstanceFilterDialogContentProps extends Omit<PresentationInstanceFilterDialogProps, "isOpen" | "title" | "descriptor"> {
  descriptor: Descriptor;
}

function PresentationInstanceFilterDialogContent(props: PresedntationInstanceFilterDialogContentProps) {
  const { onApply, initialFilter, descriptor, imodel, ruleGroupDepthLimit, filterResultCountRenderer, onClose } = props;

  const initialPropertyFilter = useRef<PropertyFilter | undefined>(
    initialFilter ? convertPresentationFilterToPropertyFilter(descriptor, initialFilter.filter) : undefined,
  );

  useEffect(() => {
    initialPropertyFilter.current = initialFilter ? convertPresentationFilterToPropertyFilter(descriptor, initialFilter.filter) : undefined;
  }, [descriptor, initialFilter]);

  const { rootGroup, actions, validate } = usePropertyFilterBuilder({
    initialFilter: initialPropertyFilter.current,
  });

  const filteringProps = usePresentationInstanceFilteringProps(descriptor, imodel, initialFilter?.usedClasses);

  const applyButtonHandle = () => {
    const filter = validate();
    if (filter) {
      const presentationInstanceFilter = createPresentationInstanceFilter(descriptor, filter);
      if (presentationInstanceFilter) {
        onApply({ filter: presentationInstanceFilter, usedClasses: filteringProps.selectedClasses });
      }
    }
  };

  const isDisabled = !rootGroup.items.flat(Number.MAX_SAFE_INTEGER).some((item) => !isPropertyFilterBuilderRuleGroup(item) && item.operator !== undefined);

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

  return show ? (
    <div className="presentation-instance-filter-dialog-progress">
      <ProgressRadial indeterminate={true} size="large" />
    </div>
  ) : null;
}
