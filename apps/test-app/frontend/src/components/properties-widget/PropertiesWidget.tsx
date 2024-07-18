/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/* eslint-disable no-console */

import "./PropertiesWidget.css";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useResizeDetector } from "react-resize-detector";
import { PropertyRecord, PropertyValueFormat } from "@itwin/appui-abstract";
import {
  ActionButtonRendererProps,
  CompositeFilterType,
  CompositePropertyDataFilterer,
  DisplayValuePropertyDataFilterer,
  FilteredPropertyData,
  FilteringInput,
  FilteringInputStatus,
  FilteringPropertyDataProvider,
  HighlightInfo,
  LabelPropertyDataFilterer,
  PropertyCategory,
  PropertyCategoryLabelFilterer,
  PropertyData,
  PropertyGridContextMenuArgs,
  useDebouncedAsyncValue,
  VirtualizedPropertyGridWithDataProvider,
} from "@itwin/components-react";
import { IModelApp, IModelConnection } from "@itwin/core-frontend";
import { ContextMenuItem, ContextMenuItemProps, GlobalContextMenu, Orientation } from "@itwin/core-react";
import { Flex, ToggleSwitch } from "@itwin/itwinui-react";
import { Field } from "@itwin/presentation-common";
import {
  DiagnosticsProps,
  FavoritePropertiesDataFilterer,
  NavigationPropertyEditorContextProvider,
  PortalTargetContextProvider,
  PresentationPropertyDataProvider,
  useNavigationPropertyEditorContextProviderProps,
  usePropertyDataProviderWithUnifiedSelection,
} from "@itwin/presentation-components";
import { FavoritePropertiesScope, Presentation } from "@itwin/presentation-frontend";
import { DiagnosticsSelector } from "../diagnostics-selector/DiagnosticsSelector";
import { assert } from "@itwin/core-bentley";

const FAVORITES_SCOPE = FavoritePropertiesScope.IModel;

export interface Props {
  imodel: IModelConnection;
  rulesetId?: string;
}

export function PropertiesWidget(props: Props) {
  const { imodel, rulesetId } = props;
  const [diagnosticsOptions, setDiagnosticsOptions] = useState<DiagnosticsProps>({ ruleDiagnostics: undefined, devDiagnostics: undefined });

  const [filterText, setFilterText] = useState("");
  const [isFavoritesFilterActive, setIsFavoritesFilterActive] = useState(false);
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);
  const [activeHighlight, setActiveHighlight] = useState<HighlightInfo>();

  const setFilter = useCallback(
    (filter: string) => {
      if (filter !== filterText) {
        setFilterText(filter);
      }
    },
    [filterText],
  );

  const [filteringResult, setFilteringResult] = useState<FilteredPropertyData>();
  const resultSelectorProps = useMemo(() => {
    return filteringResult?.matchesCount !== undefined
      ? {
          onSelectedChanged: (index: React.SetStateAction<number>) => setActiveMatchIndex(index),
          resultCount: filteringResult.matchesCount,
        }
      : undefined;
  }, [filteringResult]);

  const onFilteringStateChanged = useCallback(
    (newFilteringResult: FilteredPropertyData | undefined) => {
      setFilteringResult(newFilteringResult);
      if (newFilteringResult?.getMatchByIndex) {
        setActiveHighlight(newFilteringResult.getMatchByIndex(activeMatchIndex));
      }
    },
    [activeMatchIndex],
  );

  const { width, height, ref } = useResizeDetector();
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  return (
    <div ref={setPortalTarget} className="PropertiesWidget">
      <PortalTargetContextProvider portalTarget={portalTarget}>
        <h3>{IModelApp.localization.getLocalizedString("Sample:controls.properties.widget-label")}</h3>
        <DiagnosticsSelector onDiagnosticsOptionsChanged={setDiagnosticsOptions} />
        {rulesetId ? (
          <div className="SearchBar">
            <FilteringInput
              onFilterCancel={() => {
                setFilter("");
              }}
              onFilterClear={() => {
                setFilter("");
              }}
              onFilterStart={(newFilter) => {
                setFilter(newFilter);
              }}
              style={{ flex: "auto" }}
              resultSelectorProps={resultSelectorProps}
              status={filterText.length !== 0 ? FilteringInputStatus.FilteringFinished : FilteringInputStatus.ReadyToFilter}
            />
            <ToggleSwitch
              className="FavoritesToggle"
              title="Favorites"
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setIsFavoritesFilterActive(e.target.checked)}
            />
          </div>
        ) : null}
        <div ref={ref} className="ContentContainer">
          {rulesetId && width && height ? (
            <PropertyGrid
              width={width}
              height={height}
              imodel={imodel}
              rulesetId={rulesetId}
              filtering={{ filter: filterText, onlyFavorites: isFavoritesFilterActive, activeHighlight, onFilteringStateChanged }}
              diagnostics={diagnosticsOptions}
            />
          ) : null}
        </div>
      </PortalTargetContextProvider>
    </div>
  );
}

