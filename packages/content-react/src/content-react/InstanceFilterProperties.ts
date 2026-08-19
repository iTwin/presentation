/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import type { ReadonlyContentDescriptor, ReadonlyPropertyField } from "@itwin/presentation-content";
import type { EC } from "@itwin/presentation-shared";

/**
 * Describes one concrete primary class that can be selected to restrict filter properties.
 * @public
 */
export interface InstanceFilterClass {
  /** Full EC class name in dot notation. */
  name: EC.FullClassNameDotNotation;
  /** Text suitable for displaying the class when no application-specific class label is available. */
  label: string;
}

/**
 * Data used to populate an instance filter builder.
 * @public
 */
export interface InstanceFilterProperties {
  /** Concrete primary classes that can be selected to restrict filter properties. */
  classes: InstanceFilterClass[];
  /** Non-hidden property fields that are available for the descriptor's content sources. */
  properties: ReadonlyPropertyField[];
}

/**
 * Input used to create instance filter properties from a content descriptor.
 * @public
 */
export interface CreateInstanceFilterPropertiesProps {
  /** Descriptor containing the fields to expose as filter properties. */
  descriptor: ReadonlyContentDescriptor;
}

/**
 * Creates UI-neutral class and property lists for an instance filter.
 *
 * The result excludes hidden and non-property fields. Concrete primary classes across all descriptor
 * sources populate the result's class list. Each field's `primaryClassNames` identifies the classes
 * to which it is available.
 *
 * @public
 */
export function createInstanceFilterProperties({
  descriptor,
}: CreateInstanceFilterPropertiesProps): InstanceFilterProperties {
  const candidateClassNames = getCandidateClassNames(descriptor.sources);
  const properties = Object.values(descriptor.fields).filter(
    (field): field is ReadonlyPropertyField => field.kind === "property" && !field.hidden,
  );
  return { classes: candidateClassNames.map((name) => ({ name, label: name })), properties };
}

function getCandidateClassNames(sources: ReadonlyContentDescriptor["sources"]): EC.FullClassNameDotNotation[] {
  const classNames = new Set<EC.FullClassNameDotNotation>();
  for (const source of sources) {
    const resolvedClasses =
      source.resolvedPrimaryClasses.length > 0 ? source.resolvedPrimaryClasses : [source.target.primaryClass];
    for (const className of resolvedClasses) {
      classNames.add(className);
    }
  }
  return [...classNames];
}
