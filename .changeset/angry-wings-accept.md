---
"@itwin/presentation-hierarchies-react": patch
---

Fix accessibility issues in `<TreeErrorRenderer />`.

This involves a few localized string changes:

- Added `issuesForTree`, defaulting to "Issues for {{tree_label}}.", used as a region landmark label for the error message container.
- Added `noIssuesFound`, defaulting to "No issues found.", used as a label for errors' list when there are no issues.
- Changed `issuesFound` to default to "{{number_of_issues}} issues found.", and updated its usage to inject the number of issues found into the string instead of prefixing it before the string, which allows to place the number at any place in the string (may be a requirement for some languages). This is **a breaking change** for anyone, supplying their own localized strings.

Also, **a new required prop** `treeLabel` was added to `<TreeErrorRenderer />` and `<StrataKitTreeRenderer />` components. The label is used to uniquely identify a tree in the application, which is required for accessibility purposes.
