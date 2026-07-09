/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

/**
 * Kind of a lexical token produced by `tokenize`.
 * @internal
 */
export type TokenType = "number" | "string" | "identifier" | "operator" | "eof";

/**
 * A lexical token of an ECExpression.
 * @internal
 */
export interface Token {
  type: TokenType;
  /**
   * For `string` tokens this is the decoded value (with `""` un-escaped to `"`); for `number` tokens it is the
   * emission-ready numeric literal; otherwise it is the raw source text.
   */
  value: string;
  /** For `number` tokens, whether the literal is an integer or a floating-point number. */
  numberKind?: "int" | "double";
  /** Zero-based offset of the token in the source string. */
  position: number;
}

const IDENT_START = /[A-Za-z_]/;
const IDENT_PART = /[A-Za-z0-9_]/;

function isDigit(char: string): boolean {
  return char >= "0" && char <= "9";
}

/**
 * Splits an ECExpression string into a flat list of lexical tokens, terminated by an `eof` token.
 * Throws a descriptive `Error` for unterminated strings, unsupported literals, and stray characters.
 * @internal
 */
export function tokenize(expression: string): Token[] {
  const tokens: Token[] = [];
  const length = expression.length;
  let i = 0;

  while (i < length) {
    const char = expression[i];

    // whitespace
    if (char === " " || char === "\t" || char === "\n" || char === "\r") {
      ++i;
      continue;
    }

    const start = i;

    // string literal (double-quoted, `""` escapes a quote)
    if (char === '"') {
      ++i;
      let value = "";
      let closed = false;
      while (i < length) {
        if (expression[i] === '"') {
          if (expression[i + 1] === '"') {
            value += '"';
            i += 2;
            continue;
          }
          ++i;
          closed = true;
          break;
        }
        value += expression[i++];
      }
      if (!closed) {
        throw new Error(`Unterminated string literal at position ${start}.`);
      }
      tokens.push({ type: "string", value, position: start });
      continue;
    }

    // DateTime literal `@<ticks>` is intentionally unsupported
    if (char === "@") {
      throw new Error("DateTime literals (`@<ticks>`) are not supported.");
    }

    // array indexing is intentionally unsupported
    if (char === "[") {
      throw new Error("Array indexing (`[...]`) is not supported.");
    }

    // number literal (int, hex, double)
    if (isDigit(char) || (char === "." && isDigit(expression[i + 1]))) {
      if (char === "0" && (expression[i + 1] === "x" || expression[i + 1] === "X")) {
        let k = i + 2;
        while (k < length && /[0-9A-Fa-f]/.test(expression[k])) {
          ++k;
        }
        tokens.push({ type: "number", value: expression.slice(i, k), numberKind: "int", position: start });
        i = k;
        continue;
      }
      let j = i;
      let isDouble = false;
      while (j < length && isDigit(expression[j])) {
        ++j;
      }
      if (expression[j] === ".") {
        isDouble = true;
        ++j;
        while (j < length && isDigit(expression[j])) {
          ++j;
        }
      }
      if (expression[j] === "e" || expression[j] === "E") {
        isDouble = true;
        ++j;
        if (expression[j] === "+" || expression[j] === "-") {
          ++j;
        }
        while (j < length && isDigit(expression[j])) {
          ++j;
        }
      }
      tokens.push({
        type: "number",
        value: expression.slice(i, j),
        numberKind: isDouble ? "double" : "int",
        position: start,
      });
      i = j;
      continue;
    }

    // identifier / keyword
    if (IDENT_START.test(char)) {
      let j = i + 1;
      while (j < length && IDENT_PART.test(expression[j])) {
        ++j;
      }
      tokens.push({ type: "identifier", value: expression.slice(i, j), position: start });
      i = j;
      continue;
    }

    // operators (longest match first)
    const three = expression.slice(i, i + 3);
    if (three === ">>>") {
      tokens.push({ type: "operator", value: three, position: start });
      i += 3;
      continue;
    }
    const two = expression.slice(i, i + 2);
    if (two === "<=" || two === ">=" || two === "<>" || two === "=>" || two === "<<" || two === ">>") {
      tokens.push({ type: "operator", value: two, position: start });
      i += 2;
      continue;
    }
    if ("=<>+-*/\\&~(),.:^".includes(char)) {
      tokens.push({ type: "operator", value: char, position: start });
      ++i;
      continue;
    }

    throw new Error(`Unexpected character '${char}' at position ${start}.`);
  }

  tokens.push({ type: "eof", value: "", position: length });
  return tokens;
}
