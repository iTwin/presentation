/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module InstancesFilter
 */

import "./PresentationInstanceFilterDialog.scss";
import { ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { PrimitiveValue, PropertyDescription, PropertyValueFormat, StandardTypeNames } from "@itwin/appui-abstract";
import {
  BuildFilterOptions,
  defaultPropertyFilterBuilderRuleValidator,
  isPropertyFilterBuilderRuleGroup,
  isUnaryPropertyFilterOperator,
  PropertyFilterBuilderRule,
  PropertyFilterBuilderRuleGroupItem,
  PropertyFilterRuleOperator,
  usePropertyFilterBuilder,
} from "@itwin/components-react";
import { IModelConnection } from "@itwin/core-frontend";
import { Button, Dialog, ProgressRadial } from "@itwin/itwinui-react";
import { Descriptor, Keys } from "@itwin/presentation-common";
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
  /** Renders filter results count. */
  filterResultsCountRenderer?: (filter: PresentationInstanceFilterInfo) => ReactNode;
  /**
   * [Keys]($presentation-common) of filterables on which the filter was called.
   *
   * These keys should match the keys that were used to create the descriptor.
   */
  descriptorInputKeys?: Keys;
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
  descriptorInputKeys?: Keys;
}

function PresentationInstanceFilterDialogContent(props: PresentationInstanceFilterDialogContentProps) {
  const { onApply, initialFilter, descriptor, imodel, ruleGroupDepthLimit, filterResultsCountRenderer, onClose, descriptorInputKeys } = props;
  const [initialPropertyFilter] = useState(() => (initialFilter ? convertPresentationFilterToPropertyFilter(descriptor, initialFilter.filter) : undefined));

  const { rootGroup, actions, buildFilter } = usePropertyFilterBuilder({
    initialFilter: initialPropertyFilter,
    ruleValidator: filterRuleValidator,
  });

  const filteringProps = usePresentationInstanceFilteringProps(descriptor, imodel, initialFilter?.usedClasses);
  const getFilterInfo = useCallback(
    (options?: BuildFilterOptions) => {
      const filter = buildFilter(options);
      if (!filter) {
        return undefined;
      }
      const presentationInstanceFilter = createPresentationInstanceFilter(descriptor, filter);
      if (!presentationInstanceFilter) {
        return undefined;
      }

      return { filter: presentationInstanceFilter, usedClasses: filteringProps.selectedClasses };
    },
    [buildFilter, descriptor, filteringProps.selectedClasses],
  );

  const applyButtonHandle = () => {
    const result = getFilterInfo();
    if (!result) {
      return;
    }
    onApply(result);
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
          descriptorInputKeys={descriptorInputKeys}
        />
      </Dialog.Content>
      <div className="presentation-instance-filter-dialog-bottom-container">
        <div>{filterResultsCountRenderer ? <ResultsRenderer buildFilter={getFilterInfo} renderer={filterResultsCountRenderer} /> : null}</div>
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

interface ResultsRendererProps {
  buildFilter: (options?: BuildFilterOptions) => PresentationInstanceFilterInfo | undefined;
  renderer: (filter: PresentationInstanceFilterInfo) => ReactNode;
}

function ResultsRenderer({ buildFilter, renderer }: ResultsRendererProps) {
  const filter = useMemo(() => buildFilter({ ignoreErrors: true }), [buildFilter]);
  if (!filter) {
    return null;
  }
  return <>{renderer(filter)}</>;
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

function filterRuleValidator(item: PropertyFilterBuilderRule) {
  // skip empty rules and rules that do not require value
  if (item.property === undefined || item.operator === undefined || isUnaryPropertyFilterOperator(item.operator)) {
    return undefined;
  }

  // istanbul ignore if
  if (item.value !== undefined && item.value.valueFormat !== PropertyValueFormat.Primitive) {
    return undefined;
  }

  const error = combineValidators(
    quantityPropertyValidator,
    numericPropertyValidator,
  )({
    property: item.property,
    operator: item.operator,
    value: item.value,
  });

  if (error) {
    return error;
  }

  return defaultPropertyFilterBuilderRuleValidator(item);
}

function combineValidators(...validators: Array<(ctx: ValidatorContext) => string | undefined>) {
  return (ctx: ValidatorContext) => {
    for (const validator of validators) {
      const error = validator(ctx);
      if (error) {
        return error;
      }
    }
    return undefined;
  };
}

interface ValidatorContext {
  property: PropertyDescription;
  operator: PropertyFilterRuleOperator;
  value?: PrimitiveValue;
}

function quantityPropertyValidator({ property, value }: ValidatorContext) {
  // rules with non quantity properties or without values
  if (property.quantityType === undefined || value === undefined) {
    return undefined;
  }
  if (isInvalidPrimitiveValue(value)) {
    return translate("instance-filter-builder.error-messages.invalid");
  }

  return undefined;
}

function numericPropertyValidator({ property, value }: ValidatorContext) {
  if (!isPropertyNumeric(property.typename) || value === undefined) {
    return undefined;
  }

  if (isInvalidPrimitiveValue(value)) {
    return translate("instance-filter-builder.error-messages.not-a-number");
  }

  return undefined;
}

function isPropertyNumeric(typename: string) {
  return (
    typename === StandardTypeNames.Number || typename === StandardTypeNames.Int || typename === StandardTypeNames.Float || typename === StandardTypeNames.Double
  );
}

function isInvalidPrimitiveValue(value: PrimitiveValue) {
  return value.value === undefined && value.displayValue !== undefined && value.displayValue !== "";
}
