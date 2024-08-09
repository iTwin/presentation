---
"@itwin/unified-selection": patch
---

API documentation improvements:

- Add warnings to interfaces which are not supposed to be extended or implemented by consumers. Objects of such interfaces are only supposed to be created by functions in this package. As such, adding required members to these interfaces is not considered a breaking change.

- Changed `string` to `Id64String` where appropriate, to make it clear that the string is expected to be a valid Id64 string. Note that this is not a breaking change, as `Id64String` is just a type alias for `string`.
