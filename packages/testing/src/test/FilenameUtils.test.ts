/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import * as path from "path";
import { FILE_PATH_RESERVED_CHARACTERS, limitFilePathLength } from "../presentation-testing/FilenameUtils.js";

describe("limitFilePathLength", () => {
  it("returns given file path when length is within limits", async () => {
    const inputFileName = new Array(260 - FILE_PATH_RESERVED_CHARACTERS - 4 - 4).fill("a").join("");
    const inputFilePath = path.format({
      dir: path.join("x", "y"),
      name: inputFileName,
      ext: ".ext",
    });
    expect(inputFilePath.length).to.eq(260 - FILE_PATH_RESERVED_CHARACTERS);
    expect(limitFilePathLength(inputFilePath)).to.eq(inputFilePath);
  });

  it("returns shortened file path when length exceeds limits by 1 character, and shortened file name fits into path", async () => {
    const inputFileName = new Array(260 - FILE_PATH_RESERVED_CHARACTERS - 4 - 4 + 1).fill("a").join("");
    const inputFilePath = path.format({
      dir: path.join("x", "y"),
      name: inputFileName,
      ext: ".ext",
    });
    expect(inputFilePath.length).to.eq(260 - FILE_PATH_RESERVED_CHARACTERS + 1);

    const result = limitFilePathLength(inputFilePath);
    expect(result).to.eq(
      path.format({
        dir: path.join("x", "y"),
        name: `${new Array(118).fill("a").join("")}...${new Array(118).fill("a").join("")}`,
        ext: ".ext",
      }),
    );
    expect(result.length).to.eq(260 - FILE_PATH_RESERVED_CHARACTERS);
  });

  it("returns shortened file path when length exceeds limits by 2 characters, and shortened file name fits into path", async () => {
    const inputFileName = new Array(260 - FILE_PATH_RESERVED_CHARACTERS - 4 - 4 + 2).fill("a").join("");
    const inputFilePath = path.format({
      dir: path.join("x", "y"),
      name: inputFileName,
      ext: ".ext",
    });
    expect(inputFilePath.length).to.eq(260 - FILE_PATH_RESERVED_CHARACTERS + 2);

    const result = limitFilePathLength(inputFilePath);
    expect(result).to.eq(
      path.format({
        dir: path.join("x", "y"),
        name: `${new Array(118).fill("a").join("")}...${new Array(118).fill("a").join("")}`,
        ext: ".ext",
      }),
    );
    expect(result.length).to.eq(260 - FILE_PATH_RESERVED_CHARACTERS);
  });

  it("throws when file path without name exceeds allowed length", async () => {
    const inputFilePath = path.format({
      dir: new Array(260 - FILE_PATH_RESERVED_CHARACTERS - 4 - 1).fill("x").join(""),
      name: "a",
      ext: ".ext",
    });
    expect(inputFilePath.length).to.eq(260 - FILE_PATH_RESERVED_CHARACTERS + 1);
    expect(() => limitFilePathLength(inputFilePath)).to.throw(Error);
  });
});
