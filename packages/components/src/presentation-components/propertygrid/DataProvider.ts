/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module PropertyGrid
 */

import "../common/DisposePolyfill.js";
import { inPlaceSort } from "fast-sort";
import { PropertyRecord, PropertyValueFormat as UiPropertyValueFormat } from "@itwin/appui-abstract";
import { IPropertyDataProvider, PropertyCategory, PropertyData, PropertyDataChangeEvent } from "@itwin/components-react";
import { assert } from "@itwin/core-bentley";
import { IModelConnection } from "@itwin/core-frontend";
import {
  addFieldHierarchy,
  CategoryDescription,
  ContentFlags,
  createFieldHierarchies,
  DefaultContentDisplayTypes,
  Descriptor,
  DescriptorOverrides,
  Field,
  FieldHierarchy,
  InstanceKey,
  NestedContentValue,
  PropertyValueFormat as PresentationPropertyValueFormat,
  ProcessFieldHierarchiesProps,
  ProcessPrimitiveValueProps,
  RelationshipMeaning,
  Ruleset,
  StartArrayProps,
  StartContentProps,
  StartStructProps,
  traverseContentItem,
  Value,
  ValuesMap,
} from "@itwin/presentation-common";
import { createIModelKey } from "@itwin/presentation-core-interop";
import { FavoritePropertiesScope, Presentation } from "@itwin/presentation-frontend";
import { FieldHierarchyRecord, InternalPropertyRecordsBuilder, IPropertiesAppender } from "../common/ContentBuilder.js";
import { CacheInvalidationProps, ContentDataProvider, IContentDataProvider } from "../common/ContentDataProvider.js";
import { DiagnosticsProps } from "../common/Diagnostics.js";
import { createLabelRecord, findField, memoize, WithIModelKey } from "../common/Utils.js";
import { FAVORITES_CATEGORY_NAME, getFavoritesCategory } from "../favorite-properties/Utils.js";

// eslint-disable-next-line @typescript-eslint/unbound-method
const labelsComparer = new Intl.Collator(undefined, { sensitivity: "base" }).compare;

/**
 * Default presentation ruleset used by [[PresentationPropertyDataProvider]]. The ruleset just gets properties
 * of the selected elements.
 *
 * @public
 */
export const DEFAULT_PROPERTY_GRID_RULESET: Ruleset = {
  id: "presentation-components/DefaultPropertyGridContent",
  rules: [
    {
      ruleType: "Content",
      onlyIfNotHandled: true,
      specifications: [
        {
          specType: "SelectedNodeInstances",
        },
      ],
    },
  ],
};

/**
 * Interface for presentation rules-driven property data provider.
 * @public
 */
export type IPresentationPropertyDataProvider = IPropertyDataProvider & IContentDataProvider;

/**
 * Properties for creating a [[PresentationPropertyDataProvider]] instance.
 * @public
 */
export interface PresentationPropertyDataProviderProps extends DiagnosticsProps {
  /** IModelConnection to use for requesting property data. */
  imodel: IModelConnection;

  /**
   * Id of the ruleset to use when requesting properties or a ruleset itself. If not
   * set, default presentation rules are used which return content for the selected elements.
   */
  ruleset?: string | Ruleset;

  /**
   * If true, additional 'favorites' category is not created.
   */
  disableFavoritesCategory?: boolean;
}

/**
 * Presentation Rules-driven property data provider implementation.
 * @public
 */
export class PresentationPropertyDataProvider extends ContentDataProvider implements IPresentationPropertyDataProvider {
  public onDataChanged = new PropertyDataChangeEvent();
  private _includeFieldsWithNoValues: boolean;
  private _includeFieldsWithCompositeValues: boolean;
  private _isNestedPropertyCategoryGroupingEnabled: boolean;
  private _onFavoritesChangedRemoveListener?: () => void;
  private _shouldCreateFavoritesCategory: boolean;

