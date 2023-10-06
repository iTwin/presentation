/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { useCallback, useEffect, useState } from "react";
import { ActionMeta, MultiValue, Options } from "react-select";
import { PropertyDescription, PropertyValue, PropertyValueFormat } from "@itwin/appui-abstract";
import { IModelConnection } from "@itwin/core-frontend";
import { ContentSpecificationTypes, Descriptor, DisplayValueGroup, Field, FieldDescriptor, Keys, KeySet, Ruleset, RuleTypes } from "@itwin/presentation-common";
import { Presentation } from "@itwin/presentation-frontend";
import { deserializeDisplayValueGroupArray, findField, serializeDisplayValueGroupArray, translate } from "../common/Utils";
import { AsyncMultiTagSelect } from "../instance-filter-builder/MultiTagSelect";
import { getInstanceFilterFieldName } from "../instance-filter-builder/Utils";

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
  const [selectedValues, setSelectedValues] = useState<DisplayValueGroup[] | undefined>(() => getUniqueValueFromProperty(value));
  const [field, setField] = useState<Field | undefined>(() => findField(descriptor, getInstanceFilterFieldName(property)));
  useEffect(() => {
    setField(findField(descriptor, getInstanceFilterFieldName(property)));
  }, [descriptor, property]);

  useEffect(() => {
    setSelectedValues(getUniqueValueFromProperty(value));
  }, [value]);

  const onValueChange = (newValue: MultiValue<DisplayValueGroup>, _: ActionMeta<DisplayValueGroup>) => {
    setSelectedValues(newValue.map((item) => item));
    if (newValue.length === 0) {
      onChange({
        valueFormat: PropertyValueFormat.Primitive,
        displayValue: undefined,
        value: undefined,
      });
    } else {
      const { displayValues, groupedRawValues } = serializeDisplayValueGroupArray([...newValue]);
      onChange({
        valueFormat: PropertyValueFormat.Primitive,
        displayValue: displayValues,
        value: groupedRawValues,
      });
    }
  };

  const isOptionSelected = (option: DisplayValueGroup, _: Options<DisplayValueGroup>): boolean =>
    selectedValues?.map((selectedValue) => selectedValue.displayValue).includes(option.displayValue) ?? false;

  const ruleset = useUniquePropertyValuesRuleset(descriptor.ruleset, field);
  const loadTargets = useUniquePropertyValuesLoader({ imodel, ruleset, fieldDescriptor: field?.getFieldDescriptor() }, descriptorInputKeys);

  return (
    <AsyncMultiTagSelect
      value={selectedValues ?? null}
      loadOptions={async (_, options) => loadTargets(options.length)}
      placeholder={translate("unique-values-property-editor.select-values")}
      onChange={onValueChange}
      isOptionSelected={isOptionSelected}
      cacheUniqs={[property]}
      hideSelectedOptions={false}
      isSearchable={false}
      closeMenuOnSelect={false}
      getOptionLabel={(option) => option.displayValue!.toString()}
      getOptionValue={(option) => option.groupedRawValues[0]!.toString()}
    />
  );
}

function getUniqueValueFromProperty(property: PropertyValue | undefined): DisplayValueGroup[] | undefined {
  if (property && property.valueFormat === PropertyValueFormat.Primitive && typeof property.value === "string" && property.displayValue) {
    const { displayValue, value } = property;
    const { displayValues, groupedRawValues } = deserializeDisplayValueGroupArray(displayValue, value);
    if (displayValues === undefined || groupedRawValues === undefined) {
      return undefined;
    }
    const uniqueValues: DisplayValueGroup[] = [];
    for (let i = 0; i < displayValues.length; i++) {
      uniqueValues.push({ displayValue: displayValues[i], groupedRawValues: groupedRawValues[i] });
    }
    return uniqueValues;
  }
  return undefined;
}

function useUniquePropertyValuesRuleset(descriptorRuleset?: Ruleset, field?: Field) {
  const [ruleset, setRuleset] = useState<Ruleset>();
  useEffect(() => {
    if (descriptorRuleset) {
      setRuleset(descriptorRuleset);
      return;
    }

    const baseClassInfo = getBaseClassInfo(field);
    if (baseClassInfo === undefined) {
      setRuleset(undefined);
      return;
    }
    const [schemaName, className] = baseClassInfo.name.split(":");
    setRuleset({
      id: "unique-property-values",
      rules: [
        {
          ruleType: RuleTypes.Content,
          specifications: [
            {
              specType: ContentSpecificationTypes.ContentInstancesOfSpecificClasses,
              classes: { schemaName, classNames: [className], arePolymorphic: true },
            },
          ],
        },
      ],
    });
  }, [field, descriptorRuleset]);

  return ruleset;
}

function getBaseClassInfo(field?: Field) {
  if (field?.parent === undefined && field?.isPropertiesField()) {
    return field.properties[0].property.classInfo;
  }

  let rootParentField = field?.parent;
  while (rootParentField?.parent !== undefined) {
    rootParentField = rootParentField.parent;
  }
  const lastStepToPrimaryClass = rootParentField?.pathToPrimaryClass.slice(-1).pop();

  return lastStepToPrimaryClass?.targetClassInfo;
}

interface UseUniquePropertyValuesLoaderProps {
  imodel: IModelConnection;
  ruleset?: Ruleset;
  fieldDescriptor?: FieldDescriptor;
}

function useUniquePropertyValuesLoader({ imodel, ruleset, fieldDescriptor }: UseUniquePropertyValuesLoaderProps, descriptorInputKeys?: Keys) {
  const loadTargets = useCallback(
    async (loadedOptionsCount: number) => {
      if (!ruleset || !fieldDescriptor) {
        return { options: [], hasMore: false };
      }

      const content = await Presentation.presentation.getPagedDistinctValues({
        imodel,
        descriptor: {},
        fieldDescriptor,
        rulesetOrId: ruleset,
        paging: { start: loadedOptionsCount, size: UNIQUE_PROPERTY_VALUES_BATCH_SIZE },
        keys: new KeySet(descriptorInputKeys),
      });

      const filteredOptions = [];
      for (const option of content.items) {
        if (option.displayValue === undefined) {
          continue;
        }
        const groupedValues = option.groupedRawValues.filter((value) => value !== undefined);
        if (groupedValues.length !== 0) {
          filteredOptions.push({ displayValue: option.displayValue, groupedRawValues: groupedValues });
        }
      }

      return {
        options: filteredOptions,
        hasMore: content.items.length === UNIQUE_PROPERTY_VALUES_BATCH_SIZE,
      };
    },
    [imodel, ruleset, fieldDescriptor, descriptorInputKeys],
  );

  return loadTargets;
}
