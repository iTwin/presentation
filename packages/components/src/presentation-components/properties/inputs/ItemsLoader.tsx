/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { UNIQUE_PROPERTY_VALUES_BATCH_SIZE } from "./UseUniquePropertyValuesLoader";

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
        initialSelectedValues = initialSelectedValues?.filter((initialSelectedValue) => initialSelectedValue !== this._getOptionLabel(option));
      });

      loadedItems.push(...options);
      hasMore = batchHasMore;
      currOffset += length;
    } while (hasMore && initialSelectedValues && initialSelectedValues.length > 0);
    this._loadedItems.push(...loadedItems);
    this._offset = currOffset;
    this._hasMore = hasMore;
    this._onItemsLoaded(loadedItems);
    this._isLoading = false;
  }

  public async loadItems(filterText?: string) {
    if (!this._hasMore || this._isLoading || !filterText) {
      return;
    }

    const filteredItems = this._loadedItems.filter((option) => this._getOptionLabel(option).toLowerCase().includes(filterText.toLowerCase()));
    if (filteredItems.length >= UNIQUE_PROPERTY_VALUES_BATCH_SIZE) {
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
