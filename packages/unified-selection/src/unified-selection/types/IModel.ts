/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { Id64Arg } from "@itwin/core-bentley";
import { Event } from "@itwin/presentation-shared";

/**
 * Identifies the type of changes made to the `CoreIModelSelectionSet` to produce a `CoreSelectionSetEvent`.
 * @see https://www.itwinjs.org/reference/core-frontend/selectionset/selectionseteventtype/
 * @internal
 */
export enum CoreSelectionSetEventType {
  /** Elements have been added to the set. */
  Add,
  /** Elements have been removed from the set. */
  Remove,
  /** Some elements have been added to the set and others have been removed. */
  Replace,
  /** All elements are about to be removed from the set. */
  Clear,
}

/**
 * Payload sent to `CoreIModelSelectionSet.onChanged` event listeners to describe how the contents of the set have changed.
 * @see https://www.itwinjs.org/reference/core-frontend/selectionset/selectionsetevent/
 * @internal
 */
export interface CoreSelectionSetEventUnsafe {
  /**
   * The type of operation that produced this event.
   *
   * Actually, this should be `CoreSelectionSetEventType`, however we can't use it here because in TS two identical enums with
   * different names aren't equal, so [`SelectionSetEventType `](https://www.itwinjs.org/reference/core-frontend/selectionset/selectionseteventtype/)
   * doesn't map to `CoreSelectionSetEventType` as far as TS is concerned. Due to this reason, this interface is marked as `unsafe`.
   */
  type: number;
  /** The element Ids added to the set. */
  added?: Id64Arg;
  /** The element Ids removed from the set. */
  removed?: Id64Arg;
  /** The affected `CoreIModelSelectionSet`. */
  set: CoreIModelSelectionSet;
}

/**
 * A set of *currently selected* elements in an iModel.
 * @see https://www.itwinjs.org/reference/core-frontend/selectionset/
 * @internal
 */
export interface CoreIModelSelectionSet {
  /** Event called whenever elements are added or removed from this SelectionSet. */
  onChanged: Event<(ev: CoreSelectionSetEventUnsafe) => void>;
  /** The IDs of the selected elements. */
  readonly elements: Set<string>;
  /** Clear current selection set. */
  emptyAll(): void;
  /** Add one or more Ids to the current selection set. */
  add(elem: Id64Arg): boolean;
  /** Remove one or more Ids from the current selection set. */
  remove(elem: Id64Arg): boolean;
}

/**
 * A set if ID's optimized for performance-critical code which represents large sets of ID's as pairs of 32-bit integers.
 * @see https://www.itwinjs.org/reference/core-bentley/ids/id64/id64.uint32set/
 * @internal
 */
interface Uint32Set {
  /** Add any number of Ids to the set. */
  addIds(ids: Id64Arg): void;
  /** Remove any number of Ids from the set. */
  deleteIds(ids: Id64Arg): void;
}

/**
 * A set of *hilited* elements in an iModel, by element id.
 * @see https://www.itwinjs.org/reference/core-frontend/selectionset/hiliteset/
 * @internal
 */
export interface CoreIModelHiliteSet {
  /** Control whether the hilited elements should be synchronized with the contents of `CoreIModelSelectionSet`.*/
  wantSyncWithSelectionSet: boolean;
  /** The set of hilited elements. */
  readonly elements: Uint32Set;
  /** The set of hilited subcategories. */
  readonly subcategories: Uint32Set;
  /** The set of hilited models. */
  readonly models: Uint32Set;
  /** Remove all elements from the hilited set. */
  clear(): void;
}
