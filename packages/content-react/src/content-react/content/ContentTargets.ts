/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { normalizeFullClassName } from "@itwin/presentation-shared";
import { TRANSIENT_ELEMENT_CLASSNAME } from "@itwin/unified-selection";
import { abortableIterable } from "../Utils.js";

import type { ContentTarget } from "@itwin/presentation-content";
import type { EC } from "@itwin/presentation-shared";
import type { SelectableInstanceKey, Selectables } from "@itwin/unified-selection";

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
  abortSignal?.throwIfAborted();
  const builder = createTargetsBuilder();
  builder.addInstanceKeys(selectables.instanceKeys);
  for (const custom of selectables.custom.values()) {
    for await (const key of abortableIterable(custom.loadInstanceKeys(), abortSignal)) {
      builder.addKey(key);
    }
  }
  return builder.build();
}

function createTargetsBuilder() {
  const idsByClass = new Map<EC.FullClassNameDotNotation, Set<string>>();
  function add(className: string, ids: Iterable<string>) {
    if (className === TRANSIENT_ELEMENT_CLASSNAME) {
      return;
    }
    const primaryClass = normalizeFullClassName(className);
    let classIds = idsByClass.get(primaryClass);
    if (!classIds) {
      classIds = new Set();
      idsByClass.set(primaryClass, classIds);
    }
    for (const id of ids) {
      classIds.add(id);
    }
  }
  return {
    addInstanceKeys(instanceKeys: Selectables["instanceKeys"]) {
      instanceKeys.forEach((ids, className) => add(className, ids));
    },
    addKey(key: SelectableInstanceKey) {
      add(key.className, [key.id]);
    },
    build(): ContentTarget[] {
      return [...idsByClass]
        .filter(([, ids]) => ids.size > 0)
        .map(([primaryClass, ids]) => ({ primaryClass, instanceIds: [...ids] }));
    },
  };
}
