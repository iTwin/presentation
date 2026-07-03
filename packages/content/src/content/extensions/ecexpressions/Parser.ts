/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { tokenize } from "./Tokenizer.js";

import type { Token } from "./Tokenizer.js";

/**
 * A literal value node.
 * @internal
 */
export type LiteralNode =
  | { kind: "literal"; type: "int"; value: string }
  | { kind: "literal"; type: "double"; value: string }
  | { kind: "literal"; type: "string"; value: string }
  | { kind: "literal"; type: "bool"; value: boolean }
  | { kind: "literal"; type: "null" };

/**
 * A property/member access chain (e.g. `this.Code.Value`, `parent.ECInstanceId`, `Label`).
 * @internal
 */
export interface PropertyNode {
  kind: "property";
  root: string;
  path: string[];
}

/**
 * An explicitly parenthesized sub-expression; preserved so emission keeps the author's grouping.
 * @internal
 */
export interface ParenNode {
  kind: "paren";
  expr: Node;
}

/**
 * A unary prefix operation (`-` negation or `Not`).
 * @internal
 */
export interface UnaryNode {
  kind: "unary";
  op: "-" | "not";
  operand: Node;
}

/**
 * A binary operation. `op` is the normalized ECExpression operator (`and`, `or`, `mod`, or the raw symbol).
 * @internal
 */
export interface BinaryNode {
  kind: "binary";
  op: string;
  left: Node;
  right: Node;
}

/**
 * A function or method call. `receiver` is set for method-style calls (e.g. `this.IsOfClass(...)`).
 * The emitter classifies the call by `name`.
 * @internal
 */
export interface CallNode {
  kind: "call";
  receiver?: PropertyNode;
  name: string;
  args: Node[];
}

/**
 * A lambda argument (`param => body`), only valid inside `AnyMatches` and related-instance overloads.
 * @internal
 */
export interface LambdaNode {
  kind: "lambda";
  param: string;
  body: Node;
}

/**
 * A `<listSource>.AnyMatches(param => condition)` postfix application.
 * @internal
 */
export interface AnyMatchesNode {
  kind: "anyMatches";
  source: Node;
  param: string;
  condition: Node;
}

/**
 * Union of all ECExpression AST node shapes.
 * @internal
 */
export type Node =
  | LiteralNode
  | PropertyNode
  | ParenNode
  | UnaryNode
  | BinaryNode
  | CallNode
  | LambdaNode
  | AnyMatchesNode;

interface BinaryOp {
  canonical: string;
  precedence: number;
}

const NOT_OPERAND_PRECEDENCE = 4;

class Parser {
  readonly #tokens: Token[];
  #pos = 0;

  constructor(tokens: Token[]) {
    this.#tokens = tokens;
  }

  public parse(): Node {
    if (this.#peek().type === "eof") {
      throw new Error("Expression is empty.");
    }
    const node = this.#parseBinary(0);
    if (this.#peek().type !== "eof") {
      const token = this.#peek();
      throw new Error(`Unexpected token '${token.value}' at position ${token.position}.`);
    }
    return node;
  }

