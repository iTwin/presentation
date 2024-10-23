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
    const matchingItems: T[] = [];
    const filterInitialSelectedValues = (items: T[]) => {
      matchingItems.push(
        ...items.filter((item) => {
          return initialSelectedValues?.some((initialSelectedValue) => initialSelectedValue === this._getOptionLabel(item));
        }),
      );
    };

    const needsItems = (): boolean => {
      if (this._loadedItems.length > 0) {
        filterInitialSelectedValues(this._loadedItems);
      }

      return this._loadedItems.length < VALUE_BATCH_SIZE && (initialSelectedValues?.length === 0 || initialSelectedValues?.length !== matchingItems.length);
    };

    const needsMoreItems = (items: T[]): boolean => {
      filterInitialSelectedValues(items);
      return !!initialSelectedValues && initialSelectedValues.length !== matchingItems.length;
    };

    await this.loadUniqueItems(needsItems, needsMoreItems);
  }

  public async loadItems(filterText?: string) {
    const matchingItems: T[] = [];

    if (!filterText) {
      return;
    }

    const needsMoreItems = (options: T[]): boolean => {
      matchingItems.push(...options.filter((option) => this._getOptionLabel(option).toLowerCase().includes(filterText.toLowerCase())));
      return matchingItems.length < VALUE_BATCH_SIZE;
    };

    await this.loadUniqueItems(() => needsMoreItems(this._loadedItems), needsMoreItems);
  }

  private async loadUniqueItems(needsItems: () => boolean, needsMoreItems: (options: T[]) => boolean) {
    const loadedItems: T[] = [];
    let loadedItemsBatch: T[] = [];
    let currOffset = this._offset;
    let hasMore = this._hasMore;

    if (!this._hasMore || this._isLoading) {
      return;
    }

    if (!needsItems()) {
      return;
    }

    this._isLoading = true;
    this._beforeLoad();

    do {
      const { options, hasMore: batchHasMore, length } = await this._loadItems(currOffset);
      loadedItemsBatch = options;
      if (this._disposed) {
        return;
      }

      loadedItems.push(...loadedItemsBatch);
      hasMore = batchHasMore;
      currOffset += length;
    } while (hasMore && needsMoreItems(loadedItemsBatch));

    this._loadedItems.push(...loadedItems);
    this._offset = currOffset;
    this._hasMore = hasMore;
    this._onItemsLoaded(loadedItems);
    this._isLoading = false;
  }
}
