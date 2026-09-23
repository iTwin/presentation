/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { Presentation } from "@itwin/presentation-backend";
import { ContentFlags, DefaultContentDisplayTypes, KeySet, RuleTypes } from "@itwin/presentation-common";

import type { IModelDb } from "@itwin/core-backend";
import type { DescriptorJSON, ItemJSON, InstanceKey as LegacyInstanceKey, Ruleset } from "@itwin/presentation-common";
import type { InstanceKey } from "@itwin/presentation-shared";
import type { CaptureEnvelope, Scenario } from "../Persistence.js";

const RULESET_ID = "content-output-equivalence";

export type LegacyCapture = CaptureEnvelope<DescriptorJSON, ItemJSON, "legacy">;

function toLegacyKey(key: InstanceKey): LegacyInstanceKey {
  return { ...key, className: key.className.replace(".", ":") };
}

async function createConsolidatedContentDescriptor({ imodel }: { imodel: IModelDb }) {
  const ruleset: Ruleset = {
    id: `${RULESET_ID}-consolidated`,
    rules: [
      {
        ruleType: RuleTypes.Content,
        specifications: [
          {
            specType: "ContentInstancesOfSpecificClasses",
            classes: { schemaName: "BisCore", classNames: ["GeometricElement3d"], arePolymorphic: true },
            handlePropertiesPolymorphically: true,
          },
        ],
      },
    ],
  };
  const result = await Presentation.getManager().getContentDescriptor({
    imodel,
    rulesetOrId: ruleset,
    displayType: DefaultContentDisplayTypes.PropertyPane,
    contentFlags: ContentFlags.ShowLabels,
    keys: new KeySet(),
  });
  if (!result) {
    throw new Error("Legacy content returned no consolidated descriptor.");
  }
  return { descriptor: result.toJSON() };
}

async function createSelectedInstancesContent({
  imodel,
  instanceKeys,
}: {
  imodel: IModelDb;
  instanceKeys: InstanceKey[];
}) {
  const ruleset: Ruleset = {
    id: `${RULESET_ID}-selected-instances`,
    rules: [{ ruleType: RuleTypes.Content, specifications: [{ specType: "SelectedNodeInstances" }] }],
  };
  const content = await Presentation.getManager().getContent({
    imodel,
    rulesetOrId: ruleset,
    descriptor: { displayType: DefaultContentDisplayTypes.Grid },
    keys: new KeySet(instanceKeys.map(toLegacyKey)),
    omitFormattedValues: true,
  });
  if (!content) {
    throw new Error("Legacy content returned no element properties.");
  }
  return { descriptor: content.descriptor.toJSON(), items: content.contentSet.map((item) => item.toJSON()) };
}

export async function captureLegacy(props: {
  imodel: IModelDb;
  scenario: Scenario;
  implementationFingerprint: string;
  imodelFingerprint: string;
}): Promise<LegacyCapture> {
  const { imodel, scenario } = props;
  return {
    captureFormatVersion: 1,
    implementation: "legacy",
    implementationFingerprint: props.implementationFingerprint,
    imodelFingerprint: props.imodelFingerprint,
    scenario,
    createdAt: new Date().toISOString(),
    ...(scenario.id === "all-elements-descriptor"
      ? await createConsolidatedContentDescriptor({ imodel })
      : await createSelectedInstancesContent({ imodel, instanceKeys: scenario.keys })),
  };
}
