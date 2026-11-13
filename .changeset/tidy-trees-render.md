---
"@itwin/presentation-hierarchies-react": minor
---

Bundle the StrataKit tree implementation so consumers of the headless entry point no longer install `@stratakit/structures` and its required peer dependencies. Export `StrataKitErrorRegionItem` from the `/stratakit` entry point for custom error rendering.

`@stratakit/structures` is no longer installed with this package. Custom `renderError` callbacks of `TreeErrorRenderer` that return `unstable_ErrorRegion.Item` from `@stratakit/structures` should return `StrataKitErrorRegionItem` instead.