  /**
   * Constructor
   */
  constructor(props: PresentationPropertyDataProviderProps) {
    super({
      imodel: props.imodel,
      ruleset: props.ruleset ? props.ruleset : DEFAULT_PROPERTY_GRID_RULESET,
      displayType: DefaultContentDisplayTypes.PropertyPane,
      ruleDiagnostics: props.ruleDiagnostics,
      devDiagnostics: props.devDiagnostics,
    });
    this._includeFieldsWithNoValues = true;
    this._includeFieldsWithCompositeValues = true;
    this._isNestedPropertyCategoryGroupingEnabled = true;
    this._shouldCreateFavoritesCategory = !props.disableFavoritesCategory;
  }

  #dispose() {
    super[Symbol.dispose]();
    if (this._onFavoritesChangedRemoveListener) {
      this._onFavoritesChangedRemoveListener();
      this._onFavoritesChangedRemoveListener = undefined;
    }
  }

  /**
   * Dispose the presentation property data provider.
   */
  public override [Symbol.dispose]() {
    this.#dispose();
  }

  /** @deprecated in 5.7. Use `[Symbol.dispose]` instead. */
  /* c8 ignore next 3 */
  public override dispose() {
    this.#dispose();
  }

  /**
   * Invalidates cached content and clears categorized data.
   */
  protected override invalidateCache(props: CacheInvalidationProps): void {
    super.invalidateCache(props);
    this.getMemoizedData.cache.keys.length = 0;
    this.getMemoizedData.cache.values.length = 0;
    this.onDataChanged.raiseEvent();
  }

  /**
   * Provides content configuration for the property grid
   */
  protected override async getDescriptorOverrides(): Promise<DescriptorOverrides> {
    return {
      ...(await super.getDescriptorOverrides()),
      contentFlags: ContentFlags.ShowLabels | ContentFlags.MergeResults,
    };
  }

  /**
   * Hides the computed display label field from the list of properties
   */
  protected isFieldHidden(field: Field) {
    return field.name === "/DisplayLabel/";
  }

  /**
   * Should fields with no values be included in the property list. No value means:
   * - For *primitive* fields: `null`, `undefined`, `""` (empty string)
   * - For *array* fields: `[]` (empty array)
   * - For *struct* fields: `{}` (object with no members)
   *
   * @deprecated in 3.x. Use [FilteringPropertyDataProvider]($components-react) and [IPropertyDataFilterer]($components-react) APIs for filtering-out properties.
   */
  public get includeFieldsWithNoValues(): boolean {
    return this._includeFieldsWithNoValues;
  }
  public set includeFieldsWithNoValues(value: boolean) {
    if (this._includeFieldsWithNoValues === value) {
      return;
    }
    this._includeFieldsWithNoValues = value;
    this.invalidateCache({ content: true });
  }

  /**
   * Should fields with composite values be included in the property list.
   * Fields with composite values:
   * - *array* fields.
   * - *struct* fields.
   *
   * @deprecated in 3.x. Use [FilteringPropertyDataProvider]($components-react) and [IPropertyDataFilterer]($components-react) APIs for filtering-out properties.
   */
  public get includeFieldsWithCompositeValues(): boolean {
    return this._includeFieldsWithCompositeValues;
  }
  public set includeFieldsWithCompositeValues(value: boolean) {
    if (this._includeFieldsWithCompositeValues === value) {
      return;
    }
    this._includeFieldsWithCompositeValues = value;
    this.invalidateCache({ content: true });
  }

  /**
   * Is nested property categories enabled. Defaults to `true`.
   */
  public get isNestedPropertyCategoryGroupingEnabled(): boolean {
    return this._isNestedPropertyCategoryGroupingEnabled;
  }
  public set isNestedPropertyCategoryGroupingEnabled(value: boolean) {
    if (this._isNestedPropertyCategoryGroupingEnabled === value) {
      return;
    }
    this._isNestedPropertyCategoryGroupingEnabled = value;
    this.invalidateCache({ content: true });
  }

  /* eslint-disable @typescript-eslint/no-deprecated */
  /**
   * Should the specified field be included in the favorites category.
   * @deprecated in 5.2. Use `isFieldFavoriteAsync` instead.
   */
  protected isFieldFavorite(field: Field): boolean {
    return this._shouldCreateFavoritesCategory && Presentation.favoriteProperties.has(field, this.imodel, FavoritePropertiesScope.IModel);
  }
  /** Should the specified field be included in the favorites category. */
  protected async isFieldFavoriteAsync(field: Field): Promise<boolean> {
    if (this.isFieldFavorite === PresentationPropertyDataProvider.prototype.isFieldFavorite) {
      // if the actual `isFieldFavorite` matches the one in prototype, it means it wasn't overridden,
      // so we can just ignore it and use the new async version
      return this._shouldCreateFavoritesCategory ? isFieldFavorite(field, this.imodel) : false;
    }
    // otherwise, we need to call the deprecated method to stay backwards compatible...
    return this.isFieldFavorite(field);
  }
  /* eslint-enable @typescript-eslint/no-deprecated */

  /**
   * Sorts the specified list of categories by priority. May be overriden
   * to supply a different sorting algorithm.
   */
  protected sortCategories(categories: CategoryDescription[]): void {
    inPlaceSort(categories).by([{ desc: (c) => c.priority }, { asc: (c) => c.label, comparer: labelsComparer }]);
  }

  /* eslint-disable @typescript-eslint/no-deprecated */
  /**
   * Sorts the specified list of fields by priority. May be overriden to supply a different sorting algorithm.
   * @deprecated in 5.2. Use `sortFieldsAsync` instead.
   */
  protected sortFields(category: CategoryDescription, fields: Field[]): void {
    /* c8 ignore start */
    if (category.name === FAVORITES_CATEGORY_NAME) {
      Presentation.favoriteProperties.sortFields(this.imodel, fields);
    } else {
      inPlaceSort(fields).by([{ desc: (f) => f.priority }, { asc: (f) => f.label, comparer: labelsComparer }]);
    }
    /* c8 ignore end */
  }
  /**
   * Sorts the specified list of fields by priority. May be overriden to supply a different sorting algorithm.
   */
  protected async sortFieldsAsync(category: CategoryDescription, fields: Field[]): Promise<void> {
    if (this.sortFields === PresentationPropertyDataProvider.prototype.sortFields) {
      // if the actual `sortFields` matches the one in prototype, it means it wasn't overridden,
      // so we can just ignore it and use the new async version
      category.name === FAVORITES_CATEGORY_NAME
        ? await sortFavoriteFields(fields, this.imodel)
        : inPlaceSort(fields).by([{ desc: (f) => f.priority }, { asc: (f) => f.label, comparer: labelsComparer }]);
      return;
    }
    // otherwise, we need to call the deprecated method to stay backwards compatible...
    this.sortFields(category, fields);
  }
  /* eslint-enable @typescript-eslint/no-deprecated */

  /**
   * Returns property data.
   */

  protected getMemoizedData = memoize(async (): Promise<PropertyData> => {
    this.setupFavoritePropertiesListener();
    const content = await this.getContent();
    if (!content || 0 === content.contentSet.length) {
      return createDefaultPropertyData();
    }

    const contentItem = content.contentSet[0];
    const callbacks: PropertyPaneCallbacks = {
      isFavorite: async (field) => this.isFieldFavoriteAsync(field),
      isHidden: (field) => this.isFieldHidden(field),
      sortCategories: (categories) => this.sortCategories(categories),
      sortFields: async (category, fields) => this.sortFieldsAsync(category, fields),
    };
    const builder = await PropertyDataBuilder.create({
      imodel: this.imodel,
      descriptor: content.descriptor,
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      includeWithNoValues: this.includeFieldsWithNoValues,
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      includeWithCompositeValues: this.includeFieldsWithCompositeValues,
      wantNestedCategories: this._isNestedPropertyCategoryGroupingEnabled,
      callbacks,
    });
    traverseContentItem(builder, content.descriptor, contentItem);
    return builder.getPropertyData();
  });

  /**
   * Returns property data.
   */
  public async getData(): Promise<PropertyData> {
    return this.getMemoizedData();
  }

  /**
   * Get keys of instances which were used to create given [PropertyRecord]($appui-abstract).
   */
  public async getPropertyRecordInstanceKeys(record: PropertyRecord): Promise<InstanceKey[]> {
    const content = await this.getContent();
    if (!content || 0 === content.contentSet.length) {
      return [];
    }

    let recordField = findField(content.descriptor, record.property.name);
    if (!recordField) {
      return [];
    }

    const fieldsStack: Field[] = [];
    while (recordField.parent) {
      recordField = recordField.parent;
      fieldsStack.push(recordField);
    }
    fieldsStack.reverse();

    let contentItems: Array<{ primaryKeys: InstanceKey[]; values: ValuesMap }> = content.contentSet;
    fieldsStack.forEach((field) => {
      const nestedContent = contentItems.reduce((nc, curr) => {
        const currItemValue = curr.values[field.name];
        assert(Value.isNestedContent(currItemValue));
        nc.push(...currItemValue);
        return nc;
      }, new Array<NestedContentValue>());
      contentItems = nestedContent.map((nc) => ({
        primaryKeys: nc.primaryKeys,
        values: nc.values,
      }));
    });

    return contentItems.reduce((keys, curr) => {
      keys.push(...curr.primaryKeys);
      return keys;
    }, new Array<InstanceKey>());
  }

  private setupFavoritePropertiesListener() {
    /* c8 ignore next 3 */
    if (this._onFavoritesChangedRemoveListener) {
      return;
    }
    this._onFavoritesChangedRemoveListener = Presentation.favoriteProperties.onFavoritesChanged.addListener(() => this.invalidateCache({}));
  }
}

