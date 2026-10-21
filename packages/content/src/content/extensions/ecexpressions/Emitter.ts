/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { ECSql, normalizeFullClassName } from "@itwin/presentation-shared";
import { ECSQL_PREFIX, PRIMARY_CLASS_ALIAS } from "../../InternalUtils.js";

import type { Id64String } from "@itwin/core-bentley";
import type { EC, ECSqlBinding, IInstanceLabelSelectClauseFactory } from "@itwin/presentation-shared";
import type {
  AnyMatchesNode,
  BinaryNode,
  CallNode,
  LambdaNode,
  LiteralNode,
  Node,
  PropertyNode,
  UnaryNode,
} from "./Parser.js";

/**
 * A nested map of resolved symbol member values. Leaf members are `string` or `number`; nested objects
 * represent further member access (e.g. `{ Parent: { ECInstanceId: "0x1" } }` for `ParentNode.Parent.ECInstanceId`).
 * @internal
 */
export interface SymbolValues {
  [member: string]: string | number | SymbolValues;
}

/**
 * Options controlling how an ECExpression AST is emitted to ECSQL.
 * @internal
 */
export interface EmitterOptions {
  primaryClassAlias?: string;
  primaryClassName?: EC.FullClassNameDotNotation;
  labelSelectClauseFactory?: IInstanceLabelSelectClauseFactory;
  context?: { getSelectedInstanceIds?: () => Id64String[]; resolveRoot?: (root: string) => SymbolValues | undefined };
}

const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * The ECExpression grammar's root symbol for the primary/current instance — the literal token a
 * consumer writes (e.g. `this.PropertyName`). It is a fixed part of the expression language, so it
 * stays `"this"` regardless of the actual SQL alias ({@link PRIMARY_CLASS_ALIAS}) the root maps to.
 */
const PRIMARY_INSTANCE_ROOT = "this";

const BUILTIN_FUNCTIONS = toLowerCaseValues({
  isOfClass: "IsOfClass",
  getDisplayLabel: "GetDisplayLabel",
  getECClassId: "GetECClassId",
  iif: "IIf",
  isNull: "IsNull",
  ifNull: "IfNull",
  hasRelatedInstance: "HasRelatedInstance",
  getRelatedInstancesCount: "GetRelatedInstancesCount",
  getRelatedValue: "GetRelatedValue",
  getRelatedDisplayLabel: "GetRelatedDisplayLabel",
  set: "Set",
});

const RELATED_FUNCTIONS = new Set([
  BUILTIN_FUNCTIONS.hasRelatedInstance,
  BUILTIN_FUNCTIONS.getRelatedInstancesCount,
  BUILTIN_FUNCTIONS.getRelatedValue,
  BUILTIN_FUNCTIONS.getRelatedDisplayLabel,
]);

const BUILTIN_UNSUPPORTED_FUNCTIONS = new Set(
  [
    "GetVariableStringValue",
    "GetVariableBoolValue",
    "GetVariableIntValue",
    "GetVariableIntValues",
    "HasVariable",
    "GetLabelDisplayValue",
    "GetFormattedValue",
    "CompareDateTimes",
    "GetSettingValue",
    "GetSettingIntValue",
    "GetSettingIntValues",
    "GetSettingBoolValue",
    "GetSettingStringValue",
    "HasSetting",
  ].map((name) => name.toLowerCase()),
);

/**
 * Walks an ECExpression AST and produces an ECSQL fragment plus any generated bindings.
 * @internal
 */
export class Emitter {
  readonly #primaryClassAlias: string;
  readonly #primaryClassName?: EC.FullClassNameDotNotation;
  readonly #labelFactory?: IInstanceLabelSelectClauseFactory;
  readonly #getSelectedInstanceIds?: () => Id64String[];
  readonly #resolveRoot?: (root: string) => SymbolValues | undefined;

  readonly #bindings: Record<string, ECSqlBinding> = {};
  readonly #paramSubstitutions = new Map<string, string>();
  #bindingIndex = 0;

