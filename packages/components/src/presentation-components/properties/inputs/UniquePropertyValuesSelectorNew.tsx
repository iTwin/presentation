/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { useEffect, useMemo, useState } from "react";
import { from, map, mergeMap, toArray } from "rxjs";
import { PropertyDescription, PropertyValue, PropertyValueFormat } from "@itwin/appui-abstract";
import { IModelConnection } from "@itwin/core-frontend";
import { Anchor, ComboBox, MenuItem, MenuItemSkeleton, SelectOption } from "@itwin/itwinui-react";
import {
  ClassInfo,
  Descriptor,
  DisplayValue,
  DisplayValueGroup,
  Field,
  FieldDescriptor,
  Keys,
  KeySet,
  MultiSchemaClassesSpecification,
  Ruleset,
} from "@itwin/presentation-common";
import { Presentation } from "@itwin/presentation-frontend";
import { deserializeUniqueValues, findField, serializeUniqueValues, translate, UniqueValue } from "../../common/Utils";
import { getInstanceFilterFieldName } from "../../instance-filter-builder/Utils";

/** @internal */
export const UNIQUE_PROPERTY_VALUES_BATCH_SIZE = 5;

/** @internal */
export interface UniquePropertyValuesSelectorProps {
  /** Currently entered value. */
  value?: PropertyValue;
  /** Property used in rule to which this value will be compared to. */
  property: PropertyDescription;
  /** Callback that is invoked when value changes. */
  onChange: (value: PropertyValue) => void;
  /** Current IModel */
  imodel: IModelConnection;
  /** Current descriptor */
  descriptor: Descriptor;
  /** Keys that are currently selected for filtering */
  descriptorInputKeys?: Keys;
}

/** @internal */
export function UniquePropertyValuesSelector(props: UniquePropertyValuesSelectorProps) {
  const { imodel, descriptor, property, onChange, value, descriptorInputKeys } = props;
  const [field, setField] = useState<Field | undefined>(() => findField(descriptor, getInstanceFilterFieldName(property)));
  const selectedValues = useMemo<string[]>(() => getUniqueValueFromProperty(value).map((val) => val.displayValue), [value]);

  const [searchText, setSearchText] = useState<string>("");

  useEffect(() => {
    setField(findField(descriptor, getInstanceFilterFieldName(property)));
    setSearchText("");
  }, [descriptor, property]);

  const onValueChange = (changedOptions: UniqueValue[]) => {
    if (changedOptions.length === 0) {
      onChange({
        valueFormat: PropertyValueFormat.Primitive,
        displayValue: undefined,
        value: undefined,
      });
    } else {
      const { displayValues, groupedRawValues } = serializeUniqueValues(changedOptions);
      onChange({
        valueFormat: PropertyValueFormat.Primitive,
        displayValue: displayValues,
        value: groupedRawValues,
      });
    }
  };

  const ruleset = useUniquePropertyValuesRuleset(descriptor.ruleset, field, descriptorInputKeys);
  const { selectOptions, loadedOptions } = useUniquePropertyValuesLoader({
    imodel,
    ruleset,
    field,
    descriptorInputKeys,
    typeName: property.typename,
    filterText: searchText,
  });

  return (
    <ComboBox
      multiple={true}
      enableVirtualization={true}
      options={selectOptions}
      onChange={(newValue) => {
        const newSelectedValues = loadedOptions.filter((opt) => newValue.includes(opt.displayValue));
        onValueChange(newSelectedValues);
      }}
      value={selectedValues}
      inputProps={{ placeholder: "Select value", size: "small", value: searchText, onChange: (e) => setSearchText(e.target.value) }}
      itemRenderer={(option, states) => {
        if (isLoadingIndicator(option)) {
          return <MenuItemSkeleton />;
        }

        if (isLoadMoreOption(option)) {
          return (
            <MenuItem onClick={option.action}>
              <Anchor as="button">{option.label}</Anchor>
            </MenuItem>
          );
        }

        return (
          <MenuItem {...states} value={option.value}>
            {option.label}
          </MenuItem>
        );
      }}
    />
  );
}

function isLoadingIndicator(option: SelectOption<string>): option is SelectOption<string> & { loadingIndicator: true } {
  return "loadingIndicator" in option;
}

function isLoadMoreOption(option: SelectOption<string>): option is SelectOption<string> & { action: () => Promise<void> } {
  return "action" in option;
}

function getUniqueValueFromProperty(propertyValue: PropertyValue | undefined): UniqueValue[] {
  if (propertyValue?.valueFormat === PropertyValueFormat.Primitive && typeof propertyValue.value === "string" && propertyValue.displayValue) {
    return deserializeUniqueValues(propertyValue.displayValue, propertyValue.value) ?? [];
  }
  return [];
}

