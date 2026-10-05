/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { createHash } from "node:crypto";
import { createECSqlQueryExecutor } from "@itwin/presentation-core-interop";

import type { IModelDb } from "@itwin/core-backend";
import type { Id64String } from "@itwin/core-bentley";
import type { EC, InstanceKey } from "@itwin/presentation-shared";
import type { SamplingOptions } from "./Configuration.js";

export interface Sample {
  candidateCounts: Record<string, number>;
  keys: InstanceKey[];
}

function keyIdentity(key: InstanceKey): string {
  return `${key.className.toLowerCase()}:${key.id.toLowerCase()}`;
}

function getSampleOffset(
  className: EC.FullClassNameDotNotation,
  candidateCount: number,
  sampleSize: number,
  seed: number,
): number {
  const availableOffsets = candidateCount - sampleSize + 1;
  if (availableOffsets <= 1) {
    return 0;
  }
  const hash = createHash("sha256").update(`${seed}:${className.toLowerCase()}`).digest();
  return hash.readUInt32BE() % availableOffsets;
}

export async function selectSample(props: {
  imodel: IModelDb;
  sampling: SamplingOptions;
  explicitKeys?: InstanceKey[];
}): Promise<Sample> {
  const { imodel, sampling } = props;
  const executor = createECSqlQueryExecutor(imodel);
  const classRows = executor.createQueryReader(
    {
      ecsql: `
        SELECT ec_classname(e.ECClassId, 's.c'), e.ECClassId, COUNT(*)
        FROM BisCore.Element e
        GROUP BY e.ECClassId
      `,
    },
    { rowFormat: "Indexes" },
  );
  const candidateCounts: Record<string, number> = {};
  const selected = new Map<string, InstanceKey>();
  for await (const row of classRows) {
    const className = row[0] as EC.FullClassNameDotNotation;
    const classId = row[1] as Id64String;
    const candidateCount = row[2] as number;
    candidateCounts[className] = candidateCount;

    const sampleSize = Math.min(candidateCount, sampling.perClass);
    const sampleRows = executor.createQueryReader(
      {
        ecsql: `
          SELECT e.ECInstanceId
          FROM BisCore.Element e
          WHERE e.ECClassId = ?
          ORDER BY e.ECInstanceId
          LIMIT ? OFFSET ?
        `,
        bindings: [
          { type: "id", value: classId },
          { type: "int", value: sampleSize },
          { type: "int", value: getSampleOffset(className, candidateCount, sampleSize, sampling.seed) },
        ],
      },
      { rowFormat: "Indexes" },
    );
    for await (const sampleRow of sampleRows) {
      const key = { className, id: sampleRow[0] as Id64String };
      selected.set(keyIdentity(key), key);
    }
  }
  for (const explicitKey of props.explicitKeys ?? []) {
    selected.set(keyIdentity(explicitKey), explicitKey);
  }

  return {
    candidateCounts: Object.fromEntries(Object.entries(candidateCounts).sort(([lhs], [rhs]) => lhs.localeCompare(rhs))),
    keys: [...selected.values()].sort((lhs, rhs) => keyIdentity(lhs).localeCompare(keyIdentity(rhs))),
  };
}
