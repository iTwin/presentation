/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

/** @packageDocumentation
 * @module UnifiedSelection
 */

/**
 * ECInstance selectable
 * @beta
 */
export interface SelectableInstanceKey {
  /** Full class name in format `SchemaName:ClassName` or `SchemaName.ClassName` */
  className: string;
  /** ECInstance ID */
  id: string;
}

/**
 * A custom selectable
 * @beta
 */
export interface CustomSelectable {
  /** Unique identifier of the selectable */
  identifier: string;
  /** Asynchronous function for loading instance keys */
  loadInstanceKeys: () => AsyncIterableIterator<SelectableInstanceKey>;
  /** Custom data of the selectable
   * @internal
   */
  data: any;
}

/**
 * A single selectable that identifies something in an iTwin.js application
 * @beta
 */
export type Selectable = SelectableInstanceKey | CustomSelectable;

/** @beta */
// eslint-disable-next-line @typescript-eslint/no-redeclare
export namespace Selectable {
  /** Check if the supplied selectable is a `SelectableInstanceKey` */
  export function isInstanceKey(selectable: Selectable): selectable is SelectableInstanceKey {
    const instanceKey = selectable as SelectableInstanceKey;
    return !!instanceKey.className && !!instanceKey.id;
  }

  /** Check if the supplied selectable is a `CustomSelectable` */
  export function isCustom(selectable: Selectable): selectable is CustomSelectable {
    return !!(selectable as CustomSelectable).identifier;
  }
}

/**
 * A collection of selectables that identify something that can be selected in an iTwin.js application
 * @beta
 */
export interface Selectables {
  /**
   * Map between ECInstance className and instance IDs
   */
  instanceKeys: Map<string, Set<string>>;
  /**
   * Map between unique identifier of `CustomSelectable` and the selectable itself
   */
  custom: Map<string, CustomSelectable>;
}

/** @beta */
// eslint-disable-next-line @typescript-eslint/no-redeclare
export namespace Selectables {
  /**
   * Creates `Selectables` from array of selectable
   * @param source Source to create selectables from
   * @beta
   */
  export function create(source: Selectable[]): Selectables {
    const newSelectables = {
      instanceKeys: new Map<string, Set<string>>(),
      custom: new Map<string, CustomSelectable>(),
    };
    Selectables.add(newSelectables, source);
    return newSelectables;
  }

  /**
   * Get the number of selectables stored in a `Selectables` object.
   * @param selectables `Selectables` object to get size for
   * @beta
   */
  export function size(selectables: Selectables): number {
    let insatanceCount = 0;
    selectables.instanceKeys.forEach((set: Set<string>) => (insatanceCount += set.size));
    return insatanceCount + selectables.custom.size;
  }

  /**
   * Is a `Selectables` object currently empty.
   * @param selectables `Selectables` object to check
   * @beta
   */
  export function isEmpty(selectables: Selectables): boolean {
    return Selectables.size(selectables) === 0;
  }

  /**
   * Check if a `Selectables` object contains the specified selectable.
   * @param selectables `Selectables` object to check
   * @param value The selectable to check for.
   * @beta
   */
  export function has(selectables: Selectables, value: Selectable): boolean {
    if (Selectable.isInstanceKey(value)) {
      const formattedClassName = value.className.replace(".", ":");
      const set = selectables.instanceKeys.get(formattedClassName);
      return !!(set && set.has(value.id));
    }
    return selectables.custom.has(value.identifier);
  }

  /**
   * Check if a `Selectables` object contains all the specified selectables.
   * @param selectables `Selectables` object to check
   * @param values The selectables to check for.
   * @beta
   */
  export function hasAll(selectables: Selectables, values: Selectable[]): boolean {
    if (Selectables.size(selectables) < values.length) {
      return false;
    }
    for (const selectable of values) {
      if (!Selectables.has(selectables, selectable)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Check if a `Selectables` object contains any of the specified selectables.
   * @param selectables `Selectables` object to check
   * @param values The selectables to check for.
   * @beta
   */
  export function hasAny(selectables: Selectables, values: Selectable[]): boolean {
    for (const selectable of values) {
      if (Selectables.has(selectables, selectable)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Add a one or more selectables to a `Selectables`
   * @param selectables `Selectables` object to add selectables for
   * @param values Selectables to add.
   * @beta
   */
  export function add(selectables: Selectables, values: Selectable[]): boolean {
    let hasChanged = false;
    for (const selectable of values) {
      if (Selectable.isInstanceKey(selectable)) {
        const formattedClassName = selectable.className.replace(".", ":");
        let set = selectables.instanceKeys.get(formattedClassName);
        if (!set) {
          set = new Set<string>();
        }
        if (!set.has(selectable.id)) {
          set.add(selectable.id);
          selectables.instanceKeys.set(formattedClassName, set);
          hasChanged = true;
        }
      } else if (!selectables.custom.has(selectable.identifier)) {
        selectables.custom.set(selectable.identifier, selectable);
        hasChanged = true;
      }
    }
    return hasChanged;
  }

  /**
   * Removes one or more selectables from a `Selectables` object.
   * @param selectables `Selectables` object to remove selectables for
   * @param values Selectables to remove.
   * @beta
   */
  export function remove(selectables: Selectables, values: Selectable[]): boolean {
    let hasChanged = false;
    for (const selectable of values) {
      if (Selectable.isInstanceKey(selectable)) {
        const formattedClassName = selectable.className.replace(".", ":");
        const set = selectables.instanceKeys.get(formattedClassName);
        if (set && set.has(selectable.id)) {
          set.delete(selectable.id);
          hasChanged = true;
          if (set.size === 0) {
            selectables.instanceKeys.delete(formattedClassName);
          }
        }
      } else if (selectables.custom.has(selectable.identifier)) {
        selectables.custom.delete(selectable.identifier);
        hasChanged = true;
      }
    }
    return hasChanged;
  }

  /**
   * Clear a `Selectables` object.
   * @param selectables `Selectables` object to clear selectables for
   * @beta
   */
  export function clear(selectables: Selectables): boolean {
    if (Selectables.size(selectables) === 0) {
      return false;
    }
    selectables.instanceKeys = new Map<string, Set<string>>();
    selectables.custom = new Map<string, CustomSelectable>();
    return true;
  }

  /**
   * Check whether at least one selectable passes a condition in a `Selectables` object.
   * @param selectables `Selectables` object to check
   * @beta
   */
  export function some(selectables: Selectables, callback: (selectable: Selectable) => boolean) {
    for (const entry of selectables.instanceKeys) {
      for (const item of entry[1]) {
        if (callback({ className: entry[0], id: item })) {
          return true;
        }
      }
    }
    for (const entry of selectables.custom) {
      if (callback(entry[1])) {
        return true;
      }
    }
    return false;
  }

  /**
   * Iterate over all keys in a `Selectables` object.
   * @param selectables `Selectables` object to iterate over
   * @beta
   */
  export function forEach(selectables: Selectables, callback: (selectable: Selectable, index: number) => void) {
    let index = 0;
    selectables.instanceKeys.forEach((ids: Set<string>, className: string) => {
      ids.forEach((id: string) => callback({ className, id }, index++));
    });
    selectables.custom.forEach((data) => {
      callback(data, index++);
    });
  }
}