function useUniquePropertyValuesRuleset(descriptorRuleset?: Ruleset, field?: Field, descriptorInputKeys?: Keys) {
  const [ruleset, setRuleset] = useState<Ruleset>();
  useEffect(() => {
    if (descriptorRuleset) {
      setRuleset(descriptorRuleset);
      return;
    }

    if (descriptorInputKeys && hasKeys(descriptorInputKeys)) {
      setRuleset({
        id: "unique-instances-property-values",
        rules: [
          {
            ruleType: "Content",
            specifications: [
              {
                specType: "SelectedNodeInstances",
              },
            ],
          },
        ],
      });
      return;
    }

    const classInfos = getFieldClassInfos(field);
    if (classInfos.length === 0) {
      setRuleset(undefined);
      return;
    }

    setRuleset({
      id: "unique-class-property-values",
      rules: [
        {
          ruleType: "Content",
          specifications: [
            {
              specType: "ContentInstancesOfSpecificClasses",
              classes: createSchemaClasses(classInfos),
            },
          ],
        },
      ],
    });
  }, [field, descriptorRuleset, descriptorInputKeys]);

  return ruleset;
}

function createSchemaClasses(infos: ClassInfo[]): MultiSchemaClassesSpecification | MultiSchemaClassesSpecification[] {
  const schemaClassMap = new Map<string, string[]>();
  infos.forEach((info) => {
    const [schemaName, className] = info.name.split(":");
    let classNames = schemaClassMap.get(schemaName);
    if (!classNames) {
      classNames = [];
      schemaClassMap.set(schemaName, classNames);
    }
    if (!classNames.includes(className)) {
      classNames.push(className);
    }
  });
  const schemaClasses = [...schemaClassMap.entries()].map(([schemaName, classNames]) => ({ schemaName, classNames, arePolymorphic: true }));
  return schemaClasses.length === 1 ? schemaClasses[0] : schemaClasses;
}

function getFieldClassInfos(field?: Field) {
  if (field?.parent === undefined && field?.isPropertiesField()) {
    return field.properties.map((p) => p.property.classInfo);
  }

  let rootParentField = field?.parent;
  while (rootParentField?.parent !== undefined) {
    rootParentField = rootParentField.parent;
  }
  const lastStepToPrimaryClass = rootParentField?.pathToPrimaryClass.slice(-1).pop();
  return lastStepToPrimaryClass ? [lastStepToPrimaryClass.targetClassInfo] : [];
}

interface UseUniquePropertyValuesLoaderProps {
  imodel: IModelConnection;
  ruleset?: Ruleset;
  field?: Field;
  descriptorInputKeys?: Keys;
  typeName: string;
  filterText: string;
}

interface UniquePropertyValuesLoaderState {
  options: UniqueValue[];
  hasMore: boolean;
  loading: boolean;
}

function useUniquePropertyValuesLoader({ imodel, ruleset, field, descriptorInputKeys, typeName, filterText }: UseUniquePropertyValuesLoaderProps) {
  const [itemsLoader, setItemsLoader] = useState<ItemsLoader | undefined>();

  const [state, setLoadedOptions] = useState<UniquePropertyValuesLoaderState>({
    options: [],
    hasMore: false,
    loading: false,
  });

  useEffect(() => {
    setLoadedOptions({ options: [], hasMore: false, loading: false });
    if (!ruleset || !field) {
      return;
    }

    const loader = new ItemsLoader(
      imodel,
      ruleset,
      field,
      new KeySet(descriptorInputKeys),
      () => {
        setLoadedOptions((prev) => ({ ...prev, loading: true }));
      },
      (newItems, hasMore) => {
        setLoadedOptions((prev) => ({
          options: [...prev.options, ...newItems],
          hasMore,
          loading: false,
        }));
      },
    );
    void loader.loadItems(undefined);
    setItemsLoader(loader);
    return () => {
      loader.dispose();
    };
  }, [imodel, ruleset, field, descriptorInputKeys]);

  useEffect(() => {
    if (!filterText) {
      return;
    }

    const timeout = setTimeout(() => {
      if (itemsLoader?.needsLoadingItems(filterText)) {
        void itemsLoader?.loadItems(filterText);
      }
    }, 250);

    return () => {
      clearTimeout(timeout);
    };
  }, [itemsLoader, filterText]);

  return {
    selectOptions: useMemo<SelectOption<string>[]>(() => {
      const options: SelectOption<string>[] = state.options.map((option) => ({
        label: formatOptionLabel(option.displayValue, typeName),
        value: option.displayValue,
        rawValue: option,
      }));

      if (state.loading) {
        options.push({ label: "Loading...", value: "__loading__", loadingIndicator: true });
      }

      if (!state.loading && state.hasMore) {
        options.push({ label: "Load more...", value: "__load-more__", action: async () => itemsLoader?.loadItems(filterText) });
      }

      return options;
    }, [state, itemsLoader, filterText, typeName]),
    loadedOptions: state.options,
  };
}