async function isFieldFavorite(field: Field, imodel: IModelConnection) {
  if (Presentation.favoriteProperties.hasAsync) {
    return Presentation.favoriteProperties.hasAsync(field, imodel, FavoritePropertiesScope.IModel);
  }
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  return Presentation.favoriteProperties.has(field, imodel, FavoritePropertiesScope.IModel);
}

async function sortFavoriteFields(fields: Field[], imodel: IModelConnection) {
  if (Presentation.favoriteProperties.sortFieldsAsync) {
    await Presentation.favoriteProperties.sortFieldsAsync(imodel, fields);
    return;
  }
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  Presentation.favoriteProperties.sortFields(imodel, fields);
}

const createDefaultPropertyData = (): PropertyData => ({
  label: PropertyRecord.fromString("", "label"),
  categories: [],
  records: {},
});

interface PropertyPaneCallbacks {
  isFavorite(field: Field): Promise<boolean>;
  isHidden(field: Field): boolean;
  sortCategories(categories: CategoryDescription[]): void;
  sortFields: (category: CategoryDescription, fields: Field[]) => Promise<void>;
}
interface PropertyDataBuilderProps {
  imodel: IModelConnection;
  descriptor: Descriptor;
  includeWithNoValues: boolean;
  includeWithCompositeValues: boolean;
  callbacks: PropertyPaneCallbacks;
  wantNestedCategories: boolean;
}
class PropertyDataBuilder extends InternalPropertyRecordsBuilder {
  private _props: PropertyDataBuilderProps;
  private _result: PropertyData | undefined;
  private _categoriesCache: PropertyCategoriesCache;
  private _categorizedRecords = new Map<string, FieldHierarchyRecord[]>();
  private _favoriteFieldHierarchies: FieldHierarchy[] = [];
  private _asyncTasks: Array<Promise<void>> = [];

