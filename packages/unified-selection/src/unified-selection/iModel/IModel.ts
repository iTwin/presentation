/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module UnifiedSelection
 */

/**
 * Used as an argument to a function that can accept one or more [[Id64String]]s.
 */
export type IdArg = string | Set<string> | string[];

/**
 * Identifies the type of changes made to the [[SelectionSet]] to produce a [[SelectionSetEvent]].
 */
export enum SelectionSetEventType {
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
 * Passed to [[SelectionSet.onChanged]] event listeners when elements are added to the selection set.
 */
export interface SelectAddEvent {
  /** The type of operation that produced this event. */
  type: SelectionSetEventType.Add;
  /** The Ids of the elements added to the set. */
  added: IdArg;
  /** The affected SelectionSet. */
  set: SelectionSet;
}

/**
 * Passed to [[SelectionSet.onChanged]] event listeners when elements are removed from the selection set.
 */
export interface SelectRemoveEvent {
  /** The type of operation that produced this event. */
  type: SelectionSetEventType.Remove | SelectionSetEventType.Clear;
  /** The element Ids removed from the set. */
  removed: IdArg;
  /** The affected SelectionSet. */
  set: SelectionSet;
}

/**
 * Passed to [[SelectionSet.onChanged]] event listeners when elements are simultaneously added to and removed from the selection set.
 */
export interface SelectReplaceEvent {
  /** The type of operation that produced this event. */
  type: SelectionSetEventType.Replace;
  /** The element Ids added to the set. */
  added: IdArg;
  /** The element Ids removed from the set. */
  removed: IdArg;
  /** The affected SelectionSet. */
  set: SelectionSet;
}

/**
 * Payload sent to [[SelectionSet.onChanged]] event listeners to describe how the contents of the set have changed.
 */
export type SelectionSetEvent = SelectAddEvent | SelectRemoveEvent | SelectReplaceEvent;

/**
 * Manages a set of *listeners* for a particular event and notifies them when the event is raised.
 */
export interface Event<T> {
  /** Registers a Listener to be executed whenever this event is raised. */
  addListener(listener: T, scope?: any): () => void;
  /** Un-register a previously registered listener. */
  removeListener(listener: T, scope?: any): boolean;
}

/**
 * A set of *currently selected* elements for an IModelConnection.
 */
export interface SelectionSet {
  /** iModel of the set. */
  iModel: IModelConnection;
  /** Event called whenever elements are added or removed from this SelectionSet. */
  onChanged: Event<(ev: SelectionSetEvent) => void>;
  /** The IDs of the selected elements. */
  get elements(): Set<string>;
  /** Clear current selection set. */
  emptyAll(): void;
  /** Add one or more Ids to the current selection set. */
  add(elem: IdArg): boolean;
  /** Remove one or more Ids from the current selection set. */
  remove(elem: IdArg): boolean;
}

/**
 * A set if ID's optimized for performance-critical code which represents large sets of ID's as pairs of 32-bit integers.
 */
export interface Uint32Set {
  /** Add any number of Ids to the set. */
  addIds(ids: IdArg): void;
  /** Remove any number of Ids from the set. */
  deleteIds(ids: IdArg): void;
}

/**
 * A set of *hilited* elements for an [[IModelConnection]], by element id.
 */
export interface IModelHiliteSet {
  /** Control whether the hilited elements will be synchronized with the contents of the [[SelectionSet]].*/
  set wantSyncWithSelectionSet(want: boolean);
  /** The set of hilited elements. */
  get elements(): Uint32Set;
  /** The set of hilited subcategories. */
  subcategories: Uint32Set;
  /** The set of hilited models. */
  models: Uint32Set;
  /** Remove all elements from the hilited set. */
  clear(): void;
}

/**
 * Interface representing a connection to iModel.
 */
export interface IModelConnection {
  /** Key of the iModel. */
  get key(): string;
  /** The set of currently hilited elements for this IModelConnection. */
  readonly hilited: IModelHiliteSet;
  /** The set of currently selected elements for this IModelConnection. */
  readonly selectionSet: SelectionSet;
}
