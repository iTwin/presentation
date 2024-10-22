/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { ConcatenatedValue } from "./ConcatenatedValue.js";
import {
  createConcatenatedValueJsonSelector,
  createRawPropertyValueSelector,
  TypedValueSelectClauseProps,
} from "./ecsql-snippets/ECSqlValueSelectorSnippets.js";
import { ECClassHierarchyInspector } from "./Metadata.js";

/**
 * Props for `IInstanceLabelSelectClauseFactory.createSelectClause`.
 * @beta
 */
interface CreateInstanceLabelSelectClauseProps {
  /**
   * Alias of an ECSQL class referring to the target instance whose label should be selected.
   *
   * Example:
   * ```ts
   * const selectClause = `
   *   SELECT ${await factory.createSelectClause({ classAlias: "x" })}
   *   FROM bis.GeometricElement3d AS x
   * `;
   * ```
   */
  classAlias: string;

  /**
   * An optional full name of the class whose instance label is to be selected.
   *
   * The attribute's purpose is purely for optimization and `IInstanceLabelSelectClauseFactory` should not
   * rely on this to be set to a leaf class or set at all. However, when this name is provided, some factory
   * implementations may be able to create a more efficient select clause (e.g. drop some pieces of clause
   * that don't apply for given class).
   */
  className?: string;

  /**
   * An optional function for concatenating multiple `TypedValueSelectClauseProps`. Selectors' concatenation
   * is used when a label consists of multiple pieces, e.g.:
   * - `[` - string,
   * - `this.PropertyX` - property value selector,
   * - `]` - string.
   *
   * It's concatenator's job to serialize those pieces into a single selector and, depending on the use case,
   * it may do that in multiple ways. For example:
   *
   * - `createConcatenatedValueJsonSelector` serializes parts into a JSON array selector. This allows the array to
   *   be parsed after the query is run, where each part can be handled individually without losing its metadata.
   *   This is the default value.
   *
   * - `createConcatenatedValueStringSelector` concatenates parts into a string using SQLite's `||` operator. While
   *   this way of concatenation looses metadata (thus disabling formatting of the values), it tries to produce the
   *   value to be as close as possible to the formatted one. This concatenator may be used to create a label for using
   *   in the query `WHERE` clause.
   *
   * @see `createConcatenatedValueJsonSelector`
   * @see `createConcatenatedValueStringSelector`
   */
  selectorsConcatenator?: (selectors: TypedValueSelectClauseProps[], checkSelector?: string) => string;
}

/**
 * An interface for a factory that knows how create instance label select clauses.
 * @see `createDefaultInstanceLabelSelectClauseFactory`
 * @see `createClassBasedInstanceLabelSelectClauseFactory`
 * @see `createBisInstanceLabelSelectClauseFactory`
 * @beta
 */
export interface IInstanceLabelSelectClauseFactory {
  /** Creates a select clause for an instance label. */
  createSelectClause(props: CreateInstanceLabelSelectClauseProps): Promise<string>;
}

/**
 * Parses an instance label from query result into a string or a `ConcatenatedValue`. The latter type of result
 * is expected when label selector is created using `IInstanceLabelSelectClauseFactory.createSelectClause` with
 * `createConcatenatedValueJsonSelector`.
 *
 * @beta
 */
export function parseInstanceLabel(value: string | undefined): ConcatenatedValue | string {
  if (!value) {
    return "";
  }
  if ((value.startsWith("[") && value.endsWith("]")) || (value.startsWith("{") && value.endsWith("}"))) {
    try {
      return JSON.parse(value);
    } catch {
      // fall through
    }
  }
  // not a JSON object/array
  return value;
}

/**
 * Creates a label select clause in a format `Class label [base36(briefcase id)-base36(local id)]`, where
 * local and briefcase IDs are calculated based on ECInstance ID:
 * - `{briefcase id} = ECInstanceId >> 40`
 * - `{local id} = ECInstanceId & (1 << 40 - 1)`
 *
 * @see https://www.itwinjs.org/presentation/advanced/defaultbisrules/#label-overrides
 * @beta
 */
export function createDefaultInstanceLabelSelectClauseFactory(): IInstanceLabelSelectClauseFactory {
  return {
    async createSelectClause(props: CreateInstanceLabelSelectClauseProps): Promise<string> {
      return `(
        SELECT
          ${concatenate(props, [
            {
              selector: `COALESCE(
                ${createRawPropertyValueSelector("c", "DisplayLabel")},
                ${createRawPropertyValueSelector("c", "Name")}
              )`,
            },
            ...createECInstanceIdSuffixSelectors(props.classAlias),
          ])}
        FROM [meta].[ECClassDef] AS [c]
        WHERE [c].[ECInstanceId] = ${createRawPropertyValueSelector(props.classAlias, "ECClassId")}
      )`;
    },
  };
}

/**
 * An association of a class and an instance label select clause factory method.
 * @beta
 */
interface ClassBasedLabelSelectClause {
  /** Full class name */
  className: string;
  /** A factory method to create an instance label select clause */
  clause: (props: CreateInstanceLabelSelectClauseProps) => Promise<string>;
}

/**
 * Props for `createClassBasedInstanceLabelSelectClauseFactory`.
 * @beta
 */
interface ClassBasedInstanceLabelSelectClauseFactoryProps {
  /** Access to ECClass hierarchy in the iModel. */
  classHierarchyInspector: ECClassHierarchyInspector;

  /**
   * A prioritized list of instance label selectors associated to classes they should be applied to.
   *
   * Because the list may contain clauses for classes in the same class hierarchy, and the factory
   * handles them in given order, the order of clauses should be from the most specific class to the
   * most general one.
   */
  clauses: ClassBasedLabelSelectClause[];

