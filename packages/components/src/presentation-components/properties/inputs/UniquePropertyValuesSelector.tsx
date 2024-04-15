/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { useCallback, useEffect, useMemo, useState } from "react";
import { ActionMeta, MultiValue } from "react-select";
import { from, map, mergeMap, toArray } from "rxjs";
import { PropertyDescription, PropertyValue, PropertyValueFormat } from "@itwin/appui-abstract";
import { IModelConnection } from "@itwin/core-frontend";
import {
  ClassInfo,
  ContentSpecificationTypes,
  Descriptor,
  DisplayValue,
  DisplayValueGroup,
  Field,
  Keys,
  KeySet,
  MultiSchemaClassesSpecification,
  Ruleset,
  RuleTypes,
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
}

/** @internal */
export function UniquePropertyValuesSelector(props: UniquePropertyValuesSelectorProps) {
  const { imodel, descriptor, property, onChange, value, descriptorInputKeys } = props;
  const [field, setField] = useState<Field | undefined>(() => findField(descriptor, getInstanceFilterFieldName(property)));
  const selectedValues = useMemo(() => getUniqueValueFromProperty(value), [value]);

  useEffect(() => {
    setField(findField(descriptor, getInstanceFilterFieldName(property)));
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

  const isOptionSelected = (option: UniqueValue): boolean => selectedValues.map((selectedValue) => selectedValue.displayValue).includes(option.displayValue);

  const ruleset = useUniquePropertyValuesRuleset(descriptor.ruleset, field);
  const loadTargets = useUniquePropertyValuesLoader({ imodel, ruleset, field, descriptorInputKeys });

  return (
    <AsyncSelect
      value={selectedValues}
      loadOptions={async (_, options) => loadTargets(options.length)}
      placeholder={translate("unique-values-property-editor.select-values")}
      onChange={onValueChange}
      isOptionSelected={isOptionSelected}
      cacheUniqs={[property]}
      hideSelectedOptions={false}
      isSearchable={false}
      closeMenuOnSelect={false}
      tabSelectsValue={false}
      getOptionLabel={(option) => formatOptionLabel(option.displayValue, property.typename)}
      getOptionValue={(option) => option.displayValue}
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

function useUniquePropertyValuesRuleset(descriptorRuleset?: Ruleset, field?: Field) {
  const [ruleset, setRuleset] = useState<Ruleset>();
  useEffect(() => {
    if (descriptorRuleset) {
      setRuleset(descriptorRuleset);
      return;
    }

    const classInfos = getFieldClassInfos(field);
    if (classInfos.length === 0) {
      setRuleset(undefined);
      return;
    }

    setRuleset({
      id: "unique-property-values",
      rules: [
        {
          ruleType: RuleTypes.Content,
          specifications: [
            {
              specType: ContentSpecificationTypes.ContentInstancesOfSpecificClasses,
              classes: createSchemaClasses(classInfos),
            },
          ],
        },
      ],
    });
  }, [field, descriptorRuleset]);

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
  ruleset?: Ruleset;
  field?: Field;
  descriptorInputKeys?: Keys;
}

function useUniquePropertyValuesLoader({ imodel, ruleset, field, descriptorInputKeys }: UseUniquePropertyValuesLoaderProps) {
  const loadTargets = useCallback(
    async (loadedOptionsCount: number) => {
      if (!ruleset || !field) {
        return { options: [], hasMore: false };
      }

      const requestProps = {
        imodel,
        descriptor: {},
        fieldDescriptor: field.getFieldDescriptor(),
        rulesetOrId: ruleset,
        paging: { start: loadedOptionsCount, size: UNIQUE_PROPERTY_VALUES_BATCH_SIZE },
        keys: new KeySet(descriptorInputKeys),
      };
      const items = await new Promise<DisplayValueGroup[]>((resolve, reject) => {
        (Presentation.presentation.getDistinctValuesIterator
          ? from(Presentation.presentation.getDistinctValuesIterator(requestProps)).pipe(
              mergeMap((result) => result.items),
              toArray(),
            )
          : // eslint-disable-next-line deprecation/deprecation
            from(Presentation.presentation.getPagedDistinctValues(requestProps)).pipe(map((result) => result.items))
        ).subscribe({
          next: resolve,
          error: reject,
        });
      });

      const filteredOptions: UniqueValue[] = [];
      for (const option of items) {
        if (option.displayValue === undefined || !DisplayValue.isPrimitive(option.displayValue)) {
          continue;
        }
        const groupedValues = option.groupedRawValues.filter((value) => value !== undefined);
        if (groupedValues.length !== 0) {
          filteredOptions.push({ displayValue: option.displayValue, groupedRawValues: groupedValues });
        }
      }

      return {
        options: filteredOptions,
        hasMore: items.length === UNIQUE_PROPERTY_VALUES_BATCH_SIZE,
      };
    },
    [imodel, ruleset, field, descriptorInputKeys],
  );

  return loadTargets;
}
