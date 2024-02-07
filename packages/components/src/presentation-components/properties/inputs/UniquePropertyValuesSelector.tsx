/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { useCallback, useEffect, useMemo, useState } from "react";
import { ActionMeta, MultiValue } from "react-select";
import { PropertyDescription, PropertyValue, PropertyValueFormat } from "@itwin/appui-abstract";
import { IModelConnection } from "@itwin/core-frontend";
import { ContentSpecificationTypes, Descriptor, DisplayValue, Field, Keys, KeySet, Ruleset, RuleTypes } from "@itwin/presentation-common";
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
  field?: Field;
  descriptorInputKeys?: Keys;
}

function useUniquePropertyValuesLoader({ imodel, ruleset, field, descriptorInputKeys }: UseUniquePropertyValuesLoaderProps) {
  const loadTargets = useCallback(
    async (loadedOptionsCount: number) => {
      if (!ruleset || !field) {
        return { options: [], hasMore: false };
      }

      const content = await Presentation.presentation.getPagedDistinctValues({
        imodel,
        descriptor: {},
        fieldDescriptor: field.getFieldDescriptor(),
        rulesetOrId: ruleset,
        paging: { start: loadedOptionsCount, size: UNIQUE_PROPERTY_VALUES_BATCH_SIZE },
        keys: new KeySet(descriptorInputKeys),
      });

      const filteredOptions: UniqueValue[] = [];
      for (const option of content.items) {
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
        hasMore: content.items.length === UNIQUE_PROPERTY_VALUES_BATCH_SIZE,
      };
    },
    [imodel, ruleset, field, descriptorInputKeys],
  );

  return loadTargets;
}
