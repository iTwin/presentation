---
"@itwin/presentation-hierarchies": patch
---

Fixed iModel hierarchy provider returning unfiltered nodes after setting the hierarchy filter in certain scenarios.

The situation could happen when a new hierarchy filter is set during an ongoing nodes request. Then, requesting nodes immediately after setting the filter could return nodes from the previous request.

The change also slightly changes what happens when a hierarchy provider when its internal state is reset: provider is disposed, the `imodelChanged` event is raised or hierarchy filter is set. Previously, it would continue handling all ongoing requests and return a valid result. Now, it will stop ASAP and return an empty list.
