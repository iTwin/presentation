/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { useEffect, useMemo, useState } from "react";
import { ActionMeta, InputActionMeta, MultiValue } from "react-select";
import { from, map, mergeMap, toArray } from "rxjs";
import { PropertyDescription, PropertyValue, PropertyValueFormat } from "@itwin/appui-abstract";
import { IModelConnection } from "@itwin/core-frontend";
import {
  ClassInfo,
  Descriptor,
  DisplayValue,
  DisplayValueGroup,
  Field,
  Keys,
  KeySet,
  MultiSchemaClassesSpecification,
  Ruleset,
} from "@itwin/presentation-common";
import { Presentation } from "@itwin/presentation-frontend";
import { deserializeUniqueValues, findField, serializeUniqueValues, translate, UniqueValue } from "../../common/Utils";
import { getInstanceFilterFieldName } from "../../instance-filter-builder/Utils";
import { AsyncSelect } from "./AsyncSelect";

/** @internal */
export const UNIQUE_PROPERTY_VALUES_BATCH_SIZE = 100;

/** @internal */
export interface UniquePropertyValuesSelectorProps {
  /** Currently entered value. */
  value?: PropertyValue;
  /** Property used in rule to which this value will be compared to. */
  property: PropertyDescription;
  /** Callback that is invoked when value changes. */
  onChange: (value: PropertyValue) => void;
  /** Current IModel */
  imodel: IModelConnection;
  /** Current descriptor */
  descriptor: Descriptor;
  /** Keys that are currently selected for filtering */
  descriptorInputKeys?: Keys;
  /** Currently selected classes. */
  selectedClasses?: ClassInfo[];
}

/** @internal */
export function UniquePropertyValuesSelector(props: UniquePropertyValuesSelectorProps) {
  const { imodel, descriptor, property, onChange, value, descriptorInputKeys, selectedClasses } = props;
  const [field, setField] = useState<Field | undefined>(() => findField(descriptor, getInstanceFilterFieldName(property)));
  const [searchInput, setSearchInput] = useState<string>("");
  const selectedValues = useMemo(() => getUniqueValueFromProperty(value), [value]);

  useEffect(() => {
    setField(findField(descriptor, getInstanceFilterFieldName(property)));
    setSearchInput("");
  }, [descriptor, property]);

  const onValueChange = (_: MultiValue<UniqueValue>, action: ActionMeta<UniqueValue>) => {
    const currentOptions = () => {
      switch (action.action) {
        case "select-option":
          return [...selectedValues, action.option].filter((v): v is UniqueValue => v !== undefined);
        case "deselect-option":
          return [...selectedValues].filter((v) => v.displayValue !== action.option?.displayValue);
        case "clear":
          return [];
      }
      // istanbul ignore next
      return [...selectedValues];
    };

    const newSelectedValue = currentOptions();
    if (newSelectedValue.length === 0) {
      onChange({
        valueFormat: PropertyValueFormat.Primitive,
        displayValue: undefined,
        value: undefined,
      });
    } else {
      const { displayValues, groupedRawValues } = serializeUniqueValues(newSelectedValue);
      onChange({
        valueFormat: PropertyValueFormat.Primitive,
        displayValue: displayValues,
        value: groupedRawValues,
      });
    }
  };

  const onInputChange = (input: string, actionMeta: InputActionMeta) => {
    // Do not reset search input on option select
    if (actionMeta.action !== "set-value") {
      setSearchInput(input);
    }
  };

  const isOptionSelected = (option: UniqueValue): boolean => selectedValues.map((selectedValue) => selectedValue.displayValue).includes(option.displayValue);
  const ruleset = useUniquePropertyValuesRuleset(descriptor.ruleset, field, descriptorInputKeys, selectedClasses);
  const { loadValues, hasMore, optionCount } = useUniquePropertyValuesLoader({ imodel, property, descriptor, ruleset, field, descriptorInputKeys });

  return (
    <AsyncSelect
      inputValue={searchInput}
      value={selectedValues}
      debounceTimeout={500}
      loadOptions={async (input, options) => loadValues(input, options.length)}
      placeholder={translate("unique-values-property-editor.select-values")}
      onChange={onValueChange}
      isOptionSelected={isOptionSelected}
      cacheUniqs={[property, searchInput]}
      hideSelectedOptions={false}
      isSearchable={true}
      closeMenuOnSelect={false}
      blurInputOnSelect={false}
      tabSelectsValue={false}
      getOptionLabel={(option) => formatOptionLabel(option.displayValue, property.typename)}
      getOptionValue={(option) => option.displayValue}
      onInputChange={onInputChange}
      // do not show no data message if no options are shown but more can be loaded
      isLoading={optionCount === 0 && hasMore ? true : undefined}
    />
  );
}

