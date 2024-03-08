import faker from "@faker-js/faker";
import { Id64 } from "@itwin/core-bentley";
import { InstanceId, InstanceKey } from "@itwin/presentation-common";
import { CustomSelectableObject } from "../../unified-selection/SelectableObjectSet";

/**
 * Generates a random `InstanceId`
 * @internal Used for testing only.
 */
export const createRandomECInstanceId = (): InstanceId => {
  return Id64.fromLocalAndBriefcaseIds(faker.datatype.number(), faker.datatype.number());
};

/**
 * Generates a random `InstanceKey`
 * @internal Used for testing only.
 */
export const createRandomSelectableECInstanceObject = (): InstanceKey => {
  return {
    className: faker.random.word(),
    id: createRandomECInstanceId(),
  };
};

/**
 * Generates a random `CustomSelectableObject`
 * @internal Used for testing only.
 */
export const createCustomSelectableObject = (): CustomSelectableObject => {
  return {
    identifier: createRandomECInstanceId(),
    loadInstanceKeys: async () => [],
    data: {},
  };
};