interface PropertyGridProps {
  imodel: IModelConnection;
  rulesetId: string;
  diagnostics: DiagnosticsProps;
  filtering: {
    filter: string;
    onlyFavorites: boolean;
    activeHighlight?: HighlightInfo;
    onFilteringStateChanged: (result: FilteredPropertyData | undefined) => void;
  };
  width: number;
  height: number;
}
function PropertyGrid(props: PropertyGridProps) {
  const { imodel, rulesetId, diagnostics, ...restProps } = props;
  const [dataProvider, setDataProvider] = useState<AutoExpandingPropertyDataProvider>();

  useEffect(() => {
    const provider = new AutoExpandingPropertyDataProvider({ imodel, ruleset: rulesetId, ...diagnostics });
    provider.isNestedPropertyCategoryGroupingEnabled = true;
    setDataProvider(provider);
    return () => {
      provider.dispose();
    };
  }, [imodel, rulesetId, diagnostics]);

  if (!dataProvider) {
    return null;
  }

  return <FilterablePropertyGrid {...restProps} imodel={imodel} dataProvider={dataProvider} />;
}

function FilterablePropertyGrid({
  dataProvider,
  filtering,
  imodel,
  width,
  height,
}: Omit<PropertyGridProps, "rulesetId" | "diagnostics"> & { dataProvider: PresentationPropertyDataProvider }) {
  const { isOverLimit, numSelectedElements } = usePropertyDataProviderWithUnifiedSelection({ dataProvider });

  const { filter: filterText, onlyFavorites, activeHighlight, onFilteringStateChanged } = filtering;
  const [filteringProvDataChanged, setFilteringProvDataChanged] = useState({});
  const [filteringDataProvider, setFilteringDataProvider] = useState<FilteringPropertyDataProvider>();
  useEffect(() => {
    const valueFilterer = new DisplayValuePropertyDataFilterer(filterText);
    const labelFilterer = new LabelPropertyDataFilterer(filterText);
    const categoryFilterer = new PropertyCategoryLabelFilterer(filterText);
    const favoriteFilterer = new FavoritePropertiesDataFilterer({ source: dataProvider, favoritesScope: FAVORITES_SCOPE, isActive: onlyFavorites });

    const recordFilterer = new CompositePropertyDataFilterer(labelFilterer, CompositeFilterType.Or, valueFilterer);
    const textFilterer = new CompositePropertyDataFilterer(recordFilterer, CompositeFilterType.Or, categoryFilterer);
    const favoriteTextFilterer = new CompositePropertyDataFilterer(textFilterer, CompositeFilterType.And, favoriteFilterer);
    const filteringDataProv = new FilteringPropertyDataProvider(dataProvider, favoriteTextFilterer);
    filteringDataProv.onDataChanged.addListener(() => {
      setFilteringProvDataChanged({});
    });
    setFilteringDataProvider(filteringDataProv);
    return () => {
      filteringDataProv.dispose();
    };
  }, [dataProvider, filterText, onlyFavorites]);

  const { value: filteringResult } = useDebouncedAsyncValue(
    useCallback(async () => {
      return filteringDataProvider?.getData();
    }, [filteringDataProvider, filteringProvDataChanged]), // eslint-disable-line react-hooks/exhaustive-deps
  );
  useEffect(() => {
    onFilteringStateChanged(filteringResult);
  }, [filteringResult, onFilteringStateChanged]);

  const renderFavoritesActionButton = useCallback(
    (buttonProps: ActionButtonRendererProps) => <FavoritePropertyActionButton {...buttonProps} dataProvider={dataProvider} />,
    [dataProvider],
  );
  const renderCopyActionButton = useCallback(() => <CopyActionButton />, []);

  const [contextMenuArgs, setContextMenuArgs] = useState<PropertyGridContextMenuArgs>();
  const onPropertyContextMenu = useCallback((args: PropertyGridContextMenuArgs) => {
    args.event.persist();
    setContextMenuArgs(args);
  }, []);
  const onCloseContextMenu = useCallback(() => {
    setContextMenuArgs(undefined);
  }, []);
  const navigationPropertyEditorContextProviderProps = useNavigationPropertyEditorContextProviderProps(imodel, dataProvider);

  if (!filteringDataProvider) {
    return null;
  }

  if (numSelectedElements === 0) {
    return (
      <Flex justifyContent="center" style={{ height: "100%" }}>
        {IModelApp.localization.getLocalizedString("Sample:property-grid.no-elements-selected")}
      </Flex>
    );
  }

  if (isOverLimit) {
    return (
      <Flex justifyContent="center" style={{ height: "100%" }}>
        {IModelApp.localization.getLocalizedString("Sample:property-grid.too-many-elements-selected")}
      </Flex>
    );
  }

  return (
    <>
      <NavigationPropertyEditorContextProvider {...navigationPropertyEditorContextProviderProps}>
        <VirtualizedPropertyGridWithDataProvider
          width={width}
          height={height}
          dataProvider={filteringDataProvider}
          isPropertyHoverEnabled={true}
          onPropertyContextMenu={onPropertyContextMenu}
          actionButtonRenderers={[renderFavoritesActionButton, renderCopyActionButton]}
          orientation={Orientation.Horizontal}
          horizontalOrientationMinWidth={500}
          highlight={
            filterText && filterText.length !== 0 ? { highlightedText: filterText, activeHighlight, filteredTypes: filteringResult?.filteredTypes } : undefined
          }
          isPropertyEditingEnabled={true}
          onPropertyUpdated={async ({ newValue, propertyRecord }) => {
            console.log(`Updated new value for "${propertyRecord.property.displayLabel}": ${JSON.stringify(newValue)}`); // eslint-disable-line no-console
            const aspectClassName = propertyRecord.extendedData?.[PROPERTY_RECORD_EXTENDED_DATA_BaseAspectClassName];
            if (aspectClassName) {
              assert(newValue.valueFormat === PropertyValueFormat.Primitive);
              const elementIds = (await getDataProviderElementIds(dataProvider)).join(",");
              if (propertyRecord.property.typename === "boolean") {
                newValue.value
                  ? console.log(`TODO: for elements [${elementIds}], insert an instance of "${aspectClassName}"`)
                  : console.log(`TODO: for elements [${elementIds}], remove associated instance of "${aspectClassName}"`);
              } else if (propertyRecord.property.typename === "enum") {
                console.log(`TODO: for elements [${elementIds}], remove all associated instances of "${aspectClassName}"${newValue.value !== "" ? `and insert "${newValue.value as string}"` : ``}`);
              }
            }
            return true;
          }}
        />
      </NavigationPropertyEditorContextProvider>
      {contextMenuArgs && <PropertiesWidgetContextMenu args={contextMenuArgs} dataProvider={dataProvider} onCloseContextMenu={onCloseContextMenu} />}
    </>
  );
}