  private constructor(props: PropertyDataBuilderProps) {
    super(
      (item) => ({
        item,
        append: (record: FieldHierarchyRecord): void => {
          const category = record.fieldHierarchy.field.category;
          let records = this._categorizedRecords.get(category.name);
          if (!records) {
            records = [];
            this._categorizedRecords.set(category.name, records);
          }
          records.push(record);
        },
      }),
      (record: WithIModelKey<PropertyRecord>) => {
        record.imodelKey = createIModelKey(props.imodel);
      },
    );
    this._props = props;
    this._categoriesCache = new PropertyCategoriesCache(props.wantNestedCategories);
  }

  public static async create(props: PropertyDataBuilderProps) {
    const builder = new PropertyDataBuilder(props);
    await builder.initFavoriteFields(props.descriptor);
    return builder;
  }

  private async initFavoriteFields(descriptor: Descriptor) {
    const fieldHierarchies = createFieldHierarchies(descriptor.fields);
    this._favoriteFieldHierarchies = await this.createFavoriteFieldsList(fieldHierarchies);
  }

  public async getPropertyData() {
    await Promise.all(this._asyncTasks);
    assert(this._result !== undefined);
    return this._result;
  }

  public override startContent(props: StartContentProps): boolean {
    this._categoriesCache.initFromDescriptor(props.descriptor);
    return super.startContent(props);
  }