  private constructor(options: EmitterOptions) {
    this.#primaryClassAlias = options.primaryClassAlias ?? PRIMARY_CLASS_ALIAS;
    this.#primaryClassName = options.primaryClassName;
    this.#labelFactory = options.labelSelectClauseFactory;
    this.#getSelectedInstanceIds = options.context?.getSelectedInstanceIds;
    this.#resolveRoot = options.context?.resolveRoot;
  }

  /**
   * Emits the ECSQL fragment for the given AST node together with any bindings generated while doing so.
   * Bindings are omitted from the result when none were generated.
   */
  public static async convert(
    node: Node,
    options: EmitterOptions = {},
  ): Promise<{ ecsql: string; bindings?: Record<string, ECSqlBinding> }> {
    const emitter = new Emitter(options);
    const ecsql = await emitter.#emit(node);
    return Object.keys(emitter.#bindings).length > 0 ? { ecsql, bindings: emitter.#bindings } : { ecsql };
  }

  async #emit(node: Node): Promise<string> {
    switch (node.kind) {
      case "literal":
        return this.#emitLiteral(node);
      case "paren":
        return `(${await this.#emit(node.expr)})`;
      case "property":
        return this.#emitProperty(node);
      case "unary":
        return this.#emitUnary(node);
      case "binary":
        return this.#emitBinary(node);
      case "call":
        return this.#emitCall(node);
      case "anyMatches":
        return this.#emitAnyMatches(node);
      /* v8 ignore next 2 -- defensive: lambdas only appear inside call argument lists, never as standalone nodes */
      case "lambda":
        throw new Error("Unexpected lambda expression outside of a supported context.");
    }
  }

