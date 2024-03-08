/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module UnifiedSelection
 */

import { Guid, GuidString } from "@itwin/core-bentley";
import { InstanceId, InstanceKey, PresentationError, PresentationStatus } from "@itwin/presentation-common";

/**
 * A custom selectable object
 * @beta
 */
export interface CustomSelectableObject {
  /** Unique identifier of the object */
  identifier: string;
  /** Asynchronous function for loading instance keys */
  loadInstanceKeys: () => Promise<InstanceKey[]>;
  /** Custom data of the object
   * @internal
   */
  data: any;
}

/**
 * A single selectable object that identifies something in an iTwin.js application
 * @beta
 */
export type SelectableObject = Readonly<InstanceKey> | Readonly<CustomSelectableObject>;

/**
 * A collection of selectable objects that identify something in an iModel.js application
 * @beta
 */
export type SelectableObjects = ReadonlyArray<SelectableObject> | Readonly<SelectableObjectSet>;

/** @beta */
// eslint-disable-next-line @typescript-eslint/no-redeclare
export namespace SelectableObject {
  /** Check if the supplied selectable object is an `InstanceKey` */
  export function isInstanceKey(selectableObject: SelectableObject): selectableObject is InstanceKey {
    return !!(selectableObject as InstanceKey).className && !!(selectableObject as InstanceKey).id;
  }

  /** Check if the supplied selectable object is a `CustomSelectableObject` */
  export function isCustomSelectableObject(selectableObject: SelectableObject): selectableObject is CustomSelectableObject {
    return !!(selectableObject as CustomSelectableObject).identifier;
  }
}

/**
 * A class that holds multiple [[SelectableObject]] instances of different types.
 * @beta
 */
export class SelectableObjectSet {
  // Map between lowercase class name and instance ID
  private _instanceKeys: Map<string, Set<InstanceId>>;
  // Map between custom object unique identifier and the object itself
  private _customSelectableObjects: Map<string, CustomSelectableObjectData>;
  // Map between lowercase class name and the most recent non-lowercase class name
  private _classNameMap: Map<string, string>;
  private _guid!: GuidString;

  /**
   * Creates an instance of `SelectableObjectSet`.
   * @param source Optional source to initialize from.
   */
  constructor(source?: SelectableObjects) {
    this._instanceKeys = new Map<string, Set<InstanceId>>();
    this._customSelectableObjects = new Map<string, CustomSelectableObject>();
    this._classNameMap = new Map<string, string>();

    if (source) {
      this.add(source);
    } else {
      this.recalculateGuid();
    }
  }

  /**
   * Get a GUID that identifies changes in this `SelectableObjectSet`. The value
   * does not uniquely identify contents of the set, but it can be
   * used to check whether set has changed.
   */
  public get guid(): GuidString {
    return this._guid;
  }

  /**
   * Get the number of selectable objects stored in this `SelectableObjectSet`.
   */
  public get size(): number {
    return this.instanceKeysCount + this.customSelectableObjectsCount;
  }

  /**
   * Is this `SelectableObjectSet` currently empty.
   */
  public get isEmpty() {
    return this.size === 0;
  }

  /**
   * Get the number of stored instance keys
   */
  public get instanceKeysCount(): number {
    let count = 0;
    this._instanceKeys.forEach((set: Set<string>) => (count += set.size));
    return count;
  }

  /**
   * Get a map of instance keys stored in this `SelectableObjectSet`
   *
   * **Warning**: getting instance keys might be expensive for large sets.
   */
  public get instanceKeys(): Map<string, Set<InstanceId>> {
    const map = new Map<string, Set<InstanceId>>();
    for (const entry of this._instanceKeys) {
      const className = this._classNameMap.get(entry[0]);
      map.set(className!, new Set([...entry[1]]));
    }
    return map;
  }

  /**
   * Get the number of stored custom selection objects
   */
  public get customSelectableObjectsCount(): number {
    return this._customSelectableObjects.size;
  }

