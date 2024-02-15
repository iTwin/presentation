/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module InstancesFilter
 */

import { useCallback, useEffect, useMemo } from "react";
import { PropertyDescription } from "@itwin/appui-abstract";
import { PropertyFilterBuilderRuleValue, PropertyFilterBuilderRuleValueRendererProps, usePropertyFilterBuilder } from "@itwin/components-react";
import { assert } from "@itwin/core-bentley";
import { IModelConnection } from "@itwin/core-frontend";
import { ClassId, ClassInfo, Descriptor, InstanceFilterDefinition, Keys, PropertiesField } from "@itwin/presentation-common";
import { navigationPropertyEditorContext } from "../properties/editors/NavigationPropertyEditorContext";
import { UniquePropertyValuesSelector } from "../properties/inputs/UniquePropertyValuesSelector";
import { InstanceFilterBuilder, usePresentationInstanceFilteringProps } from "./InstanceFilterBuilder";
import { PresentationInstanceFilter, PresentationInstanceFilterConditionGroup } from "./PresentationInstanceFilter";
import { PresentationInstanceFilterProperty } from "./PresentationInstanceFilterProperty";
import { createInstanceFilterPropertyInfos, useFilterBuilderNavigationPropertyEditorContext } from "./Utils";
import { createFilterClassExpression, createInstanceFilterDefinitionBase } from "./InstanceFilterConverter";

/**
 * Function that checks if supplied [[PresentationInstanceFilter]] is [[PresentationInstanceFilterConditionGroup]].
 * @beta
 * @deprecated in 5.0. Use `PresentationInstanceFilter.isConditionGroup` instead.
 */
// istanbul ignore next
export function isPresentationInstanceFilterConditionGroup(filter: PresentationInstanceFilter): filter is PresentationInstanceFilterConditionGroup {
  return PresentationInstanceFilter.isConditionGroup(filter);
}

/**
 * Converts [[PresentationInstanceFilter]] into [InstanceFilterDefinition]($presentation-common) that can be passed
 * to [PresentationManager]($presentation-frontend) through request options in order to filter results.
 * @beta
 * @deprecated in 5.0. Use `createInstanceFilterDefinition` instead.
 */
// istanbul ignore next
export async function convertToInstanceFilterDefinition(filter: PresentationInstanceFilter, imodel: IModelConnection): Promise<InstanceFilterDefinition> {
  return createInstanceFilterDefinitionBase(filter, imodel);
}

/**
 * Data structure that stores information about filter built by [[PresentationInstanceFilterDialog]].
 * @beta
 */
export interface PresentationInstanceFilterInfo {
  /** Instance filter. */
  filter: PresentationInstanceFilter | undefined;
  /** Classes of the properties used in filter. */
  usedClasses: ClassInfo[];
}

/**
 * Data structure that contains information about property used for building filter.
 * @beta
 */
export interface PresentationInstanceFilterPropertyInfo {
  /** Content descriptor field that represents this property. */
  field: PropertiesField;
  /** Property description  */
  propertyDescription: PropertyDescription;
  /** Id of the class where this property is defined. */
  sourceClassId: ClassId;
  /** Name of the class that was used to access this property. */
  className: string;
  /** Label of related property category. */
  categoryLabel?: string;
}

/**
 * Props for [[useInstanceFilterPropertyInfos]] hook.
 * @beta
 */
export interface UseInstanceFilterPropertyInfosProps {
  /** Descriptor to pull properties from. */
  descriptor: Descriptor;
}

/**
 * Custom hook that collects properties from descriptor for filter building.
 * @beta
 */
export function useInstanceFilterPropertyInfos({ descriptor }: UseInstanceFilterPropertyInfosProps) {
  const propertyInfos = useMemo(() => createInstanceFilterPropertyInfos(descriptor), [descriptor]);

  const propertyRenderer = useCallback(
    (name: string) => {
      const instanceFilterPropertyInfo = propertyInfos.find((info) => info.propertyDescription.name === name);
      assert(instanceFilterPropertyInfo !== undefined);
      return (
        <PresentationInstanceFilterProperty
          propertyDescription={instanceFilterPropertyInfo.propertyDescription}
          fullClassName={instanceFilterPropertyInfo.className}
          categoryLabel={instanceFilterPropertyInfo.categoryLabel}
        />
      );
    },
    [propertyInfos],
  );

  return {
    propertyInfos,
    propertyRenderer,
  };
}

/**
 * Props for [[PresentationFilterBuilderValueRenderer]].
 * @beta
 */