async function getDataProviderElementIds(dataProvider: PresentationPropertyDataProvider) {
  const content = await dataProvider.getContent();
  return content ? content.contentSet.flatMap((contentItem) => contentItem.primaryKeys.map((key) => key.id)) : [];
}

type ContextMenuItemInfo = ContextMenuItemProps & { id: string; label: string };
interface PropertiesWidgetContextMenuProps {
  dataProvider: PresentationPropertyDataProvider;
  args: PropertyGridContextMenuArgs;
  onCloseContextMenu: () => void;
}
function PropertiesWidgetContextMenu(props: PropertiesWidgetContextMenuProps) {
  const {
    dataProvider,
    args: { propertyRecord: record },
    onCloseContextMenu,
  } = props;
  const imodel = dataProvider.imodel;

  const addFavorite = useCallback(
    async (propertyField: Field) => {
      await Presentation.favoriteProperties.add(propertyField, imodel, FAVORITES_SCOPE);
      onCloseContextMenu();
    },
    [onCloseContextMenu, imodel],
  );

  const removeFavorite = useCallback(
    async (propertyField: Field) => {
      await Presentation.favoriteProperties.remove(propertyField, imodel, FAVORITES_SCOPE);
      onCloseContextMenu();
    },
    [onCloseContextMenu, imodel],
  );

  const asyncItems = useDebouncedAsyncValue(
    useCallback(async () => {
      const field = await dataProvider.getFieldByPropertyDescription(record.property);
      const items: ContextMenuItemInfo[] = [];
      if (field !== undefined) {
        if (await Presentation.favoriteProperties.hasAsync(field, imodel, FAVORITES_SCOPE)) {
          items.push({
            id: "remove-favorite",
            onSelect: async () => removeFavorite(field),
            title: IModelApp.localization.getLocalizedString("Sample:controls.properties.context-menu.remove-favorite.description"),
            label: IModelApp.localization.getLocalizedString("Sample:controls.properties.context-menu.remove-favorite.label"),
          });
        } else {
          items.push({
            id: "add-favorite",
            onSelect: async () => addFavorite(field),
            title: IModelApp.localization.getLocalizedString("Sample:controls.properties.context-menu.add-favorite.description"),
            label: IModelApp.localization.getLocalizedString("Sample:controls.properties.context-menu.add-favorite.label"),
          });
        }
      }
      return items;
    }, [imodel, dataProvider, record, addFavorite, removeFavorite]),
  );

  if (!asyncItems.value || asyncItems.value.length === 0) {
    return null;
  }

  return (
    <GlobalContextMenu
      opened={true}
      onOutsideClick={onCloseContextMenu}
      onEsc={onCloseContextMenu}
      identifier="PropertiesWidget"
      x={props.args.event.clientX}
      y={props.args.event.clientY}
    >
      {asyncItems.value.map((item) => (
        <ContextMenuItem key={item.id} onSelect={item.onSelect} title={item.title}>
          {item.label}
        </ContextMenuItem>
      ))}
    </GlobalContextMenu>
  );
}

