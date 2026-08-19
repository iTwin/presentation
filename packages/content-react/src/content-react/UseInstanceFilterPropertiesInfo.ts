/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createInstanceFilterProperties } from "./InstanceFilterProperties.js";

import type { ReadonlyPropertyField } from "@itwin/presentation-content";
import type { EC } from "@itwin/presentation-shared";
import type { CreateInstanceFilterPropertiesProps, InstanceFilterProperties } from "./InstanceFilterProperties.js";

/**
 * Input used by {@link useInstanceFilterPropertiesInfo}.
 * @public
 */
export interface UseInstanceFilterPropertiesInfoProps extends CreateInstanceFilterPropertiesProps {
  /** Class names selected when the hook is first initialized. */
  initialSelectedClasses?: EC.FullClassNameDotNotation[];
}

/**
 * State and actions for an instance filter builder.
 * @public
 */
export interface InstanceFilterPropertiesInfo extends InstanceFilterProperties {
  /**
   * Properties available to at least one selected class, or all `properties` when no classes are selected.
   */
  visibleProperties: ReadonlyPropertyField[];
  /** Full names of the classes currently selected to restrict properties. */
  selectedClasses: EC.FullClassNameDotNotation[];
  /** Replaces the selected classes used to restrict `visibleProperties`. */
  onSelectedClassesChanged: (classes: EC.FullClassNameDotNotation[]) => void;
}

/**
 * Maintains selected primary classes and synchronously filters properties for a content descriptor.
 * A property remains visible when it is available to at least one selected class.
 *
 * @public
 */
export function useInstanceFilterPropertiesInfo({
  descriptor,
  initialSelectedClasses,
}: UseInstanceFilterPropertiesInfoProps): InstanceFilterPropertiesInfo {
  const initialSelectedClassNamesRef = useRef(initialSelectedClasses);
  const { classes, properties } = useMemo(() => createInstanceFilterProperties({ descriptor }), [descriptor]);
  const [selectedClasses, setSelectedClasses] = useState(initialSelectedClassNamesRef.current ?? []);
  useEffect(() => {
    setSelectedClasses(initialSelectedClassNamesRef.current ?? []);
  }, [descriptor]);
  const visibleProperties = useMemo(() => {
    if (selectedClasses.length === 0) {
      return properties;
    }

    const selectedClassNameSet = new Set(selectedClasses);
    return properties.filter((property) =>
      property.primaryClassNames.some((className) => selectedClassNameSet.has(className)),
    );
  }, [properties, selectedClasses]);
  const onSelectedClassesChanged = useCallback(
    (newClasses: EC.FullClassNameDotNotation[]) => {
      setSelectedClasses(newClasses);
    },
    [setSelectedClasses],
  );

  return { classes, properties, visibleProperties, selectedClasses, onSelectedClassesChanged };
}
