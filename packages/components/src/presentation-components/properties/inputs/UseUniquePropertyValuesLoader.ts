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

/** @internal */
export const UNIQUE_PROPERTY_VALUES_BATCH_SIZE = 5;

/** @internal */
export const FILTER_WARNING_OPTION = { label: "Too many values please use filter", value: "__filter__", disabled: true };

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
        setLoadedOptions((prev) => ({ ...prev, loading: true }));
      },
      (newItems) => {
        setLoadedOptions((prev) => ({
          options: [...prev.options, ...newItems],
          isLoading: false,
        }));
      },
      async (offset: number) => getItems({ imodel, offset, field: field.getFieldDescriptor(), ruleset, keys: new KeySet(descriptorInputKeys) }),
      (option) => option.displayValue,
      initialSelectedValues,
    );
    void loader.loadInitialItems();
    setItemsLoader(loader);
    return () => {
      loader.dispose();
    };
  }, [imodel, ruleset, field, descriptorInputKeys, initialSelectedValues]);

  // On filter text change, check if more items need to be loaded
  useEffect(() => {
    if (!filterText) {
      return;
    }

    const timeout = setTimeout(() => {
      if (itemsLoader?.needsLoadingItems(filterText)) {
        void itemsLoader?.loadItems(filterText);
      }
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
          // rawValue: option,
        };
      });

      if (options.length >= UNIQUE_PROPERTY_VALUES_BATCH_SIZE) {
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
    paging: { start: offset, size: UNIQUE_PROPERTY_VALUES_BATCH_SIZE },
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

  const hasMore = items.length === UNIQUE_PROPERTY_VALUES_BATCH_SIZE;
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

interface LoadedItems<T> {
  options: T[];
  length: number;
  hasMore: boolean;
}

/** @internal */
export class ItemsLoader<T> {
  private _loadedItems: T[] = [];
  private _isLoading = false;
  private _hasMore = true;
  private _disposed = false;
  private _offset = 0;

  constructor(
    private _beforeLoad: () => void,
    private _onItemsLoaded: (newItems: T[]) => void,
    private _loadItems: (offSet: number) => Promise<LoadedItems<T>>,
    private _getOptionLabel: (option: T) => string,
    private _initialSelectedValues?: string[],
  ) {}

  public dispose() {
    this._disposed = true;
  }

  public needsLoadingItems(filterText?: string) {
    if (!this._hasMore || !filterText) {
      return false;
    }

    const filteredItems = this._loadedItems.filter((option) => this._getOptionLabel(option).toLowerCase().includes(filterText.toLowerCase()));
    return filteredItems.length < UNIQUE_PROPERTY_VALUES_BATCH_SIZE;
  }

  public async loadInitialItems() {
    let currOffset = this._offset;
    let hasMore = this._hasMore;
    const loadedItems: T[] = [];

    this._isLoading = true;
    this._beforeLoad();

    do {
      const { options, hasMore: batchHasMore, length } = await this._loadItems(currOffset);

      if (this._disposed) {
        return;
      }

      options.forEach((option) => {
        this._initialSelectedValues = this._initialSelectedValues?.filter((initialSelectedValue) => initialSelectedValue !== this._getOptionLabel(option));
      });

      loadedItems.push(...options);
      hasMore = batchHasMore;
      currOffset += length;
    } while (hasMore && this._initialSelectedValues && this._initialSelectedValues.length > 0);
    this._loadedItems.push(...loadedItems);
    this._offset = currOffset;
    this._hasMore = hasMore;
    this._onItemsLoaded(loadedItems);
    this._isLoading = false;
  }

  public async loadItems(filterText: string) {
    if (this._isLoading || !this._hasMore) {
      return;
    }

    this._isLoading = true;
    this._beforeLoad();

    const { options, hasMore, length } = await this.loadFilteredItems(filterText);

    if (this._disposed) {
      return;
    }

    this._loadedItems.push(...options);
    this._offset += length;
    this._hasMore = hasMore;
    this._onItemsLoaded(options);
    this._isLoading = false;
  }

  private async loadFilteredItems(filterText: string) {
    const loadedItems: T[] = [];
    let currOffset = this._offset;
    let hasMore = this._hasMore;
    let matchingItems: T[] = [];

    do {
      const { options, hasMore: batchHasMore, length } = await this._loadItems(currOffset);

      if (this._disposed) {
        return { options: loadedItems, hasMore, length };
      }

      loadedItems.push(...options);
      hasMore = batchHasMore;
      currOffset += length;
      matchingItems = loadedItems.filter((option) => this._getOptionLabel(option).toLowerCase().includes(filterText.toLowerCase()));
    } while (hasMore && matchingItems.length < UNIQUE_PROPERTY_VALUES_BATCH_SIZE);

    return { options: loadedItems, hasMore, length: currOffset };
  }
}
