/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Core
 */

import "../common/DisposePolyfill.js";
import * as mm from "micro-memoize";
import { LegacyRef, MutableRefObject, RefCallback, useCallback, useEffect, useState } from "react";
import { Primitives, PrimitiveValue, PropertyDescription, PropertyRecord, PropertyValueFormat } from "@itwin/appui-abstract";
import { Guid, GuidString } from "@itwin/core-bentley";
import { TranslationOptions } from "@itwin/core-common";
import { Descriptor, Field, KeySet, LabelCompositeValue, LabelDefinition, parseCombinedFieldNames, Ruleset, Value } from "@itwin/presentation-common";
import { Presentation } from "@itwin/presentation-frontend";
import { Selectables } from "@itwin/unified-selection";

/** @internal */
export const localizationNamespaceName = "PresentationComponents";

/**
 * Translate a string with the specified id from `PresentationComponents`
 * localization namespace. The `stringId` should not contain namespace - it's
 * prepended automatically.
 *
 * @internal
 */
export const translate = (stringId: string, options?: TranslationOptions): string => {
  stringId = `${localizationNamespaceName}:${stringId}`;
  return Presentation.localization.getLocalizedString(stringId, options);
};

/**
 * Creates a display name for the supplied component
 * @internal
 */
export const getDisplayName = <P>(component: React.ComponentType<P>): string => {
  if (component.displayName) {
    return component.displayName;
  }
  if (component.name) {
    return component.name;
  }
  return "Component";
};

/**
 * Finds a field given the name of property record created from that field.
 * @internal
 */
export const findField = (descriptor: Descriptor, recordPropertyName: string): Field | undefined => {
  let fieldsSource: { getFieldByName: (name: string) => Field | undefined } | undefined = descriptor;
  const fieldNames = parseCombinedFieldNames(recordPropertyName);
  while (fieldsSource && fieldNames.length) {
    const field: Field | undefined = fieldsSource.getFieldByName(fieldNames.shift()!);
    fieldsSource = field && field.isNestedContentField() ? field : undefined;
    if (!fieldNames.length) {
      return field;
    }
  }
  return undefined;
};

/**
 * Creates property record for label using label definition.
 * @internal
 */
export const createLabelRecord = (label: LabelDefinition, name: string): PropertyRecord => {
  const value: PrimitiveValue = {
    displayValue: label.displayValue,
    value: createPrimitiveLabelValue(label),
    valueFormat: PropertyValueFormat.Primitive,
  };
  const property: PropertyDescription = {
    displayLabel: "Label",
    typename: label.typeName,
    name,
  };

  return new PropertyRecord(value, property);
};

const createPrimitiveLabelValue = (label: LabelDefinition) => {
  return LabelDefinition.isCompositeDefinition(label) ? createPrimitiveCompositeValue(label.rawValue) : label.rawValue;
};

const createPrimitiveCompositeValue = (compositeValue: LabelCompositeValue): Primitives.Composite => {
  return {
    separator: compositeValue.separator,
    parts: compositeValue.values.map((part) => ({
      displayValue: part.displayValue,
      typeName: part.typeName,
      rawValue: createPrimitiveLabelValue(part),
    })),
  };
};

/** @internal */
export type RulesetOrId = Ruleset | string;

/**
 * Returns ruleset id from `RulesetOrId`.
 * @internal
 */
export function getRulesetId(ruleset: RulesetOrId) {
  return typeof ruleset === "string" ? ruleset : ruleset.id;
}

/**
 * A helper to track ongoing async tasks. Usage:
 * ```
 * {
 *   using _r = tracker.trackAsyncTask();
 *   await doSomethingAsync();
 * }
 * ```
 *
 * Can be used with `waitForPendingAsyncs` in test helpers to wait for all
 * async tasks to complete.
 *
 * @internal
 */
export class AsyncTasksTracker {
  private _asyncsInProgress = new Set<GuidString>();
  public get pendingAsyncs() {
    return this._asyncsInProgress;
  }
  public trackAsyncTask(): Disposable {
    const id = Guid.createValue();
    this._asyncsInProgress.add(id);
    return {
      [Symbol.dispose]: () => this._asyncsInProgress.delete(id),
    };
  }
}

