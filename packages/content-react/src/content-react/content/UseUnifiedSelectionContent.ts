/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Selectables } from "@itwin/unified-selection";
import { createContentTargetsFromSelectables } from "./ContentTargets.js";
import { useAsyncValue } from "./internal/UseAsyncValue.js";
import { useContent } from "./UseContent.js";

import type { ContentTarget } from "@itwin/presentation-content";
import type { SelectionStorage } from "@itwin/unified-selection";
import type { AsyncValueLoader } from "./internal/UseAsyncValue.js";
import type { UseContentProps, UseContentResult } from "./UseContent.js";

/**
 * Props for `useUnifiedSelectionContent`.
 * @public
 */
interface UseUnifiedSelectionContentProps extends Omit<UseContentProps, "targets" | "imodelAccess"> {
  /**
   * Access to the iModel's schemas and ECSQL queries, and the key of the iModel whose selection to load content
   * for. Selection changes of other iModels are ignored.
   */
  imodelAccess: UseContentProps["imodelAccess"] & { imodelKey: string };
  /** Unified selection storage to get the selection from. */
  selectionStorage: SelectionStorage;
  /**
   * Maximum number of selected items to load content for. When more items are selected, no content is loaded
   * and the result has `isOverLimit` set. Defaults to `100`.
   */
  instancesLimit?: number;
}

/**
 * Result of `useUnifiedSelectionContent`.
 * @public
 */
export type UseUnifiedSelectionContentResult = UseContentResult & {
  /** Number of selected items. A custom selectable counts as one item, whatever number of instances it represents. */
  selectedInstancesCount: number;
  /** Whether more items are selected than `instancesLimit`. No content is loaded in that case. */
  isOverLimit: boolean;
};

/** Default value of `UseUnifiedSelectionContentProps.instancesLimit`. */
const DEFAULT_INSTANCES_LIMIT = 100;

/**
 * A React hook that loads content of the instances selected in unified selection and keeps it up to date.
 *
 * Content is loaded for the selection at the deepest selection level when the hook is mounted, and for the
 * selection at the changed level after every selection change of the given iModel. Content of the previous
 * selection is kept until content of the new selection is ready, and cleared when nothing is selected or more
 * items than `instancesLimit` are selected. Otherwise it works like `useContent`: content is loaded again when
 * `imodelChanged` is raised or when `reload` is called.
 *
 * @public
 */
export function useUnifiedSelectionContent(props: UseUnifiedSelectionContentProps): UseUnifiedSelectionContentResult {
  const { selectionStorage, instancesLimit = DEFAULT_INSTANCES_LIMIT, ...contentProps } = props;
  const selection = useSelectionTargets({ selectionStorage, imodelKey: props.imodelAccess.imodelKey, instancesLimit });
  const contentResult = useContent({ ...contentProps, targets: selection.targets });
  const { reload: reloadContent } = contentResult;
  const { retry: retrySelection, error: selectionError } = selection;
  const reload = useCallback(() => {
    // Targets of the same selection don't change, so they're loaded again only if loading them failed.
    if (selectionError !== undefined) {
      retrySelection();
    } else {
      reloadContent();
    }
  }, [selectionError, retrySelection, reloadContent]);

  return useMemo((): UseUnifiedSelectionContentResult => {
    const selectionInfo = {
      selectedInstancesCount: selection.selectedInstancesCount,
      isOverLimit: selection.isOverLimit,
      reload,
    };
    if (selection.isLoading) {
      return { content: contentResult.content, isLoading: true, ...selectionInfo };
    }
    if (selection.error !== undefined) {
      return { content: undefined, isLoading: false, error: selection.error, ...selectionInfo };
    }
    return { ...contentResult, ...selectionInfo };
  }, [selection, reload, contentResult]);
}