  public override finishItem(): void {
    assert(this._result === undefined);
    const categorizedRecords: { [categoryName: string]: PropertyRecord[] } = {};
    this._categorizedRecords.forEach((recs, categoryName) => {
      destructureRecords(recs);
      if (recs.length) {
        // note: will await on all async tasks before returning the result
        this._asyncTasks.push(
          (async () => {
            const sortedFields = recs.map((r) => r.fieldHierarchy.field);
            await this._props.callbacks.sortFields(this._categoriesCache.getEntry(categoryName)!, sortedFields);
            categorizedRecords[categoryName] = sortedFields.map((field) => recs.find((r) => r.fieldHierarchy.field === field)!.record);
          })(),
        );
      }
    });
    assert(IPropertiesAppender.isRoot(this.currentPropertiesAppender));
    const item = this.currentPropertiesAppender.item;
    this._result = {
      label: createLabelRecord(item.label, "label"),
      description: item.classInfo ? item.classInfo.label : undefined,
      categories: this.createPropertyCategories()
        .filter(({ categoryHasParent }) => !categoryHasParent)
        .map(({ category }) => category),
      records: categorizedRecords,
      reusePropertyDataState: true,
    };
  }

  private createPropertyCategories(): Array<{ category: PropertyCategory; source: CategoryDescription; categoryHasParent: boolean }> {
    // determine which categories are actually used
    const usedCategoryNames = new Set();
    this._categorizedRecords.forEach((records, categoryName) => {
      /* c8 ignore next 3 */
      if (records.length === 0) {
        return;
      }

      let category = this._categoriesCache.getEntry(categoryName);
      while (category) {
        usedCategoryNames.add(category.name);

        if (!this._props.wantNestedCategories) {
          break;
        }

        category = category.parent ? this._categoriesCache.getEntry(category.parent.name) : undefined;
      }
    });

    // set up categories hierarchy
    const categoriesHierarchy = new Map<CategoryDescription | undefined, CategoryDescription[]>();
    this._categoriesCache.getEntries().forEach((category) => {
      if (!usedCategoryNames.has(category.name)) {
        // skip unused categories
        return;
      }

      const parentCategory = this._props.wantNestedCategories ? category.parent : undefined;
      let childCategories = categoriesHierarchy.get(parentCategory);
      if (!childCategories) {
        childCategories = [];
        categoriesHierarchy.set(parentCategory, childCategories);
      }
      childCategories.push(category);
    });

    // sort categories
    const nestedSortCategory = (category: CategoryDescription | undefined) => {
      const childCategories = categoriesHierarchy.get(category);
      if (childCategories && childCategories.length > 1) {
        this._props.callbacks.sortCategories(childCategories);
      }

      if (childCategories) {
        childCategories.forEach(nestedSortCategory);
      }
    };
    nestedSortCategory(undefined);

    // create a hierarchy of PropertyCategory
    const propertyCategories = new Array<{
      category: PropertyCategory;
      source: CategoryDescription;
      categoryHasParent: boolean;
    }>();
    const pushPropertyCategories = (parentDescr?: CategoryDescription) => {
      const childCategoryDescriptions = categoriesHierarchy.get(parentDescr);
      const childPropertyCategories = (childCategoryDescriptions ?? []).map((categoryDescr) => {
        const category: PropertyCategory = {
          name: categoryDescr.name,
          label: categoryDescr.label,
          expand: categoryDescr.expand,
        };
        if (categoryDescr.renderer) {
          category.renderer = categoryDescr.renderer;
        }
        return { category, source: categoryDescr, categoryHasParent: parentDescr !== undefined };
      });
      propertyCategories.push(...childPropertyCategories);
      for (const categoryInfo of childPropertyCategories) {
        const childCategories = pushPropertyCategories(categoryInfo.source);
        if (childCategories.length) {
          categoryInfo.category.childCategories = childCategories;
        }
      }
      return childPropertyCategories.map((categoryInfo) => categoryInfo.category);
    };
    pushPropertyCategories(undefined);
    return propertyCategories;
  }

