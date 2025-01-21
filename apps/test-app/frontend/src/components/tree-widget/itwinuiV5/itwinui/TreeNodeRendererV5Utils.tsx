/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { LegacyRef, MutableRefObject, Ref, useCallback } from "react";
import { Anchor, Text } from "@itwin/itwinui-react-v5/bricks";
import { useLocalizationContext } from "./LocalizationContext";

/** @internal */
export const MAX_LIMIT_OVERRIDE = 10000; // TODO: remove when moved to hierarchies-react

/** @internal */
export interface ResultSetTooLargeNodeLabelProps {
  limit: number;
  onFilterClick?: () => void;
  onOverrideLimit?: (limit: number) => void;
}

/** @internal */
export function ResultSetTooLargeNodeLabel({ onFilterClick, onOverrideLimit, limit }: ResultSetTooLargeNodeLabelProps) {
  const { localizedStrings } = useLocalizationContext();
  const supportsFiltering = !!onFilterClick;
  const supportsLimitOverride = !!onOverrideLimit && limit < MAX_LIMIT_OVERRIDE;

  const limitExceededMessage = createLocalizedMessage(
    supportsFiltering ? localizedStrings.resultLimitExceededWithFiltering : localizedStrings.resultLimitExceeded,
    limit,
    onFilterClick,
  );
  const increaseLimitMessage = supportsLimitOverride
    ? createLocalizedMessage(
        supportsFiltering ? localizedStrings.increaseHierarchyLimitWithFiltering : localizedStrings.increaseHierarchyLimit,
        MAX_LIMIT_OVERRIDE,
        () => onOverrideLimit(MAX_LIMIT_OVERRIDE),
      )
    : { title: "", element: null };

  const title = `${limitExceededMessage.title} ${increaseLimitMessage.title}`;

  return (
    // <Flex flexDirection="column" gap="3xs" title={title} alignItems="start">
    <div style={{ display: "flex" }} title={title}>
      {limitExceededMessage.element}
      {increaseLimitMessage.element}
    </div>
    // </Flex>
  );
}

/** @internal */
export function ErrorNodeLabel({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { localizedStrings } = useLocalizationContext();
  return (
    // <Flex flexDirection="row" gap="xs" title={message} alignItems="start"> // flex is not released yet
    <div style={{ display: "flex" }}>
      <Text>{message}</Text>
      {onRetry ? <Anchor onClick={onRetry}>{localizedStrings?.retry}</Anchor> : null}
    </div>
    // </Flex>
  );
}

/** @internal */
export function createLocalizedMessage(message: string, limit: number, onClick?: () => void) {
  const limitStr = limit.toLocaleString(undefined, { useGrouping: true });
  const messageWithLimit = message.replace("{{limit}}", limitStr);
  const exp = new RegExp("<link>(.*)</link>");
  const match = messageWithLimit.match(exp);

  if (!match) {
    return {
      title: messageWithLimit,
      element: (
        <div style={{ display: "flex" }}>
          {/* <Flex flexDirection="row" gap="3xs"> */}
          <Text>{messageWithLimit}</Text>
          {/* </Flex> */}
        </div>
      ),
    };
  }

  const [fullText, innerText] = match;
  const [textBefore, textAfter] = messageWithLimit.split(fullText);

  return {
    title: messageWithLimit.replace(fullText, innerText),
    element: (
      // <Flex flexDirection="row" gap="3xs">
      <div style={{ display: "flex" }}>
        {textBefore ? <Text>{textBefore}</Text> : null}
        <Anchor
          // underline props does not exist in v5
          onClick={(e) => {
            e.stopPropagation();
            onClick?.();
          }}
        >
          {innerText}
        </Anchor>
        {textAfter ? <Text>{textAfter}</Text> : null}
      </div>
      // </Flex>
    ),
  };
}

/** @internal */
export function useMergedRefs<T>(...refs: ReadonlyArray<Ref<T> | LegacyRef<T> | undefined | null>) {
  return useCallback(
    (instance: T | null) => {
      refs.forEach((ref) => {
        if (typeof ref === "function") {
          ref(instance);
        } else if (ref) {
          (ref as MutableRefObject<T | null>).current = instance;
        }
      });
    }, // eslint-disable-next-line react-hooks/exhaustive-deps
    [...refs],
  );
}
