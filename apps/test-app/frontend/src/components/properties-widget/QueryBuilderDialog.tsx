import { useEffect, useMemo, useState } from "react";
import { Primitives, PropertyDescription } from "@itwin/appui-abstract";
import {
  PropertyFilterBuilderRenderer,
  PropertyFilterBuilderRuleValueRendererProps,
  PropertyFilterRuleGroupOperator,
  PropertyFilterRuleOperator,
  usePropertyFilterBuilder,
} from "@itwin/components-react";
import { IModelConnection } from "@itwin/core-frontend";
import { Dialog, Label } from "@itwin/itwinui-react";
import { Descriptor, RelationshipPath } from "@itwin/presentation-common";
import {
  createPresentationInstanceFilter,
  createQueryMetadata,
  navigationPropertyEditorContext,
  PresentationFilterBuilderValueRenderer,
  QueryMetadata,
  QueryRule,
  QueryRuleGroup,
  RelatedInstanceDescription,
  useFilterBuilderNavigationPropertyEditorContext,
  usePropertyInfos,
} from "@itwin/presentation-components";

export interface QueryBuilderInput {
  descriptor: Descriptor;
  property: PropertyDescription;
}

interface QueryBuildersProps {
  imodel: IModelConnection;
  inputs: QueryBuilderInput[];
}

interface QueryBuildersDialogProps extends QueryBuildersProps {
  onClose: () => void;
}

export function QueryBuilderDialog({ onClose, ...props }: QueryBuildersDialogProps) {
  return (
    <Dialog isOpen={true} onClose={onClose} closeOnEsc={true} preventDocumentScroll={true} trapFocus={true} isDraggable isResizable>
      <Dialog.Backdrop />
      <Dialog.Main style={{ minWidth: "90%", minHeight: "70%" }}>
        <Dialog.TitleBar>Query Builder</Dialog.TitleBar>
        <Dialog.Content>
          <QueryBuilders {...props} />
        </Dialog.Content>
      </Dialog.Main>
    </Dialog>
  );
}

function QueryBuilders({ imodel, inputs }: QueryBuildersProps) {
  const [queries, setQueries] = useState<Record<string, QueryMetadata | undefined>>({});

  useEffect(() => {
    // eslint-disable-next-line no-console
    console.log(queries);
  }, [queries]);

  return (
    <div className="query-builders">
      {inputs.map((input, i) => (
        <SingleQueryBuilder
          key={i}
          imodel={imodel}
          {...input}
          onQueryChanged={(query) => {
            setQueries((prev) => ({ ...prev, [input.descriptor.selectClasses[0].selectClassInfo.name]: query }));
          }}
        />
      ))}
    </div>
  );
}

function noopValidator() {
  return undefined;
}

interface SingleQueryBuilderProps extends QueryBuilderInput {
  imodel: IModelConnection;
  onQueryChanged: (query: QueryMetadata | undefined) => void;
}

/** Render query builder for single class. */
function SingleQueryBuilder({ descriptor, imodel, onQueryChanged }: SingleQueryBuilderProps) {
  // collect direct and related properties from content descriptor.
  const { propertyInfos, propertyRenderer } = usePropertyInfos({ descriptor });
  // map presentation property info data structures to `PropertyDescription`.
  const properties = useMemo(() => propertyInfos.map((info) => info.propertyDescription), [propertyInfos]);
  // initialize query builder. Returns current state and actions for building filter.
  const { rootGroup, actions, buildFilter } = usePropertyFilterBuilder({ ruleValidator: noopValidator });

  // create context for input used to enter navigation property value. (in future `PresentationFilterBuilderValueRenderer` can take care of this)
  const navigationPropertyContextValue = useFilterBuilderNavigationPropertyEditorContext(imodel, descriptor);

  // create metadata for building ECSQL query.
  const queryMetadata = useMemo<QueryMetadata | undefined>(() => {
    // get current filter
    const filter = buildFilter();
    if (!filter) {
      return undefined;
    }
    // add presentation metadata to filter
    // replaces filter rule `PropertyDescription` into `PropertiesField`. It has additional metadata about property:
    // - property schema name
    // - property class
    // - relationship path from property class to the select class if this property is related.
    const presentationFilter = createPresentationInstanceFilter(descriptor, filter);
    if (!presentationFilter) {
      return undefined;
    }
    // create metadata for builder ECSQL query. It simplifies result of `createPresentationInstanceFilter`:
    // - collects relationship paths from all related properties used in filter to the select class (return only unique paths)
    // - creates aliases for related properties and associated relationship paths
    // all this information is available on `PresentationInstanceFilter` returned by `createPresentationInstanceFilter` but this is a helper function
    // to get data structure that is easier to use when building ECSQL query.
    return createQueryMetadata(presentationFilter);
  }, [buildFilter, descriptor]);

  useEffect(() => {
    onQueryChanged(queryMetadata);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryMetadata]);

  return (
    <div className="query-builder-container">
      <div className="query-builder">
        <Label>{descriptor.selectClasses[0].selectClassInfo.label}</Label>
        <navigationPropertyEditorContext.Provider value={navigationPropertyContextValue}>
          <PropertyFilterBuilderRenderer
            properties={properties}
            rootGroup={rootGroup}
            actions={actions}
            propertyRenderer={propertyRenderer}
            ruleGroupDepthLimit={0}
            ruleValueRenderer={(rendererProps: PropertyFilterBuilderRuleValueRendererProps) => (
              // custom renderer for value input that utilizes presentation metadata:
              // - for `=` and `!=` operators renders drop down with unique values
              // - for kind of quantity properties renders input with units support
              // otherwise renders default values renderer provided by `component-react` package.
              <PresentationFilterBuilderValueRenderer {...rendererProps} imodel={imodel} descriptor={descriptor} />
            )}
          />
        </navigationPropertyEditorContext.Provider>
      </div>
      <div className="query-builder-result">
        <Label>Query</Label>
        {queryMetadata ? <QueryBuilderResult queryMetadata={queryMetadata} /> : null}
      </div>
    </div>
  );
}