function formatOptionLabel(displayValue: string, type: string): string {
  if (displayValue === "") {
    return translate("unique-values-property-editor.empty-value");
  }

  switch (type) {
    case "dateTime":
      return new Date(displayValue).toLocaleString();
    case "shortDate":
      return new Date(displayValue).toLocaleDateString();
    default:
      return displayValue;
  }
}

function getUniqueValueFromProperty(propertyValue: PropertyValue | undefined): UniqueValue[] {
  if (propertyValue?.valueFormat === PropertyValueFormat.Primitive && typeof propertyValue.value === "string" && propertyValue.displayValue) {
    return deserializeUniqueValues(propertyValue.displayValue, propertyValue.value) ?? [];
  }
  return [];
}

function useUniquePropertyValuesRuleset(descriptorRuleset?: Ruleset, field?: Field, descriptorInputKeys?: Keys, selectedClasses?: ClassInfo[]) {
  const [ruleset, setRuleset] = useState<Ruleset>();
  useEffect(() => {
    if (descriptorRuleset) {
      setRuleset(descriptorRuleset);
      return;
    }

    if (descriptorInputKeys && hasKeys(descriptorInputKeys)) {
      setRuleset({
        id: "unique-instances-property-values",
        rules: [
          {
            ruleType: "Content",
            specifications: [
              {
                specType: "SelectedNodeInstances",
                acceptableClassNames: selectedClasses ? selectedClasses.map(({ name }) => name.split(":")[1]) : undefined,
                acceptablePolymorphically: false,
              },
            ],
          },
        ],
      });
      return;
    }

    const classInfos = selectedClasses ?? getFieldClassInfos(field);
    if (classInfos.length === 0) {
      setRuleset(undefined);
      return;
    }

    setRuleset({
      id: "unique-class-property-values",
      rules: [
        {
          ruleType: "Content",
          specifications: [
            {
              specType: "ContentInstancesOfSpecificClasses",
              classes: createSchemaClasses(classInfos),
            },
          ],
        },
      ],
    });
  }, [field, descriptorRuleset, descriptorInputKeys, selectedClasses]);

  return ruleset;
}

function createSchemaClasses(infos: ClassInfo[]): MultiSchemaClassesSpecification | MultiSchemaClassesSpecification[] {
  const schemaClassMap = new Map<string, string[]>();
  infos.forEach((info) => {
    const [schemaName, className] = info.name.split(":");
    let classNames = schemaClassMap.get(schemaName);
    if (!classNames) {
      classNames = [];
      schemaClassMap.set(schemaName, classNames);
    }
    if (!classNames.includes(className)) {
      classNames.push(className);
    }
  });
  const schemaClasses = [...schemaClassMap.entries()].map(([schemaName, classNames]) => ({ schemaName, classNames, arePolymorphic: true }));
  return schemaClasses.length === 1 ? schemaClasses[0] : schemaClasses;
}

function getFieldClassInfos(field?: Field) {
  if (field?.parent === undefined && field?.isPropertiesField()) {
    return field.properties.map((p) => p.property.classInfo);
  }

  let rootParentField = field?.parent;
  while (rootParentField?.parent !== undefined) {
    rootParentField = rootParentField.parent;
  }
  const lastStepToPrimaryClass = rootParentField?.pathToPrimaryClass.slice(-1).pop();
  return lastStepToPrimaryClass ? [lastStepToPrimaryClass.targetClassInfo] : [];
}

