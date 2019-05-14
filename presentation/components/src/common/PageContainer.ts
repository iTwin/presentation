/*---------------------------------------------------------------------------------------------
* Copyright (c) 2019 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
/** @module Core */

/**
 * Position of a page in a container.
 * @internal
 */
export interface Position {
  index: number;
  start: number;
  end: number;
}

/**
 * A structure to store a page of data
 * @internal
 */
export interface Page<TItem> {
  readonly position: Position;
  items?: TItem[];
}

/**
 * Container which helps with paging by manages specified number of pages
 * and disposing others
 * @internal
 */
export class PageContainer<TItem, TPage extends Page<TItem> = Page<TItem>> {
  private _pageSize: number;
  private _maxPages: number;
  private _pages: TPage[] = [];

  /** Constructor */
  constructor(pageSize: number, maxPages: number) {
    this._pageSize = pageSize;
    this._maxPages = maxPages;
  }

  /** Get page size used by this container */
  public get pageSize() { return this._pageSize; }
  public set pageSize(value: number) {
    if (this._pageSize === value)
      return;
    this._pageSize = value;
    this.invalidatePages();
  }

  /** Drop all pages */
  public invalidatePages(): void { this._pages = []; }

  /** Get a page containing an item with the specified index. */
  public getPage(itemIndex: number): TPage | undefined {
    for (const page of this._pages) {
      if (page.position.start <= itemIndex && itemIndex <= page.position.end)
        return page;
    }
    return undefined;
  }

  /**
   * Get item at the specified index or undefined if
   * there's no item with such index loaded.
   */
  public getItem(index: number): TItem | undefined {
    const page = this.getPage(index);
    if (!page || !page.items)
      return undefined;
    return page.items[index - page.position.start];
  }

  /** Get index of the specified item */
  public getIndex(item: TItem): number {
    for (const page of this._pages) {
      if (!page.items)
        continue;
      for (let i = 0; i < page.items.length; ++i) {
        const row = page.items[i];
        if (row === item)
          return page.position.start + i;
      }
    }
    return -1;
  }

  /** Reserve space for a page */
  public reservePage(index: number): TPage {
    // find the place for the new page to insert
    let pageIndex: number = 0;
    for (const p of this._pages) {
      if (p.position.start >= index)
        break;
      pageIndex++;
    }
    const pageBefore = (pageIndex > 0) ? this._pages[pageIndex - 1] : undefined;
    const pageAfter = (pageIndex < this._pages.length) ? this._pages[pageIndex] : undefined;

    // determine the start of the page for the specified index
    let pageStartIndex = index;
    let pageSize = this.pageSize;
    if (undefined !== pageAfter && pageStartIndex > pageAfter.position.start - this.pageSize) {
      pageStartIndex = pageAfter.position.start - this.pageSize;
    }
    if (undefined !== pageBefore && pageBefore.position.end > pageStartIndex) {
      pageStartIndex = pageBefore.position.end + 1;
    }
    if (pageBefore && pageAfter && (pageAfter.position.start - pageBefore.position.end) < pageSize)
      pageSize = pageAfter.position.start - pageBefore.position.end - 1;
    if (pageStartIndex < 0) {
      pageSize += pageStartIndex;
      pageStartIndex = 0;
    }
    if (pageSize <= 0)
      throw new Error("Invalid page size");

    // insert the new page
    const position = {
      index: pageIndex,
      start: pageStartIndex,
      end: pageStartIndex + pageSize - 1,
    };
    const page = { position } as any;
    this._pages.splice(position.index, 0, page);
    this.reIndexPages(position.index);
    this.disposeFarthestPages(position);
    return page;
  }

  private reIndexPages(startIndex: number): void {
    for (let i = startIndex + 1; i < this._pages.length; ++i)
      this._pages[i].position.index = i;
  }

  private disposeFarthestPages(position: Position): void {
    if (this._pages.length > this._maxPages) {
      // we drop the page that's furthest from the newly created one
      const distanceToFront = position.index;
      const distanceToBack = this._pages.length - position.index - 1;
      if (distanceToBack > distanceToFront)
        this._pages.pop();
      else
        this._pages.splice(0, 1);
    }
  }
}
