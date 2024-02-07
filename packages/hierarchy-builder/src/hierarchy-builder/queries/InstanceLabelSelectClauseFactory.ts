/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { IMetadataProvider } from "../ECMetadata";
import { getClass } from "../internal/Common";
import { createConcatenatedValueJsonSelector, createRawPropertyValueSelector, TypedValueSelectClauseProps } from "./ecsql-snippets/ECSqlValueSelectorSnippets";

/**
 * Props for [[IInstanceLabelSelectClauseFactory.createSelectClause]].
 * @beta
 */
export interface CreateInstanceLabelSelectClauseProps {
  /**
   * Alias of an ECSQL class referring to the target instance whole label should be selected.
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
   * An optional full name of a class whose instance label is to be selected.
   *
   * The attribute's purpose is purely for optimization and `IInstanceLabelSelectClauseFactory` should not
   * rely on this to be set to a leaf class or set at all. However, when this name is provided, some factory
   * implementations may be able to create a more efficient select clause (e.g. drop some pieces of clause
   * that don't apply for given class).
   */
  className?: string;

  /**
   * An optional function for concatenating multiple [[TypedValueSelectClauseProps]]. Selectors' concatenation
   * is used when a label consists of multiple pieces, e.g.:
   * - `[` - string,
   * - `this.PropertyX` - property value selector,
   * - `]` - string.
   *
   * It's concatenator's job to serialize those pieces into a single selector and, depending on the use case,
   * it may do that in multiple ways.
   *
   * - [[createConcatenatedValueJsonSelector]] serializes parts into a JSON array. This allows the array to
   *   be parsed after the query is run, where each part can be handled individually without losing its metadata.
   *   This is the default value.
   *
   * - [[createConcatenatedValueStringSelector]] concatenates parts into a string using SQLite's `||` operator. While
   *   this way of concatenation looses metadata (thus disabling formatting of the values), it tries to produce the
   *   value to be as close as possible to the formatted one. This concatenator may be used to create a label for using
   *   in the query `WHERE` clause, for example.
   *
   * @see createConcatenatedValueJsonSelector
   * @see createConcatenatedValueStringSelector
   */
  selectorsConcatenator?: (selectors: TypedValueSelectClauseProps[], checkSelector?: string) => string;
}

/**
 * An interface for a factory that knows how create instance label select clauses.
 * @beta
 */
export interface IInstanceLabelSelectClauseFactory {
  /** Creates a select clause for an instance label. */
  createSelectClause(props: CreateInstanceLabelSelectClauseProps): Promise<string>;
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
export class DefaultInstanceLabelSelectClauseFactory implements IInstanceLabelSelectClauseFactory {
  public async createSelectClause(props: CreateInstanceLabelSelectClauseProps): Promise<string> {
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
  }
}

/**
 * An association of a class and an instance label select clause factory method.
 * @beta
 */
export interface ClassBasedLabelSelectClause {
  /** Full class name */
  className: string;
  /** A factory method to create an instance label select clause */
  clause: (props: CreateInstanceLabelSelectClauseProps) => Promise<string>;
}

/**
 * Props for [[ClassBasedInstanceLabelSelectClauseFactory]].
 * @beta
 */
export interface ClassBasedInstanceLabelSelectClauseFactoryProps {
  /** Access to iModel metadata */
  metadataProvider: IMetadataProvider;

  /** A list of instance label selectors associated to classes they should be applied to */
  clauses: ClassBasedLabelSelectClause[];

  /**
   * A fallback label clause factory for when [[ClassBasedInstanceLabelSelectClauseFactory]] doesn't produce a label.
   * Defaults to [[DefaultInstanceLabelSelectClauseFactory]].
   */
  defaultClauseFactory?: IInstanceLabelSelectClauseFactory;
}

/**
 * Creates an instance label select clause based on its class.
 * @beta
 */
export class ClassBasedInstanceLabelSelectClauseFactory implements IInstanceLabelSelectClauseFactory {
  private _defaultFactory: IInstanceLabelSelectClauseFactory;
  private _labelClausesByClass: ClassBasedLabelSelectClause[];
  private _metadataProvider: IMetadataProvider;

  public constructor(props: ClassBasedInstanceLabelSelectClauseFactoryProps) {
    // istanbul ignore next
    this._defaultFactory = props.defaultClauseFactory ?? new DefaultInstanceLabelSelectClauseFactory();
    this._labelClausesByClass = props.clauses;
    this._metadataProvider = props.metadataProvider;
  }

  public async createSelectClause(props: CreateInstanceLabelSelectClauseProps): Promise<string> {
    if (this._labelClausesByClass.length === 0) {
      return this._defaultFactory.createSelectClause(props);
    }

    const labelClausePromises = props.className ? await this.getLabelClausesForClass(props.className) : this._labelClausesByClass;
    if (labelClausePromises.length === 0) {
      return this._defaultFactory.createSelectClause(props);
    }

    const labelClauses = await Promise.all(
      labelClausePromises.map(async ({ className, clause }) => ({
        className,
        clause: await clause(props),
      })),
    );

    return `COALESCE(
      ${labelClauses
        .map(({ className, clause }) =>
          `
            IIF(
              ${createRawPropertyValueSelector(props.classAlias, "ECClassId")} IS (${className}),
              ${clause.trim()},
              NULL
            )
          `.trim(),
        )
        .join(", ")},
      ${await this._defaultFactory.createSelectClause(props)}
    )`;
  }

  private async getLabelClausesForClass(queryClassName: string) {
    const queryClass = await getClass(this._metadataProvider, queryClassName);
    const matchingLabelClauses = await Promise.all(
      this._labelClausesByClass.map(async (entry) => {
        const clauseClass = await getClass(this._metadataProvider, entry.className);
        if (await clauseClass.is(queryClass)) {
          // label selector is intended for a more specific class than we're selecting from - need to include it
          // as query results (on polymorphic select) are going to include more specific class instances too
          return entry;
        }
        if (await queryClass.is(clauseClass)) {
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
}

/**
 * Props for [[BisInstanceLabelSelectClauseFactory]].
 * @beta
 */
export interface BisInstanceLabelSelectClauseFactoryProps {
  metadataProvider: IMetadataProvider;
}

/**
 * Creates a label select clause according to BIS instance label rules.
 *
 * @see https://www.itwinjs.org/presentation/advanced/defaultbisrules/#label-overrides
 * @beta
 */
export class BisInstanceLabelSelectClauseFactory implements IInstanceLabelSelectClauseFactory {
  private _impl: ClassBasedInstanceLabelSelectClauseFactory;
  public constructor(props: BisInstanceLabelSelectClauseFactoryProps) {
    this._impl = new ClassBasedInstanceLabelSelectClauseFactory({
      metadataProvider: props.metadataProvider,
      clauses: [
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
            SELECT ${await this.createSelectClause({ ...rest, classAlias: "e", className: "BisCore.Element" })}
            FROM [bis].[Element] AS [e]
            WHERE [e].[ECInstanceId] = ${createRawPropertyValueSelector(classAlias, "ModeledElement", "Id")}
          )`,
        },
      ],
    });
  }

  public async createSelectClause(props: CreateInstanceLabelSelectClauseProps) {
    return this._impl.createSelectClause(props);
  }
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
