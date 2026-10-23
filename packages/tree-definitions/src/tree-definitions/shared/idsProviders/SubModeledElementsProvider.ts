/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { defer, EMPTY, map, reduce, shareReplay } from "rxjs";
import { catchBeSQLiteInterrupts } from "../TreeErrors.js";

import type { Observable } from "rxjs";
import type { GuidString } from "@itwin/core-bentley";
import type { LimitingECSqlQueryExecutor } from "@itwin/presentation-hierarchies";
import type { ElementId, ModelId } from "../Types.js";

interface SubModeledElementsProviderProps {
  queryExecutor: LimitingECSqlQueryExecutor;
  componentId: GuidString;
  elementClassName: string;
  nonEmptyModelIds: ReadonlySet<ModelId>;
}

/**
 * Sub-modeled element data used by `SharedIdsProvider.subModeledElements`.
 * @beta
 */
export interface SubModeledElementsProviderData {
  /** Elements that are modeled by models containing elements. Their IDs are also IDs of the sub-models. */
  allSubModels: Set<ElementId>;
}

/** @internal */
export class SubModeledElementsProvider {
  #queryExecutor: LimitingECSqlQueryExecutor;
  #componentId: GuidString;
  #componentName: string;
  #elementClassName: string;
  #nonEmptyModelIds: ReadonlySet<ModelId>;
  // ElementId here is also a ModelId, since those elements are sub models.
  #cachedData: Observable<SubModeledElementsProviderData> | undefined;

  constructor(props: SubModeledElementsProviderProps) {
    this.#queryExecutor = props.queryExecutor;
    this.#componentId = props.componentId;
    this.#elementClassName = props.elementClassName;
    this.#componentName = "SubModeledElementsProvider";
    this.#nonEmptyModelIds = props.nonEmptyModelIds;
  }

  private querySubModeledElements(): Observable<ElementId> {
    if (this.#nonEmptyModelIds.size === 0) {
      return EMPTY;
    }
    return defer(() => {
      const query = `
        SELECT me.ECInstanceId subModeledElementId
        FROM ${this.#elementClassName} me
        JOIN IdSet(?) modelIdSet ON modelIdSet.id = me.ECInstanceId
      `;
      return this.#queryExecutor.createQueryReader(
        { ecsql: query, bindings: [{ type: "idset", value: this.#nonEmptyModelIds }] },
        {
          rowFormat: "ECSqlPropertyNames",
          limit: "unbounded",
          restartToken: `${this.#componentName}/${this.#componentId}/sub-modeled-elements`,
        },
      );
    }).pipe(
      catchBeSQLiteInterrupts,
      map((row) => row.subModeledElementId),
    );
  }

  public getData(): Observable<SubModeledElementsProviderData> {
    this.#cachedData ??= defer(() =>
      this.querySubModeledElements().pipe(
        reduce(
          (acc, subModeledElementId) => {
            acc.allSubModels.add(subModeledElementId);
            return acc;
          },
          { allSubModels: new Set<ElementId>() },
        ),
      ),
    ).pipe(shareReplay());
    return this.#cachedData;
  }
}