interface SelectionTargets {
  /**
   * Targets of the current selection. While they're loading, holds targets of the previous selection, so that
   * selecting the same instances again doesn't trigger a new content load.
   */
  targets: ContentTarget[] | undefined;
  selectedInstancesCount: number;
  isOverLimit: boolean;
  /** Whether targets are loading. */
  isLoading: boolean;
  /** The error that made loading instance keys of custom selectables fail, if any. */
  error?: unknown;
  /** Loads targets again, e.g. after loading instance keys of custom selectables failed. */
  retry: () => void;
}

/** Tracks unified selection of an iModel and creates content targets from it. */
function useSelectionTargets(inputs: SelectionInputs): SelectionTargets {
  const selection = useSelection(inputs);
  const load = useMemo((): AsyncValueLoader<ContentTarget[]> | undefined => {
    const selectables = selection?.selectables;
    if (!selectables || Selectables.isEmpty(selectables)) {
      return undefined;
    }
    return async ({ signal }) => createContentTargetsFromSelectables({ selectables, abortSignal: signal });
  }, [selection]);
  const { value: targets, isLoading, error, reload: retry } = useAsyncValue(load, { keepPreviousValue: true });

  return useMemo((): SelectionTargets => {
    if (!selection) {
      // Until the selection is read for new inputs, it isn't known yet.
      return { targets: undefined, selectedInstancesCount: 0, isOverLimit: false, isLoading: true, retry };
    }
    return {
      targets,
      selectedInstancesCount: selection.selectedInstancesCount,
      isOverLimit: !selection.selectables,
      isLoading,
      ...(error !== undefined ? { error } : {}),
      retry,
    };
  }, [selection, targets, isLoading, error, retry]);
}

interface SelectionInputs {
  selectionStorage: SelectionStorage;
  imodelKey: string;
  instancesLimit: number;
}

interface Selection {
  inputs: SelectionInputs;
  selectedInstancesCount: number;
  /** A copy of the selection. `undefined` when more items are selected than `instancesLimit`. */
  selectables: Selectables | undefined;
}

/**
 * Returns the selection at the deepest selection level on mount, and the selection at the changed level after
 * every selection change of the given iModel. Returns `undefined` until the selection is read for the given inputs.
 */
function useSelection(inputs: SelectionInputs): Selection | undefined {
  const { selectionStorage, imodelKey, instancesLimit } = inputs;
  const [selection, setSelection] = useState<Selection>();
  const trackedLevel = useRef<{ inputs: SelectionInputs; level: number } | undefined>(undefined);

  useEffect(() => {
    const effectInputs = { selectionStorage, imodelKey, instancesLimit };
    const update = (level: number) => {
      const selectables = selectionStorage.getSelection({ imodelKey, level });
      const selectedInstancesCount = Selectables.size(selectables);
      trackedLevel.current = { inputs: effectInputs, level };
      setSelection({
        inputs: effectInputs,
        selectedInstancesCount,
        // The storage keeps changing the returned object, so keep a copy.
        selectables:
          selectedInstancesCount > instancesLimit ? undefined : Selectables.create(getSelectablesList(selectables)),
      });
    };
    const previous = trackedLevel.current;
    update(
      previous?.inputs.selectionStorage === selectionStorage && previous.inputs.imodelKey === imodelKey
        ? previous.level
        : (selectionStorage.getSelectionLevels({ imodelKey }).at(-1) ?? 0),
    );
    return selectionStorage.selectionChangeEvent.addListener((args) => {
      if (args.imodelKey === imodelKey) {
        update(args.level);
      }
    });
  }, [selectionStorage, imodelKey, instancesLimit]);

  const isStale =
    !selection ||
    selection.inputs.selectionStorage !== selectionStorage ||
    selection.inputs.imodelKey !== imodelKey ||
    selection.inputs.instancesLimit !== instancesLimit;
  return isStale ? undefined : selection;
}

function getSelectablesList(selectables: Selectables) {
  const list: Parameters<typeof Selectables.create>[0] = [];
  Selectables.forEach(selectables, (selectable) => list.push(selectable));
  return list;
}
