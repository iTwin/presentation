/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

/** @internal */
export const VALUE_BATCH_SIZE = 100;

/** @internal */
export const FILTER_WARNING_OPTION = { label: "Too many values please use filter", value: "__filter__", disabled: true };

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
  ) {}

  public dispose() {
    this._disposed = true;
  }

  public async loadInitialItems(initialSelectedValues?: string[]) {
    this._isLoading = true;
    this._beforeLoad();

    const filterInitialSelectedValues = (items: T[]): void => {
      items.forEach((item) => {
        initialSelectedValues = initialSelectedValues?.filter((initialSelectedValue) => initialSelectedValue !== this._getOptionLabel(item));
      });
    };

    const needsMoreItems = (items: T[]): boolean => {
      filterInitialSelectedValues(items);
      return !!initialSelectedValues && initialSelectedValues.length > 0;
    };

    if (this._loadedItems.length > 0) {
      filterInitialSelectedValues(this._loadedItems);
    }

    if (this._loadedItems.length >= VALUE_BATCH_SIZE && initialSelectedValues?.length === 0) {
      return;
    }

    const { newItems, hasMore, length } = await this.loadUniqueItems(needsMoreItems);

    this._loadedItems.push(...newItems);
    this._offset = length;
    this._hasMore = hasMore;
    this._onItemsLoaded(newItems);
    this._isLoading = false;
  }

  public async loadItems(filterText?: string) {
    if (!this._hasMore || this._isLoading || !filterText) {
      return;
    }

    const filteredItems = this._loadedItems.filter((option) => this._getOptionLabel(option).toLowerCase().includes(filterText.toLowerCase()));
    if (filteredItems.length >= VALUE_BATCH_SIZE) {
      return;
    }

    let matchingItems: T[] = [];

    const needsMoreItems = (options: T[]): boolean => {
      matchingItems = options.filter((option) => this._getOptionLabel(option).toLowerCase().includes(filterText.toLowerCase()));
      return matchingItems.length < VALUE_BATCH_SIZE;
    };

    this._isLoading = true;
    this._beforeLoad();

    const { newItems, hasMore, length } = await this.loadUniqueItems(needsMoreItems);

    if (this._disposed) {
      return;
    }

    this._loadedItems.push(...newItems);
    this._offset = length;
    this._hasMore = hasMore;
    this._onItemsLoaded(newItems);
    this._isLoading = false;
  }

  private async loadUniqueItems(needsMoreItems: (options: T[]) => boolean) {
    const loadedItems: T[] = [];
    let currOffset = this._offset;
    let hasMore = this._hasMore;

    do {
      const { options, hasMore: batchHasMore, length } = await this._loadItems(currOffset);

      if (this._disposed) {
        return { newItems: loadedItems, hasMore, length };
      }

      loadedItems.push(...options);
      hasMore = batchHasMore;
      currOffset += length;
    } while (hasMore && needsMoreItems(loadedItems));

    return { newItems: loadedItems, hasMore, length: currOffset };
  }
}
