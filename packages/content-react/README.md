# @itwin/presentation-content-react

Copyright © Bentley Systems, Incorporated. All rights reserved. See LICENSE.md for license terms and full copyright notice.

The `@itwin/presentation-content-react` package provides React hooks and UI-neutral models for working with [`@itwin/presentation-content`](../content).

## Entry points

| Entry point                         | Description                                              |
| ----------------------------------- | -------------------------------------------------------- |
| `@itwin/presentation-content-react` | Hooks and helper models for building content-driven UIs. |

## Public API

- `useInstanceFilterPropertiesInfo` — React hook that derives `classes` and `properties` lists from a `ContentDescriptor` for an instance filter builder.
- `createInstanceFilterProperties` — UI-neutral helper that derives `classes` and `properties` lists for an instance filter builder.
- `useUniqueFieldValues` — React hook that loads a field's unique values, formatted for display, for populating a filter builder's value selector.
- `getUniqueFieldValues` — UI-neutral helper backing `useUniqueFieldValues`.
- Types: `InstanceFilterClass`, `InstanceFilterPropertiesInfo`, `UniqueFieldValue`.
- `useContent` — React hook that loads content for given content targets and keeps it up to date. It tracks loading and error state, and loads content again when the targets change, when the given `imodelChanged` event is raised, or when `reload` is called. The previously loaded content is kept until the new one is ready.
- `useUnifiedSelectionContent` — React hook that works like `useContent`, but loads content of the instances selected in a unified selection storage. Content is loaded again when the selection of the given iModel changes, keeping content of the previous selection until then. No content is loaded when more than `instancesLimit` items (100 by default) are selected.
- `getContent` — loads content for given content targets.
