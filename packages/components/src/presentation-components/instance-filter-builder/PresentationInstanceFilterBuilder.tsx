/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module InstancesFilter
 */

import { useCallback, useState } from "react";
import { StandardTypeNames } from "@itwin/appui-abstract";
import {
  PropertyFilter,
  PropertyFilterBuilderRuleValue,
  PropertyFilterBuilderRuleValueRendererProps,
  PropertyFilterRuleOperator,
} from "@itwin/components-react";
import { IModelConnection } from "@itwin/core-frontend";
import { ClassInfo, Descriptor } from "@itwin/presentation-common";
import { navigationPropertyEditorContext } from "../properties/NavigationPropertyEditor";
import { UniquePropertyValuesSelector } from "../properties/UniquePropertyValuesSelector";
import { InstanceFilterBuilder, useFilterBuilderNavigationPropertyEditorContext, usePresentationInstanceFilteringProps } from "./InstanceFilterBuilder";
import { PresentationInstanceFilter } from "./Types";
import { convertPresentationFilterToPropertyFilter, createPresentationInstanceFilter } from "./Utils";

/**
 * Data structure that stores information about filter built by [[PresentationInstanceFilterBuilder]].
 * @beta
 */
export interface PresentationInstanceFilterInfo {
  /** Instance filter. */
  filter: PresentationInstanceFilter;
  /** Classes of the properties used in filter. */
  usedClasses: ClassInfo[];
}

/**
 * Props for [[PresentationInstanceFilterBuilder]] component.
 * @beta
 */
export interface PresentationInstanceFilterBuilderProps {
  /** iModel connection to pull data from. */
  imodel: IModelConnection;
  /** Descriptor containing properties and classes that should be available for building filter. */
  descriptor: Descriptor;
  /** Callback that is invoked when filter changes. */
  onInstanceFilterChanged: (filter?: PresentationInstanceFilterInfo) => void;
  /** Specifies how deep rule groups can be nested. */
  ruleGroupDepthLimit?: number;
  /** Initial filter that will be show when component is mounted. */
  initialFilter?: PresentationInstanceFilterInfo;
  /** Should unique values renderer be enabled */
  enableUniqueValuesRenderer?: boolean;
}

/**
 * Component for building complex instance filters for filtering Content and Nodes produced by [PresentationManager]($presentation-frontend).
 * @beta
 */
export function PresentationInstanceFilterBuilder(props: PresentationInstanceFilterBuilderProps) {
  const { imodel, descriptor, onInstanceFilterChanged, ruleGroupDepthLimit, initialFilter, enableUniqueValuesRenderer } = props;
  const filteringProps = usePresentationInstanceFilteringProps(descriptor, imodel, initialFilter?.usedClasses);

  const onFilterChanged = useCallback(
    (filter?: PropertyFilter) => {
      const presentationFilter = filter ? createPresentationInstanceFilter(descriptor, filter) : undefined;
      onInstanceFilterChanged(presentationFilter ? { filter: presentationFilter, usedClasses: filteringProps.selectedClasses } : undefined);
    },
    [descriptor, onInstanceFilterChanged, filteringProps.selectedClasses],
  );

  const contextValue = useFilterBuilderNavigationPropertyEditorContext(imodel, descriptor);
  const [initialPropertyFilter] = useState(() => (initialFilter ? convertPresentationFilterToPropertyFilter(descriptor, initialFilter.filter) : undefined));

  return (
    <navigationPropertyEditorContext.Provider value={contextValue}>
      <InstanceFilterBuilder
        {...filteringProps}
        initialFilter={initialPropertyFilter}
        onFilterChanged={onFilterChanged}
        ruleGroupDepthLimit={ruleGroupDepthLimit}
        ruleValueRenderer={
          enableUniqueValuesRenderer
            ? (pr: PropertyFilterBuilderRuleValueRendererProps) => <UniqueValuesRenderer {...pr} imodel={imodel} descriptor={descriptor} />
            : undefined
        }
      />
    </navigationPropertyEditorContext.Provider>
  );
}

function UniqueValuesRenderer(props: PropertyFilterBuilderRuleValueRendererProps & { imodel: IModelConnection; descriptor: Descriptor }) {
  if (
    props.property.typename !== StandardTypeNames.Navigation &&
    (props.operator === PropertyFilterRuleOperator.IsEqual || props.operator === PropertyFilterRuleOperator.IsNotEqual)
  ) {
    return <UniquePropertyValuesSelector {...props} />;
  }
  return <PropertyFilterBuilderRuleValue {...props} />;
}