  private buildFavoriteFieldAncestors(field: Field) {
    let parentField = field.parent;
    while (parentField) {
      parentField = parentField.clone();
      parentField.nestedFields = [field];
      parentField.category = this._categoriesCache.getFavoriteCategory(parentField.category);
      field = parentField;
      parentField = parentField.parent;
    }
    field.rebuildParentship();
  }
  private createFavoriteFieldsHierarchy(hierarchy: FieldHierarchy): FieldHierarchy {
    const favoriteField = hierarchy.field.clone();
    favoriteField.category = this._categoriesCache.getFavoriteCategory(hierarchy.field.category);
    this.buildFavoriteFieldAncestors(favoriteField);
    return {
      field: favoriteField,
      childFields: hierarchy.childFields.map((c) => this.createFavoriteFieldsHierarchy(c)),
    };
  }
  private async createFavoriteFieldsList(fieldHierarchies: FieldHierarchy[]): Promise<FieldHierarchy[]> {
    const favorites: FieldHierarchy[] = [];
    await Promise.all(
      fieldHierarchies.map(async (fh) =>
        traverseFieldHierarchy(fh, async (hierarchy) => {
          if (!(await this._props.callbacks.isFavorite(hierarchy.field))) {
            return true;
          }
          addFieldHierarchy(favorites, this.createFavoriteFieldsHierarchy(hierarchy));
          return false;
        }),
      ),
    );
    return favorites;
  }
  public override processFieldHierarchies(props: ProcessFieldHierarchiesProps): void {
    super.processFieldHierarchies(props);
    props.hierarchies.push(...this._favoriteFieldHierarchies);
  }

  public override startStruct(props: StartStructProps): boolean {
    if (this.shouldSkipField(props.hierarchy.field, () => !Object.keys(props.rawValues).length)) {
      return false;
    }

    return super.startStruct(props);
  }

  public override startArray(props: StartArrayProps): boolean {
    if (this.shouldSkipField(props.hierarchy.field, () => !props.rawValues.length)) {
      return false;
    }

    return super.startArray(props);
  }

  public override processPrimitiveValue(props: ProcessPrimitiveValueProps): void {
    if (this.shouldSkipField(props.field, () => null === props.rawValue || undefined === props.rawValue || "" === props.rawValue)) {
      return;
    }

    super.processPrimitiveValue(props);
  }

  private shouldSkipField(field: Field, isValueEmpty: () => boolean): boolean {
    const isFavorite = this._favoriteFieldHierarchies.find((h) => h.field.name === field.name) !== undefined;

    // skip values of hidden fields
    if (!isFavorite && this._props.callbacks.isHidden(field)) {
      return true;
    }

    // skip empty values
    if (!isFavorite && !this._props.includeWithNoValues && isValueEmpty()) {
      return true;
    }

    if (field.type.valueFormat !== PresentationPropertyValueFormat.Primitive && !this._props.includeWithCompositeValues) {
      // skip composite fields if requested
      return true;
    }

    return false;
  }
}

class PropertyCategoriesCache {
  private _byName = new Map<string, CategoryDescription>();

  constructor(private _enableCategoryNesting: boolean) {}

