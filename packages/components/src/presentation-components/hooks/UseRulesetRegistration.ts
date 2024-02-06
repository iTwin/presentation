/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Core
 */

import { useCallback } from "react";
import { useDisposable } from "@itwin/core-react";
import { Ruleset } from "@itwin/presentation-common";
import { RulesetRegistrationHelper } from "../common/RulesetRegistrationHelper";

/**
 * Custom hook which registers supplied Ruleset on mount and removes on unmount.
 * @public
 * @deprecated in 4.x. It is not compatible with React 18 StrictMode. Use `Presentation.presentation.rulesets().add(ruleset)` directly.
 */
export function useRulesetRegistration(ruleset: Ruleset) {
  useDisposable(useCallback(() => new RulesetRegistrationHelper(ruleset), [ruleset]));
}
