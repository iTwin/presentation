/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { transformForPropertyGrid } from "./PropertyGrid.js";

import type { ReadonlyContentDescriptor } from "../model/ContentDescriptor.js";
import type { ContentItem } from "../model/ContentItem.js";
import type { PropertyGridEntries, PropertyGridTransformConfig } from "./PropertyGrid.js";

/**
 * Supported content transformations, keyed by transformation type. Each holds the configuration `transformContent`
 * accepts for the type, and the result it returns.
 *
 * @public
 */
interface ContentTransformations {
  /** Shapes content for a property grid. */
  propertyGrid: { config: PropertyGridTransformConfig; result: PropertyGridEntries };
}

/**
 * Type of a content transformation, telling what the content is transformed for.
 * @public
 */
type ContentTransformType = keyof ContentTransformations;

/**
 * Props for {@link transformContent}.
 * @public
 */
interface TransformContentProps<TType extends ContentTransformType> {
  /** Descriptor of the content. */
  descriptor: ReadonlyContentDescriptor;
  /** Content items to transform. */
  items: ContentItem[];
  /** What the content is transformed for, and options specific to that transformation type. */
  config: ContentTransformations[TType]["config"] & { type: TType };
}

const transformations: {
  [TType in ContentTransformType]: (props: TransformContentProps<TType>) => ContentTransformations[TType]["result"];
} = { propertyGrid: transformForPropertyGrid };

/**
 * Shapes raw content items for display in a specific kind of UI, selected by `config.type`. The result type depends
 * on the transformation type, and is meant to be mapped into a UI-specific format, e.g. property grid data.
 *
 * @example
 * ```ts
 * const { entries } = transformContent({ descriptor, items, config: { type: "propertyGrid" } });
 * ```
 *
 * @public
 */
export function transformContent<TType extends ContentTransformType>(
  props: TransformContentProps<TType>,
): ContentTransformations[TType]["result"] {
  const transform: (props: TransformContentProps<TType>) => ContentTransformations[TType]["result"] =
    transformations[props.config.type];
  return transform(props);
}
