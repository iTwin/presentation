/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { useCallback, useEffect, useMemo, useState } from "react";
import { PropertyDescription, PropertyValue, PropertyValueFormat } from "@itwin/appui-abstract";
import { IModelConnection } from "@itwin/core-frontend";
import { ComboBox, SelectOption } from "@itwin/itwinui-react";
import { ClassInfo, Descriptor, Field, Keys, KeySet, MultiSchemaClassesSpecification, Ruleset } from "@itwin/presentation-common";
import { deserializeUniqueValues, findField, serializeUniqueValues, translate, UniqueValue } from "../../common/Utils";
import { getInstanceFilterFieldName } from "../../instance-filter-builder/Utils";
import { FILTER_WARNING_OPTION } from "./ItemsLoader";
import { UNIQUE_PROPERTY_VALUES_BATCH_SIZE, useUniquePropertyValuesLoader } from "./UseUniquePropertyValuesLoader";

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
  const [searchInput, setSearchInput] = useState<string>();
  const selectedValues = useMemo(() => getUniqueValueFromProperty(value)?.map((val) => val.displayValue), [value]);
  const ruleset = useUniquePropertyValuesRuleset(descriptor.ruleset, field, descriptorInputKeys, selectedClasses);
  const { selectOptions, loadedOptions, isLoading } = useUniquePropertyValuesLoader({
    imodel,
    ruleset,
    field,
    descriptorInputKeys,
    typeName: property.typename,
    selectedValues,
    filterText: searchInput,
  });

  const onValueChange = useCallback(
    (newValues: string[]) => {
      const newSelectedValues = loadedOptions.filter((opt) => newValues.includes(opt.displayValue));
      if (newSelectedValues.length === 0) {
        onChange({
          valueFormat: PropertyValueFormat.Primitive,
          displayValue: undefined,
          value: undefined,
        });
      } else {
        const { displayValues, groupedRawValues } = serializeUniqueValues(newSelectedValues);
        onChange({
          valueFormat: PropertyValueFormat.Primitive,
          displayValue: displayValues,
          value: groupedRawValues,
        });
      }
    },
    [loadedOptions, onChange],
  );

  const emptyContent = useMemo(() => {
    return isLoading ? translate("unique-values-property-editor.loading-values") : translate("unique-values-property-editor.no-values");
  }, [isLoading]);

  useEffect(() => {
    setField(findField(descriptor, getInstanceFilterFieldName(property)));
    setSearchInput("");
  }, [descriptor, property]);

  useEffect(() => {
    setSearchInput("");
  }, []);

  return (
    <ComboBox
      multiple={true}
      enableVirtualization={true}
      options={selectOptions}
      onChange={(newValues) => onValueChange(newValues)}
      filterFunction={(options: SelectOption<string>[], inputValue: string) => {
        const filteredOptions = options
          .filter((option) => option.label.toLowerCase().includes(inputValue.toLowerCase()) && option.value !== FILTER_WARNING_OPTION.value)
          .slice(0, UNIQUE_PROPERTY_VALUES_BATCH_SIZE);

        if (filteredOptions.length >= UNIQUE_PROPERTY_VALUES_BATCH_SIZE) {
          filteredOptions.push(FILTER_WARNING_OPTION);
        }
        return filteredOptions;
      }}
      emptyStateMessage={emptyContent}
      value={selectedValues}
      inputProps={{
        placeholder: translate("unique-values-property-editor.select-values"),
        size: "small",
        value: searchInput,
        onChange: (e) => setSearchInput(e.target.value),
      }}
    />
  );
}

function getUniqueValueFromProperty(propertyValue: PropertyValue | undefined): UniqueValue[] | undefined {
  if (propertyValue?.valueFormat === PropertyValueFormat.Primitive && typeof propertyValue.value === "string" && propertyValue.displayValue) {
    return deserializeUniqueValues(propertyValue.displayValue, propertyValue.value);
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
                acceptableClassNames: selectedClasses ? selectedClasses.map(({ name }) => name.split(/[\.:]/)[1]) : undefined,
                acceptablePolymorphically: true,
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
    const [schemaName, className] = info.name.split(/[\.:]/);
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

function hasKeys(descriptorInputKeys?: Keys) {
  return Array.isArray(descriptorInputKeys) ? descriptorInputKeys.length > 0 : !(descriptorInputKeys as KeySet).isEmpty;
}