  public initFromDescriptor(descriptor: Descriptor) {
    descriptor.categories.forEach((category) => {
      this.cache(category);
    });
    this.initFromFields(descriptor.fields);
  }

  private initFromFields(fields: Field[]) {
    fields.forEach((field: Field) => {
      if (field.isNestedContentField()) {
        this.initFromFields(field.nestedFields);
      } else {
        this.cache(field.category);
      }
    });

    // add parent categories that have no fields of their own
    [...this._byName.values()].forEach((entry) => {
      let curr: CategoryDescription | undefined = entry;
      while (curr) {
        curr = curr.parent ? this.cache(curr.parent) : undefined;
      }
    });
  }

  private cache(category: CategoryDescription) {
    const entry = this._byName.get(category.name);
    if (entry) {
      return entry;
    }

    this._byName.set(category.name, category);
    return category;
  }

  public getEntry(descr: string) {
    return this._byName.get(descr);
  }

  public getEntries() {
    return [...this._byName.values()];
  }

  public getFavoriteCategory(sourceCategory: CategoryDescription): CategoryDescription {
    if (!this._enableCategoryNesting) {
      return this.getRootFavoritesCategory();
    }

    const fieldCategoryRenameStatus = this.getRenamedCategory(`${FAVORITES_CATEGORY_NAME}-${sourceCategory.name}`, sourceCategory);
    let curr = fieldCategoryRenameStatus;
    while (!curr.fromCache && curr.category.parent) {
      const parentCategoryRenameStatus = this.getRenamedCategory(`${FAVORITES_CATEGORY_NAME}-${curr.category.parent.name}`, curr.category.parent);
      curr.category.parent = parentCategoryRenameStatus.category;
      curr = parentCategoryRenameStatus;
    }
    if (!curr.fromCache) {
      curr.category.parent = this.getRootFavoritesCategory();
    }
    return fieldCategoryRenameStatus.category;
  }

  private getCachedCategory(name: string, factory: () => CategoryDescription) {
    let cached = this._byName.get(name);
    if (cached) {
      return { category: cached, fromCache: true };
    }

    cached = factory();
    this._byName.set(name, cached);
    return { category: cached, fromCache: false };
  }

  private getRootFavoritesCategory() {
    return this.getCachedCategory(FAVORITES_CATEGORY_NAME, getFavoritesCategory).category;
  }

  private getRenamedCategory(name: string, source: CategoryDescription) {
    return this.getCachedCategory(name, () => ({ ...source, name }));
  }
}

function shouldDestructureArrayField(field: Field) {
  // destructure arrays if they're based on nested content field or nested under a nested content field
  return field.isNestedContentField() || field.parent;
}

function shouldDestructureStructField(field: Field, totalRecordsCount: number | undefined) {
  // destructure structs if they're based on nested content and:
  // - if relationship meaning is 'same instance' - always destructure
  // - if relationship meaning is 'related instance' - only if it's the only record in the list
  return field.isNestedContentField() && (field.relationshipMeaning === RelationshipMeaning.SameInstance || totalRecordsCount === 1);
}

function destructureStructMember(member: FieldHierarchyRecord): Array<FieldHierarchyRecord> {
  // only destructure array member items
  if (
    member.record.value.valueFormat !== UiPropertyValueFormat.Array ||
    !shouldDestructureArrayField(member.fieldHierarchy.field) ||
    !shouldDestructureStructField(member.fieldHierarchy.field, undefined)
  ) {
    return [member];
  }

  // don't want to include struct arrays without items - just return empty array
  if (member.record.value.items.length === 0) {
    return [];
  }

  // the array should be of size 1
  if (member.record.value.items.length > 1) {
    return [member];
  }

  // the single item should be a struct
  const item = member.record.value.items[0];
  assert(item.value.valueFormat === UiPropertyValueFormat.Struct);

  // if all above checks pass, destructure the struct item
  const recs = [{ ...member, record: item }];
  destructureRecords(recs);
  return recs;
}

