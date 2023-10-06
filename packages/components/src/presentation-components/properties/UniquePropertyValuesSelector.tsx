/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { useCallback, useEffect, useMemo, useState } from "react";
import { ActionMeta, MultiValue } from "react-select";
import { PropertyDescription, PropertyValue, PropertyValueFormat } from "@itwin/appui-abstract";
import { IModelConnection } from "@itwin/core-frontend";
import { ContentSpecificationTypes, Descriptor, DisplayValue, Field, KeySet, Ruleset, RuleTypes, Value } from "@itwin/presentation-common";
import { Presentation } from "@itwin/presentation-frontend";
import { deserializeDisplayValueGroupArray, findField, serializeDisplayValueGroupArray, translate } from "../common/Utils";
import { findBaseExpressionClass } from "../instance-filter-builder/InstanceFilterConverter";
import { getInstanceFilterFieldName } from "../instance-filter-builder/Utils";
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
}

interface UniqueValue {
  displayValue: string;
  groupedRawValues: Value[];
}

/** @internal */
export function UniquePropertyValuesSelector(props: UniquePropertyValuesSelectorProps) {
  const { imodel, descriptor, property, onChange, value } = props;
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
      const { displayValues, groupedRawValues } = serializeDisplayValueGroupArray(newSelectedValue);
      onChange({
        valueFormat: PropertyValueFormat.Primitive,
        displayValue: displayValues,
        value: groupedRawValues,
      });
    }
  };

  const isOptionSelected = (option: UniqueValue): boolean => selectedValues.map((selectedValue) => selectedValue.displayValue).includes(option.displayValue);

  const ruleset = useUniquePropertyValuesRuleset({ descriptor, imodel, field });
  const loadTargets = useUniquePropertyValuesLoader({ imodel, ruleset, field });

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
      getOptionLabel={(option) => (option.displayValue === "" ? translate("unique-values-property-editor.empty-value") : option.displayValue)}
      getOptionValue={(option) => option.displayValue}
    />
  );
}

function getUniqueValueFromProperty(property: PropertyValue | undefined): UniqueValue[] {
  if (property && property.valueFormat === PropertyValueFormat.Primitive && typeof property.value === "string" && property.displayValue) {
    const { displayValue, value } = property;
    const { displayValues, groupedRawValues } = deserializeDisplayValueGroupArray(displayValue, value);
    if (displayValues === undefined || groupedRawValues === undefined) {
      return [];
    }
    const uniqueValues: UniqueValue[] = [];
    for (let i = 0; i < displayValues.length; i++) {
      uniqueValues.push({ displayValue: displayValues[i], groupedRawValues: groupedRawValues[i] });
    }
    return uniqueValues;
  }
  return [];
}

interface UseUniquePropertyValuesRulesetProps {
  descriptor: Descriptor;
  field?: Field;
  imodel: IModelConnection;
}

function useUniquePropertyValuesRuleset({ descriptor, field, imodel }: UseUniquePropertyValuesRulesetProps) {
  const [ruleset, setRuleset] = useState<Ruleset>();
  useEffect(() => {
    void (async () => {
      const [schemaName, className] = await getSchemaAndClassNames({ imodel, descriptor, field });
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
    })();
  }, [field, descriptor, imodel]);

  return ruleset;
}

async function getSchemaAndClassNames({ imodel, descriptor, field }: UseUniquePropertyValuesRulesetProps) {
  if (field?.parent === undefined && field?.isPropertiesField()) {
    return field.properties[0].property.classInfo.name.split(":");
  }
  return (
    await findBaseExpressionClass(
      imodel,
      descriptor.selectClasses.map((item) => item.selectClassInfo),
    )
  ).name.split(":");
}

interface UseUniquePropertyValuesLoaderProps {
  imodel: IModelConnection;
  ruleset?: Ruleset;
  field?: Field;
}

function useUniquePropertyValuesLoader({ imodel, ruleset, field }: UseUniquePropertyValuesLoaderProps) {
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
        keys: new KeySet(),
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
    [imodel, ruleset, field],
  );

  return loadTargets;
}
