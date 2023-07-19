/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { useCallback, useEffect, useState } from "react";
import { ActionMeta, MultiValue } from "react-select";
import { PropertyDescription, PropertyValue, PropertyValueFormat } from "@itwin/appui-abstract";
import { PropertyFilterBuilderRuleValueProps } from "@itwin/components-react";
import { IModelConnection } from "@itwin/core-frontend";
import { ContentSpecificationTypes, Descriptor, DisplayValueGroup, FieldDescriptor, KeySet, Ruleset, RuleTypes, Value } from "@itwin/presentation-common";
import { Presentation } from "@itwin/presentation-frontend";
import { AsyncMultiTagSelect } from "../instance-filter-builder/MultiTagSelect";
import { PRESENTATION_TARGETS_BATCH_SIZE } from "./UseNavigationPropertyTargetsLoader";
import { translate } from "../common/Utils";

/** @internal */
export function UniquePropertyValuesTargetSelector(props: PropertyFilterBuilderRuleValueProps & { imodel: IModelConnection; descriptor: Descriptor }) {
  const { imodel, descriptor, property, onChange, value } = props;
  const [selectedTarget, setSelectedTarget] = useState<DisplayValueGroup[] | undefined>(() => getUniqueValueTargetFromProperty(value));
  const [fieldDescriptor, setFieldDescriptor] = useState<FieldDescriptor | undefined>(() =>
    descriptor.fields.find((field) => field.label === property.displayLabel)?.getFieldDescriptor(),
  );

  useEffect(() => {
    setFieldDescriptor(descriptor.fields.find((field) => field.label === property.displayLabel)?.getFieldDescriptor());
  }, [descriptor, property]);

  useEffect(() => {
    setSelectedTarget(getUniqueValueTargetFromProperty(value));
  }, [value]);

  const onValueChange = useCallback(
    (newValue: MultiValue<DisplayValueGroup>, _: ActionMeta<DisplayValueGroup>) => {
      setSelectedTarget(newValue.map((item) => item));
      if (newValue.length === 0) {
        onChange({
          valueFormat: PropertyValueFormat.Primitive,
          displayValue: undefined,
          value: undefined,
        });
      } else {
        onChange({
          valueFormat: PropertyValueFormat.Primitive,
          displayValue: JSON.stringify(newValue.map((item) => item.displayValue)),
          value: stringifyGroupRawValuesTo(newValue),
        });
      }
    },
    [onChange],
  );

  const ruleset = useUniquePropertyValuesRuleset({ property, fieldDescriptor });
  const loadTargets = useUniquePropertyValuesLoader({ imodel, ruleset, fieldDescriptor });

  return (
    <AsyncMultiTagSelect
      value={selectedTarget ?? null}
      loadOptions={async (inputValue, options) => loadTargets(inputValue, options.length)}
      placeholder={translate("unique-values-property-editor.select-values")}
      onChange={onValueChange}
      debounceTimeout={500}
      cacheUniqs={[property]}
      getOptionLabel={(option) => option.displayValue?.toString() ?? ""}
      getOptionValue={(option) => option.groupedRawValues[0]?.toString() ?? ""}
      hideSelectedOptions={false}
      isSearchable={false}
      closeMenuOnSelect={false}
    />
  );
}

function getUniqueValueTargetFromProperty(property: PropertyValue | undefined): DisplayValueGroup[] | undefined {
  if (property && property.valueFormat === PropertyValueFormat.Primitive && typeof property.value === "string" && property.displayValue) {
    const { displayValue, value } = property;
    const parsedDisplayValues = JSON.parse(displayValue);
    const parsedGroupedRawValues = JSON.parse(value);
    const uniqueValues: DisplayValueGroup[] = [];
    for (let i = 0; i < parsedDisplayValues.length; i++) {
      uniqueValues.push({ displayValue: parsedDisplayValues[i], groupedRawValues: parsedGroupedRawValues[i] });
    }
    return uniqueValues;
  }
  return undefined;
}

interface UseUniquePropertyValuesRulesetProps {
  property: PropertyDescription;
  fieldDescriptor?: FieldDescriptor;
}

function useUniquePropertyValuesRuleset({ property, fieldDescriptor }: UseUniquePropertyValuesRulesetProps) {
  const [ruleset, setRuleset] = useState<Ruleset>();
  const [schemaName, className] = fieldDescriptor && FieldDescriptor.isProperties(fieldDescriptor) ? fieldDescriptor.properties[0].class.split(":") : ["", ""];
  useEffect(() => {
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
  }, [property, schemaName, className]);

  return ruleset;
}

interface UseUniquePropertyValuesLoaderProps {
  imodel: IModelConnection;
  ruleset?: Ruleset;
  fieldDescriptor?: FieldDescriptor;
}

function useUniquePropertyValuesLoader({ imodel, ruleset, fieldDescriptor }: UseUniquePropertyValuesLoaderProps) {
  const loadTargets = useCallback(
    async (_: string, loadedOptionsCount: number) => {
      if (!ruleset || !fieldDescriptor) {
        return { options: [], hasMore: false };
      }

      const content = await Presentation.presentation.getPagedDistinctValues({
        imodel,
        descriptor: {},
        fieldDescriptor,
        rulesetOrId: ruleset,
        paging: { start: loadedOptionsCount, size: PRESENTATION_TARGETS_BATCH_SIZE },
        keys: new KeySet(),
      });
      return {
        options: content.items.filter(
          (item) =>
            item.groupedRawValues.filter((value) => value !== undefined && value !== null) && item.displayValue !== undefined && item.displayValue !== "",
        ),
        hasMore: content.items.length === PRESENTATION_TARGETS_BATCH_SIZE,
      };
    },
    [imodel, ruleset, fieldDescriptor],
  );

  return loadTargets;
}

function stringifyGroupRawValuesTo(values: MultiValue<DisplayValueGroup>) {
  const singleArray: Value[] = [];
  values.forEach((item) => singleArray.push(item.groupedRawValues));
  return JSON.stringify(singleArray);
}