function destructureStructArrayItems(items: PropertyRecord[], fieldHierarchy: FieldHierarchy) {
  const destructuredFields: FieldHierarchy[] = [];
  fieldHierarchy.childFields.forEach((nestedFieldHierarchy) => {
    let didDestructure = false;
    items.forEach((item) => {
      assert(item.value.valueFormat === UiPropertyValueFormat.Struct);

      if (item.value.members[nestedFieldHierarchy.field.name] === undefined) {
        // the member may not exist at all if we decided to skip it beforehand
        return;
      }

      // destructure a single struct array item member
      const destructuredMembers = destructureStructMember({
        fieldHierarchy: nestedFieldHierarchy,
        record: item.value.members[nestedFieldHierarchy.field.name],
      });

      // remove the old member and insert all destructured new members
      delete item.value.members[nestedFieldHierarchy.field.name];
      destructuredMembers.forEach((destructuredMember) => {
        assert(item.value.valueFormat === UiPropertyValueFormat.Struct);
        item.value.members[destructuredMember.fieldHierarchy.field.name] = destructuredMember.record;
      });

      // store new members. all items are expected to have the same members, so only need to do this once
      if (!didDestructure) {
        destructuredMembers.forEach((destructuredMember) => destructuredFields.push(destructuredMember.fieldHierarchy));
        didDestructure = true;
      }
    });
  });

  // if we got a chance to destructure at least one item, replace old members with new ones
  // in the field hierarchy that we got
  if (items.length > 0) {
    fieldHierarchy.childFields = destructuredFields;
  }
}

function destructureRecords(records: FieldHierarchyRecord[]) {
  let i = 0;
  while (i < records.length) {
    const entry = records[i];

    if (entry.record.value.valueFormat === UiPropertyValueFormat.Array && shouldDestructureArrayField(entry.fieldHierarchy.field)) {
      if (shouldDestructureStructField(entry.fieldHierarchy.field, 1)) {
        // destructure individual array items
        destructureStructArrayItems(entry.record.value.items, entry.fieldHierarchy);
      }

      // destructure 0 or 1 sized arrays by removing the array record and putting its first item in its place (if any)
      if (entry.record.value.items.length <= 1) {
        records.splice(i, 1);
        if (entry.record.value.items.length > 0) {
          const item = entry.record.value.items[0];
          records.splice(i, 0, { ...entry, fieldHierarchy: entry.fieldHierarchy, record: item });
        }
        continue;
      }
    }

    if (entry.record.value.valueFormat === UiPropertyValueFormat.Struct && shouldDestructureStructField(entry.fieldHierarchy.field, records.length)) {
      // destructure structs by replacing them with their member records
      const members = entry.fieldHierarchy.childFields.reduce((list, nestedFieldHierarchy) => {
        assert(entry.record.value.valueFormat === UiPropertyValueFormat.Struct);
        assert(entry.record.value.members[nestedFieldHierarchy.field.name] !== undefined);
        const member = {
          fieldHierarchy: nestedFieldHierarchy,
          field: nestedFieldHierarchy.field,
          record: entry.record.value.members[nestedFieldHierarchy.field.name],
        };
        list.push(...destructureStructMember(member));
        return list;
      }, new Array<FieldHierarchyRecord>());
      records.splice(i, 1, ...members);
      continue;
    }

    ++i;
  }

  // lastly, when there's only one record in the list and it's an array that we want destructured, set the `hideCompositePropertyLabel`
  // attribute so only the items are rendered
  if (
    records.length === 1 &&
    records[0].record.value.valueFormat === UiPropertyValueFormat.Array &&
    shouldDestructureArrayField(records[0].fieldHierarchy.field)
  ) {
    records[0].record.property.hideCompositePropertyLabel = true;
  }
}

async function traverseFieldHierarchy(hierarchy: FieldHierarchy, cb: (h: FieldHierarchy) => Promise<boolean>) {
  if (await cb(hierarchy)) {
    await Promise.all(hierarchy.childFields.map(async (childHierarchy) => traverseFieldHierarchy(childHierarchy, cb)));
  }
}