  #addBinding(binding: ECSqlBinding): string {
    const name = `${ECSQL_PREFIX}expr${this.#bindingIndex++}`;
    this.#bindings[name] = binding;
    return `:${name}`;
  }

  #emitLiteral(node: LiteralNode): string {
    switch (node.type) {
      case "bool":
        return node.value ? "TRUE" : "FALSE";
      case "null":
        return "NULL";
      case "int":
      case "double":
        return node.value;
      case "string":
        return this.#addBinding({ type: "string", value: node.value });
    }
  }

  #emitProperty(node: PropertyNode): string {
    const substitution = this.#paramSubstitutions.get(node.root);
    if (substitution !== undefined) {
      return substitution;
    }
    const symbols = this.#resolveRoot?.(node.root);
    if (symbols) {
      let current: string | number | SymbolValues = symbols;
      for (const segment of node.path) {
        if (typeof current !== "object" || !(segment in current)) {
          throw new Error(`Unable to resolve symbol '${node.root}.${node.path.join(".")}'.`);
        }
        current = current[segment];
      }
      if (typeof current === "object") {
        throw new Error(`Unable to resolve symbol '${node.root}.${node.path.join(".")}'.`);
      }
      return this.#bindResolvedValue(current);
    }
    return this.#mapProperty(node.root, node.path);
  }

  #mapProperty(root: string, path: string[]): string {
    return [root === PRIMARY_INSTANCE_ROOT ? this.#primaryClassAlias : root, ...path]
      .map((segment) => bracket(segment))
      .join(".");
  }

  #bindResolvedValue(value: string | number): string {
    if (typeof value === "number") {
      return this.#addBinding({ type: Number.isInteger(value) ? "int" : "double", value });
    }
    return this.#addBinding({ type: "string", value });
  }

  async #emitUnary(node: UnaryNode): Promise<string> {
    const operand = await this.#emit(node.operand);
    return node.op === "-" ? `-${operand}` : `NOT ${operand}`;
  }

  async #emitBinary(node: BinaryNode): Promise<string> {
    if (node.op === "=" || node.op === "<>") {
      if (isNullLiteral(node.right)) {
        const operand = await this.#emit(node.left);
        return `${operand} ${node.op === "=" ? "IS NULL" : "IS NOT NULL"}`;
      }
      if (isNullLiteral(node.left)) {
        const operand = await this.#emit(node.right);
        return `${operand} ${node.op === "=" ? "IS NULL" : "IS NOT NULL"}`;
      }
    }

    const left = await this.#emit(node.left);
    const right = await this.#emit(node.right);
    switch (node.op) {
      case "and":
        return `${left} AND ${right}`;
      case "or":
        return `${left} OR ${right}`;
      case "mod":
        return `${left} % ${right}`;
      case "&":
        return `${left} || ${right}`;
      case "\\":
        return `CAST(${left} / ${right} AS INTEGER)`;
      case "~":
        return `CAST(${left} AS TEXT) LIKE ${right} ESCAPE '\\'`;
      default:
        return `${left} ${node.op} ${right}`;
    }
  }

  async #emitCall(node: CallNode): Promise<string> {
    const lower = node.name.toLowerCase();

    if (RELATED_FUNCTIONS.has(lower)) {
      return this.#emitRelated(node);
    }
    if (lower === BUILTIN_FUNCTIONS.isOfClass) {
      return this.#emitIsOfClass(node);
    }
    if (lower === BUILTIN_FUNCTIONS.getDisplayLabel) {
      return this.#emitGetDisplayLabel(node);
    }
    if (lower === BUILTIN_FUNCTIONS.getECClassId) {
      return `ec_classid(${await this.#emitArgs(node.args)})`;
    }
    if (lower === BUILTIN_FUNCTIONS.iif) {
      return `IIF(${await this.#emitArgs(node.args)})`;
    }
    if (lower === BUILTIN_FUNCTIONS.isNull) {
      if (node.args.length !== 1) {
        throw new Error("`IsNull` expects a single argument.");
      }
      return `(${await this.#emit(node.args[0])}) IS NULL`;
    }
    if (lower === BUILTIN_FUNCTIONS.ifNull) {
      return `IFNULL(${await this.#emitArgs(node.args)})`;
    }

    if (this.#isUnsupportedFunction(lower)) {
      throw new Error(`Function '${node.name}' is not supported.`);
    }

    if (node.receiver) {
      throw new Error(`Unsupported method '${node.name}'.`);
    }
    /* v8 ignore next 3 -- defensive: call names always originate from identifier tokens */
    if (!IDENTIFIER_PATTERN.test(node.name)) {
      throw new Error(`Invalid function name '${node.name}'.`);
    }
    return `${node.name}(${await this.#emitArgs(node.args)})`;
  }

  #isUnsupportedFunction(lowerName: string): boolean {
    return BUILTIN_UNSUPPORTED_FUNCTIONS.has(lowerName);
  }

  async #emitArgs(args: Node[]): Promise<string> {
    const parts: string[] = [];
    for (const arg of args) {
      if (arg.kind === "lambda") {
        throw new Error("Unexpected lambda argument.");
      }
      parts.push(await this.#emit(arg));
    }
    return parts.join(", ");
  }

  async #emitRelated(node: CallNode): Promise<string> {
    if (!node.receiver) {
      throw new Error(`'${node.name}' must be called on an instance (e.g. \`this.${node.name}(...)\`).`);
    }
    const lower = node.name.toLowerCase();
    const lambda = node.args.find((arg): arg is LambdaNode => arg.kind === "lambda");

    if (lambda) {
      const strings = node.args.filter((arg) => arg.kind !== "lambda");
      const lambdaClass = normalizeFullClassName(asStringLiteral(strings[0]));
      const alias = lambda.param;
      const where = await this.#emit(lambda.body);
      const lambdaFrom = `FROM ${ECSql.createClassSelector(lambdaClass)} ${bracket(alias)} WHERE ${where}`;
      switch (lower) {
        case BUILTIN_FUNCTIONS.hasRelatedInstance:
          return `EXISTS (SELECT 1 ${lambdaFrom})`;
        case BUILTIN_FUNCTIONS.getRelatedInstancesCount:
          return `(SELECT COUNT(1) ${lambdaFrom})`;
        case BUILTIN_FUNCTIONS.getRelatedValue:
          return `(SELECT ${bracketPath(alias, asStringLiteral(strings[1]))} ${lambdaFrom} LIMIT 1)`;
        case BUILTIN_FUNCTIONS.getRelatedDisplayLabel:
          return `(SELECT ${await this.#labelClause(alias, lambdaClass)} ${lambdaFrom} LIMIT 1)`;
      }
    }

    const relationship = normalizeFullClassName(asStringLiteral(node.args[0]));
    const direction = asStringLiteral(node.args[1]);
    const relatedClass = normalizeFullClassName(asStringLiteral(node.args[2]));
    const forward = validateDirection(direction);
    const receiver = this.#mapProperty(node.receiver.root, node.receiver.path);
    const relatedEnd = forward ? "Target" : "Source";
    const receiverEnd = forward ? "Source" : "Target";
    const from = `
      FROM ${ECSql.createClassSelector(relationship)} ${bracket("relationship")}
      JOIN ${ECSql.createClassSelector(relatedClass)} ${bracket("related")}
        ON [related].[ECClassId] = [relationship].[${relatedEnd}ECClassId] AND [related].[ECInstanceId] = [relationship].[${relatedEnd}ECInstanceId]
      WHERE [relationship].[${receiverEnd}ECClassId] = ${receiver}.[ECClassId] AND [relationship].[${receiverEnd}ECInstanceId] = ${receiver}.[ECInstanceId]
    `;

    switch (lower) {
      case BUILTIN_FUNCTIONS.hasRelatedInstance:
        return `EXISTS (SELECT 1 ${from})`;
      case BUILTIN_FUNCTIONS.getRelatedInstancesCount:
        return `(SELECT COUNT(1) ${from})`;
      case BUILTIN_FUNCTIONS.getRelatedValue:
        return `(SELECT ${bracketPath("related", asStringLiteral(node.args[3]))} ${from} LIMIT 1)`;
      case BUILTIN_FUNCTIONS.getRelatedDisplayLabel:
        return `(SELECT ${await this.#labelClause("related", relatedClass)} ${from} LIMIT 1)`;
      /* v8 ignore next 2 -- defensive: lower is always one of RELATED_FUNCTIONS */
      default:
        throw new Error(`Unsupported related-instance function '${node.name}'.`);
    }
  }

  #emitIsOfClass(node: CallNode): string {
    if (!node.receiver) {
      throw new Error("`IsOfClass` must be called on an instance (e.g. `this.IsOfClass(...)`).");
    }
    if (node.args.length === 2 && isStringLiteral(node.args[0]) && isStringLiteral(node.args[1])) {
      const className = validatedIdentifier(node.args[0].value);
      const schemaName = validatedIdentifier(node.args[1].value);
      const receiver = this.#mapProperty(node.receiver.root, node.receiver.path);
      return `${receiver}.[ECClassId] IS (${schemaName}.${className})`;
    }
    throw new Error("`IsOfClass` id overload is not supported.");
  }

  async #emitGetDisplayLabel(node: CallNode): Promise<string> {
    if (!node.receiver) {
      throw new Error("`GetDisplayLabel` must be called on an instance (e.g. `this.GetDisplayLabel()`).");
    }
    const root = node.receiver.root;
    const alias = root === PRIMARY_INSTANCE_ROOT ? this.#primaryClassAlias : root;
    const className = root === PRIMARY_INSTANCE_ROOT ? this.#primaryClassName : undefined;
    return this.#labelClause(alias, className);
  }

  async #labelClause(classAlias: string, className?: EC.FullClassNameDotNotation): Promise<string> {
    if (!this.#labelFactory) {
      throw new Error("Generating an instance label requires a `labelSelectClauseFactory` option.");
    }
    return this.#labelFactory.createSelectClause({
      classAlias,
      className,
      selectorsConcatenator: ECSql.createConcatenatedValueStringSelector,
    });
  }

  async #emitAnyMatches(node: AnyMatchesNode): Promise<string> {
    const items = this.#resolveListItems(node.source);
    if (items.length === 0) {
      return "FALSE";
    }

    const equality = detectEquality(node.condition, node.param);
    if (equality) {
      const expr = await this.#emit(equality.otherSide);
      const names = items.map((binding) => this.#addBinding(binding));
      return `${expr} IN (${names.join(", ")})`;
    }

    // When the condition does not reference the lambda parameter, its truth value is the same for
    // every item. Since an empty list is already handled above, the result for a non-empty list is
    // simply the condition evaluated once (repeating it per item would be redundant and would emit
    // bindings for the — unused — list values).
    if (!referencesParam(node.condition, node.param)) {
      return `(${await this.#emit(node.condition)})`;
    }

    const parts: string[] = [];
    for (const binding of items) {
      const name = this.#addBinding(binding);
      this.#paramSubstitutions.set(node.param, name);
      try {
        parts.push(await this.#emit(node.condition));
      } finally {
        this.#paramSubstitutions.delete(node.param);
      }
    }
    return `(${parts.join(" OR ")})`;
  }

  #resolveListItems(source: Node): ECSqlBinding[] {
    if (source.kind === "call") {
      const lower = source.name.toLowerCase();
      if (lower === BUILTIN_FUNCTIONS.set) {
        return source.args.map((arg) => {
          if (arg.kind !== "literal") {
            throw new Error("`Set(...)` items must be literal values.");
          }
          return literalToBinding(arg);
        });
      }
      if (this.#isUnsupportedFunction(lower)) {
        throw new Error(`Function '${source.name}' is not supported.`);
      }
    }
    if (source.kind === "property" && source.root === "SelectedInstanceKeys" && source.path.length === 0) {
      if (!this.#getSelectedInstanceIds) {
        throw new Error("`SelectedInstanceKeys` requires a `getSelectedInstanceIds` context hook.");
      }
      return this.#getSelectedInstanceIds().map((value) => ({ type: "id", value }));
    }
    throw new Error("Unsupported `AnyMatches` list source.");
  }
}