  /**
   * Get a map of custom selectable objects stored in this `SelectableObjectSet`
   *
   * **Warning**: getting custom selectable objects might be expensive for large sets.
   */
  public get customSelectableObjects(): Map<string, CustomSelectableObject> {
    const map = new Map<string, CustomSelectableObject>();
    for (const entry of this._customSelectableObjects) {
      const customObject: CustomSelectableObject = {
        identifier: entry[0],
        loadInstanceKeys: entry[1].loadInstanceKeys,
        data: entry[1].data,
      };
      map.set(entry[0], customObject);
    }
    return map;
  }

  /**
   * Check if this `SelectableObjectSet` contains the specified selectable object.
   * @param value The selectable object to check.
   */
  public has(value: SelectableObject): boolean {
    if (!value) {
      throw new PresentationError(PresentationStatus.InvalidArgument, "Invalid argument: value");
    }
    if (SelectableObject.isInstanceKey(value)) {
      const set = this._instanceKeys.get(value.className.toLowerCase());
      return !!(set && set.has(value.id));
    }
    if (SelectableObject.isCustomSelectableObject(value)) {
      return this._customSelectableObjects.has(value.identifier);
    }
    throw new PresentationError(PresentationStatus.InvalidArgument, "Invalid argument: value");
  }

  /**
   * Check if this `SelectableObjectSet` contains all the specified selectable objects.
   * @param values The selectable objects to check.
   */
  public hasAll(values: SelectableObjects): boolean {
    if (!values) {
      throw new PresentationError(PresentationStatus.InvalidArgument, "Invalid argument: values");
    }
    if (this.isSelectableObjectSet(values)) {
      return this.hasSelectableObjectSet(values, "all");
    }
    if (this.isSelectableObjectArray(values)) {
      return this.hasSelectableObjectArray(values, "all");
    }
    throw new PresentationError(PresentationStatus.InvalidArgument, "Invalid argument: values");
  }

  /**
   * Check if this `SelectableObjectSet` contains any of the specified selectable objects.
   * @param values The selectable objects to check.
   */
  public hasAny(values: SelectableObjects): boolean {
    if (!values) {
      throw new PresentationError(PresentationStatus.InvalidArgument, "Invalid argument: values");
    }
    if (this.isSelectableObjectSet(values)) {
      return this.hasSelectableObjectSet(values, "any");
    }
    if (this.isSelectableObjectArray(values)) {
      return this.hasSelectableObjectArray(values, "any");
    }
    throw new PresentationError(PresentationStatus.InvalidArgument, "Invalid argument: values");
  }

  /**
   * Add a one or more selectable objects to this `SelectableObjectSet`
   * @param value Selectable objects to add.
   * @param pred An optional predicate function that indicates whether a selectable object should be added
   * @returns itself
   */
  public add(value: SelectableObjects | SelectableObject, pred?: (selectableObject: SelectableObject) => boolean): SelectableObjectSet {
    if (!value) {
      throw new PresentationError(PresentationStatus.InvalidArgument, "Invalid argument: value");
    }
    const sizeBefore = this.size;
    if (this.isSelectableObjectSet(value)) {
      this.addSelectableObjectSet(value, pred);
    } else if (this.isSelectableObjectArray(value)) {
      value.forEach((selectableObject) => this.add(selectableObject, pred));
    } else if (!pred || pred(value)) {
      if (SelectableObject.isInstanceKey(value)) {
        const lowerClassName = value.className.toLowerCase();
        let set = this._instanceKeys.get(lowerClassName);
        if (!set) {
          set = new Set<string>();
        }
        set.add(value.id);
        this._instanceKeys.set(lowerClassName, set);
        this._classNameMap.set(lowerClassName, value.className);
      } else if (SelectableObject.isCustomSelectableObject(value)) {
        this._customSelectableObjects.set(value.identifier, value);
      } else {
        throw new PresentationError(PresentationStatus.InvalidArgument, "Invalid argument: value");
      }
    }
    if (this.size !== sizeBefore) {
      this.recalculateGuid();
    }
    return this;
  }

