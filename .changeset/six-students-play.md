---
"@itwin/presentation-hierarchies": patch
---

Remove `@internal` tags from public APIs that aren't exported through the barrel. They were added to explicitly say that not adding to barrel was intentional, but that makes the `@itwin/no-internal` linter rule angry.