interface UseUniquePropertyValuesLoaderProps {
  imodel: IModelConnection;
  property: PropertyDescription;
  descriptor: Descriptor;
  ruleset?: Ruleset;
  field?: Field;
  descriptorInputKeys?: Keys;
}

interface UseUniquePropertyValuesLoaderResult {
  loadValues: (searchInput: string, loadedOptionsCount: number) => Promise<{ options: UniqueValue[]; hasMore: boolean }>;
  optionCount: number;
  hasMore: boolean;
}

interface UniquePropertyValuesLoaderState {
  totalCount: number;
  filteredCount: number;
  options: UniqueValue[];
  hasMore: boolean;
}

function useUniquePropertyValuesLoader({
  imodel,
  property,
  descriptor,
  ruleset,
  field,
  descriptorInputKeys,
}: UseUniquePropertyValuesLoaderProps): UseUniquePropertyValuesLoaderResult {
  const [loadedOptions, setLoadedOptions] = useState<UniquePropertyValuesLoaderState>({
    totalCount: 0,
    filteredCount: 0,
    options: [],
    hasMore: false,
  });

  useEffect(() => {
    setLoadedOptions({ totalCount: 0, filteredCount: 0, options: [], hasMore: false });
  }, [property, descriptor]);

  const loadValues = async (searchInput: string, loadedOptionsCount: number) => {
    searchInput = searchInput.toLowerCase();
    const matchesSearchInput = (option: UniqueValue) => {
      return !searchInput || option.displayValue.toLowerCase().includes(searchInput);
    };

    if (!ruleset || !field) {
      return { options: [], hasMore: false };
    }

    // if the first page is requested and we already have the options loaded, return previous values.
    if (loadedOptionsCount === 0 && loadedOptions.totalCount > 0) {
      const searchedOptions = loadedOptions.options.filter(matchesSearchInput);
      if (!loadedOptions.hasMore || searchedOptions.length !== 0) {
        return { options: searchedOptions, hasMore: loadedOptions.hasMore };
      }
    }

    const requestProps = {
      imodel,
      descriptor: {},
      fieldDescriptor: field.getFieldDescriptor(),
      rulesetOrId: ruleset,
      paging: { start: loadedOptions.totalCount, size: UNIQUE_PROPERTY_VALUES_BATCH_SIZE },
      keys: new KeySet(descriptorInputKeys),
    };
    const items = await new Promise<DisplayValueGroup[]>((resolve) => {
      (Presentation.presentation.getDistinctValuesIterator
        ? from(Presentation.presentation.getDistinctValuesIterator(requestProps)).pipe(
            mergeMap((result) => result.items),
            toArray(),
          )
        : // eslint-disable-next-line deprecation/deprecation
          from(Presentation.presentation.getPagedDistinctValues(requestProps)).pipe(map((result) => result.items))
      ).subscribe({
        next: resolve,
        error: () => resolve([]),
      });
    });

    const options: UniqueValue[] = [];
    for (const option of items) {
      if (option.displayValue === undefined || !DisplayValue.isPrimitive(option.displayValue)) {
        continue;
      }
      const groupedValues = option.groupedRawValues.filter((value) => value !== undefined);

      if (groupedValues.length !== 0) {
        options.push({ displayValue: option.displayValue, groupedRawValues: groupedValues });
      }
    }

    const hasMoreOptions = items.length === UNIQUE_PROPERTY_VALUES_BATCH_SIZE;
    const filteredOptions = options.filter(matchesSearchInput);

    setLoadedOptions((prev) => ({
      totalCount: prev.totalCount + items.length,
      // when first page is requested reset filtered option count
      filteredCount: loadedOptionsCount === 0 ? filteredOptions.length : prev.filteredCount + filteredOptions.length,
      options: [...prev.options, ...options],
      hasMore: hasMoreOptions,
    }));

    return {
      options: filteredOptions,
      hasMore: hasMoreOptions,
    };
  };

  return { loadValues, optionCount: loadedOptions.filteredCount, hasMore: loadedOptions.hasMore };
}

function hasKeys(descriptorInputKeys?: Keys) {
  return Array.isArray(descriptorInputKeys) ? descriptorInputKeys.length > 0 : !(descriptorInputKeys as KeySet).isEmpty;
}