  /**
   * Deletes one or more selectable objects from this `SelectableObjectSet`.
   * @param value Selectable objects to add. to delete.
   * @returns itself
   */
  public delete(value: SelectableObjects | SelectableObject): SelectableObjectSet {
    if (!value) {
      throw new PresentationError(PresentationStatus.InvalidArgument, "Invalid argument: value");
    }
    const sizeBefore = this.size;
    if (this.isSelectableObjectSet(value)) {
      this.deleteSelectableObjectSet(value);
    } else if (this.isSelectableObjectArray(value)) {
      for (const selectableObject of value) {
        this.delete(selectableObject);
      }
    } else if (SelectableObject.isInstanceKey(value)) {
      const set = this._instanceKeys.get(value.className.toLowerCase());
      if (set) {
        set.delete(value.id);
      }
    } else if (SelectableObject.isCustomSelectableObject(value)) {
      this._customSelectableObjects.delete(value.identifier);
    } else {
      throw new PresentationError(PresentationStatus.InvalidArgument, "Invalid argument: value");
    }
    if (this.size !== sizeBefore) {
      this.recalculateGuid();
    }
    return this;
  }

  /**
   * Clear this `SelectableObjectSet`.
   * @returns itself
   */
  public clear() {
    if (this.isEmpty) {
      return this;
    }
    this._instanceKeys = new Map<string, Set<InstanceId>>();
    this._customSelectableObjects = new Map<string, CustomSelectableObject>();
    this._classNameMap = new Map<string, string>();
    this.recalculateGuid();
    return this;
  }

