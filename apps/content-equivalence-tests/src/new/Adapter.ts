/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import {
  createContentProvider,
  createIModelContentConfiguration,
  resolveContentSources,
} from "@itwin/presentation-content";
import { createECSchemaProvider, createECSqlQueryExecutor } from "@itwin/presentation-core-interop";
import { stableStringify } from "../Persistence.js";

import type { IModelDb } from "@itwin/core-backend";
import type { ContentItem, ContentTarget, PropertyField, ReadonlyContentDescriptor } from "@itwin/presentation-content";
import type { EC, InstanceKey, RelationshipPath } from "@itwin/presentation-shared";
import type { CaptureEnvelope, Scenario } from "../Persistence.js";

function createIModelAccess(imodel: IModelDb) {
  return { ...createECSchemaProvider(imodel), ...createECSqlQueryExecutor(imodel) };
}

export type CapturedNewValue = ContentItem["values"][string];

export interface CapturedRelatedValues {
  path: RelationshipPath;
  entries: Array<{ key: InstanceKey; relationshipKey?: InstanceKey; values: Record<string, CapturedNewValue> }>;
}

export interface CapturedNewItem {
  primaryKey: InstanceKey;
  values: ContentItem["values"];
  related: CapturedRelatedValues[];
}

export type NewCapture = CaptureEnvelope<ReadonlyContentDescriptor, CapturedNewItem, "new">;

function captureNewItem(item: ContentItem, descriptor: ReadonlyContentDescriptor): CapturedNewItem {
  const fields = Object.values(descriptor.fields);
  const relatedPaths = new Map<string, RelationshipPath>();
  for (const field of fields) {
    if (field.kind === "property" && field.pathFromTarget.length > 0) {
      relatedPaths.set(stableStringify(field.pathFromTarget), field.pathFromTarget as RelationshipPath);
    }
  }
  const related = [...relatedPaths.values()].map((path) => ({
    path,
    entries: item
      .getRelatedInstances({ pathFromTarget: path })
      .map((entry) => ({
        key: entry.key,
        relationshipKey: entry.relationshipKey,
        values: Object.fromEntries(
          fields
            .filter(
              (field): field is PropertyField =>
                field.kind === "property" && stableStringify(field.pathFromTarget) === stableStringify(path),
            )
            .map((field) => [field.id, entry.getValue(field)]),
        ),
      })),
  }));
  return { primaryKey: item.primaryKey, values: item.values, related };
}

export async function captureNew(props: {
  imodel: IModelDb;
  scenario: Scenario;
  implementationFingerprint: string;
  imodelFingerprint: string;
}): Promise<NewCapture> {
  const { imodel, scenario } = props;
  const imodelAccess = createIModelAccess(imodel);
  const config = await createIModelContentConfiguration({ imodelAccess });
  const targets: ContentTarget[] =
    scenario.id === "all-elements-descriptor"
      ? [{ primaryClass: "BisCore.GeometricElement3d" as const }]
      : Object.entries(Object.groupBy(scenario.keys, (key) => key.className)).map(([primaryClass, keys]) => ({
          primaryClass: primaryClass as EC.FullClassNameDotNotation,
          instanceIds: keys!.map((key) => key.id),
        }));
  const sources = await resolveContentSources({ imodelAccess, targets, config });
  const provider = createContentProvider({ imodelAccess, sources, config });
  const descriptor = await provider.getContentDescriptor();
  let items: CapturedNewItem[] | undefined;
  if (scenario.id === "sampled-elements") {
    items = [];
    for await (const item of provider.getItems()) {
      items.push(captureNewItem(item, descriptor));
    }
  }

  return {
    captureFormatVersion: 1,
    implementation: "new",
    implementationFingerprint: props.implementationFingerprint,
    imodelFingerprint: props.imodelFingerprint,
    scenario,
    createdAt: new Date().toISOString(),
    descriptor,
    ...(items !== undefined ? { items } : {}),
  };
}
