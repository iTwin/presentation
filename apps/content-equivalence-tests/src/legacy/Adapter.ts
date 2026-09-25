/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { Presentation } from "@itwin/presentation-backend";
import { ContentFlags, DefaultContentDisplayTypes, KeySet, RuleTypes } from "@itwin/presentation-common";
import { CAPTURE_FORMAT_VERSION } from "../Persistence.js";

import type { IModelDb } from "@itwin/core-backend";
import type {
  DescriptorJSON,
  ItemJSON,
  InstanceKey as LegacyInstanceKey,
  Rule,
  Ruleset,
} from "@itwin/presentation-common";
import type { InstanceKey } from "@itwin/presentation-shared";
import type {
  AllElementsDescriptorScenario,
  CaptureEnvelope,
  SampledElementsScenario,
  Scenario,
} from "../Persistence.js";

const RULESET_ID = "content-output-equivalence";

type LegacyCaptureEnvelope = Omit<CaptureEnvelope<"legacy">, "scenario">;

export interface CapturedLegacyItem {
  descriptor: DescriptorJSON;
  item: ItemJSON;
}

export type LegacyCapture = LegacyCaptureEnvelope &
  (
    | { scenario: AllElementsDescriptorScenario; descriptor: DescriptorJSON }
    | { scenario: SampledElementsScenario; items: CapturedLegacyItem[] }
  );

function toLegacyKey(key: InstanceKey): LegacyInstanceKey {
  return { ...key, className: key.className.replace(".", ":") };
}

const supplementalRules: Rule[] = [
  {
    ruleType: "ContentModifier",
    class: { schemaName: "BisCore", className: "DefinitionElement" },
    propertyOverrides: [{ name: "IsPrivate", isDisplayed: false }],
  },
];

async function createConsolidatedContentDescriptor({ imodel }: { imodel: IModelDb }) {
  const ruleset: Ruleset = {
    id: `${RULESET_ID}-consolidated`,
    rules: [
      ...supplementalRules,
      {
        ruleType: "Content",
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
  return result.toJSON();
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
    rules: [
      ...supplementalRules,
      { ruleType: RuleTypes.Content, specifications: [{ specType: "SelectedNodeInstances" }] },
    ],
  };
  return Promise.all(
    instanceKeys.map(async (instanceKey) => {
      const content = await Presentation.getManager().getContent({
        imodel,
        rulesetOrId: ruleset,
        descriptor: { displayType: DefaultContentDisplayTypes.Grid },
        keys: new KeySet([toLegacyKey(instanceKey)]),
        omitFormattedValues: true,
      });
      if (!content) {
        throw new Error(`Legacy content returned no content for '${instanceKey.className}:${instanceKey.id}'.`);
      }
      if (content.contentSet.length !== 1) {
        throw new Error(
          `Expected one legacy content item for '${instanceKey.className}:${instanceKey.id}', found ${content.contentSet.length}.`,
        );
      }
      return { descriptor: content.descriptor.toJSON(), item: content.contentSet[0].toJSON() };
    }),
  );
}

export async function captureLegacy(props: {
  imodel: IModelDb;
  scenario: Scenario;
  implementationFingerprint: string;
  imodelFingerprint: string;
}): Promise<LegacyCapture> {
  const { imodel, scenario } = props;
  const envelope = {
    captureFormatVersion: CAPTURE_FORMAT_VERSION,
    implementation: "legacy",
    implementationFingerprint: props.implementationFingerprint,
    imodelFingerprint: props.imodelFingerprint,
    createdAt: new Date().toISOString(),
  } as const;
  if (scenario.id === "all-elements-descriptor") {
    return { ...envelope, scenario, descriptor: await createConsolidatedContentDescriptor({ imodel }) };
  }
  return {
    ...envelope,
    scenario,
    items: await createSelectedInstancesContent({ imodel, instanceKeys: scenario.keys }),
  };
}
