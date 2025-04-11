/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

const fs = require("fs");

const yargs = require("yargs");
const path = require("path");

const argv = yargs(process.argv).argv;
const inputPath = path.resolve(argv.commentFilePath);

const lines = fs.readFileSync(inputPath).split("/n");
console.log(lines);
// const result = lines.map((line) => {
//   // Keep all lines that don't contain information about tests
//   if (!line.includes("| `")) {
//     return line;
//   }
//   const tableColumnsCellData = line.split("|");
//   const percentageChange = tableColumnsCellData[4];
//   const percentageAdjusted = percentageChange.replace("NaN", "0");
//   const percentageAsNumber = Number.parseFloat(percentageAdjusted.split("`")[1].replace("%", ""));
//   if (percentageAsNumber === 0) {
//     return tableColumnsCellData
//       .map((tableCell, index) => {
//         if (index === 4) {
//           return percentageAdjusted;
//         }
//         if (index === 5) {
//           return "🟰";
//         }
//         return tableCell;
//       })
//       .join("|");
//   }
//   if (percentageAsNumber > -10 && percentageAsNumber < 10) {
//     return tableColumnsCellData
//       .map((tableCell, index) => {
//         if (index === 5) {
//           return "〰️";
//         }
//         return tableCell;
//       })
//       .join("|");
//   }

//   const previousValue = tableColumnsCellData[3];
//   const previousValueAsNumber = Number.parseFloat(previousValue.split("`")[1]);
//   let percentageTreshold = 10;
//   if (previousValueAsNumber < 25) {
//     percentageTreshold = 75;
//   } else if (previousValueAsNumber < 50) {
//     percentageTreshold = 50;
//   } else if (previousValueAsNumber < 100) {
//     percentageTreshold = 25;
//   } else if (previousValueAsNumber < 1000) {
//     percentageTreshold = 15;
//   }
//   if (percentageAsNumber >= percentageTreshold) {
//     return tableColumnsCellData
//       .map((tableCell, index) => {
//         if (index === 5) {
//           return "🚨";
//         }
//         return tableCell;
//       })
//       .join("|");
//   }
//   return tableColumnsCellData
//     .map((tableCell, index) => {
//       if (index === 5) {
//         return "✅";
//       }
//       return tableCell;
//     })
//     .join("|");
// });
// fs.writeFileSync(inputPath, result.join("\n"));
// console.log("Adjusted Benchmark comment");
