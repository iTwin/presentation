import { CustomSelectable, SelectableInstanceKey } from "../../unified-selection/Selectable";

/**
 * Generates a random EC instance ID`
 * @internal Used for testing only.
 */
export const createECInstanceId = (id: number = 1): string => {
  return `${id}`;
};

/**
 * Generates a random `SelectableInstanceKey`
 * @internal Used for testing only.
 */
export const createSelectableInstanceKey = (id: number = 1, className: string = "testClass"): SelectableInstanceKey => {
  return {
    className,
    id: createECInstanceId(id),
  };
};

/**
 * Generates a random `CustomSelectable`
 * @internal Used for testing only.
 */
export const createCustomSelectable = (id: number = 1): CustomSelectable => {
  return {
    identifier: createECInstanceId(id),
    loadInstanceKeys: {} as AsyncIterableIterator<SelectableInstanceKey>,
    data: {},
  };
};