function bracket(identifier: string): string {
  return `[${validatedIdentifier(identifier)}]`;
}

function bracketPath(alias: string, dottedProperty: string): string {
  return [alias, ...dottedProperty.split(".")].map((segment) => bracket(segment)).join(".");
}

function validatedIdentifier(identifier: string): string {
  if (!IDENTIFIER_PATTERN.test(identifier)) {
    throw new Error(`Invalid identifier '${identifier}'.`);
  }
  return identifier;
}

function validateDirection(direction: string): boolean {
  const lower = direction.toLowerCase();
  if (lower === "forward") {
    return true;
  }
  if (lower === "backward") {
    return false;
  }
  throw new Error(`Invalid relationship direction '${direction}'; expected 'Forward' or 'Backward'.`);
}

function isStringLiteral(node: Node): node is Extract<LiteralNode, { type: "string" }> {
  return node.kind === "literal" && node.type === "string";
}

function asStringLiteral(node: Node | undefined): string {
  if (!node || !isStringLiteral(node)) {
    throw new Error("Expected a string literal argument.");
  }
  return node.value;
}

function isNullLiteral(node: Node): boolean {
  return node.kind === "literal" && node.type === "null";
}

function literalToBinding(node: LiteralNode): ECSqlBinding {
  switch (node.type) {
    case "string":
      return { type: "string", value: node.value };
    case "int":
      return { type: "int", value: Number(node.value) };
    case "double":
      return { type: "double", value: Number(node.value) };
    case "bool":
      return { type: "boolean", value: node.value };
    case "null":
      return { type: "string", value: undefined };
  }
}

