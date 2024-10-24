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

  public async loadMatchingItems(valuesToMatch?: string[]) {
    const needsItemsLoaded = (items: T[]) => {
      if (valuesToMatch && valuesToMatch.length > 0) {
        const matchingItems = items.filter((item) => {
          return valuesToMatch.some((valueToMatch) => valueToMatch === this._getOptionLabel(item));
        });
        return matchingItems.length < valuesToMatch.length;
      }
      return items.length < VALUE_BATCH_SIZE;
    };

    await this.loadUniqueItems(needsItemsLoaded);
  }

  public async loadItems(filterText?: string) {
    const needsItemsLoaded = (options: T[]): boolean => {
      if (!filterText) {
        return options.length === 0;
      }

      const matchingItems = options.filter((option) => this._getOptionLabel(option).toLowerCase().includes(filterText.toLowerCase()));
      return matchingItems.length < VALUE_BATCH_SIZE;
    };

    await this.loadUniqueItems(needsItemsLoaded);
  }

  private async loadUniqueItems(needsItemsLoaded: (options: T[]) => boolean) {
    const loadedItems: T[] = [];
    let currOffset = this._offset;
    let hasMore = this._hasMore;

    if (!this._hasMore || this._isLoading || !needsItemsLoaded(this._loadedItems)) {
      return;
    }

    this._isLoading = true;
    this._beforeLoad();

    do {
      const { options, hasMore: batchHasMore, length } = await this._loadItems(currOffset);
      if (this._disposed) {
        return;
      }

      loadedItems.push(...options);
      hasMore = batchHasMore;
      currOffset += length;
    } while (hasMore && needsItemsLoaded([...this._loadedItems, ...loadedItems]));

    this._loadedItems.push(...loadedItems);
    this._offset = currOffset;
    this._hasMore = hasMore;
    this._onItemsLoaded(loadedItems);
    this._isLoading = false;
  }
}