  /**
   * Check whether at least one selectable object passes a condition in this `SelectableObjectSet`.
   */
  public some(callback: (selectableObject: SelectableObject) => boolean) {
    for (const entry of this._instanceKeys) {
      const recentClassName = this._classNameMap.get(entry[0])!;
      if (some(entry[1], (id: InstanceId) => callback({ className: recentClassName, id }))) {
        return true;
      }
    }
    for (const entry of this._customSelectableObjects) {
      const customObject: CustomSelectableObject = {
        identifier: entry[0],
        loadInstanceKeys: entry[1].loadInstanceKeys,
        data: entry[1].data,
      };
      if (callback(customObject)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Iterate over all keys in this `SelectableObjectSet`.
   */
  public forEach(callback: (selectableObject: SelectableObject, index: number) => void) {
    let index = 0;

    this._instanceKeys.forEach((ids: Set<InstanceId>, className: string) => {
      const recentClassName = this._classNameMap.get(className)!;
      ids.forEach((id: InstanceId) => callback({ className: recentClassName, id }, index++));
    });
    this._customSelectableObjects.forEach((data, identifier) => {
      const customObject: CustomSelectableObject = {
        identifier,
        loadInstanceKeys: data.loadInstanceKeys,
        data: data.data,
      };
      callback(customObject, index++);
    });
  }

  private isSelectableObjectSet(selectableObjects: SelectableObjects | SelectableObject): selectableObjects is Readonly<SelectableObjectSet> {
    const selectableObjectSet = selectableObjects as SelectableObjectSet;
    return !!selectableObjectSet._instanceKeys && !!selectableObjectSet._customSelectableObjects;
  }

  private isSelectableObjectArray(selectableObjects: SelectableObjects | SelectableObject): selectableObjects is ReadonlyArray<SelectableObject> {
    return Array.isArray(selectableObjects);
  }

  private hasSelectableObjectSet(selectableObjectSet: Readonly<SelectableObjectSet>, checkType: "all" | "any"): boolean {
    const objectSet = selectableObjectSet as SelectableObjectSet;

    if (checkType === "all") {
      if (this._instanceKeys.size < objectSet._instanceKeys.size || this._customSelectableObjects.size < objectSet._customSelectableObjects.size) {
        return false;
      }
      for (const otherEntry of objectSet._instanceKeys) {
        const entryObjects = this._instanceKeys.get(otherEntry[0]);
        if (!entryObjects || entryObjects.size < otherEntry[1].size) {
          return false;
        }
        if ([...otherEntry[1]].some((instanceId) => !entryObjects.has(instanceId))) {
          return false;
        }
      }
      for (const otherEntry of objectSet._customSelectableObjects) {
        const entryObjects = this._customSelectableObjects.get(otherEntry[0]);
        if (!entryObjects) {
          return false;
        }
      }
      return true;
    }
    for (const otherEntry of objectSet._instanceKeys) {
      const entryObjects = this._instanceKeys.get(otherEntry[0]);
      if (entryObjects && [...otherEntry[1]].some((instanceId) => entryObjects.has(instanceId))) {
        return true;
      }
    }
    for (const otherEntry of objectSet._customSelectableObjects) {
      const entryObjects = this._customSelectableObjects.get(otherEntry[0]);
      if (entryObjects) {
        return true;
      }
    }
    return false;
  }

  private hasSelectableObjectArray(selectableObjects: ReadonlyArray<SelectableObject>, checkType: "all" | "any"): boolean {
    if (checkType === "all") {
      if (this.size < selectableObjects.length) {
        return false;
      }
      for (const selectable of selectableObjects) {
        if (!this.has(selectable)) {
          return false;
        }
      }
      return true;
    }
    for (const selectable of selectableObjects) {
      if (this.has(selectable)) {
        return true;
      }
    }
    return false;
  }

  private deleteSelectableObjectSet(selectableObjectSet: Readonly<SelectableObjectSet>): void {
    const objectSet = selectableObjectSet as SelectableObjectSet;
    for (const customObjectIdentifier of objectSet._customSelectableObjects.keys()) {
      this._customSelectableObjects.delete(customObjectIdentifier);
    }
    for (const entry of objectSet._instanceKeys) {
      const set = this._instanceKeys.get(entry[0]);
      if (set) {
        entry[1].forEach((key: string) => {
          set.delete(key);
        });
      }
    }
  }

  private recalculateGuid() {
    this._guid = this.isEmpty ? Guid.empty : Guid.createValue();
  }

  private addSelectableObjectSet(selectableObjectSet: Readonly<SelectableObjectSet>, pred?: (key: SelectableObject) => boolean): void {
    const objectSet = selectableObjectSet as SelectableObjectSet;

    for (const entry of objectSet._customSelectableObjects) {
      const customObject: CustomSelectableObject = {
        identifier: entry[0],
        loadInstanceKeys: entry[1].loadInstanceKeys,
        data: entry[1].data,
      };
      if (!pred || pred(customObject)) {
        this._customSelectableObjects.set(customObject.identifier, entry[1]);
      }
    }

    for (const entry of objectSet._instanceKeys) {
      const lowerClassName = entry[0];
      const className = objectSet._classNameMap.get(lowerClassName)!;
      let set = this._instanceKeys.get(lowerClassName);
      if (!set) {
        set = new Set();
        this._instanceKeys.set(lowerClassName, set);
        this._classNameMap.set(lowerClassName, className);
      }
      entry[1].forEach((id: InstanceId) => {
        if (!pred || pred({ className, id })) {
          set!.add(id);
        }
      });
    }
  }
}

const some = <TItem>(set: Set<TItem>, callback: (item: TItem) => boolean) => {
  for (const item of set) {
    if (callback(item)) {
      return true;
    }
  }
  return false;
};

interface CustomSelectableObjectData {
  loadInstanceKeys: () => Promise<InstanceKey[]>;
  data: any;
}
