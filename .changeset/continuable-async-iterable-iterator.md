---
"@itwin/presentation-shared": minor
---

Added `ContinuableAsyncIterableIterator` interface - an async iterator that tracks its position and returns an opaque token through `getContinuationToken`, which can be used to request a new iterator that continues from the value following the last returned one.