  #peek(offset = 0): Token {
    return this.#tokens[Math.min(this.#pos + offset, this.#tokens.length - 1)];
  }

  #next(): Token {
    return this.#tokens[this.#pos++];
  }

  #isOperator(value: string, offset = 0): boolean {
    const token = this.#peek(offset);
    return token.type === "operator" && token.value === value;
  }

  #isKeyword(value: string, offset = 0): boolean {
    const token = this.#peek(offset);
    return token.type === "identifier" && token.value.toLowerCase() === value.toLowerCase();
  }

  #expectOperator(value: string): void {
    if (!this.#isOperator(value)) {
      const token = this.#peek();
      throw new Error(`Expected '${value}' but found '${token.value}' at position ${token.position}.`);
    }
    this.#next();
  }

  #expectIdentifier(): string {
    const token = this.#peek();
    if (token.type !== "identifier") {
      throw new Error(`Expected an identifier but found '${token.value}' at position ${token.position}.`);
    }
    this.#next();
    return token.value;
  }

  #peekBinaryOp(): BinaryOp | undefined {
    const token = this.#peek();
    if (token.type === "operator") {
      switch (token.value) {
        case "^":
        case ">>>":
          throw new Error(`Operator '${token.value}' is not supported.`);
        case "=":
        case "<>":
        case "<":
        case "<=":
        case ">":
        case ">=":
        case "~":
          return { canonical: token.value, precedence: 4 };
        case "&":
        case "<<":
        case ">>":
          return { canonical: token.value, precedence: 5 };
        case "+":
        case "-":
          return { canonical: token.value, precedence: 6 };
        case "*":
        case "/":
        case "\\":
          return { canonical: token.value, precedence: 7 };
        default:
          return undefined;
      }
    }
    if (token.type === "identifier") {
      switch (token.value.toLowerCase()) {
        case "and":
        case "andalso":
          return { canonical: "and", precedence: 2 };
        case "or":
        case "orelse":
          return { canonical: "or", precedence: 1 };
        case "mod":
          return { canonical: "mod", precedence: 7 };
        case "xor":
          throw new Error("Operator 'Xor' is not supported.");
        default:
          return undefined;
      }
    }
    return undefined;
  }

  #parseBinary(minPrecedence: number): Node {
    let left = this.#parseUnary();
    for (;;) {
      const op = this.#peekBinaryOp();
      if (!op || op.precedence < minPrecedence) {
        break;
      }
      this.#next();
      const right = this.#parseBinary(op.precedence + 1);
      left = { kind: "binary", op: op.canonical, left, right };
    }
    return left;
  }

  #parseUnary(): Node {
    if (this.#isOperator("-")) {
      this.#next();
      return { kind: "unary", op: "-", operand: this.#parseUnary() };
    }
    if (this.#isKeyword("not")) {
      this.#next();
      return { kind: "unary", op: "not", operand: this.#parseBinary(NOT_OPERAND_PRECEDENCE) };
    }
    return this.#parsePrimary();
  }

  #parsePrimary(): Node {
    const token = this.#peek();

    if (token.type === "number") {
      this.#next();
      return { kind: "literal", type: token.numberKind === "double" ? "double" : "int", value: token.value };
    }
    if (token.type === "string") {
      this.#next();
      return { kind: "literal", type: "string", value: token.value };
    }
    if (this.#isOperator("(")) {
      this.#next();
      const expr = this.#parseBinary(0);
      this.#expectOperator(")");
      return { kind: "paren", expr };
    }
    if (token.type === "identifier") {
      const lower = token.value.toLowerCase();
      if (lower === "true" || lower === "false") {
        this.#next();
        return { kind: "literal", type: "bool", value: lower === "true" };
      }
      if (lower === "null") {
        this.#next();
        return { kind: "literal", type: "null" };
      }
      return this.#parseIdentifierExpression();
    }

    throw new Error(`Unexpected token '${token.value}' at position ${token.position}.`);
  }

  #parseIdentifierExpression(): Node {
    const name = this.#expectIdentifier();
    let node: Node;
    if (this.#isOperator("(")) {
      node = { kind: "call", name, args: this.#parseArgumentList() };
    } else {
      node = { kind: "property", root: name, path: [] };
    }
    return this.#parsePostfix(node);
  }

  #parsePostfix(node: Node): Node {
    while (this.#isOperator(".")) {
      this.#next();
      const segment = this.#expectIdentifier();
      if (this.#isOperator("(")) {
        const args = this.#parseArgumentList();
        if (segment.toLowerCase() === "anymatches") {
          if (args.length !== 1 || args[0].kind !== "lambda") {
            throw new Error("`AnyMatches` expects a single lambda argument.");
          }
          node = { kind: "anyMatches", source: node, param: args[0].param, condition: args[0].body };
        } else {
          if (node.kind !== "property") {
            throw new Error(`Cannot call method '${segment}' on this expression.`);
          }
          node = { kind: "call", receiver: node, name: segment, args };
        }
      } else {
        if (node.kind !== "property") {
          throw new Error(`Cannot access member '${segment}' on this expression.`);
        }
        node = { kind: "property", root: node.root, path: [...node.path, segment] };
      }
    }
    return node;
  }

  #parseArgumentList(): Node[] {
    this.#expectOperator("(");
    const args: Node[] = [];
    if (this.#isOperator(")")) {
      this.#next();
      return args;
    }
    for (;;) {
      args.push(this.#parseArgument());
      if (this.#isOperator(",")) {
        this.#next();
        continue;
      }
      break;
    }
    this.#expectOperator(")");
    return args;
  }

  #parseArgument(): Node {
    if (this.#peek().type === "identifier" && this.#isOperator("=>", 1)) {
      const param = this.#expectIdentifier();
      this.#expectOperator("=>");
      return { kind: "lambda", param, body: this.#parseBinary(0) };
    }
    return this.#parseBinary(0);
  }
}

/**
 * Parses an ECExpression string into an AST.
 * @internal
 */
export function parse(expression: string): Node {
  return new Parser(tokenize(expression)).parse();
}
