/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Internal
 */

import { useCallback, useEffect, useState } from "react";
import { EMPTY, from, map, mergeMap, toArray } from "rxjs";
import { PropertyDescription } from "@itwin/appui-abstract";
import { IModelConnection } from "@itwin/core-frontend";
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

/** @internal */
export const NAVIGATION_PROPERTY_TARGETS_BATCH_SIZE = 100;

/** @internal */
export interface NavigationPropertyTarget {
  label: LabelDefinition;
  key: InstanceKey;
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
}

/** @internal */
export function useNavigationPropertyTargetsLoader(props: UseNavigationPropertyTargetsLoaderProps) {
  const { imodel, ruleset } = props;
  const loadTargets = useCallback(
    async (filter: string, loadedOptionsCount: number): Promise<NavigationPropertyTargetsResult> => {
      if (!ruleset) {
        return { options: [], hasMore: false };
      }

      const requestProps = {
        imodel,
        rulesetOrId: ruleset,
        keys: new KeySet(),
        descriptor: {
          contentFlags: ContentFlags.ShowLabels | ContentFlags.NoFields,
          fieldsFilterExpression: filter ? `/DisplayLabel/ ~ \"%${filter}%\"` : undefined,
        },
        paging: { start: loadedOptionsCount, size: NAVIGATION_PROPERTY_TARGETS_BATCH_SIZE },
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

      return {
        options: items.map((item) => ({
          label: item.label,
          key: item.primaryKeys[0],
        })),
        hasMore: items.length === NAVIGATION_PROPERTY_TARGETS_BATCH_SIZE,
      };
    },
    [ruleset, imodel],
  );

  return loadTargets;
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