function FavoritePropertyActionButton(props: ActionButtonRendererProps & { dataProvider: PresentationPropertyDataProvider }) {
  const { property: record, dataProvider } = props;
  const { value: field } = useDebouncedAsyncValue(
    useCallback(async () => dataProvider.getFieldByPropertyDescription(record.property), [dataProvider, record.property]),
  );
  const { value: isFieldFavorite } = useDebouncedAsyncValue(
    useCallback(async () => field && Presentation.favoriteProperties.hasAsync(field, dataProvider.imodel, FAVORITES_SCOPE), [field, dataProvider]),
  );
  return (
    <div>{field && (isFieldFavorite || props.isPropertyHovered) ? <FavoriteFieldActionButton field={field} imodel={dataProvider.imodel} /> : undefined}</div>
  );
}

function FavoriteFieldActionButton(props: { imodel: IModelConnection; field: Field }) {
  const { field, imodel } = props;
  const toggleFavoriteProperty = useCallback(async () => {
    if (await Presentation.favoriteProperties.hasAsync(field, imodel, FAVORITES_SCOPE)) {
      await Presentation.favoriteProperties.remove(field, imodel, FAVORITES_SCOPE);
    } else {
      await Presentation.favoriteProperties.add(field, imodel, FAVORITES_SCOPE);
    }
  }, [field, imodel]);
  const { value: isFieldFavorite } = useDebouncedAsyncValue(
    useCallback(async () => field && Presentation.favoriteProperties.hasAsync(field, props.imodel, FAVORITES_SCOPE), [field, props.imodel]),
  );
  return (
    <div className="favorite-action-button" onClick={toggleFavoriteProperty} onKeyDown={toggleFavoriteProperty} role="button" tabIndex={0}>
      {isFieldFavorite ? (
        <div style={{ width: "20px", height: "20px", background: "orange" }} />
      ) : (
        <div style={{ width: "20px", height: "20px", background: "blue" }} />
      )}
    </div>
  );
}

function CopyActionButton() {
  return (
    <div className="copy-action-button" style={{ height: "20px" }}>
      Copy
    </div>
  );
}

