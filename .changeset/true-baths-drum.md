---
"@itwin/unified-selection-react": major
"@itwin/unified-selection": major
"@itwin/presentation-opentelemetry": major
---

Dropped CommonJS support. These packages are now published as ES modules (ESM) only.

This is a packaging change only — the public API is unchanged — so consumers already using the ESM build are not affected. For downstream packages depending on these:

- If you list one of these packages as a `peerDependency`, widen the version range to include the new major version.
- If you have one of these packages as a `dependency` and re-expose it through your public API, you can safely bump to the new major version — the API is unchanged, so it will not break your API consumers.