/** @internal */
/* c8 ignore start */
export function useMergedRefs<T>(...refs: Array<MutableRefObject<T | null> | LegacyRef<T>>): RefCallback<T> {
  return useCallback(
    (instance: T | null) => {
      refs.forEach((ref) => {
        if (typeof ref === "function") {
          ref(instance);
        } else if (ref) {
          (ref as MutableRefObject<T | null>).current = instance;
        }
      });
    },
    [...refs], // eslint-disable-line react-hooks/exhaustive-deps
  );
}
/* c8 ignore end */

/**
 * A hook that helps components throw errors in React's render loop so they can be captured by React error
 * boundaries.
 *
 * Usage: simply call the returned function with an error and it will be re-thrown in React render loop.
 *
 * @internal
 */
export function useErrorState() {
  const [_, setError] = useState(undefined);
  const setErrorState = useCallback((e: unknown) => {
    setError(() => {
      throw e instanceof Error ? e : /* c8 ignore next */ new Error();
    });
  }, []);
  return setErrorState;
}

/**
 * A hook that rerenders component after some time.
 * @param delayMilliseconds - milliseconds to delay. Default is 250.
 * @internal
 */
export function useDelay(delayMilliseconds: number = 250) {
  const [passed, setPassed] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setPassed(true);
    }, delayMilliseconds);
    return () => {
      clearTimeout(timeout);
    };
  }, [delayMilliseconds]);

  return passed;
}

export interface UniqueValue {
  displayValue: string;
  groupedRawValues: Value[];
}

/**
 * Function for serializing `UniqueValue`.
 * Returns an object, which consists of `displayValues` and `groupedRawValues`.
 */
export function serializeUniqueValues(values: UniqueValue[]): { displayValues: string; groupedRawValues: string } {
  const displayValues: string[] = [];
  const groupedRawValues: {
    [key: string]: Value[];
  } = {};
  values.forEach((item) => {
    displayValues.push(item.displayValue);
    groupedRawValues[item.displayValue] = [...item.groupedRawValues];
  });
  return { displayValues: JSON.stringify(displayValues), groupedRawValues: JSON.stringify(groupedRawValues) };
}

/**
 * Function for deserializing `displayValues` and `groupedRawValues`.
 * Returns an array of `UniqueValue` or undefined if parsing fails.
 */
export function deserializeUniqueValues(serializedDisplayValues: string, serializedGroupedRawValues: string): UniqueValue[] | undefined {
  const tryParseJSON = (value: string) => {
    try {
      return JSON.parse(value);
    } catch {
      return false;
    }
  };
  const displayValues = tryParseJSON(serializedDisplayValues);
  const groupedRawValues = tryParseJSON(serializedGroupedRawValues);

  if (!displayValues || !groupedRawValues || !Array.isArray(displayValues) || Object.keys(groupedRawValues).length !== displayValues.length) {
    return undefined;
  }

  const uniqueValues: UniqueValue[] = [];
  for (const displayValue of displayValues) {
    uniqueValues.push({ displayValue, groupedRawValues: groupedRawValues[displayValue] });
  }
  return uniqueValues;
}

export function memoize<Fn extends mm.AnyFn>(fn: Fn | mm.Memoized<Fn>, options?: mm.Options<Fn>): mm.Memoized<Fn> {
  const microMemoize = mm.default as unknown as (fn: Fn | mm.Memoized<Fn>, options?: mm.Options<Fn>) => mm.Memoized<Fn>;
  return microMemoize(fn, options);
}

export type WithIModelKey<TObj extends {}> = TObj & { imodelKey?: string };

export async function createKeySetFromSelectables(selectables: Selectables): Promise<KeySet> {
  const keys = new KeySet();
  for await (const instanceKey of Selectables.load(selectables)) {
    keys.add(instanceKey);
  }
  return keys;
}
