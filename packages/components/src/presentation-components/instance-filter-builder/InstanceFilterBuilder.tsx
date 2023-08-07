/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module InstancesFilter
 */

import "./InstanceFilterBuilder.scss";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BehaviorSubject, from, of } from "rxjs";
import { map } from "rxjs/internal/operators/map";
import { switchAll } from "rxjs/internal/operators/switchAll";
import { PropertyDescription, StandardTypeNames } from "@itwin/appui-abstract";
import {
  PropertyFilterBuilderRenderer,
  PropertyFilterBuilderRendererProps,
  PropertyFilterBuilderRuleValue,
  PropertyFilterBuilderRuleValueRendererProps,
  PropertyFilterRuleOperator,
} from "@itwin/components-react";
import { assert } from "@itwin/core-bentley";
import { IModelConnection } from "@itwin/core-frontend";
import { ComboBox, SelectOption } from "@itwin/itwinui-react";
import { ClassInfo, Descriptor } from "@itwin/presentation-common";
import { translate } from "../common/Utils";
import { navigationPropertyEditorContext, NavigationPropertyEditorContextProps } from "../properties/NavigationPropertyEditor";
import { UniquePropertyValuesSelector } from "../properties/UniquePropertyValuesSelector";
import { getIModelMetadataProvider } from "./ECMetadataProvider";
import { PresentationInstanceFilterProperty } from "./PresentationInstanceFilterProperty";
import { createInstanceFilterPropertyInfos, getInstanceFilterFieldName, InstanceFilterPropertyInfo } from "./Utils";

/**
 * Props for [[InstanceFilterBuilder]] component.
 * @internal
 */
export interface InstanceFilterBuilderProps extends PropertyFilterBuilderRendererProps {
  /** Currently selected classes. */
  selectedClasses: ClassInfo[];
  /** List of all available classes. */
  classes: ClassInfo[];
  /** Callback that is invoked when selected classes changes. */
  onSelectedClassesChanged: (classIds: string[]) => void;
  /** iModel connection that will be used for getting [[navigationPropertyEditorContext]] */
  imodel: IModelConnection;
  /** [Descriptor]($presentation-common) that will be used for getting [[navigationPropertyEditorContext]]. */
  descriptor: Descriptor;
  /** Should unique values renderer be enabled */
  enableUniqueValuesRenderer?: boolean;
}

/**
 * Component for building complex instance filters based on instance properties. In addition to filter builder component
 * it renders selector for classes that can be used to filter out available properties in filter rules.
 * @internal
 */
export function InstanceFilterBuilder(props: InstanceFilterBuilderProps) {
  const { selectedClasses, classes, onSelectedClassesChanged, imodel, descriptor, enableUniqueValuesRenderer, ...restProps } = props;

  const navigationPropertyEditorContextValue = useFilterBuilderNavigationPropertyEditorContext(imodel, descriptor);

  const options = useMemo(() => classes.map(createOption), [classes]);
  const selectedOptions = useMemo(() => selectedClasses.map((classInfo) => classInfo.id), [selectedClasses]);

  return (
    <div className="presentation-instance-filter">
      <ComboBox
        enableVirtualization={true}
        multiple={true}
        options={options}
        value={selectedOptions}
        inputProps={{
          placeholder: translate("instance-filter-builder.select-class"),
        }}
        onChange={(selectedIds) => {
          onSelectedClassesChanged(selectedIds);
        }}
      />
      <div className="presentation-property-filter-builder">
        <navigationPropertyEditorContext.Provider value={navigationPropertyEditorContextValue}>
          <PropertyFilterBuilderRenderer
            {...restProps}
            ruleValueRenderer={
              enableUniqueValuesRenderer
                ? (pr: PropertyFilterBuilderRuleValueRendererProps) => <UniqueValuesRenderer {...pr} imodel={imodel} descriptor={descriptor} />
                : undefined
            }
          />
        </navigationPropertyEditorContext.Provider>
      </div>
    </div>
  );
}

function createOption(classInfo: ClassInfo): SelectOption<string> {
  return { label: classInfo.label, value: classInfo.id };
}

/**
 * Custom hook that extracts properties and classes from [Descriptor]($presentation-common) and creates props that can be used by [[InstanceFilterBuilder]] component.
 *
 * This hook also makes sure that when classes are selected available properties list is updated to contain only properties found on selected classes and vice versa -
 * when property is selected in one of the rules selected classes list is updated to contain only classes that has access to that property.
 * @internal
 */
export function usePresentationInstanceFilteringProps(
  descriptor: Descriptor,
  imodel: IModelConnection,
  initialClasses?: ClassInfo[],
): Required<
  Pick<
    InstanceFilterBuilderProps,
    "properties" | "classes" | "selectedClasses" | "onSelectedClassesChanged" | "propertyRenderer" | "onRulePropertySelected" | "isDisabled"
  >