class AutoExpandingPropertyDataProvider extends PresentationPropertyDataProvider {
  public override async getData(): Promise<PropertyData> {
    const result = await super.getData();
    this.expandCategories(result.categories);

    if (result.categories.length > 0) {
      this.pushFakePropertyRecords(result);
      await this.enableAspectsEditingOnFakeProperties(Object.values(result.records).flat());
    }

    return result;
  }

  private expandCategories(categories: PropertyCategory[]) {
    categories.forEach((category: PropertyCategory) => {
      category.expand = true;
      if (category.childCategories) {
        this.expandCategories(category.childCategories);
      }
    });
  }

  /**
   * These records would already be there, coming from the backend, specified through presentation rules.
   * For PoC purposes we just add them here.
   */
  private pushFakePropertyRecords(data: PropertyData) {
    const recordBooleanFalse = new PropertyRecord(
      {
        valueFormat: PropertyValueFormat.Primitive,
        displayValue: "False",
        value: false,
      },
      {
        displayLabel: "Fake false boolean property",
        name: "FakeFalseBooleanProperty",
        typename: "boolean",
      },
    );
    const recordBooleanTrue = new PropertyRecord(
      {
        valueFormat: PropertyValueFormat.Primitive,
        displayValue: "True",
        value: true,
      },
      {
        displayLabel: "Fake true boolean property",
        name: "FakeTrueBooleanProperty",
        typename: "boolean",
      },
    );
    const recordEnumNoValue = new PropertyRecord(
      {
        valueFormat: PropertyValueFormat.Primitive,
        displayValue: "",
        value: "",
      },
      {
        displayLabel: "Fake enum property with no value",
        name: "FakeEnumPropertyNoValue",
        typename: "string",
      },
    );
    const recordEnumWithValue = new PropertyRecord(
      {
        valueFormat: PropertyValueFormat.Primitive,
        displayValue: "External Source Aspect",
        value: "BisCore.ExternalSourceAspect",
      },
      {
        displayLabel: "Fake enum property with value",
        name: "FakeEnumPropertyWithValue",
        typename: "string",
      },
    );
    [recordBooleanFalse, recordBooleanTrue, recordEnumNoValue, recordEnumWithValue].forEach((record) => {
      record.extendedData = {
        // this value would be coming from calculated property specification in presentation rules
        [PROPERTY_RECORD_EXTENDED_DATA_BaseAspectClassName]: "BisCore.ElementMultiAspect",
      };
      data.records[data.categories[0].name].push(record);
    });
  }

  private async enableAspectsEditingOnFakeProperties(records: PropertyRecord[]) {
    await Promise.all(records.map(async (record) => this.enableAspectsEditingOnFakeProperty(record)));
  }

  private async enableAspectsEditingOnFakeProperty(record: PropertyRecord) {
    const baseAspectClassName = record.extendedData?.[PROPERTY_RECORD_EXTENDED_DATA_BaseAspectClassName];
    if (
      // not a fake property associated with a base aspect class
      !baseAspectClassName ||
      // not a string means it's probably a "checkbox" rather than an "enum" - no need to query the enum values
      record.property.typename !== "string"
    ) {
      return;
    }

    // Ideally, we should use the schema context to find derived classes - the schemas get cached, so it would be less traveling to the backend.
    // However, I don't see an option to get derived classes - only the base ones... @Colin
    // const baseAspectClass = await MyAppFrontend.getSchemaContext(this.imodel).getSchemaItem<ECClass>(new SchemaItemKey(className, new SchemaKey(schemaName)));

    // So for the PoC purposes we just load that information using a meta query
    const enumValues: { value: string; label: string }[] = [];
    enumValues.push({ value: "", label: "" }); // make the combo box nullable
    for await (const row of this.imodel.createQueryReader(
      `
        SELECT ec_classname(ECInstanceId, 's.c'), DisplayLabel
        FROM meta.ECClassDef
        WHERE ECInstanceId IS (${baseAspectClassName}) AND Modifier <> 1
      `,
    )) {
      const className = row[0];
      const classLabel = row[1];
      enumValues.push({ value: className, label: classLabel });
    }
    record.property.typename = "enum";
    record.property.enum = {
      isStrict: true,
      choices: enumValues,
    };
  }
}

const PROPERTY_RECORD_EXTENDED_DATA_BaseAspectClassName = "BaseAspectClassName";
