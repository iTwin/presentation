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

interface ModeledElementsCacheProps {
  queryExecutor: LimitingECSqlQueryExecutor;
  componentId: GuidString;
  elementClassName: string;
  nonEmptyModelIds: Array<ModelId>;
}

/** @internal */
export class ModeledElementsCache {
  #queryExecutor: LimitingECSqlQueryExecutor;
  #componentId: GuidString;
  #componentName: string;
  #elementClassName: string;
  #nonEmptyModelIds: Array<ModelId>;
  // ElementId here is also a ModelId, since those elements are sub models.
  #modeledElementsInfo: Observable<{ allSubModels: Set<ElementId> }> | undefined;

  constructor(props: ModeledElementsCacheProps) {
    this.#queryExecutor = props.queryExecutor;
    this.#componentId = props.componentId;
    this.#elementClassName = props.elementClassName;
    this.#componentName = "ModeledElementsCache";
    this.#nonEmptyModelIds = props.nonEmptyModelIds;
  }

  private queryModeledElements(): Observable<ElementId> {
    if (this.#nonEmptyModelIds.length === 0) {
      return EMPTY;
    }
    return defer(() => {
      const query = `
        SELECT me.ECInstanceId modeledElementId
        FROM ${this.#elementClassName} me
        JOIN IdSet(?) modelIdSet ON modelIdSet.id = me.ECInstanceId
      `;
      return this.#queryExecutor.createQueryReader(
        { ecsql: query, bindings: [{ type: "idset", value: this.#nonEmptyModelIds }] },
        {
          rowFormat: "ECSqlPropertyNames",
          limit: "unbounded",
          restartToken: `${this.#componentName}/${this.#componentId}/modeled-elements`,
        },
      );
    }).pipe(
      catchBeSQLiteInterrupts,
      map((row) => row.modeledElementId),
    );
  }

  public getModeledElementsInfo() {
    this.#modeledElementsInfo ??= this.queryModeledElements().pipe(
      reduce(
        (acc, modeledElementId) => {
          acc.allSubModels.add(modeledElementId);
          return acc;
        },
        { allSubModels: new Set<ElementId>() },
      ),
      shareReplay(),
    );
    return this.#modeledElementsInfo;
  }
}
