/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Internal
 */

import { useEffect, useMemo, useState } from "react";
import { EMPTY, from, map, mergeMap, toArray } from "rxjs";
import { PropertyDescription } from "@itwin/appui-abstract";
import { IModelConnection } from "@itwin/core-frontend";
import { SelectOption } from "@itwin/itwinui-react";
import {
  ContentFlags,
  ContentSpecificationTypes,
  InstanceKey,
  Item,
  KeySet,
  LabelDefinition,
  NavigationPropertyInfo,
  Ruleset,
  RuleTypes,
} from "@itwin/presentation-common";
import { Presentation } from "@itwin/presentation-frontend";
import { FILTER_WARNING_OPTION, VALUE_BATCH_SIZE } from "./ItemsLoader.js";

/** @internal */
export interface NavigationPropertyTarget {
  label: LabelDefinition;
  key: InstanceKey;
}

interface NavigationPropertyValuesLoaderState {
  options: NavigationPropertyTarget[];
  isLoading: boolean;
}

/** @internal */
export interface NavigationPropertyTargetsResult {
  options: NavigationPropertyTarget[];
  hasMore: boolean;
}

/** @internal */
export interface UseNavigationPropertyTargetsLoaderProps {
  imodel: IModelConnection;
  ruleset?: Ruleset;
  filterText?: string;
  initialSelectedTarget?: string;
}

/** @internal */
export function useNavigationPropertyTargetsLoader(props: UseNavigationPropertyTargetsLoaderProps) {
  const { imodel, ruleset, filterText, initialSelectedTarget } = props;

  const [itemsLoader, setItemsLoader] = useState<NavigationPropertyItemsLoader | undefined>();

  const [state, setLoadedOptions] = useState<NavigationPropertyValuesLoaderState>({
    options: [],
    isLoading: false,
  });

  // Get initial loader and values
  useEffect(() => {
    setLoadedOptions({ options: [], isLoading: false });
    if (!ruleset) {
      return;
    }

    const loader = new NavigationPropertyItemsLoader(
      () => {
        setLoadedOptions((prev) => ({ ...prev, isLoading: true }));
      },
      (newItems) => {
        setLoadedOptions((prev) => ({
          options: [...prev.options, ...newItems],
          isLoading: false,
        }));
      },
      async (filter?: string) => getItems(imodel, ruleset, filter),
    );

    void loader.loadItems(initialSelectedTarget ?? "");
    setItemsLoader(loader);
    return () => {
      loader.dispose();
    };
  }, [imodel, initialSelectedTarget, ruleset]);

  // On filter text change, check if more items need to be loaded
  useEffect(() => {
    if (!itemsLoader) {
      return;
    }

    const timeout = setTimeout(() => {
      void itemsLoader.loadItems(filterText);
    }, 250);

    return () => {
      clearTimeout(timeout);
    };
  }, [itemsLoader, filterText]);

  return {
    selectOptions: useMemo<SelectOption<string>[]>(() => {
      const options: SelectOption<string>[] = state.options.map((option) => {
        return {
          label: option.label.displayValue,
          value: option.label.displayValue,
        };
      });

      if (options.length >= VALUE_BATCH_SIZE) {
        options.push(FILTER_WARNING_OPTION);
      }
      return options;
    }, [state.options]),
    loadedOptions: state.options,
    isLoading: state.isLoading,
  };
}

/** @internal */
export function useNavigationPropertyTargetsRuleset(
  getNavigationPropertyInfo: (property: PropertyDescription) => Promise<NavigationPropertyInfo | undefined>,
  property: PropertyDescription,
) {
  const [ruleset, setRuleset] = useState<Ruleset>();

  useEffect(() => {
    let disposed = false;
    void (async () => {
      const propertyInfo = await getNavigationPropertyInfo(property);
      if (!disposed && propertyInfo) {
        setRuleset(createNavigationPropertyTargetsRuleset(propertyInfo));
      }
    })();
    return () => {
      disposed = true;
    };
  }, [property, getNavigationPropertyInfo]);

  return ruleset;
}

function createNavigationPropertyTargetsRuleset(propertyInfo: NavigationPropertyInfo): Ruleset {
  const [schemaName, className] = propertyInfo.targetClassInfo.name.split(":");
  return {
    id: `navigation-property-targets`,
    rules: [
      {
        ruleType: RuleTypes.Content,
        specifications: [
          {
            specType: ContentSpecificationTypes.ContentInstancesOfSpecificClasses,
            classes: { schemaName, classNames: [className], arePolymorphic: propertyInfo.isTargetPolymorphic },
          },
        ],
      },
    ],
  };
}

async function getItems(imodel: IModelConnection, ruleset: Ruleset, filter?: string) {
  const requestProps = {
    imodel,
    rulesetOrId: ruleset,
    keys: new KeySet(),
    descriptor: {
      contentFlags: ContentFlags.ShowLabels | ContentFlags.NoFields,
      fieldsFilterExpression: filter ? `/DisplayLabel/ ~ \"%${filter}%\"` : undefined,
    },
    paging: { size: VALUE_BATCH_SIZE },
  };
  const items = await new Promise<Item[]>((resolve, reject) => {
    (Presentation.presentation.getContentIterator
      ? from(Presentation.presentation.getContentIterator(requestProps)).pipe(
          mergeMap((result) => (result ? result.items : EMPTY)),
          toArray(),
        )
      : // eslint-disable-next-line @typescript-eslint/no-deprecated
        from(Presentation.presentation.getContent(requestProps)).pipe(map((content) => (content ? content.contentSet : [])))
    ).subscribe({
      next: resolve,
      error: reject,
    });
  });

  const results: NavigationPropertyTarget[] = items.map((item) => ({
    label: item.label,
    key: item.primaryKeys[0],
  }));
  return results;
}

/** @internal */
export class NavigationPropertyItemsLoader {
  private _loadedItems: NavigationPropertyTarget[] = [];
  private _isLoading = false;
  private _disposed = false;

  constructor(
    private _beforeLoad: () => void,
    private _onItemsLoaded: (newItems: NavigationPropertyTarget[]) => void,
    private _loadItems: (filterText?: string) => Promise<NavigationPropertyTarget[]>,
  ) {}

  public dispose() {
    this._disposed = true;
  }

  public async loadItems(filterText?: string) {
    if (this._isLoading || filterText === undefined || (filterText === "" && this._loadedItems.length >= VALUE_BATCH_SIZE)) {
      return;
    }

    const filteredItems = this._loadedItems.filter((option) => option.label.displayValue.toLowerCase().includes(filterText.toLowerCase()));
    if (filteredItems.length >= VALUE_BATCH_SIZE) {
      return;
    }

    this._isLoading = true;
    this._beforeLoad();

    const options = await this._loadItems(filterText);

    if (this._disposed) {
      return;
    }

    const uniqueOptions = options.filter((option) => {
      return !this._loadedItems.some((loadedItem) => {
        return loadedItem.key.id === option.key.id && loadedItem.label.displayValue === option.label.displayValue;
      });
    });

    this._loadedItems.push(...uniqueOptions);
    this._onItemsLoaded(uniqueOptions);
    this._isLoading = false;
  }
}
