/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { createDescriptorTransformerFromContentModifierRule } from "./DescriptorTransformerFactory.js";
import { createFieldsProviderFromContentModifierRule } from "./FieldsProviderFactory.js";
import { checkRequiredSchemas } from "./Utils.js";

import type { ECSchemaProvider, ECSqlQueryExecutor } from "@itwin/presentation-shared";
import type { ContentConfiguration } from "../../Content.js";
import type { DescriptorTransformer } from "../DescriptorTransformer.js";
import type { IModelFieldsProvider } from "../IModelFieldsProvider.js";
import type { ContentModifierRule, Ruleset } from "./PresentationRules.js";

/**
 * Props for `createIModelContentConfiguration`.
 *
 * @public
 */
interface CreateIModelContentConfigurationProps {
  /** Access to the iModel for reading its embedded content configuration and inspecting its schemas. */
  imodelAccess: ECSqlQueryExecutor & ECSchemaProvider;
}

/**
 * Builds a `ContentConfiguration` from configuration embedded in the given iModel.
 *
 * The returned configuration can be passed to `resolveContentSources` and `createContentProvider`
 * to apply the iModel's embedded content customizations when producing content. These customizations
 * add fields (e.g. related and calculated properties) and adjust field metadata (e.g. labels,
 * categories, visibility) for the classes they target.
 *
 * @public
 */
export async function createIModelContentConfiguration(
  props: CreateIModelContentConfigurationProps,
): Promise<ContentConfiguration> {
  const { imodelAccess } = props;
  const fieldsProviders: IModelFieldsProvider[] = [];
  const descriptorTransformers: DescriptorTransformer[] = [];

  for await (const ruleset of loadEmbeddedRulesets(imodelAccess)) {
    if (!isSupplementalRuleset(ruleset)) {
      continue;
    }
    if (!(await areRulesetSchemaRequirementsMet(imodelAccess, ruleset))) {
      continue;
    }
    for (const rule of ruleset.rules) {
      if (!isContentModifierRule(rule)) {
        continue;
      }
      const { fieldsProvider, descriptorTransformer } = mapContentModifierRule(rule);
      fieldsProviders.push(fieldsProvider);
      descriptorTransformers.push(descriptorTransformer);
    }
  }

  return { fieldsProviders, descriptorTransformers };
}

/** Narrows a `RulesetRule` to a `ContentModifier` rule. */
function isContentModifierRule(
  rule: Ruleset["rules"][number],
): rule is { ruleType: "ContentModifier" } & ContentModifierRule {
  return rule.ruleType === "ContentModifier";
}

/**
 * Reads and parses every ruleset embedded in the iModel, yielding them lazily.
 *
 * Applies no supplemental/schema filtering — that is the caller's responsibility. Tolerates iModels
 * that do not contain the `PresentationRules.Ruleset` table (e.g. older or empty iModels) by
 * completing without yielding.
 */
async function* loadEmbeddedRulesets(imodelAccess: ECSqlQueryExecutor): AsyncIterableIterator<Ruleset> {
  const reader = imodelAccess.createQueryReader(
    { ecsql: "SELECT JsonProperties FROM PresentationRules.Ruleset" },
    { rowFormat: "Indexes" },
  );
  try {
    for await (const row of reader) {
      yield JSON.parse(row[0]).jsonProperties as Ruleset;
    }
  } catch (error) {
    // The `PresentationRules.Ruleset` class only exists in iModels that have imported the
    // `PresentationRules` schema. Treat its absence as "no embedded rulesets"; surface anything else.
    if (!isPresentationRulesSchemaAbsenceError(error)) {
      throw error;
    }
  }
}

/**
 * Returns whether an error indicates that the `PresentationRules.Ruleset` class is not present in the
 * iModel (i.e. the `PresentationRules` schema has not been imported).
 */
function isPresentationRulesSchemaAbsenceError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.includes("'PresentationRules.Ruleset' does not exist or could not be loaded")
  );
}

/**
 * Returns whether a ruleset is supplemental (contributes to content produced by primary rulesets).
 */
function isSupplementalRuleset(ruleset: Ruleset): boolean {
  return !!ruleset.supplementationInfo;
}

/**
 * A ruleset declares which schemas must be present in the iModel for it to apply. Returns whether the
 * iModel satisfies those requirements. Honors both the current `requiredSchemas` attribute and the
 * deprecated `supportedSchemas` attribute (promoted to versionless requirements).
 */
async function areRulesetSchemaRequirementsMet(imodelAccess: ECSchemaProvider, ruleset: Ruleset): Promise<boolean> {
  if (ruleset.requiredSchemas) {
    return checkRequiredSchemas(imodelAccess, ruleset.requiredSchemas);
  }
  if (ruleset.supportedSchemas) {
    const requiredSchemas = ruleset.supportedSchemas.schemaNames.map((name) => ({ name }));
    return checkRequiredSchemas(imodelAccess, requiredSchemas);
  }
  return true;
}

/**
 * Maps a single `ContentModifier` rule to the fields provider and descriptor transformer it produces.
 */
function mapContentModifierRule(rule: ContentModifierRule): {
  fieldsProvider: IModelFieldsProvider;
  descriptorTransformer: DescriptorTransformer;
} {
  return {
    fieldsProvider: createFieldsProviderFromContentModifierRule({ rule }),
    descriptorTransformer: createDescriptorTransformerFromContentModifierRule({ rule }),
  };
}
