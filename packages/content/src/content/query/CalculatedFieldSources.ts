/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { ECSql } from "@itwin/presentation-shared";
import { ECSQL_PREFIX, PRIMARY_CLASS_ALIAS, substituteExpressionAlias } from "../InternalUtils.js";

import type { DeepReadonly, EC, ECSchemaProvider } from "@itwin/presentation-shared";
import type { ContentSource } from "../ContentTarget.js";
import type { ReadonlyCalculatedField } from "../model/Field.js";

export const SOURCE_CLASS_ALIAS_PREFIX = `${ECSQL_PREFIX}calc_source_`;

/**
 * Joins the primary row once more, typed as a class narrower than the primary class, so expressions
 * declared against that class can reference its properties. Fields sharing a class share the join.
 */
interface SourceClassJoin {
  className: EC.FullClassNameDotNotation;
  alias: string;
}

/** The aliases calculated fields are evaluated against in a source's queries, and the joins they need. */
export interface CalculatedFieldSources {
  /**
   * Field id -> the alias its expression is evaluated against: the primary alias when the primary class
   * is the field's declared class or a subclass of it, otherwise the alias of a `SourceClassJoin`.
   * A field applying to none of the source's classes is absent and has no value in the source's queries.
   */
  aliases: Map<ReadonlyCalculatedField["id"], string>;
  joins: SourceClassJoin[];
}

/**
 * Determines the alias each given calculated field is evaluated against for `source`, and the joins
 * for the aliases other than the primary one.
 */
export async function resolveCalculatedFieldSources(props: {
  schemaProvider: Pick<ECSchemaProvider, "classDerivesFrom">;
  source: Pick<DeepReadonly<ContentSource>, "target" | "resolvedPrimaryClasses">;
  fields: Iterable<Pick<ReadonlyCalculatedField, "id" | "sourceClassName" | "primaryClassNames">>;
}): Promise<CalculatedFieldSources> {
  const { schemaProvider, source } = props;
  const primaryClass = source.target.primaryClass;
  const sourceClasses = source.resolvedPrimaryClasses.length > 0 ? source.resolvedPrimaryClasses : [primaryClass];
  const fieldsById = new Map([...props.fields].map((field) => [field.id, field]));

  // `undefined`: not applicable, `true`: evaluated against the primary alias, `false`: against a joined class.
  const isDirectById = new Map<ReadonlyCalculatedField["id"], boolean | undefined>();
  await Promise.all(
    [...fieldsById.values()].map(async (field) => {
      if (!sourceClasses.some((className) => field.primaryClassNames.includes(className))) {
        isDirectById.set(field.id, undefined);
        return;
      }
      isDirectById.set(
        field.id,
        field.sourceClassName === primaryClass ||
          (await schemaProvider.classDerivesFrom(primaryClass, field.sourceClassName)),
      );
    }),
  );

  const joinedClasses = [
    ...new Set(
      [...fieldsById.values()].flatMap((field) =>
        isDirectById.get(field.id) === false ? [field.sourceClassName] : [],
      ),
    ),
  ].sort();
  const joins = joinedClasses.map((className, index) => ({ className, alias: `${SOURCE_CLASS_ALIAS_PREFIX}${index}` }));
  const aliasByClass = new Map(joins.map((join) => [join.className, join.alias]));

  const aliases = new Map<ReadonlyCalculatedField["id"], string>();
  for (const field of fieldsById.values()) {
    const isDirect = isDirectById.get(field.id);
    if (isDirect !== undefined) {
      aliases.set(field.id, isDirect ? PRIMARY_CLASS_ALIAS : aliasByClass.get(field.sourceClassName)!);
    }
  }
  return { aliases, joins };
}

/** Renders a `SourceClassJoin` onto a query whose primary class is aliased `primaryAlias`. */
export function renderSourceClassJoin(join: SourceClassJoin, primaryAlias: string = PRIMARY_CLASS_ALIAS): string {
  return `LEFT OUTER JOIN ${ECSql.createClassSelector(join.className)} [${join.alias}] ON [${join.alias}].[ECInstanceId] = [${primaryAlias}].[ECInstanceId]`;
}

/**
 * Renders a calculated field's expression evaluated against `alias`. Against a joined class's alias,
 * a primary outside that class yields `NULL` whatever the expression is.
 *
 * The result is a single operand, so callers must not wrap it again.
 */
export function renderCalculatedExpression(props: {
  field: Pick<ReadonlyCalculatedField, "expression" | "targetAlias">;
  alias: string;
  primaryAlias?: string;
}): string {
  const { field, alias, primaryAlias = PRIMARY_CLASS_ALIAS } = props;
  const expression = substituteExpressionAlias({
    expression: field.expression,
    fromAlias: field.targetAlias ?? primaryAlias,
    toAlias: alias,
  });
  return alias === primaryAlias
    ? `(${expression})`
    : `IIF([${alias}].[ECInstanceId] IS NOT NULL, (${expression}), NULL)`;
}