interface QueryBuilderResultProps {
  queryMetadata: QueryMetadata;
}

function QueryBuilderResult({ queryMetadata }: QueryBuilderResultProps) {
  const query = useMemo(() => createQuery(queryMetadata), [queryMetadata]);
  return (
    <div className="query-result">
      <div className="query-result-join">
        {query.joinClauses.map((clause, i) => (
          <div key={i}>{clause}</div>
        ))}
      </div>
      <div className="query-result-where">{query.whereClause}</div>
    </div>
  );
}

// simple implementation of creating `ECSQL` JOIN and WHERE clause strings from filter built with `PropertyFilterBuilder`.
function createQuery(metadata: QueryMetadata): {
  joinClauses: string[];
  whereClause: string;
} {
  const whereClause = createWhereClause(metadata.rules);
  const joinClauses = createJoinClause(metadata.relatedInstances);

  return {
    whereClause,
    joinClauses,
  };
}

function createJoinClause(relatedInstances: RelatedInstanceDescription[]): string[] {
  const joinClauses: string[] = [];
  for (let j = 0; j < relatedInstances.length; j++) {
    const related = relatedInstances[j];
    const alias = related.alias;
    const relatedPath = RelationshipPath.strip(related.path);
    let prevAlias = "this";
    for (let i = 0; i < relatedPath.length; i++) {
      const step = relatedPath[i];
      const stepAlias = i + 1 === relatedPath.length ? alias : `class_${j}_${i}`;
      const relAlias = `rel_${j}_${i}`;
      joinClauses.push(`JOIN ${step.relationshipName} as ${relAlias} ON ${relAlias}.SourceECInstanceId = ${prevAlias}.ECInstanceId`);
      joinClauses.push(`JOIN ${step.targetClassName} as ${stepAlias} ON ${relAlias}.TargetECInstanceId = ${stepAlias}.ECInstanceId`);
      prevAlias = stepAlias;
    }
  }

  return joinClauses;
}

function createWhereClause(rules: QueryRule | QueryRuleGroup): string {
  return `WHERE ${parseQuery(rules)}`;
}

function parseQuery(rules: QueryRule | QueryRuleGroup): string {
  if (isQueryRule(rules)) {
    return parseQueryRule(rules);
  }

  return parseQueryRuleGroup(rules);
}

function parseQueryRuleGroup(group: QueryRuleGroup) {
  const rules = group.rules.map(parseQuery);
  return `(${rules.join(group.operator === PropertyFilterRuleGroupOperator.And ? " AND " : " OR ")})`;
}

function parseQueryRule(rule: QueryRule) {
  const accessorBase = `[${rule.sourceAlias}].[${rule.propertyName}]`;
  const operator = getOperatorString(rule.operator);
  if (!rule.value || !rule.value.value) {
    return `${accessorBase} ${operator}`;
  }

  const accessor = rule.propertyTypeName === "navigation" ? `${accessorBase}.[Id]` : accessorBase;
  const valueString = getValueString(rule.value.value);
  return `${accessor} ${operator} ${valueString}`;
}

function getValueString(value: Primitives.Value) {
  if ((value as Primitives.InstanceKey).id !== undefined) {
    return (value as Primitives.InstanceKey).id;
  }

  if (typeof value === "number") {
    return value.toFixed(3);
  }

  return value.toString();
}

function getOperatorString(operator: PropertyFilterRuleOperator) {
  switch (operator) {
    case PropertyFilterRuleOperator.IsTrue:
      return "IS TRUE";
    case PropertyFilterRuleOperator.IsFalse:
      return "IS FALSE";
    case PropertyFilterRuleOperator.IsEqual:
      return "=";
    case PropertyFilterRuleOperator.IsNotEqual:
      return "<>";
    case PropertyFilterRuleOperator.Greater:
      return ">";
    case PropertyFilterRuleOperator.GreaterOrEqual:
      return ">=";
    case PropertyFilterRuleOperator.Less:
      return "<";
    case PropertyFilterRuleOperator.LessOrEqual:
      return "<=";
    case PropertyFilterRuleOperator.Like:
      return "LIKE";
    case PropertyFilterRuleOperator.IsNull:
      return "IS NULL";
    case PropertyFilterRuleOperator.IsNotNull:
      return "IS NOT NULL";
  }
}

function isQueryRule(rule: QueryRule | QueryRuleGroup): rule is QueryRule {
  return (rule as QueryRule).propertyName !== undefined;
}
