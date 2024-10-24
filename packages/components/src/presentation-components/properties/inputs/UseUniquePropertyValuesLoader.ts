/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { useEffect, useMemo, useState } from "react";
import { from, map, mergeMap, toArray } from "rxjs";
import { IModelConnection } from "@itwin/core-frontend";
import { SelectOption } from "@itwin/itwinui-react";
import { DisplayValue, DisplayValueGroup, Field, FieldDescriptor, Keys, KeySet, Ruleset } from "@itwin/presentation-common";
import { Presentation } from "@itwin/presentation-frontend";
import { translate, UniqueValue } from "../../common/Utils";
import { FILTER_WARNING_OPTION, ItemsLoader, VALUE_BATCH_SIZE } from "./ItemsLoader";

interface UseUniquePropertyValuesLoaderProps {
  imodel: IModelConnection;
  ruleset?: Ruleset;
  field?: Field;
  descriptorInputKeys?: Keys;
  typeName: string;
  filterText?: string;
  selectedValues?: string[];
}

interface UniquePropertyValuesLoaderState {
  options: UniqueValue[];
  isLoading: boolean;
}

/** @internal */
export function useUniquePropertyValuesLoader({
  imodel,
  ruleset,
  field,
  descriptorInputKeys,
  typeName,
  filterText,
  selectedValues,
}: UseUniquePropertyValuesLoaderProps) {
  const [itemsLoader, setItemsLoader] = useState<ItemsLoader<UniqueValue> | undefined>();
  const [initialSelectedValues] = useState(selectedValues);

  const [state, setLoadedOptions] = useState<UniquePropertyValuesLoaderState>({
    options: [],
    isLoading: false,
  });

  // Get initial loader and values
  useEffect(() => {
    setLoadedOptions({ options: [], isLoading: false });
    if (!ruleset || !field) {
      return;
    }

    const loader = new ItemsLoader(
      () => {
        setLoadedOptions((prev) => ({ ...prev, isLoading: true }));
      },
      (newItems) => {
        setLoadedOptions((prev) => ({
          options: [...prev.options, ...newItems],
          isLoading: false,
        }));
      },
      async (offset: number) => getItems({ imodel, offset, field: field.getFieldDescriptor(), ruleset, keys: new KeySet(descriptorInputKeys) }),
      (option) => option.displayValue,
    );
    void loader.loadMatchingItems(initialSelectedValues);
    setItemsLoader(loader);
    return () => {
      loader.dispose();
    };
  }, [imodel, ruleset, field, descriptorInputKeys, initialSelectedValues]);

  // On filter text change, check if more items need to be loaded
  useEffect(() => {
    if (!filterText || !itemsLoader) {
      return;
    }

    const timeout = setTimeout(() => {
      void itemsLoader.loadItems(filterText);
    }, 250);

    return () => {
      clearTimeout(timeout);
    };
  }, [itemsLoader, filterText]);

  return {
    selectOptions: useMemo<SelectOption<string>[]>(() => {
      const options: SelectOption<string>[] = state.options.map((option) => {
        return {
          label: formatOptionLabel(option.displayValue, typeName),
          value: option.displayValue,
        };
      });

      if (options.length >= VALUE_BATCH_SIZE) {
        options.push(FILTER_WARNING_OPTION);
      }

      return options;
    }, [state.options, typeName]),
    loadedOptions: state.options,
    isLoading: state.isLoading,
  };
}

function formatOptionLabel(displayValue: string, type: string): string {
  if (displayValue === "") {
    return translate("unique-values-property-editor.empty-value");
  }

  switch (type) {
    case "dateTime":
      return new Date(displayValue).toLocaleString(undefined, {
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "numeric",
        minute: "numeric",
        second: "numeric",
        fractionalSecondDigits: 3,
      });
    case "shortDate":
      return new Date(displayValue).toLocaleDateString();
    default:
      return displayValue;
  }
}

async function getItems({
  imodel,
  field,
  offset,
  ruleset,
  keys,
}: {
  imodel: IModelConnection;
  offset: number;
  field: FieldDescriptor;
  ruleset: Ruleset;
  keys: KeySet;
}) {
  const requestProps = {
    imodel,
    descriptor: {},
    fieldDescriptor: field,
    rulesetOrId: ruleset,
    paging: { start: offset, size: VALUE_BATCH_SIZE },
    keys,
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

  const hasMore = items.length === VALUE_BATCH_SIZE;
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

  return {
    options,
    length: items.length,
    hasMore,
  };
}