function detectEquality(condition: Node, param: string): { otherSide: Node } | undefined {
  if (condition.kind !== "binary" || condition.op !== "=") {
    return undefined;
  }
  const leftIsParam = isParamReference(condition.left, param);
  const rightIsParam = isParamReference(condition.right, param);
  if (leftIsParam === rightIsParam) {
    return undefined;
  }
  return { otherSide: leftIsParam ? condition.right : condition.left };
}

function isParamReference(node: Node, param: string): boolean {
  return node.kind === "property" && node.root === param;
}

/**
 * Whether the given AST subtree references the lambda `param` (as the root of any property access).
 * Traverses the node generically so every nested position (operands, arguments, sub-conditions) is covered.
 */
function referencesParam(node: unknown, param: string): boolean {
  if (Array.isArray(node)) {
    return node.some((child) => referencesParam(child, param));
  }
  if (node !== null && typeof node === "object") {
    const record = node as Record<string, unknown>;
    if (record.kind === "property" && record.root === param) {
      return true;
    }
    return Object.values(record).some((value) => referencesParam(value, param));
  }
  return false;
}

function toLowerCaseValues<T extends Record<string, string>>(names: T): Record<keyof T, string> {
  return Object.fromEntries(Object.entries(names).map(([key, name]) => [key, name.toLowerCase()])) as Record<
    keyof T,
    string
  >;
}
