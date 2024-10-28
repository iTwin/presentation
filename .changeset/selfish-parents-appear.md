---
"@itwin/presentation-testing": minor
---

Export file name utility functions.

- `getTestOutputDir` and `setTestOutputDir` - get/set functions for the global test output directory used by this package.
- `setupOutputFileLocation` - given a file name, returns a full path to the file in the test output directory.
- `createFileNameFromString` - creates a valid, sanitized file name from any string.
- `limitFilePathLength` - makes sure the given file path is shorter than 260 characters.
