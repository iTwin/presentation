---
"@itwin/presentation-shared": major
---

Enhance the `Props` type to only accept functions that have one object argument.

The term "props" refers to a props object, meaning there should only be one argument. For cases when a function has multiple arguments, use TypeScript's `Parameters` utility type instead.
