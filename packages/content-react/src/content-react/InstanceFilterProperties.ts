/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import type { ContentDescriptor, ContentSource, PropertyField } from "@itwin/presentation-content";
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
 * Describes a filterable content property and the primary classes that can supply it.
 * @public
 */
export interface InstanceFilterProperty {
  /** The descriptor field used when building a filter for this property. */
  field: PropertyField;
  /** Stable identity of the descriptor field. */
  id: PropertyField["id"];
  /** Text suitable for displaying the property. */
  label: PropertyField["label"];
  /** Value shape used by consumers to select operators and value editors. */
  type: PropertyField["type"];
  /** Whether the property is reached through one or more relationships from the primary instance. */
  isRelated: boolean;
  /**
   * Concrete primary classes that can supply the property.
   *
   * Direct fields use their descriptor value classes. Related fields use the target classes recorded
   * on resolved relationship paths matching the field's path.
   */
  availableClassNames: EC.FullClassNameDotNotation[];
}

/**
 * Data used to populate an instance filter builder.
 * @public
 */
export interface InstanceFilterProperties {
  /** Concrete primary classes that can be selected to restrict filter properties. */
  classes: InstanceFilterClass[];
  /** Non-hidden property fields that are available for the descriptor's content sources. */
  properties: InstanceFilterProperty[];
}

/**
 * Input used to create instance filter properties from a content descriptor.
 * @public
 */
export interface CreateInstanceFilterPropertiesProps {
  /** Descriptor containing the fields to expose as filter properties. */
  descriptor: ContentDescriptor;
}

/**
 * Creates UI-neutral class and property lists for an instance filter.
 *
 * The result excludes hidden and non-property fields. Concrete primary classes across all descriptor
 * sources populate the result's class list; a source target's primary class is used when source
 * resolution found no concrete classes. Direct fields are available to their value-supplier classes,
 * while related fields are available only to primary classes associated with resolved paths that
 * match the field's relationship path.
 *
 * @public
 */
export function createInstanceFilterProperties({
  descriptor,
}: CreateInstanceFilterPropertiesProps): InstanceFilterProperties {
  const candidateClassNames = getCandidateClassNames(descriptor.sources);
  const candidateClassNameSet = new Set(candidateClassNames);

  const properties = Object.values(descriptor.fields).flatMap((field): InstanceFilterProperty[] => {
    if (field.kind !== "property" || field.hidden) {
      return [];
    }

    const isRelated = field.pathFromTarget.length > 0;
    const availableClassNames = isRelated
      ? getRelatedFieldClassNames(field, descriptor.sources, candidateClassNames)
      : field.valueClassNames.filter((className) => candidateClassNameSet.has(className));

    return availableClassNames.length > 0
      ? [{ field, id: field.id, label: field.label, type: field.type, isRelated, availableClassNames }]
      : [];
  });

  return { classes: candidateClassNames.map((name) => ({ name, label: name })), properties };
}

function getCandidateClassNames(sources: ContentSource[]): EC.FullClassNameDotNotation[] {
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

function getRelatedFieldClassNames(
  field: PropertyField,
  sources: ContentSource[],
  candidateClassNames: EC.FullClassNameDotNotation[],
): EC.FullClassNameDotNotation[] {
  const availableClassNames = new Set<EC.FullClassNameDotNotation>();
  for (const source of sources) {
    for (const { paths } of source.resolvedDeclarations) {
      for (const resolvedPath of paths) {
        if (!startsWithRelationshipPath(resolvedPath.path, field.pathFromTarget)) {
          continue;
        }
        for (const className of resolvedPath.targetClassNames) {
          availableClassNames.add(className);
        }
      }
    }
  }
  return candidateClassNames.filter((className) => availableClassNames.has(className));
}

function startsWithRelationshipPath(
  path: PropertyField["pathFromTarget"],
  prefix: PropertyField["pathFromTarget"],
): boolean {
  return (
    path.length >= prefix.length &&
    prefix.every(
      (step, index) =>
        path[index].sourceClassName === step.sourceClassName &&
        path[index].targetClassName === step.targetClassName &&
        path[index].relationshipName === step.relationshipName &&
        Boolean(path[index].relationshipReverse) === Boolean(step.relationshipReverse),
    )
  );
}
