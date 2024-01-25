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
import { PropertyDescription } from "@itwin/appui-abstract";
import { PropertyFilterBuilderRenderer, PropertyFilterBuilderRendererProps, PropertyFilterBuilderRuleValueRendererProps } from "@itwin/components-react";
import { IModelConnection } from "@itwin/core-frontend";
import { Alert, ComboBox, SelectOption } from "@itwin/itwinui-react";
import { ClassInfo, Descriptor, Keys } from "@itwin/presentation-common";
import { translate } from "../common/Utils";
import { getIModelMetadataProvider } from "./ECMetadataProvider";
import { PresentationFilterBuilderValueRenderer, PresentationInstanceFilterPropertyInfo, useInstanceFilterPropertyInfos } from "./PresentationFilterBuilder";
import { isFilterNonEmpty } from "./Utils";

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
  /** [Keys]($presentation-common) that will be passed through to [[FilterBuilderValueRenderer]] */
  descriptorInputKeys?: Keys;
}

/**
 * Component for building complex instance filters based on instance properties. In addition to filter builder component
 * it renders selector for classes that can be used to filter out available properties in filter rules.
 * @internal
 */
export function InstanceFilterBuilder(props: InstanceFilterBuilderProps) {
  const { selectedClasses, classes, onSelectedClassesChanged, imodel, descriptor, descriptorInputKeys, ...restProps } = props;

  const [showClassSelectionWarning, setShowClassSelectionWarning] = useState(false);
  const options = useMemo(() => classes.map(createOption), [classes]);
  const selectedOptions = useMemo(() => selectedClasses.map((classInfo) => classInfo.id), [selectedClasses]);

  return (
    <>
      {showClassSelectionWarning && (
        <Alert type="warning" className="class-selection-warning">
          {translate("instance-filter-builder.class-selection-warning")}
        </Alert>
      )}
      <div className="presentation-instance-filter">
        <ComboBox
          enableVirtualization={true}
          multiple={true}
          options={options}
          value={selectedOptions}
          inputProps={{
            placeholder: selectedClasses.length
              ? translate("instance-filter-builder.selected-classes")
              : translate("instance-filter-builder.select-classes-optional"),
          }}
          onShow={() => setShowClassSelectionWarning(!!selectedOptions.length && isFilterNonEmpty(props.rootGroup))}
          onHide={() => setShowClassSelectionWarning(false)}
          onChange={(selectedIds) => {
            onSelectedClassesChanged(selectedIds);
          }}
          className={"class-selector"}
        />
        <div className="presentation-property-filter-builder">
          <PropertyFilterBuilderRenderer
            {...restProps}
            ruleValueRenderer={(rendererProps: PropertyFilterBuilderRuleValueRendererProps) => (
              <PresentationFilterBuilderValueRenderer {...rendererProps} descriptorInputKeys={descriptorInputKeys} imodel={imodel} descriptor={descriptor} />
            )}
          />
        </div>
      </div>
    </>
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
  initialActiveClasses?: ClassInfo[],
): Required<
  Pick<
    InstanceFilterBuilderProps,
    "properties" | "classes" | "selectedClasses" | "onSelectedClassesChanged" | "propertyRenderer" | "onRulePropertySelected" | "isDisabled"
  >
> {
  const { propertyInfos, propertyRenderer } = useInstanceFilterPropertyInfos({ descriptor });
  const classes = usePropertyClasses({ descriptor });
  const { activeClasses, changeActiveClasses, isFilteringClasses, filterClassesByProperty } = useActiveClasses({
    imodel,
    availableClasses: classes,
    initialActiveClasses,
  });
  const { properties, isFilteringProperties } = usePropertiesFilteringByClass({ imodel, availableProperties: propertyInfos, activeClasses });

  const onRulePropertySelected = useCallback(
    (property: PropertyDescription) => {
      const propertyInfo = propertyInfos.find((info) => info.propertyDescription.name === property.name);
      if (propertyInfo) {
        filterClassesByProperty(propertyInfo);
      }
    },
    [propertyInfos, filterClassesByProperty],
  );

  return {
    onRulePropertySelected,
    onSelectedClassesChanged: useCallback((classIds) => changeActiveClasses(classIds), [changeActiveClasses]),
    propertyRenderer,
    properties,
    classes,
    selectedClasses: activeClasses,
    isDisabled: isFilteringClasses || isFilteringProperties,
  };
}
interface UsePropertyClassesProps {
  descriptor: Descriptor;
}

function usePropertyClasses({ descriptor }: UsePropertyClassesProps) {
  return useMemo((): ClassInfo[] => {
    const uniqueClasses = new Map();
    descriptor.selectClasses.forEach((selectClass) => uniqueClasses.set(selectClass.selectClassInfo.id, selectClass.selectClassInfo));
    return [...uniqueClasses.values()];
  }, [descriptor]);
}

interface UsePropertiesFilteringByClassProps {
  imodel: IModelConnection;
  availableProperties: PresentationInstanceFilterPropertyInfo[];
  activeClasses: ClassInfo[];
}

function usePropertiesFilteringByClass({ imodel, availableProperties, activeClasses }: UsePropertiesFilteringByClassProps) {
  const [filteredProperties, setFilteredProperties] = useState<PresentationInstanceFilterPropertyInfo[] | undefined>();
  const [isFilteringProperties, setIsFilteringProperties] = useState(false);
  const properties = useMemo(
    () => (filteredProperties ?? availableProperties).map((info) => info.propertyDescription),
    [availableProperties, filteredProperties],
  );

  const classChanges = useRef(new BehaviorSubject<ClassInfo[]>([]));
  useEffect(() => {
    classChanges.current.next(activeClasses);
  }, [activeClasses]);

  // filter properties by selected classes
  useEffect(() => {
    const subscription = classChanges.current
      .pipe(
        map((classes) => {
          if (classes.length === 0) {
            return of(undefined);
          }
          setIsFilteringProperties(true);
          return from(computePropertiesByClasses(availableProperties, classes, imodel));
        }),
        switchAll(),
      )
      .subscribe({
        next: (infos: PresentationInstanceFilterPropertyInfo[] | undefined) => {
          setFilteredProperties(infos);
          setIsFilteringProperties(false);
        },
      });
    return () => {
      subscription.unsubscribe();
    };
  }, [imodel, availableProperties]);

  return {
    properties,
    isFilteringProperties,
  };
}

interface UseActiveClassesProps {
  imodel: IModelConnection;
  availableClasses: ClassInfo[];
  initialActiveClasses?: ClassInfo[];
}

function useActiveClasses({ imodel, availableClasses, initialActiveClasses }: UseActiveClassesProps) {
  const [activeClasses, setActiveClasses] = useState<ClassInfo[]>(initialActiveClasses ?? []);
  const [isFilteringClasses, setIsFilteringClasses] = useState(false);

  const availableClassesRef = useRef(availableClasses);
  useEffect(() => {
    if (availableClassesRef.current !== availableClasses) {
      setActiveClasses([]);
      availableClassesRef.current = availableClasses;
    }
  }, [availableClasses]);

  const filterClassesByProperty = useCallback(
    (property: PresentationInstanceFilterPropertyInfo) => {
      setIsFilteringClasses(true);
      void (async () => {
        const newActiveClasses = await computeClassesByProperty(activeClasses.length === 0 ? availableClasses : activeClasses, property, imodel);
        setActiveClasses(newActiveClasses);
        setIsFilteringClasses(false);
      })();
    },
    [activeClasses, availableClasses, imodel],
  );

  const changeActiveClasses = useCallback(
    (classIds: string[]) => {
      const newSelectedClasses = availableClasses.filter((availableClass) => classIds.findIndex((classId) => classId === availableClass.id) !== -1);
      setActiveClasses(newSelectedClasses);
    },
    [availableClasses],
  );

  return {
    activeClasses,
    isFilteringClasses,
    changeActiveClasses,
    filterClassesByProperty,
  };
}

async function computePropertiesByClasses(
  properties: PresentationInstanceFilterPropertyInfo[],
  classes: ClassInfo[],
  imodel: IModelConnection,
): Promise<PresentationInstanceFilterPropertyInfo[] | undefined> {
  const metadataProvider = getIModelMetadataProvider(imodel);
  const ecClassInfos = await Promise.all(classes.map(async (info) => metadataProvider.getECClassInfo(info.id)));
  const filteredProperties: PresentationInstanceFilterPropertyInfo[] = [];
  for (const prop of properties) {
    // property should be shown if at least one of selected classes is derived from property source class
    if (ecClassInfos.some((info) => info && info.isDerivedFrom(prop.sourceClassId))) {
      filteredProperties.push(prop);
    }
  }

  return filteredProperties.length === properties.length ? undefined : filteredProperties;
}

async function computeClassesByProperty(
  classes: ClassInfo[],
  property: PresentationInstanceFilterPropertyInfo,
  imodel: IModelConnection,
): Promise<ClassInfo[]> {
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