  /**
   * A fallback label clause factory for when class-based factory doesn't produce a label.
   * Defaults to the result of `createDefaultInstanceLabelSelectClauseFactory`.
   */
  defaultClauseFactory?: IInstanceLabelSelectClauseFactory;
}

/**
 * Creates an instance label select clause based on its class.
 * @beta
 */
export function createClassBasedInstanceLabelSelectClauseFactory(props: ClassBasedInstanceLabelSelectClauseFactoryProps): IInstanceLabelSelectClauseFactory {
  const { classHierarchyInspector, clauses: labelClausesByClass } = props;
  const defaultClauseFactory = props.defaultClauseFactory ?? createDefaultInstanceLabelSelectClauseFactory();
  async function getLabelClausesForClass(queryClassName: string) {
    const matchingLabelClauses = await Promise.all(
      labelClausesByClass.map(async (entry) => {
        if (await classHierarchyInspector.classDerivesFrom(entry.className, queryClassName)) {
          // label selector is intended for a more specific class than we're selecting from - need to include it
          // as query results (on polymorphic select) are going to include more specific class instances too
          return entry;
        }
        if (await classHierarchyInspector.classDerivesFrom(queryClassName, entry.className)) {
          // label selector is intended for a base class of what query is selecting - need to include it as
          // we want base class label selectors to apply to subclass instances
          return entry;
        }
        return undefined;
      }),
    );
    function filterNotUndefined<T>(x: T | undefined): x is T {
      return !!x;
    }
    return matchingLabelClauses.filter(filterNotUndefined);
  }
  return {
    async createSelectClause(clauseProps: CreateInstanceLabelSelectClauseProps): Promise<string> {
      if (labelClausesByClass.length === 0) {
        return defaultClauseFactory.createSelectClause(clauseProps);
      }

      const labelClausePromises = clauseProps.className ? await getLabelClausesForClass(clauseProps.className) : labelClausesByClass;
      if (labelClausePromises.length === 0) {
        return defaultClauseFactory.createSelectClause(clauseProps);
      }

      const labelClauses = await Promise.all(
        labelClausePromises.map(async ({ className, clause }) => ({
          className,
          clause: await clause(clauseProps),
        })),
      );

      return `COALESCE(
        ${labelClauses
          .map(({ className, clause }) =>
            `
              IIF(
                ${createRawPropertyValueSelector(clauseProps.classAlias, "ECClassId")} IS (${className}),
                ${clause.trim()},
                NULL
              )
            `.trim(),
          )
          .join(", ")},
        ${await defaultClauseFactory.createSelectClause(clauseProps)}
      )`;
    },
  };
}

/**
 * Props for `createBisInstanceLabelSelectClauseFactory`.
 * @beta
 */
interface BisInstanceLabelSelectClauseFactoryProps {
  classHierarchyInspector: ECClassHierarchyInspector;
}

/**
 * Creates a label select clause according to BIS instance label rules.
 * @see https://www.itwinjs.org/presentation/advanced/defaultbisrules/#label-overrides
 * @beta
 */
export function createBisInstanceLabelSelectClauseFactory(props: BisInstanceLabelSelectClauseFactoryProps): IInstanceLabelSelectClauseFactory {
  const clauses: ClassBasedLabelSelectClause[] = [];
  const factory = createClassBasedInstanceLabelSelectClauseFactory({
    classHierarchyInspector: props.classHierarchyInspector,
    clauses,
  });
  clauses.push(
    {
      className: "BisCore.GeometricElement",
      clause: async ({ classAlias, ...rest }) => `
        COALESCE(
          ${createRawPropertyValueSelector(classAlias, "CodeValue")},
          ${concatenate(
            rest,
            [{ selector: createRawPropertyValueSelector(classAlias, "UserLabel") }, ...createECInstanceIdSuffixSelectors(classAlias)],
            `${createRawPropertyValueSelector(classAlias, "UserLabel")} IS NOT NULL`,
          )}
        )
      `,
    },
    {
      className: "BisCore.Element",
      clause: async ({ classAlias }) => `
        COALESCE(
          ${createRawPropertyValueSelector(classAlias, "UserLabel")},
          ${createRawPropertyValueSelector(classAlias, "CodeValue")}
        )
      `,
    },
    {
      className: "BisCore.Model",
      clause: async ({ classAlias, ...rest }) => `(
        SELECT ${await factory.createSelectClause({ ...rest, classAlias: "e", className: "BisCore.Element" })}
        FROM [bis].[Element] AS [e]
        WHERE [e].[ECInstanceId] = ${createRawPropertyValueSelector(classAlias, "ModeledElement", "Id")}
      )`,
    },
  );
  return factory;
}

function createECInstanceIdSuffixSelectors(classAlias: string): TypedValueSelectClauseProps[] {
  return [
    { value: ` [`, type: "String" },
    { selector: `CAST(base36(${createRawPropertyValueSelector(classAlias, "ECInstanceId")} >> 40) AS TEXT)` },
    { value: `-`, type: "String" },
    { selector: `CAST(base36(${createRawPropertyValueSelector(classAlias, "ECInstanceId")} & ((1 << 40) - 1)) AS TEXT)` },
    { value: `]`, type: "String" },
  ];
}

function concatenate(
  props: { selectorsConcatenator?: (selectors: TypedValueSelectClauseProps[], checkSelector?: string) => string },
  selectors: TypedValueSelectClauseProps[],
  checkSelector?: string,
): string {
  return (props.selectorsConcatenator ?? createConcatenatedValueJsonSelector)(selectors, checkSelector);
}
