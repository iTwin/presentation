/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { mkdirSync, writeFileSync } from "fs";
import { LOCALIZATION_NAMESPACE, LOCALIZED_STRINGS } from "../presentation-hierarchies-react/internal/LocalizedStrings.js";

const localeContent = JSON.stringify(LOCALIZED_STRINGS, null, 2);

const outputPath = "./src/public/locales/en";
const fileName = `${LOCALIZATION_NAMESPACE}.json`;
mkdirSync(outputPath, { recursive: true });

writeFileSync(`${outputPath}/${fileName}`, `${localeContent}\n`, { encoding: "utf-8" });

// eslint-disable-next-line no-console
console.log(`Locale file has been generated at ${outputPath}`);