> {
  const propertyInfos = useMemo(() => createInstanceFilterPropertyInfos(descriptor), [descriptor]);
  const classes = useMemo((): ClassInfo[] => {
    const uniqueClasses = new Map();
    descriptor.selectClasses.forEach((selectClass) => uniqueClasses.set(selectClass.selectClassInfo.id, selectClass.selectClassInfo));
    return [...uniqueClasses.values()];
  }, [descriptor]);

  const { selectedClasses, onSelectedClassesChanged, isFilteringClasses, filterClassesByProperty } = useSelectedClasses(classes, imodel, initialClasses);
  const { properties, isFilteringProperties } = useProperties(propertyInfos, selectedClasses, imodel);

  const onRulePropertySelected = useCallback(
    (property: PropertyDescription) => {
      const propertyInfo = propertyInfos.find((info) => info.propertyDescription.name === property.name);
      if (propertyInfo) {
        filterClassesByProperty(propertyInfo);
      }
    },
    [propertyInfos, filterClassesByProperty],
  );

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
    onRulePropertySelected,
    onSelectedClassesChanged,
    propertyRenderer,
    properties,
    classes,
    selectedClasses,
    isDisabled: isFilteringClasses || isFilteringProperties,
  };
}

function useProperties(propertyInfos: InstanceFilterPropertyInfo[], selectedClasses: ClassInfo[], imodel: IModelConnection) {
  const [filteredProperties, setFilteredProperties] = useState<InstanceFilterPropertyInfo[] | undefined>();
  const [isFilteringProperties, setIsFilteringProperties] = useState(false);
  const properties = useMemo(() => (filteredProperties ?? propertyInfos).map((info) => info.propertyDescription), [propertyInfos, filteredProperties]);

  const classChanges = useRef(new BehaviorSubject<ClassInfo[]>([]));
  useEffect(() => {
    classChanges.current.next(selectedClasses);
  }, [selectedClasses]);

  // filter properties by selected classes
  useEffect(() => {
    const subscription = classChanges.current
      .pipe(
        map((classes) => {
          if (classes.length === 0) {
            return of(undefined);
          }
          setIsFilteringProperties(true);
          return from(computePropertiesByClasses(propertyInfos, classes, imodel));
        }),
        switchAll(),
      )
      .subscribe({
        next: (infos: InstanceFilterPropertyInfo[] | undefined) => {
          setFilteredProperties(infos);
          setIsFilteringProperties(false);
        },
      });
    return () => {
      subscription.unsubscribe();
    };
  }, [imodel, propertyInfos]);

  return {
    properties,
    isFilteringProperties,
  };
}

function useSelectedClasses(classes: ClassInfo[], imodel: IModelConnection, initialClasses?: ClassInfo[]) {
  const [selectedClasses, setSelectedClasses] = useState<ClassInfo[]>(initialClasses ?? []);
  const [isFilteringClasses, setIsFilteringClasses] = useState(false);

  const firstRender = useRef(true);
  useEffect(() => {
    if (!firstRender.current) {
      setSelectedClasses([]);
    }
    firstRender.current = false;
  }, [classes]);

  const filterClassesByProperty = useCallback(
    (property: InstanceFilterPropertyInfo) => {
      setIsFilteringClasses(true);
      void (async () => {
        const newSelectedClasses = await computeClassesByProperty(selectedClasses.length === 0 ? classes : selectedClasses, property, imodel);
        setSelectedClasses(newSelectedClasses);
        setIsFilteringClasses(false);
      })();
    },
    [selectedClasses, classes, imodel],
  );

  return {
    selectedClasses,
    isFilteringClasses,
    onSelectedClassesChanged: useCallback(
      (classIds: string[]) => {
        const newSelectedClasses = classes.filter((classInfo) => classIds.findIndex((classId) => classId === classInfo.id) !== -1);
        setSelectedClasses(newSelectedClasses);
      },
      [classes],
    ),
    filterClassesByProperty,
  };
}

/** @internal */
export function useFilterBuilderNavigationPropertyEditorContext(imodel: IModelConnection, descriptor: Descriptor) {
  return useMemo<NavigationPropertyEditorContextProps>(
    () => ({
      imodel,
      getNavigationPropertyInfo: async (property) => {
        const field = descriptor.getFieldByName(getInstanceFilterFieldName(property));
        if (!field || !field.isPropertiesField()) {
          return undefined;
        }

        return field.properties[0].property.navigationPropertyInfo;
      },
    }),
    [imodel, descriptor],
  );
}

async function computePropertiesByClasses(
  properties: InstanceFilterPropertyInfo[],
  classes: ClassInfo[],
  imodel: IModelConnection,
): Promise<InstanceFilterPropertyInfo[] | undefined> {
  const metadataProvider = getIModelMetadataProvider(imodel);
  const ecClassInfos = await Promise.all(classes.map(async (info) => metadataProvider.getECClassInfo(info.id)));
  const filteredProperties: InstanceFilterPropertyInfo[] = [];
  for (const prop of properties) {
    // property should be shown if all selected classes are derived from property source class
    if (ecClassInfos.every((info) => info && info.isDerivedFrom(prop.sourceClassId))) {
      filteredProperties.push(prop);
    }
  }

  return filteredProperties.length === properties.length ? undefined : filteredProperties;
}

async function computeClassesByProperty(classes: ClassInfo[], property: InstanceFilterPropertyInfo, imodel: IModelConnection): Promise<ClassInfo[]> {
  const metadataProvider = getIModelMetadataProvider(imodel);
  const propertyClass = await metadataProvider.getECClassInfo(property.sourceClassId);
  // istanbul ignore next
  if (!propertyClass) {
    return classes;
  }

  const classesWithProperty: ClassInfo[] = [];
  for (const currentClass of classes) {
    // add classes that are derived from property source class
    if (propertyClass.isBaseOf(currentClass.id)) {
      classesWithProperty.push(currentClass);
    }
  }

  return classesWithProperty;
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
