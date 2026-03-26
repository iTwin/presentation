---
name: repo-context
description: "Provides tech stack, package layout, conventions, and build commands for the iTwin/presentation monorepo. Use when: working on any package or app in this repo, planning changes, implementing features, reviewing code."
---

# iTwin/presentation Repository Context

## Overview

This is a **pnpm monorepo** orchestrated with **Lage** and versioned with **Changesets**.

## Tech Stack

| Area | Technology |
|------|-----------|
| Language | TypeScript (strict, ES2022, dual CJS/ESM builds) |
| UI | React 18, iTwinUI components, SCSS |
| Testing | Mocha + Sinon  |
| Linting | ESLint 9 (flat config), oxfmt for formatting |
| Platform | iTwin.js (iModels, ECSQL, Presentation APIs) |
| Reactive | RxJS |
| API docs | `@itwin/build-tools` (extract-api, docs) |
| Node | ^24, pnpm 10 |

## Packages

| Package | Path | Purpose |
|---------|------|---------|
| `@itwin/presentation-shared` | `packages/shared` | Shared utilities and types |
| `@itwin/presentation-core-interop` | `packages/core-interop` | Interop layer with iTwin.js Presentation |
| `@itwin/presentation-hierarchies` | `packages/hierarchies` | Hierarchy building from iModel data |
| `@itwin/presentation-hierarchies-react` | `packages/hierarchies-react` | React bindings for hierarchies |
| `@itwin/presentation-components` | `packages/components` | React components (trees, property grids, tables) |
| `@itwin/unified-selection` | `packages/unified-selection` | Unified selection storage |
| `@itwin/unified-selection-react` | `packages/unified-selection-react` | React bindings for unified selection |
| `@itwin/presentation-opentelemetry` | `packages/opentelemetry` | OpenTelemetry diagnostics integration |
| `@itwin/presentation-models-tree` | `packages/models-tree` | Models tree widget |
| `@itwin/presentation-testing` | `packages/testing` | Test helpers |
| `@itwin/presentation-test-utilities` | `packages/test-utilities` | Internal test utilities |

## Apps

| App | Path | Purpose |
|-----|------|---------|
| `full-stack-tests` | `apps/full-stack-tests` | Integration tests |
| `test-app` | `apps/test-app` | Sample app (frontend + backend) |
| `performance-tests` | `apps/performance-tests` | Benchmarks for hierarchies and unified selection |
| `load-tests` | `apps/load-tests` | Load testing |

## Key Conventions

- Packages produce dual CJS/ESM output via `tsconfig.cjs.json` / `tsconfig.esm.json`
- Public API is tracked via `extract-api` and `.api.md` report files in `api/` folders
- Copyright headers are required on all source files (enforced by `copyrightLinter.js`):
  ```
  /*---------------------------------------------------------------------------------------------
   * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
   * See LICENSE.md in the project root for license terms and full copyright notice.
   *--------------------------------------------------------------------------------------------*/
  ```
- Changes require a changeset (`pnpm change`)
- Build order is managed by Lage (`lage build`, dependencies via `^build`)

## Common Commands

| Scope | Build | Test | Lint | Format |
|-------|-------|------|------|--------|
| All (repo root) | `pnpm build:all` | `pnpm cover:all` | `pnpm lint:all` | `pnpm format` |
| Single package | `pnpm build` | `pnpm test` | `pnpm lint` | `pnpm oxfmt --check .` |
| Scoped build | `pnpm lage build --to <package>` | — | — | — |
| Format fix | `pnpm format:fix` | — | — | — |
