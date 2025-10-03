---
"@itwin/presentation-hierarchies-react": patch
---

Fix accessibility issues in `<TreeErrorRenderer />`.

This involves a few localized string changes:

- Added `noIssuesFound`, defaulting to "No issues found.".
- Changed `issuesFound` to default to "{{number_of_issues}} issues found.", and updated its usage to inject the number of issues found into the string instead of prefixing it before the string, which allows to place the number at any place in the string (may be a requirement for some languages). This is **a breaking change** for anyone, supplying their own localized strings.