export interface PresentationFilterBuilderValueRendererProps extends PropertyFilterBuilderRuleValueRendererProps {
  /** iModel used to pull data from. */
  imodel: IModelConnection;
  /** Descriptor used to get properties for filter builder. */
  descriptor: Descriptor;
  /** Keys used to create the descriptor. */
  descriptorInputKeys?: Keys;
}

/**
 * Custom renderer of the filter rule value input. It extends default value input functionality:
 * - For `IsEqual` and `IsNotEqual` operators it renders a selector with unique property values. Unique values are collected from
 * the instances described by the descriptor ([[PresentationFilterBuilderValueRendererProps.descriptor]] and [[PresentationFilterBuilderValueRendererProps.descriptorInputKeys]]).
 * - For kind of quantity properties it renders input with units support.
 *
 * @beta
 */
export function PresentationFilterBuilderValueRenderer({ imodel, descriptor, descriptorInputKeys, ...props }: PresentationFilterBuilderValueRendererProps) {
  const navigationPropertyEditorContextValue = useFilterBuilderNavigationPropertyEditorContext(imodel, descriptor);
  if (props.operator === "is-equal" || props.operator === "is-not-equal") {
    return <UniquePropertyValuesSelector {...props} imodel={imodel} descriptor={descriptor} descriptorInputKeys={descriptorInputKeys} />;
  }

  return (
    <navigationPropertyEditorContext.Provider value={navigationPropertyEditorContextValue}>
      <PropertyFilterBuilderRuleValue {...props} />
    </navigationPropertyEditorContext.Provider>
  );
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
  /**
   * Specifies how deep rule groups can be nested.
   * @deprecated in 5.0. The component doesn't support multi-level nesting anymore.
   */
  ruleGroupDepthLimit?: number;
  /** Initial filter that will be show when component is mounted. */
  initialFilter?: PresentationInstanceFilterInfo;
}

/**
 * Component for building complex instance filters for filtering content and nodes produced
 * by [PresentationManager]($presentation-frontend).
 *
 * @beta
 */
export function PresentationInstanceFilterBuilder(props: PresentationInstanceFilterBuilderProps) {
  const { imodel, descriptor, onInstanceFilterChanged, initialFilter } = props;
  const { rootGroup, actions, buildFilter } = usePropertyFilterBuilder({
    initialFilter: initialFilter?.filter ? PresentationInstanceFilter.toComponentsPropertyFilter(descriptor, initialFilter.filter) : undefined,
  });
  const filteringProps = usePresentationInstanceFilteringProps(descriptor, imodel, initialFilter?.usedClasses);
  useEffect(() => {
    const filter = buildFilter({ ignoreErrors: true });
    onInstanceFilterChanged(
      filter ? { filter: PresentationInstanceFilter.fromComponentsPropertyFilter(descriptor, filter), usedClasses: filteringProps.selectedClasses } : undefined,
    );
  }, [descriptor, buildFilter, onInstanceFilterChanged, filteringProps.selectedClasses]);
  const onSelectedClassesChanged = (classIds: string[]) => {
    filteringProps.onSelectedClassesChanged(classIds);
    actions.removeAllItems();
  };
  return (
    <InstanceFilterBuilder
      {...filteringProps}
      onSelectedClassesChanged={onSelectedClassesChanged}
      rootGroup={rootGroup}
      actions={actions}
      imodel={imodel}
      descriptor={descriptor}
    />
  );
}

/**
 * Creates [InstanceFilterDefinition]($presentation-common) from [[PresentationInstanceFilterInfo]]. Created definition
 * can be passed to [PresentationManager]($presentation-frontend) through request options in order to filter results.
 * @beta
 */
export async function createInstanceFilterDefinition(info: PresentationInstanceFilterInfo, imodel: IModelConnection): Promise<InstanceFilterDefinition> {
  if (!info.filter) {
    assert(info.usedClasses.length > 0);
    return { expression: createFilterClassExpression(info.usedClasses), selectClassName: "" };
  }

  const instanceFilter = await createInstanceFilterDefinitionBase(info.filter, imodel);
  if (info.usedClasses.length === 0) {
    return instanceFilter;
  }

  return {
    ...instanceFilter,
    expression: `${wrap(instanceFilter.expression)} AND ${createFilterClassExpression(info.usedClasses)}`,
  };
}

function wrap(expression: string) {
  if (expression.startsWith("(") && expression.endsWith(")")) {
    return expression;
  }
  return `(${expression})`;
}