function formatOptionLabel(displayValue: string, type: string): string {
  if (displayValue === "") {
    return translate("unique-values-property-editor.empty-value");
  }

  switch (type) {
    case "dateTime":
      return new Date(displayValue).toLocaleString();
    case "shortDate":
      return new Date(displayValue).toLocaleDateString();
    default:
      return displayValue;
  }
}

function hasKeys(descriptorInputKeys?: Keys) {
  return Array.isArray(descriptorInputKeys) ? descriptorInputKeys.length > 0 : !(descriptorInputKeys as KeySet).isEmpty;
}

class ItemsLoader {
  private _loadedItems: UniqueValue[] = [];
  private _isLoading = false;
  private _hasMore = true;
  private _disposed = false;

  constructor(
    private _imodel: IModelConnection,
    private _ruleset: Ruleset,
    private _field: Field,
    private _keys: KeySet,
    private _beforeLoad: () => void,
    private _onItemsLoaded: (newItems: UniqueValue[], hasMore: boolean) => void,
  ) {}

  public dispose() {
    this._disposed = true;
  }

  public needsLoadingItems(filterText?: string) {
    if (!this._hasMore) {
      return false;
    }

    const loadedItems = this._loadedItems.filter((option) => (filterText ? option.displayValue.includes(filterText) : true));
    return loadedItems.length < UNIQUE_PROPERTY_VALUES_BATCH_SIZE / 2;
  }

  public async loadItems(filterText?: string) {
    if (this._isLoading || !this._hasMore) {
      return;
    }

    this._isLoading = true;
    this._beforeLoad();

    const newItems = filterText
      ? await this.loadFilteredItems(filterText)
      : await getItems({
          imodel: this._imodel,
          offset: this._loadedItems.length,
          field: this._field.getFieldDescriptor(),
          ruleset: this._ruleset,
          keys: this._keys,
        });

    if (this._disposed) {
      return;
    }

    this._loadedItems.push(...newItems.options);
    this._hasMore = newItems.hasMore;
    this._onItemsLoaded(newItems.options, newItems.hasMore);
    this._isLoading = false;
  }

  private async loadFilteredItems(filterText: string) {
    const loadedItems: UniqueValue[] = [];
    let currOffset = this._loadedItems.length;
    let hasMore = this._hasMore;

    while (true) {
      const newItems = await getItems({
        imodel: this._imodel,
        offset: currOffset,
        field: this._field.getFieldDescriptor(),
        ruleset: this._ruleset,
        keys: this._keys,
      });

      if (this._disposed) {
        return { options: loadedItems, hasMore };
      }

      loadedItems.push(...newItems.options);
      hasMore = newItems.hasMore;
      currOffset += newItems.options.length;
      const matchingItems = loadedItems.filter((option) => option.displayValue.includes(filterText));
      if (!newItems.hasMore || matchingItems.length > UNIQUE_PROPERTY_VALUES_BATCH_SIZE / 2) {
        break;
      }
    }

    return { options: loadedItems, hasMore };
  }
}

async function getItems({
  imodel,
  offset,
  field,
  ruleset,
  keys,
}: {
  imodel: IModelConnection;
  offset: number;
  field: FieldDescriptor;
  ruleset: Ruleset;
  keys: KeySet;
}) {
  const requestProps = {
    imodel,
    descriptor: {},
    fieldDescriptor: field,
    rulesetOrId: ruleset,
    paging: { start: offset, size: UNIQUE_PROPERTY_VALUES_BATCH_SIZE },
    keys,
  };
  const items = await new Promise<DisplayValueGroup[]>((resolve) => {
    (Presentation.presentation.getDistinctValuesIterator
      ? from(Presentation.presentation.getDistinctValuesIterator(requestProps)).pipe(
          mergeMap((result) => result.items),
          toArray(),
        )
      : // eslint-disable-next-line deprecation/deprecation
        from(Presentation.presentation.getPagedDistinctValues(requestProps)).pipe(map((result) => result.items))
    ).subscribe({
      next: resolve,
      error: () => resolve([]),
    });
  });

  const hasMore = items.length === UNIQUE_PROPERTY_VALUES_BATCH_SIZE;
  const options: UniqueValue[] = [];
  for (const option of items) {
    if (option.displayValue === undefined || !DisplayValue.isPrimitive(option.displayValue)) {
      continue;
    }
    const groupedValues = option.groupedRawValues.filter((value) => value !== undefined);
    if (groupedValues.length !== 0) {
      options.push({ displayValue: option.displayValue, groupedRawValues: groupedValues });
    }
  }

  return {
    options,
    hasMore,
  };
}
