/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { normalizeFullClassName } from "@itwin/presentation-shared";
import { Selectables, TRANSIENT_ELEMENT_CLASSNAME } from "@itwin/unified-selection";
import { abortableIterable } from "../Utils.js";

import type { ContentTarget } from "@itwin/presentation-content";
import type { EC } from "@itwin/presentation-shared";

/** Props for `createContentTargetsFromSelectables`. */
interface CreateContentTargetsFromSelectablesProps {
  /** Selectables to create content targets for, e.g. the current unified selection. */
  selectables: Selectables;
  /** Cancels loading instance keys of custom selectables. The returned promise rejects with the signal's reason. */
  abortSignal?: AbortSignal;
}

/**
 * Creates content targets for the given selectables, one target per class with the ids of its selected instances.
 *
 * Instance keys of custom selectables are loaded and added to the targets of their classes. Transient instances
 * are skipped, because they have no content.
 */
export async function createContentTargetsFromSelectables(
  props: CreateContentTargetsFromSelectablesProps,
): Promise<ContentTarget[]> {
  const { selectables, abortSignal } = props;
  const idsByClass = new Map<EC.FullClassNameDotNotation, Set<string>>();
  for await (const key of abortableIterable(Selectables.load(selectables), abortSignal)) {
    if (key.className === TRANSIENT_ELEMENT_CLASSNAME) {
      continue;
    }
    const primaryClass = normalizeFullClassName(key.className);
    let ids = idsByClass.get(primaryClass);
    if (!ids) {
      ids = new Set();
      idsByClass.set(primaryClass, ids);
    }
    ids.add(key.id);
  }
  return [...idsByClass].map(([primaryClass, ids]) => ({ primaryClass, instanceIds: [...ids] }));
}
