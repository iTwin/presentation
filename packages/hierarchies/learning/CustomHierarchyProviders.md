# Custom hierarchy providers

In this package, a hierarchy provider is defined through the `HierarchyProvider` interface. Available implementations delivered by this package are listed in the [Hierarchy providers](../README.md#hierarchy-providers) README section. On the other hand, implementing a custom hierarchy provider is also an option - below there are a few examples for how to implement specific features of a custom hierarchy provider.

## Basic example

In the most basic form, a hierarchy provider only needs to implement the `getNodes` method, as it's responsible for returning nodes. The following example provider simply returns dynamically created nodes:

<!-- [[include: [Presentation.Hierarchies.CustomHierarchyProviders.Imports, Presentation.Hierarchies.CustomHierarchyProviders.BasicProviderExample], ts]] -->
<!-- BEGIN EXTRACTION -->

```ts
import { BeEvent } from "@itwin/core-bentley";
import { HierarchyNode, HierarchyProvider } from "@itwin/presentation-hierarchies";
import { Props } from "@itwin/presentation-shared";

// Create a hierarchy provider that returns an infinite hierarchy, where each node has one child node.
const provider: HierarchyProvider = {
  async *getNodes({ parentNode }) {
    yield !parentNode
      ? {
          key: { type: "generic", id: `root` },
          label: `Root node`,
          children: true,
          parentKeys: [],
        }
      : {
          key: { type: "generic", id: `child-${parentNode.parentKeys.length + 1}` },
          label: `Child ${parentNode.parentKeys.length + 1}`,
          children: true,
          parentKeys: [...parentNode.parentKeys, parentNode.key],
        };
  },
  async *getNodeInstanceKeys() {},
  setFormatter() {},
  setHierarchySearch() {},
  hierarchyChanged: new BeEvent(),
};
```

<!-- END EXTRACTION -->

## iModel-based hierarchy provider example

`@itwin/presentation-hierarchies` package provides the `createIModelHierarchyProvider` function to create a hierarchy provider that fetches nodes from an iModel. The provider has many advanced features like running multiple queries in parallel, grouping, caching an more. See more details about it in the [iModel-based hierarchy provider](./imodel/HierarchyProvider.md) learning page.

However, it's possible to write one from scratch. The following example demonstrates how to create a simple iModel-based hierarchy provider:

<!-- [[include: [Presentation.Hierarchies.CustomHierarchyProviders.Imports, Presentation.Hierarchies.CustomHierarchyProviders.IModelProviderImports, Presentation.Hierarchies.CustomHierarchyProviders.CustomIModelProviderExample], ts]] -->
<!-- BEGIN EXTRACTION -->

```ts
import { BeEvent } from "@itwin/core-bentley";
import { HierarchyNode, HierarchyProvider } from "@itwin/presentation-hierarchies";
import { Props } from "@itwin/presentation-shared";

import { BriefcaseConnection, IModelConnection } from "@itwin/core-frontend";
import { registerTxnListeners } from "@itwin/presentation-core-interop";

// Create a hierarchy provider that returns the root bis.Subject and a hierarchy of its children.
class IModelHierarchyProvider implements HierarchyProvider {
  public hierarchyChanged = new BeEvent();
  private _disposeTxnListeners: (() => void) | undefined;

  public constructor(private _imodel: IModelConnection) {
    if (this._imodel instanceof BriefcaseConnection) {
      // Briefcase connections support data modifications - the provider should listen to txn changes
      // and raise `hierarchyChanged` event when the hierarchy should be refreshed. `BriefcaseTxns` has a number
      // of events that we should listen to - here we're using `registerTxnListeners` helper to simplify subscription.
      this._disposeTxnListeners = registerTxnListeners(this._imodel.txns, () => this.hierarchyChanged.raiseEvent());
    }
  }

  // Make this provider disposable. Owners of the provider should make sure `Symbol.dispose` is called when the
  // provider is no longer needed.
  // The tree state hooks from `@itwin/presentation-hierarchies-react` package take care of this for you.
  public [Symbol.dispose]() {
    this._disposeTxnListeners?.();
  }

  public async *getNodes({ parentNode }: Props<HierarchyProvider["getNodes"]>): AsyncIterableIterator<HierarchyNode> {
    if (!parentNode) {
      // Query and return root bis.Subject node
      for await (const row of this._imodel.createQueryReader(
        `
          SELECT
            COALESCE(s.UserLabel, s.CodeValue, ec_classname(s.ECClassId, 'c')) label,
            (SELECT 1 FROM bis.Element c WHERE c.Parent.Id = s.ECInstanceId LIMIT 1) hasChildren
          FROM bis.Subject s
          WHERE s.Parent.Id IS NULL
        `,
      )) {
        yield {
          key: { type: "instances", instanceKeys: [{ className: "BisCore.Subject", id: "0x1", imodelKey: this._imodel.key }] },
          label: row.label,
          children: !!row.hasChildren,
          parentKeys: [],
        };
      }
      return;
    }
    // Query and return children for the given parent node, assuming it's based on data from the same iModel
    if (
      HierarchyNode.isInstancesNode(parentNode) &&
      parentNode.key.instanceKeys.length > 0 &&
      parentNode.key.instanceKeys.every((k) => k.imodelKey === this._imodel.key)
    ) {
      for await (const row of this._imodel.createQueryReader(
        `
          SELECT
            ec_classname(e.ECClassId, 's.c') className,
            e.ECInstanceId id,
            COALESCE(e.UserLabel, e.CodeValue, ec_classname(e.ECClassId, 'c')) label,
            (SELECT 1 FROM bis.Element c WHERE c.Parent.Id = e.ECInstanceId LIMIT 1) hasChildren
          FROM bis.Element e
          WHERE e.Parent.Id IN (${parentNode.key.instanceKeys.map((key) => key.id).join(",")})
        `,
      )) {
        yield {
          key: { type: "instances", instanceKeys: [{ className: row.className, id: row.id, imodelKey: this._imodel.key }] },
          label: row.label,
          children: !!row.hasChildren,
          parentKeys: [...parentNode.parentKeys, parentNode.key],
        };
      }
    }
  }

  // Since we're returning nodes based on instances in an iModel, we should also implement the `getNodeInstanceKeys` method
  // allow efficient retrieval of instance keys
  public async *getNodeInstanceKeys({ parentNode }: Props<HierarchyProvider["getNodeInstanceKeys"]>) {
    if (!parentNode) {
      // Don't need to run a query here - we know all iModels have one root Subject with `0x1` id
      yield { className: "BisCore.Subject", id: "0x1", imodelKey: this._imodel.key };
      return;
    }
    // Query and return children instance keys for the given parent node
    if (
      HierarchyNode.isInstancesNode(parentNode) &&
      parentNode.key.instanceKeys.length > 0 &&
      parentNode.key.instanceKeys.every((k) => k.imodelKey === this._imodel.key)
    ) {
      for await (const row of this._imodel.createQueryReader(
        `
          SELECT ec_classname(e.ECClassId, 's.c') className, e.ECInstanceId id
          FROM bis.Element e
          WHERE e.Parent.Id IN (${parentNode.key.instanceKeys.map((key) => key.id).join(",")})
        `,
      )) {
        yield { className: row.className, id: row.id, imodelKey: this._imodel.key };
      }
    }
  }

  public setFormatter() {}
  public setHierarchySearch() {}
}

// The `using` keyword makes sure the provider is disposed when it goes out of scope
using provider = new IModelHierarchyProvider(imodel);

// Traverse the hierarchy to ensure expected nodes are returned. The result depends on
// the iModel given to the provider.
await traverseHierarchy(provider);
```

<!-- END EXTRACTION -->

## 3rd party service-based hierarchy provider example

Similar to querying nodes from an iModel, it's possible to query data for creating nodes from a 3rd party service. The following example demonstrates how to create a simple service-based hierarchy provider.

First, let's define a sample books service:

<!-- [[include: [Presentation.Hierarchies.CustomHierarchyProviders.BooksService], ts]] -->
<!-- BEGIN EXTRACTION -->

```ts
// Define a type for a filter that can be applied to books service queries.
type BooksServiceFilter<TEntry> = { rules: (Partial<TEntry> | BooksServiceFilter<TEntry>)[]; operator: "and" | "or" } | Partial<TEntry>;

// Creates a books service that provides authors and books data. The service has two methods:
// - `getAuthors` - returns authors based on the provided query.
// - `getBooks` - returns books based on the provided query.
function createBooksService() {
  const authors = [
    { key: "OL26320A", name: "J.R.R. Tolkien", hasBooks: true },
    { key: "GP00000X", name: "Albert Einstein", hasBooks: false },
    { key: "OL18319A", name: "Mark Twain", hasBooks: true },
    { key: "OL25277A", name: "Tom Clancy", hasBooks: true },
  ];
  const books = [
    { key: "OL27482W", title: "The Hobbit", authorKey: "OL26320A" },
    { key: "OL27513W", title: "The Fellowship of Ring", authorKey: "OL26320A" },
    { key: "OL27479W", title: "The two towers", authorKey: "OL26320A" },

    { key: "OL53908W", title: "Adventures of Huckleberry Finn", authorKey: "OL18319A" },
    { key: "OL53919W", title: "The Adventures of Tom Sawyer", authorKey: "OL18319A" },

    { key: "OL159452W", title: "The hunt for Red October", authorKey: "OL25277A" },
    { key: "OL159642W", title: "Red storm rising", authorKey: "OL25277A" },
    { key: "OL449001W", title: "Executive orders", authorKey: "OL25277A" },
  ];
  function filterEntries<TEntry>(
    entries: TEntry[],
    query: BooksServiceFilter<TEntry> | undefined,
    entryMatcher: (entry: TEntry, query: Partial<TEntry>) => boolean,
  ) {
    function matchEntry(entry: TEntry, partialQuery?: BooksServiceFilter<TEntry>): boolean {
      return (
        !partialQuery ||
        ("rules" in partialQuery
          ? partialQuery.rules[partialQuery.operator === "and" ? "every" : "some"]((rule) => matchEntry(entry, rule))
          : entryMatcher(entry, partialQuery))
      );
    }
    return entries.filter((entry) => matchEntry(entry, query));
  }
  async function getAuthors(query?: BooksServiceFilter<(typeof authors)[0]>) {
    return filterEntries(authors, query, (entry, { key, name, hasBooks }) => {
      if (key && !entry.key.toLocaleLowerCase().includes(key.toLocaleLowerCase())) {
        return false;
      }
      if (name && !entry.name.toLocaleLowerCase().includes(name.toLocaleLowerCase())) {
        return false;
      }
      if (hasBooks !== undefined && entry.hasBooks !== hasBooks) {
        return false;
      }
      return true;
    });
  }
  async function getBooks(query?: BooksServiceFilter<(typeof books)[0]>) {
    return filterEntries(books, query, (entry, { key, authorKey, title }) => {
      if (key && !entry.key.toLocaleLowerCase().includes(key.toLocaleLowerCase())) {
        return false;
      }
      if (title && !entry.title.toLocaleLowerCase().includes(title.toLocaleLowerCase())) {
        return false;
      }
      if (authorKey && !entry.authorKey.toLocaleLowerCase().includes(authorKey.toLocaleLowerCase())) {
        return false;
      }
      return true;
    });
  }
  return { getAuthors, getBooks };
}
```

<!-- END EXTRACTION -->

Now that we have a service, let's create a hierarchy provider that creates a hierarchy based on the data returned from the service:

<!-- [[include: [Presentation.Hierarchies.CustomHierarchyProviders.Imports, Presentation.Hierarchies.CustomHierarchyProviders.3rdPartyServiceProviderExample], ts]] -->
<!-- BEGIN EXTRACTION -->

```ts
import { BeEvent } from "@itwin/core-bentley";
import { HierarchyNode, HierarchyProvider } from "@itwin/presentation-hierarchies";
import { Props } from "@itwin/presentation-shared";

// Create a fake books service that simulates fetching authors and books data.
const booksService = createBooksService();

// Create a hierarchy provider that returns a two-level hierarchy, where root nodes are authors and their
// children are books.
const provider: HierarchyProvider = {
  async *getNodes({ parentNode }) {
    if (!parentNode) {
      // For root nodes, query authors and return nodes based on them
      for (const author of await booksService.getAuthors()) {
        yield {
          key: { type: "generic", id: `author:${author.key}` },
          label: author.name,
          children: author.hasBooks,
          parentKeys: [],
        };
      }
    } else if (HierarchyNode.isGeneric(parentNode) && parentNode.key.id.startsWith("author:")) {
      // For author parent node, query books and return nodes based on them
      for (const book of await booksService.getBooks({ authorKey: parentNode.key.id.slice(7) })) {
        yield {
          key: { type: "generic", id: `book:${book.key}` },
          label: book.title,
          children: false,
          parentKeys: [...parentNode.parentKeys, parentNode.key],
        };
      }
    }
  },
  async *getNodeInstanceKeys() {},
  setHierarchySearch() {},
  setFormatter() {},
  hierarchyChanged: new BeEvent(),
};

// Traverse the hierarchy:
await traverseHierarchy(provider);
// Output:
// J.R.R. Tolkien
//   The Hobbit
//   The Fellowship of Ring
//   The two towers
// Albert Einstein
// Mark Twain
//   Adventures of Huckleberry Finn
//   The Adventures of Tom Sawyer
// Tom Clancy
//   The hunt for Red October
//   Red storm rising
//   Executive orders
```

<!-- END EXTRACTION -->

## Implementing node label formatting support

> See more details about formatting in the [Formatting](./Formatting.md.md) learning page.

While node labels' formatting is completely hierarchy provider's responsibility, the APIs are built to make it easy to implement:

- We provide 2 built-in formatters:
  - `createDefaultValueFormatter` from `@itwin/presentation-shared` package creates a basic formatter, that's suitable for values that don't have units.
  - `createValueFormatter` from `@itwin/presentation-core-interop` package creates a formatter that knows how to handle values with units.

- The `ConcatenatedValue` concept makes it easy to create formatted strings that combine multiple separately formatted values.

- The `HierarchyProvider` interface has a notion of `setFormatter` function. This makes formatting the first-class concept in the hierarchy provider, and makes it easy for consumers to assign a formatter based on user preferences, e.g. selected unit system.

With the above APIs at hand, implementing node label formatting is straightforward:

<!-- [[include: [Presentation.Hierarchies.CustomHierarchyProviders.Imports, Presentation.Hierarchies.CustomHierarchyProviders.FormattingProviderImports, Presentation.Hierarchies.CustomHierarchyProviders.FormattingProviderExample], ts]] -->
<!-- BEGIN EXTRACTION -->

```ts
import { BeEvent } from "@itwin/core-bentley";
import { HierarchyNode, HierarchyProvider } from "@itwin/presentation-hierarchies";
import { Props } from "@itwin/presentation-shared";

import {
  ConcatenatedValue,
  ConcatenatedValuePart,
  createDefaultValueFormatter,
  EventListener,
  IPrimitiveValueFormatter,
  julianToDateTime,
} from "@itwin/presentation-shared";

// Create a hierarchy provider that returns a single root node with formatted label. The formatter used by the
// provider can be changed by calling the `setFormatter` method.
class FormattingHierarchyProvider implements HierarchyProvider {
  private _formatter: IPrimitiveValueFormatter = createDefaultValueFormatter();
  public hierarchyChanged = new BeEvent<EventListener<HierarchyProvider["hierarchyChanged"]>>();
  public async *getNodes(): ReturnType<HierarchyProvider["getNodes"]> {
    yield {
      key: { type: "generic", id: `formatted-node` },
      // We're using `ConcatenatedValue` to simplify formatting complex values consisting of different parts
      // that may need to be formatted differently
      label: await ConcatenatedValue.serialize({
        parts: [
          "Boolean: ",
          { type: "Boolean", value: true },
          " | Integer: ",
          { type: "Integer", value: 123 },
          " | Double: ",
          { type: "Double", value: 4.56 },
          " | Date/Time: ",
          { type: "DateTime", extendedType: "ShortDate", value: new Date(Date.UTC(2024, 11, 31)) },
          " | Point2d: ",
          { type: "Point2d", value: { x: 1.234, y: 5.678 } },
        ],
        partFormatter: async (x) => (ConcatenatedValuePart.isString(x) ? x : this._formatter(x)),
      }),
      children: false,
      parentKeys: [],
    };
  }
  public async *getNodeInstanceKeys() {}
  public setFormatter(formatter: IPrimitiveValueFormatter | undefined) {
    this._formatter = formatter ?? createDefaultValueFormatter();
    // Changing formatter requires a hierarchy reload - trigger the `hierarchyChanged` event to let components know
    this.hierarchyChanged.raiseEvent({ formatterChange: { newFormatter: this._formatter } });
  }
  public setHierarchySearch() {}
}

const provider = new FormattingHierarchyProvider();

// Default formatter will format the node label to the following value (Date/Time formatted according to the locale and time zone):
// `Boolean: true | Integer: 123 | Double: 4.56 | Date/Time: 2024-12-31 | Point2d: (1.23, 5.68)`
console.log((await provider.getNodes().next()).value.label);

provider.setFormatter(async (typedValue) => {
  switch (typedValue.type) {
    case "Boolean":
      return typedValue.value ? "Yes" : "No";
    case "Integer":
      return `i${typedValue.value.toLocaleString()}`;
    case "Double":
      return typedValue.value.toExponential(1);
    case "DateTime":
      return (
        typeof typedValue.value === "string"
          ? new Date(typedValue.value)
          : typeof typedValue.value === "number"
            ? julianToDateTime(typedValue.value)
            : typedValue.value
      ).toISOString();
    case "Point2d":
      return `{ x: ${typedValue.value.x.toExponential(1)}, y: ${typedValue.value.y.toExponential(1)} }`;
  }
  return typedValue.value.toString();
});

// With the above formatter, the node label is formatted to the following value:
// `Boolean: Yes | Integer: i123 | Double: 4.6e+0 | Date/Time: 2024-12-31T00:00:00.000Z | Point2d: { x: 1.2e+0, y: 5.7e+0 }`
console.log((await provider.getNodes().next()).value.label);
```

<!-- END EXTRACTION -->

## Hierarchy search and hierarchy level filtering

The API has two similar concepts for creating a reduced hierarchy: hierarchy search and hierarchy level filtering. The former is applied to the whole hierarchy, and the latter is applied only on a single hierarchy level. See below for more details.

### Implementing hierarchy search support

> See more details about hierarchy search in the [Hierarchy search](./HierarchySearch.md) learning page.

For this example, let's use the books service defined in the [3rd party service-based hierarchy provider example](#3rd-party-service-based-hierarchy-provider-example) section and enhance the provider to support hierarchy search.

As described in the [Hierarchy search](./HierarchySearch.md) learning page, the process of searching a hierarchy has two major steps:

1. Determine node identifier paths for the target nodes.
2. Given the node identifier paths, filter the hierarchy.

Let's start with the first step:

<!-- [[include: [Presentation.Hierarchies.CustomHierarchyProviders.Imports, Presentation.Hierarchies.CustomHierarchyProviders.SearchProviderImports, Presentation.Hierarchies.CustomHierarchyProviders.SearchProviderExample.PathsLookup], ts]] -->
<!-- BEGIN EXTRACTION -->

```ts
import { BeEvent } from "@itwin/core-bentley";
import { HierarchyNode, HierarchyProvider } from "@itwin/presentation-hierarchies";
import { Props } from "@itwin/presentation-shared";

import { createHierarchySearchHelper, GenericNodeKey, HierarchyNodeIdentifier, HierarchySearchPath } from "@itwin/presentation-hierarchies";

// A function that matches given string against authors and books, and returns hierarchy paths
// from root to the matched node. This function must be aware of the hierarchy structure to know what paths
// to create.
async function createSearchPaths(searchText: string): Promise<HierarchySearchPath[]> {
  const results: HierarchySearchPath[] = [];
  const [matchingAuthors, matchingBooks] = await Promise.all([booksService.getAuthors({ name: searchText }), booksService.getBooks({ title: searchText })]);
  for (const author of matchingAuthors) {
    results.push([{ type: "generic", id: `author:${author.key}` }]);
  }
  for (const book of matchingBooks) {
    results.push([
      { type: "generic", id: `author:${book.authorKey}` },
      { type: "generic", id: `book:${book.key}` },
    ]);
  }
  return results;
}
```

<!-- END EXTRACTION -->

There could be a number of ways to search the hierarchy, such as by target instance identifier, by a complex query that uses multiple attributes, or simply by label. The above function filters the hierarchy by node label.

Now that we're able to find the paths, let's enhance our hierarchy provider to support searching by them:

<!-- [[include: [Presentation.Hierarchies.CustomHierarchyProviders.Imports, Presentation.Hierarchies.CustomHierarchyProviders.SearchProviderImports, Presentation.Hierarchies.CustomHierarchyProviders.SearchProviderExample.Provider], ts]] -->
<!-- BEGIN EXTRACTION -->

```ts
import { BeEvent } from "@itwin/core-bentley";
import { HierarchyNode, HierarchyProvider } from "@itwin/presentation-hierarchies";
import { Props } from "@itwin/presentation-shared";

import { createHierarchySearchHelper, GenericNodeKey, HierarchyNodeIdentifier, HierarchySearchPath } from "@itwin/presentation-hierarchies";

let rootSearch: Props<HierarchyProvider["setHierarchySearch"]>;
const hierarchyChanged = new BeEvent<EventListener<HierarchyProvider["hierarchyChanged"]>>();
const provider: HierarchyProvider = {
  async *getNodes({ parentNode }) {
    const searchHelper = !parentNode || HierarchyNode.isGeneric(parentNode) ? createHierarchySearchHelper(rootSearch?.paths, parentNode) : undefined;
    const targetNodeKeys = searchHelper?.getChildNodeSearchIdentifiers();
    if (!parentNode) {
      // For root nodes, query authors and return nodes based on them
      const authors = await booksService.getAuthors(
        targetNodeKeys
          ? {
              rules: targetNodeKeys
                .filter((key) => HierarchyNodeIdentifier.isGenericNodeIdentifier(key) && key.id.startsWith("author:"))
                .map(({ id }) => ({ key: id.slice(7) })),
              operator: "or",
            }
          : undefined,
      );
      for (const author of authors) {
        const nodeKey: GenericNodeKey = { type: "generic", id: `author:${author.key}` };
        yield {
          key: nodeKey,
          label: author.name,
          children: author.hasBooks,
          parentKeys: [],
          ...searchHelper?.createChildNodeProps({ nodeKey, parentKeys: [] }),
        };
      }
    } else if (HierarchyNode.isGeneric(parentNode) && parentNode.key.id.startsWith("author:")) {
      // For author parent node, query books and return nodes based on them
      const books = await booksService.getBooks({
        rules: [
          { authorKey: parentNode.key.id.slice(7) },
          ...(targetNodeKeys
            ? [
                {
                  rules: targetNodeKeys
                    .filter((key) => HierarchyNodeIdentifier.isGenericNodeIdentifier(key) && key.id.startsWith("book:"))
                    .map(({ id }) => ({ key: id.slice(5) })),
                  operator: "or" as const,
                },
              ]
            : []),
        ],
        operator: "and",
      });
      for (const book of books) {
        const nodeKey: GenericNodeKey = { type: "generic", id: `book:${book.key}` };
        const parentKeys = [...parentNode.parentKeys, parentNode.key];
        yield {
          key: nodeKey,
          label: book.title,
          children: false,
          parentKeys,
          ...searchHelper?.createChildNodeProps({ nodeKey, parentKeys }),
        };
      }
    }
  },
  setHierarchySearch(props) {
    // Here we receive all paths that we want to search the hierarchy by. The paths start from root, so
    // we just store them in a variable to use later when querying root nodes.
    rootSearch = props;
    // Changing the search requires a hierarchy reload - trigger the `hierarchyChanged` event to let components know
    hierarchyChanged.raiseEvent({ searchChange: { newSearch: rootSearch } });
  },
  async *getNodeInstanceKeys() {},
  setFormatter() {},
  hierarchyChanged,
};
```

<!-- END EXTRACTION -->

The provider uses target instance keys that it gets through a search helper function to search each hierarchy level. Because we already know exactly what we're looking for, we can effectively apply search at query time, rather than doing that on the client side.

With the above provider, we can now search the books hierarchy by label:

<!-- [[include: [Presentation.Hierarchies.CustomHierarchyProviders.SearchProviderExample.TraverseSearched1, Presentation.Hierarchies.CustomHierarchyProviders.SearchProviderExample.TraverseSearched2], ts]] -->
<!-- BEGIN EXTRACTION -->

```ts
// Apply the search "of" and traverse the searched hierarchy. Notice that author node
// of "The Fellowship of Ring" is included, even though it doesn't match the search.
provider.setHierarchySearch({ paths: await createSearchPaths("of") });
await traverseHierarchy(provider);
// Output:
// J.R.R. Tolkien
//   The Fellowship of Ring
// Mark Twain
//   Adventures of Huckleberry Finn
//   The Adventures of Tom Sawyer

// Apply the search "tom" and traverse the searched hierarchy. Notice that all books
// of "Tom Clancy" are included, even though they don't match the search.
provider.setHierarchySearch({ paths: await createSearchPaths("tom") });
await traverseHierarchy(provider);
// Output:
// Mark Twain
//   The Adventures of Tom Sawyer
// Tom Clancy
//   The hunt for Red October
//   Red storm rising
//   Executive orders
```

<!-- END EXTRACTION -->

## Implementing hierarchy level filtering support

> See more details about hierarchy level filtering in the [Hierarchy level filtering](./HierarchyLevelFiltering.md) learning page.

For this example, let's use the books service defined in the [3rd party service-based hierarchy provider example](#3rd-party-service-based-hierarchy-provider-example) section and enhance the provider to support hierarchy level filtering.

Hierarchy level filters are defined using the `GenericInstanceFilter` data structure, which is data source-agnostic. The first step would be to implement a converter that converts the generic filter to a filter that the data source understands:

<!-- [[include: [Presentation.Hierarchies.CustomHierarchyProviders.HierarchyLevelFilteringProviderImports, Presentation.Hierarchies.CustomHierarchyProviders.HierarchyLevelFilteringProvider.Filter], ts]] -->
<!-- BEGIN EXTRACTION -->

```ts
import { GenericInstanceFilter, GenericInstanceFilterRule, GenericInstanceFilterRuleGroup } from "@itwin/core-common";

// A function that creates a books service - specific filter, based on the given parent node and children filters
function createBooksServiceFilter(parentNodeFilter: Record<string, unknown> | undefined, genericChildrenFilter: GenericInstanceFilter | undefined) {
  function createRuleFilter(rule: GenericInstanceFilterRule): Record<string, unknown> {
    // note: this is a very simplistic implementation that doesn't support different operators, value types, etc.
    return { [rule.propertyName]: rule.value?.rawValue ?? "" };
  }
  function createGroupFilter(group: GenericInstanceFilterRuleGroup): BooksServiceFilter<Record<string, unknown>> {
    return {
      operator: group.operator,
      rules: group.rules.map(createRuleOrGroupFilter),
    };
  }
  function createRuleOrGroupFilter(ruleOrGroup: GenericInstanceFilter["rules"]): BooksServiceFilter<Record<string, unknown>> {
    return GenericInstanceFilter.isFilterRuleGroup(ruleOrGroup) ? createGroupFilter(ruleOrGroup) : createRuleFilter(ruleOrGroup);
  }
  const childrenFilter = genericChildrenFilter ? createRuleOrGroupFilter(genericChildrenFilter.rules) : undefined;
  if (parentNodeFilter && childrenFilter) {
    return { rules: [parentNodeFilter, childrenFilter], operator: "and" };
  }
  return parentNodeFilter ?? childrenFilter ?? undefined;
}
```

<!-- END EXTRACTION -->

Now, the provider can be enhanced to support hierarchy level filtering. Two changes are required on top of the original provider implementation:

1. Root nodes (authors) specify that they support filtering.
2. The filter passed to provider's `getNodes` method is passed to the data source.

Here's how the final provider looks like:

<!-- [[include: [Presentation.Hierarchies.CustomHierarchyProviders.Imports, Presentation.Hierarchies.CustomHierarchyProviders.HierarchyLevelFilteringProvider.Provider], ts]] -->
<!-- BEGIN EXTRACTION -->

```ts
import { BeEvent } from "@itwin/core-bentley";
import { HierarchyNode, HierarchyProvider } from "@itwin/presentation-hierarchies";
import { Props } from "@itwin/presentation-shared";

const provider: HierarchyProvider = {
  async *getNodes({ parentNode, instanceFilter }) {
    if (!parentNode) {
      // For root nodes, query authors and return nodes based on them
      const authors = await booksService.getAuthors(createBooksServiceFilter(undefined, instanceFilter));
      for (const author of authors) {
        const nodeKey: GenericNodeKey = { type: "generic", id: `author:${author.key}` };
        yield {
          key: nodeKey,
          label: author.name,
          children: author.hasBooks,
          parentKeys: [],
          // whoever renders the nodes, it should know that this node supports children filtering
          supportsFiltering: true,
        };
      }
    } else if (HierarchyNode.isGeneric(parentNode) && parentNode.key.id.startsWith("author:")) {
      // For author parent node, query books and return nodes based on them
      const books = await booksService.getBooks(createBooksServiceFilter({ authorKey: parentNode.key.id.slice(7) }, instanceFilter));
      for (const book of books) {
        const nodeKey: GenericNodeKey = { type: "generic", id: `book:${book.key}` };
        yield {
          key: nodeKey,
          label: book.title,
          children: false,
          parentKeys: [...parentNode.parentKeys, parentNode.key],
        };
      }
    }
  },
  setHierarchySearch() {},
  async *getNodeInstanceKeys() {},
  setFormatter() {},
  hierarchyChanged: new BeEvent(),
};
```

<!-- END EXTRACTION -->

With the above, we can now request filtered nodes from the provider.

As mentioned earlier, the filter is defined as a `GenericInstanceFilter` data structure. In real world scenarios, the component that renders the hierarchy would request metadata from the data source to know what properties are available for filtering. The component would then render some kind of filter building component to allow user define the filter. Finally, the component would pass the filter to the provider.

For this example, we just create a filter manually.

<!-- [[include: [Presentation.Hierarchies.CustomHierarchyProviders.HierarchyLevelFilteringProvider.Result1, Presentation.Hierarchies.CustomHierarchyProviders.HierarchyLevelFilteringProvider.Result2], ts]] -->
<!-- BEGIN EXTRACTION -->

```ts
// Create a filter to find authors that have "Mark" substring in their name or have no books.
const createAuthorsFilter = (): GenericInstanceFilter => ({
  propertyClassNames: ["author"],
  relatedInstances: [],
  rules: {
    operator: "or",
    rules: [
      {
        propertyName: "name",
        operator: "like",
        propertyTypeName: "string",
        sourceAlias: "",
        value: {
          displayValue: "Mark",
          rawValue: "Mark",
        },
      },
      {
        propertyName: "hasBooks",
        operator: "is-equal",
        propertyTypeName: "boolean",
        sourceAlias: "",
        value: {
          displayValue: "False",
          rawValue: false,
        },
      },
    ],
  },
});
// Print the hierarchy level. Output:
// - Albert Einstein
// - Mark Twain
for await (const node of provider.getNodes({ parentNode: undefined, instanceFilter: createAuthorsFilter() })) {
  console.log(`- ${node.label}`);
}

// Create a filter to find books whose key contains "OL274" substring and title contains "Hobbit".
const createBooksFilter = (): GenericInstanceFilter => ({
  propertyClassNames: ["book"],
  relatedInstances: [],
  rules: {
    operator: "and",
    rules: [
      {
        propertyName: "key",
        operator: "like",
        propertyTypeName: "string",
        sourceAlias: "",
        value: {
          displayValue: "OL274",
          rawValue: "OL274",
        },
      },
      {
        propertyName: "title",
        operator: "like",
        propertyTypeName: "string",
        sourceAlias: "",
        value: {
          displayValue: "Hobbit",
          rawValue: "Hobbit",
        },
      },
    ],
  },
});
// Print child hierarchy level for "J.R.R. Tolkien" author parent node. Output:
// - The Hobbit
for await (const node of provider.getNodes({
  parentNode: {
    key: { type: "generic" as const, id: "author:OL26320A" },
    label: "J.R.R. Tolkien",
    parentKeys: [],
  },
  instanceFilter: createBooksFilter(),
})) {
  console.log(`- ${node.label}`);
}
```

<!-- END EXTRACTION -->
