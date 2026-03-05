/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import type localeJson from "../../public/locales/en/PresentationHierarchies_1.0.json";

type AddPrefix<TPrefix extends string, TPath extends string> = [TPrefix] extends [never] ? `${TPath}` : `${TPrefix}.${TPath}`;

/**
 * Utility type that extracts all possible keys from a nested object as dot-separated strings
 *
 * Example:
 *
 * ```ts
 * type Example = {
 *   a: {
 *     b: string;
 *     c: number;
 *   };
 *   d: boolean;
 * }
 * // ExampleKeys will be "a.b" | "a.c" | "d"
 * type ExampleKeys = ObjectKeys<Example>
 * ```
 */
type ObjectKeys<TObject extends object, Acc extends string = never> =
  | Acc
  | {
      [K in keyof TObject & string]: TObject[K] extends object ? ObjectKeys<TObject[K], AddPrefix<Acc, K>> : AddPrefix<Acc, K>;
    }[keyof TObject & string];

/**
 * Type representing all possible localization keys
 * @internal
 */
export type LocalizationKey = ObjectKeys<typeof localeJson>;

/** @internal */
export const LOCALIZATION_NAMESPACE = "PresentationHierarchies_1.0";

/**
 * Namespaces used for localization of presentation hierarchies components.
 * @alpha
 */
export const LOCALIZATION_NAMESPACES = [LOCALIZATION_NAMESPACE];

/** @internal */
export type TranslateFunc = (key: LocalizationKey) => string;
