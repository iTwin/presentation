/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Core
 */

import { LegacyRef, MutableRefObject, RefCallback, useCallback, useRef, useState } from "react";
import { Primitives, PrimitiveValue, PropertyDescription, PropertyRecord, PropertyValueFormat } from "@itwin/appui-abstract";
import { IPropertyValueRenderer, PropertyValueRendererManager } from "@itwin/components-react";
import { assert, Guid, GuidString, IDisposable } from "@itwin/core-bentley";
import { Descriptor, Field, LabelCompositeValue, LabelDefinition, parseCombinedFieldNames } from "@itwin/presentation-common";
import { Presentation } from "@itwin/presentation-frontend";
import { InstanceKeyValueRenderer } from "../properties/InstanceKeyValueRenderer";

const localizationNamespaceName = "PresentationComponents";

/**
 * Registers 'PresentationComponents' localization namespace and returns callback
 * to unregister it.
 * @internal
 */
export const initializeLocalization = async () => {
  await Presentation.localization.registerNamespace(localizationNamespaceName);
  return () => Presentation.localization.unregisterNamespace(localizationNamespaceName); // eslint-disable-line @itwin/no-internal
};

/**
 * Registers custom property value renderers and returns cleanup callback that unregisters them.
 * @internal
 */
export const initializePropertyValueRenderers = async () => {
  const customRenderers: Array<{ name: string; renderer: IPropertyValueRenderer }> = [{ name: "SelectableInstance", renderer: new InstanceKeyValueRenderer() }];

  for (const { name, renderer } of customRenderers) {
    PropertyValueRendererManager.defaultManager.registerRenderer(name, renderer);
  }

  return () => {
    for (const { name } of customRenderers) {
      PropertyValueRendererManager.defaultManager.unregisterRenderer(name);
    }
  };
};

/**
 * Translate a string with the specified id from `PresentationComponents`
 * localization namespace. The `stringId` should not contain namespace - it's
 * prepended automatically.
 *
 * @internal
 */
export const translate = (stringId: string): string => {
  stringId = `${localizationNamespaceName}:${stringId}`;
  return Presentation.localization.getLocalizedString(stringId);
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

/**
 * A helper to track ongoing async tasks. Usage:
 * ```
 * await using(tracker.trackAsyncTask(), async (_r) => {
 *   await doSomethingAsync();
 * });
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
  public trackAsyncTask(): IDisposable {
    const id = Guid.createValue();
    this._asyncsInProgress.add(id);
    return {
      dispose: () => this._asyncsInProgress.delete(id),
    };
  }
}

/** @internal */
export function useResizeObserver<T extends HTMLElement>() {
  const observer = useRef<ResizeObserver>();
  const [{ width, height }, setSize] = useState<{ width?: number; height?: number }>({});

  const ref = useCallback((element: T | null) => {
    observer.current?.disconnect();
    if (element) {
      observer.current = new ResizeObserver(
        /* istanbul ignore next */
        (entries) => {
          assert(entries.length === 1);
          setSize(entries[0].contentRect);
        }
      );
      observer.current.observe(element);
    }
  }, []);

  return {
    ref,
    width,
    height,
  };
}

/** @internal */
export function mergeRefs<T>(...refs: Array<MutableRefObject<T | null> | LegacyRef<T>>): RefCallback<T> {
  return (instance: T | null) => {
    refs.forEach((ref) => {
      // istanbul ignore else
      if (typeof ref === "function") {
        ref(instance);
      } else if (ref) {
        (ref as MutableRefObject<T | null>).current = instance;
      }
    });
  };
}

/**
 * A hook that helps components throw errors in React's render loop so they can be captured by React error
 * boundaries.
 *
 * Usage: simply call the returned function with an error and it will be re-thrown on next render.
 *
 * @internal
 */
export function useErrorState() {
  const [error, setError] = useState<Error | undefined>(undefined);
  const setErrorState = useCallback((e: unknown) => {
    setError(e instanceof Error ? e : /* istanbul ignore next */ new Error());
  }, []);
  if (error) {
    throw error;
  }
  return setErrorState;
}
