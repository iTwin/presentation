# Change Log - @itwin/presentation-testing

## 5.4.5

### Patch Changes

- [#982](https://github.com/iTwin/presentation/pull/982): Update itwinjs-core dependencies to v5.0.0
- Updated dependencies:
  - @itwin/presentation-components@5.12.4

## 5.4.4

### Patch Changes

- Updated dependencies:
  - @itwin/presentation-components@5.12.3

## 5.4.3

### Patch Changes

- [#958](https://github.com/iTwin/presentation/pull/958): Fix support for `itwinjs-core@5.0-rc`.
- Updated dependencies:
  - @itwin/presentation-components@5.12.2

## 5.4.2

### Patch Changes

- Updated dependencies:
  - @itwin/presentation-components@5.12.1

## 5.4.1

### Patch Changes

- [#886](https://github.com/iTwin/presentation/pull/886): Fix package compatibility with `itwinjs-core` peer dependencies at version `4.x`.
- Updated dependencies:
  - @itwin/presentation-components@5.12.0

## 5.4.0

### Minor Changes

- [#834](https://github.com/iTwin/presentation/pull/834): Added `TestIModelConnection` that allows opening iModels from local files without the use of deprecated iTwin.js Core APIs.
- [#834](https://github.com/iTwin/presentation/pull/834): Updated peer dependencies to support iTwin.js Core v5 packages.

### Patch Changes

- Updated dependencies:
  - @itwin/presentation-components@5.11.0

## 5.3.1

### Patch Changes

- Updated dependencies:
  - @itwin/presentation-components@5.10.0

## 5.3.0

### Minor Changes

- [#842](https://github.com/iTwin/presentation/pull/842): Updated peer dependencies to support AppUI v5.

### Patch Changes

- Updated dependencies:
  - @itwin/presentation-components@5.9.0

## 5.2.1

### Patch Changes

- [#810](https://github.com/iTwin/presentation/pull/810): Fix the package not being usable in `cjs` builds due to usage of `import.meta`.
- Updated dependencies:
  - @itwin/presentation-components@5.8.0

## 5.2.0

### Minor Changes

- [#804](https://github.com/iTwin/presentation/pull/804): Deprecated all tree-related APIs.

  As the new generation hierarchy building APIs are now available, the old tree-related APIs are now deprecated. See reasoning and migration guide [here](https://github.com/iTwin/presentation/blob/33e79ee8d77f30580a9bab81a72884bda008db25/packages/hierarchies/learning/PresentationRulesMigrationGuide.md).

### Patch Changes

- Updated dependencies:
  - @itwin/presentation-components@5.7.0

## 5.1.2

### Patch Changes

- Updated dependencies:
  - @itwin/presentation-components@5.6.1

## 5.1.1

### Patch Changes

- [#760](https://github.com/iTwin/presentation/pull/760): Added missing `package.json` file under `cjs` folder. It is needed for package to work as commonjs module.

## 5.1.0

### Minor Changes

- [#754](https://github.com/iTwin/presentation/pull/754): Define `type` and `exports` attributes in `package.json`.

  The change moves this package a step closer towards dropping CommonJS support - it's now transpiled from ESM to CommonJS instead of the opposite.

  In addition, the `exports` attribute has been added to `package.json` to prohibit access to APIs that are not intended to be used by external consumers.

- [#754](https://github.com/iTwin/presentation/pull/754): Export file name utility functions.

  - `getTestOutputDir` and `setTestOutputDir` - get/set functions for the global test output directory used by this package.
  - `setupOutputFileLocation` - given a file name, returns a full path to the file in the test output directory.
  - `createFileNameFromString` - creates a valid, sanitized file name from any string.
  - `limitFilePathLength` - makes sure the given file path is shorter than 260 characters.

### Patch Changes

- Updated dependencies:
  - @itwin/presentation-components@5.6.0

## 5.0.17

### Patch Changes

- Updated dependencies:
  - @itwin/presentation-components@5.5.0

## 5.0.16

### Patch Changes

- Updated dependencies:
  - @itwin/presentation-components@5.4.2

## 5.0.15

### Patch Changes

- Updated dependencies:
  - @itwin/presentation-components@5.4.1

## 5.0.14

### Patch Changes

- Updated dependencies:
  - @itwin/presentation-components@5.4.0

## 5.0.13

### Patch Changes

- Updated dependencies:
  - @itwin/presentation-components@5.3.3

## 5.0.12

### Patch Changes

- [#616](https://github.com/iTwin/presentation/pull/616): Reserve more characters for iModel file name suffixes

## 5.0.11

### Patch Changes

- [#613](https://github.com/iTwin/presentation/pull/613): When creating a test iModel, limit its file name length to fit into file system limits.

## 5.0.10

### Patch Changes

- Updated dependencies:
  - @itwin/presentation-components@5.3.2

## 5.0.9

### Patch Changes

- Updated dependencies:
  - @itwin/presentation-components@5.3.1

## 5.0.8

### Patch Changes

- Updated dependencies:
  - @itwin/presentation-components@5.3.0

## 5.0.7

### Patch Changes

- Updated dependencies:
  - @itwin/presentation-components@5.2.4

## 5.0.6

### Patch Changes

- Updated dependencies:
  - @itwin/presentation-components@5.2.3

## 5.0.5

### Patch Changes

- Updated dependencies:
  - @itwin/presentation-components@5.2.2

## 5.0.4

### Patch Changes

- Updated dependencies:
  - @itwin/presentation-components@5.2.1

## 5.0.3

### Patch Changes

- [#525](https://github.com/iTwin/presentation/pull/525): Specify `@itwin/presentation-components` dependency with `^`.
- Updated dependencies:
  - @itwin/presentation-components@5.2.0

## 5.0.2

### Patch Changes

- [#498](https://github.com/iTwin/presentation/pull/498): Fix invalid file name being created when input string contains ` or ' characters.
- Updated dependencies:
  - @itwin/presentation-components@5.1.0

## 5.0.1

### Patch Changes

- Updated dependencies:
  - @itwin/presentation-components@5.0.1

## 5.0.0

### Major Changes

- [#299](https://github.com/iTwin/presentation/pull/299): Bumped peer depenendecy versions:
  - [itwinjs-core](https://github.com/iTwin/itwinjs-core) packages to `^4.1.0`.
  - [appui](https://github.com/iTwin/appui) packages to `^4.8.0`.

### Patch Changes

- [#348](https://github.com/iTwin/presentation/pull/348): Clean up `@internal` APIs exposed through the barrel exports file.
- Updated dependencies:
  - @itwin/presentation-components@5.0.0

## 5.0.0-dev.6

### Patch Changes

- Updated dependencies:
  - @itwin/presentation-components@5.0.0-dev.6

## 5.0.0-dev.5

### Patch Changes

- Updated dependencies:
  - @itwin/presentation-components@5.0.0-dev.5

## 5.0.0-dev.4

### Patch Changes

- Updated dependencies:
  - @itwin/presentation-components@5.0.0-dev.4

## 5.0.0-dev.3

### Patch Changes

- Updated dependencies:
  - @itwin/presentation-components@5.0.0-dev.3

## 5.0.0-dev.2

### Patch Changes

- [#348](https://github.com/iTwin/presentation/pull/348): Clean up `@internal` APIs exposed through the barrel exports file.
- Updated dependencies:
  - @itwin/presentation-components@5.0.0-dev.2

## 4.1.2

### Patch Changes

- Updated dependencies:
  - @itwin/presentation-components@4.4.0

## 5.0.0-dev.1

### Patch Changes

- Updated dependencies:
  - @itwin/presentation-components@5.0.0-dev.1

## 5.0.0-dev.0

### Major Changes

- [#299](https://github.com/iTwin/presentation/pull/299): Bumped `AppUI` peer dependencies to `4.6.0`. Bumped `itwinjs-core` peer dependencies to `^4.1.0`.

### Patch Changes

- Updated dependencies:
  - @itwin/presentation-components@5.0.0-dev.0

## 4.1.1

### Patch Changes

- Updated dependencies:
  - @itwin/presentation-components@4.3.0

## 4.1.0

### Minor Changes

- [#232](https://github.com/iTwin/presentation/pull/232): Added `TestIModelBuilder.importSchema` API to allow creating iModels with custom schemas.
- [#232](https://github.com/iTwin/presentation/pull/232): Added `buildTestIModel` overloads that take an async callback to set up the iModel. Deprecated the previous ones.

### Patch Changes

- Updated dependencies:
  - @itwin/presentation-components@4.2.1

This log was last generated on Thu, 31 Aug 2023 11:51:06 GMT and should not be manually modified.

<!-- Start content -->

## 4.0.3

Thu, 31 Aug 2023 11:51:06 GMT

### Patches

- Update dependencies ([commit](https://github.com/iTwin/presentation/commit/585bfe098c3c388c48ffa4f311c4722f1b6835df))
- Removed `@itwin/presentation-components` peer dependency. ([commit](https://github.com/iTwin/presentation/commit/9b369dc2cb208ecf4cc6518f319a1648f85c81d9))

## 4.0.2

Wed, 09 Aug 2023 11:47:16 GMT

### Patches

- Update package dependencies ([commit](https://github.com/iTwin/presentation/commit/22593a8fddc52b5c547c024d64e7cc5659c81d01))

## 4.0.1

Thu, 15 Jun 2023 07:31:33 GMT

### Patches

- Bumped `rimraf` version ([commit](https://github.com/iTwin/presentation/commit/e5fdd420d31c98ef6d43daa3faad4fbb27625829))

## 4.0.0

Tue, 02 May 2023 11:39:31 GMT

### Major changes

- Upgrade to AppUI 4.0 ([commit](https://github.com/iTwin/presentation/commit/c869d568d3b462670d20e1ec31807aee15a0857e))

### Minor changes

- Add a `buildTestIModel` overload that generates imodel name from mocha context ([commit](https://github.com/iTwin/presentation/commit/6b844055de128dbf3b1de1611144391dc7ee6d31))
- Change `TestIModelBuilder.insertAspect` to return inserted aspect id. ([commit](https://github.com/iTwin/presentation/commit/4b7ff68423cd641c73d9f3fb5b4bfbb5266fa1e0))
- Add `TestIModelBuilder.insertRelationship` ([commit](https://github.com/iTwin/presentation/commit/56c533083105473e4c9c05d061609a7cd5928d5d))
- Bump minimum required `itwinjs-core` version to `3.6.3` ([commit](https://github.com/iTwin/presentation/commit/7bf12337f09b7fda0362474d3d63b18bb4b07aab))

### Patches

- Reduce deprecated API usage ([commit](https://github.com/iTwin/presentation/commit/6bf1a99ec570751e16f30af658e0fa7e27e7631f))
- Replace all spaces in test name when creating test iModel. ([commit](https://github.com/iTwin/presentation/commit/070f9587299e156ebd58eb7fa0941b50f56ec188))

### Changes

- Update dependencies ([commit](https://github.com/iTwin/presentation/commit/ddf8cf327436fa38dc304666992e9fb66e942933))
- Updated to TypeScript 5.0 ([commit](https://github.com/iTwin/presentation/commit/4b7924ee69265aaadeaba81f02162bf5c404d33a))

## 3.7.4

Tue, 25 Apr 2023 17:50:35 GMT

_Version update only_

## 3.7.3

Thu, 20 Apr 2023 13:19:29 GMT

_Version update only_

## 3.7.2

Wed, 12 Apr 2023 13:12:42 GMT

_Version update only_

## 3.7.1

Mon, 03 Apr 2023 15:15:37 GMT

_Version update only_

## 3.7.0

Wed, 29 Mar 2023 15:02:27 GMT

_Version update only_

## 3.6.3

Mon, 27 Mar 2023 16:26:47 GMT

_Version update only_

## 3.6.2

Fri, 17 Mar 2023 17:52:32 GMT

_Version update only_

## 3.6.1

Fri, 24 Feb 2023 22:00:48 GMT

_Version update only_

## 3.6.0

Wed, 08 Feb 2023 14:58:40 GMT

### Updates

- Use `EmptyLocalization` for localization in tests to increase test performance
- Deprecate `ContentBuilder` methods: `createContentForAllInstances` and `createContentForInstancePerClass`.
- Added reference docs generation

## 3.5.6

Fri, 24 Feb 2023 16:02:47 GMT

_Version update only_

## 3.5.5

Thu, 26 Jan 2023 22:53:28 GMT

_Version update only_

## 3.5.4

Wed, 18 Jan 2023 15:27:15 GMT

_Version update only_

## 3.5.3

Fri, 13 Jan 2023 17:23:07 GMT

_Version update only_

## 3.5.2

Wed, 11 Jan 2023 16:46:30 GMT

_Version update only_

## 3.5.1

Thu, 15 Dec 2022 16:38:29 GMT

_Version update only_

## 3.5.0

Wed, 07 Dec 2022 19:12:37 GMT

### Updates

- Add `buildTestIModel` API for creating test iModels

## 3.4.7

Wed, 30 Nov 2022 14:28:19 GMT

_Version update only_

## 3.4.6

Tue, 22 Nov 2022 14:24:19 GMT

_Version update only_

## 3.4.5

Thu, 17 Nov 2022 21:32:50 GMT

_Version update only_

## 3.4.4

Thu, 10 Nov 2022 19:32:17 GMT

_Version update only_

## 3.4.3

Fri, 28 Oct 2022 13:34:58 GMT

_Version update only_

## 3.4.2

Mon, 24 Oct 2022 13:23:45 GMT

_Version update only_

## 3.4.1

Mon, 17 Oct 2022 20:06:51 GMT

_Version update only_

## 3.4.0

Thu, 13 Oct 2022 20:24:47 GMT

### Updates

- Allow supplying `IModelHostOptions` when initializing tests

## 3.3.5

Tue, 27 Sep 2022 11:50:59 GMT

_Version update only_

## 3.3.4

Thu, 08 Sep 2022 19:00:05 GMT

_Version update only_

## 3.3.3

Tue, 06 Sep 2022 20:54:19 GMT

_Version update only_

## 3.3.2

Thu, 01 Sep 2022 14:37:23 GMT

_Version update only_

## 3.3.1

Fri, 26 Aug 2022 15:40:02 GMT

_Version update only_

## 3.3.0

Thu, 18 Aug 2022 19:08:02 GMT

### Updates

- upgrade mocha to version 10.0.0
- make sure tests use a unique cacheDir
- IModelHost.startup now accepts IModelHostOptions interface rather than IModelHostConfiguration instance

## 3.2.9

Fri, 26 Aug 2022 14:21:40 GMT

_Version update only_

## 3.2.8

Tue, 09 Aug 2022 15:52:41 GMT

_Version update only_

## 3.2.7

Mon, 01 Aug 2022 13:36:56 GMT

_Version update only_

## 3.2.6

Fri, 15 Jul 2022 19:04:43 GMT

_Version update only_

## 3.2.5

Wed, 13 Jul 2022 15:45:53 GMT

_Version update only_

## 3.2.4

Tue, 21 Jun 2022 18:06:33 GMT

_Version update only_

## 3.2.3

Fri, 17 Jun 2022 15:18:39 GMT

_Version update only_

## 3.2.2

Fri, 10 Jun 2022 16:11:37 GMT

_Version update only_

## 3.2.1

Tue, 07 Jun 2022 15:02:57 GMT

_Version update only_

## 3.2.0

Fri, 20 May 2022 13:10:54 GMT

### Updates

- Add a way to reduce raw numeric values' decimal precision to overcome rounding differences across platforms

## 3.1.3

Fri, 15 Apr 2022 13:49:25 GMT

_Version update only_

## 3.1.2

Wed, 06 Apr 2022 22:27:56 GMT

_Version update only_

## 3.1.1

Thu, 31 Mar 2022 15:55:48 GMT

_Version update only_

## 3.1.0

Tue, 29 Mar 2022 20:53:47 GMT

_Version update only_

## 3.0.3

Fri, 25 Mar 2022 15:10:02 GMT

_Version update only_

## 3.0.2

Thu, 10 Mar 2022 21:18:13 GMT

_Version update only_

## 3.0.1

Thu, 24 Feb 2022 15:26:55 GMT

_Version update only_

## 3.0.0

Mon, 24 Jan 2022 14:00:52 GMT

### Updates

- fix code for breaking change to .query() method
- Upgrade target to ES2019
- fix ecsql row format
- rename to @itwin/presentation-testing
- Clean up deprecated APIs
- Replace usage of I18N with generic Localization interface.
- Support for TypeDoc v0.22.7. Fix various broken docs links.

## 2.19.28

Wed, 12 Jan 2022 14:52:38 GMT

_Version update only_

## 2.19.27

Wed, 05 Jan 2022 20:07:20 GMT

_Version update only_

## 2.19.26

Wed, 08 Dec 2021 20:54:53 GMT

_Version update only_

## 2.19.25

Fri, 03 Dec 2021 20:05:49 GMT

_Version update only_

## 2.19.24

Mon, 29 Nov 2021 18:44:31 GMT

_Version update only_

## 2.19.23

Mon, 22 Nov 2021 20:41:40 GMT

_Version update only_

## 2.19.22

Wed, 17 Nov 2021 01:23:26 GMT

_Version update only_

## 2.19.21

Wed, 10 Nov 2021 10:58:24 GMT

_Version update only_

## 2.19.20

Fri, 29 Oct 2021 16:14:22 GMT

_Version update only_

## 2.19.19

Mon, 25 Oct 2021 16:16:25 GMT

_Version update only_

## 2.19.18

Thu, 21 Oct 2021 20:59:44 GMT

_Version update only_

## 2.19.17

Thu, 14 Oct 2021 21:19:43 GMT

_Version update only_

## 2.19.16

Mon, 11 Oct 2021 17:37:46 GMT

_Version update only_

## 2.19.15

Fri, 08 Oct 2021 16:44:23 GMT

_Version update only_

## 2.19.14

Fri, 01 Oct 2021 13:07:03 GMT

_Version update only_

## 2.19.13

Tue, 21 Sep 2021 21:06:40 GMT

_Version update only_

## 2.19.12

Wed, 15 Sep 2021 18:06:46 GMT

_Version update only_

## 2.19.11

Thu, 09 Sep 2021 21:04:58 GMT

_Version update only_

## 2.19.10

Wed, 08 Sep 2021 14:36:01 GMT

_Version update only_

## 2.19.9

Wed, 25 Aug 2021 15:36:01 GMT

_Version update only_

## 2.19.8

Mon, 23 Aug 2021 13:23:13 GMT

_Version update only_

## 2.19.7

Fri, 20 Aug 2021 17:47:22 GMT

_Version update only_

## 2.19.6

Tue, 17 Aug 2021 20:34:29 GMT

_Version update only_

## 2.19.5

Fri, 13 Aug 2021 21:48:09 GMT

_Version update only_

## 2.19.4

Thu, 12 Aug 2021 13:09:26 GMT

_Version update only_

## 2.19.3

Wed, 04 Aug 2021 20:29:34 GMT

_Version update only_

## 2.19.2

Tue, 03 Aug 2021 18:26:23 GMT

_Version update only_

## 2.19.1

Thu, 29 Jul 2021 20:01:11 GMT

_Version update only_

## 2.19.0

Mon, 26 Jul 2021 12:21:25 GMT

_Version update only_

## 2.18.4

Tue, 10 Aug 2021 19:35:13 GMT

_Version update only_

## 2.18.3

Wed, 28 Jul 2021 17:16:30 GMT

_Version update only_

## 2.18.2

Mon, 26 Jul 2021 16:18:31 GMT

_Version update only_

## 2.18.1

Fri, 16 Jul 2021 17:45:09 GMT

_Version update only_

## 2.18.0

Fri, 09 Jul 2021 18:11:24 GMT

### Updates

- Add missing devDependencies

## 2.17.3

Mon, 26 Jul 2021 16:08:36 GMT

_Version update only_

## 2.17.2

Thu, 08 Jul 2021 15:23:00 GMT

_Version update only_

## 2.17.1

Fri, 02 Jul 2021 15:38:31 GMT

_Version update only_

## 2.17.0

Mon, 28 Jun 2021 16:20:11 GMT

_Version update only_

## 2.16.10

Thu, 22 Jul 2021 20:23:45 GMT

_Version update only_

## 2.16.9

Tue, 06 Jul 2021 22:08:34 GMT

_Version update only_

## 2.16.8

Fri, 02 Jul 2021 17:40:46 GMT

_Version update only_

## 2.16.7

Mon, 28 Jun 2021 18:13:04 GMT

_Version update only_

## 2.16.6

Mon, 28 Jun 2021 13:12:55 GMT

_Version update only_

## 2.16.5

Fri, 25 Jun 2021 16:03:01 GMT

_Version update only_

## 2.16.4

Wed, 23 Jun 2021 17:09:07 GMT

_Version update only_

## 2.16.3

Wed, 16 Jun 2021 20:29:32 GMT

_Version update only_

## 2.16.2

Thu, 03 Jun 2021 18:08:11 GMT

_Version update only_

## 2.16.1

Thu, 27 May 2021 20:04:22 GMT

_Version update only_

## 2.16.0

Mon, 24 May 2021 15:58:39 GMT

_Version update only_

## 2.15.6

Wed, 26 May 2021 15:55:19 GMT

_Version update only_

## 2.15.5

Thu, 20 May 2021 15:06:26 GMT

_Version update only_

## 2.15.4

Tue, 18 May 2021 21:59:07 GMT

_Version update only_

## 2.15.3

Mon, 17 May 2021 13:31:38 GMT

_Version update only_

## 2.15.2

Wed, 12 May 2021 18:08:13 GMT

_Version update only_

## 2.15.1

Wed, 05 May 2021 13:18:31 GMT

_Version update only_

## 2.15.0

Fri, 30 Apr 2021 12:36:58 GMT

_Version update only_

## 2.14.4

Thu, 22 Apr 2021 21:07:33 GMT

_Version update only_

## 2.14.3

Thu, 15 Apr 2021 15:13:16 GMT

_Version update only_

## 2.14.2

Thu, 08 Apr 2021 14:30:09 GMT

_Version update only_

## 2.14.1

Mon, 05 Apr 2021 16:28:00 GMT

_Version update only_

## 2.14.0

Fri, 02 Apr 2021 13:18:42 GMT

_Version update only_

## 2.13.0

Tue, 09 Mar 2021 20:28:13 GMT

### Updates

- Updated to use TypeScript 4.1
- begin rename project from iModel.js to iTwin.js

## 2.12.3

Mon, 08 Mar 2021 15:32:00 GMT

_Version update only_

## 2.12.2

Wed, 03 Mar 2021 18:48:53 GMT

_Version update only_

## 2.12.1

Tue, 23 Feb 2021 20:54:45 GMT

_Version update only_

## 2.12.0

Thu, 18 Feb 2021 22:10:13 GMT

_Version update only_

## 2.11.2

Thu, 18 Feb 2021 02:50:59 GMT

_Version update only_

## 2.11.1

Thu, 04 Feb 2021 17:22:41 GMT

_Version update only_

## 2.11.0

Thu, 28 Jan 2021 13:39:27 GMT

_Version update only_

## 2.10.3

Fri, 08 Jan 2021 18:34:03 GMT

_Version update only_

## 2.10.2

Fri, 08 Jan 2021 14:52:02 GMT

_Version update only_

## 2.10.1

Tue, 22 Dec 2020 00:53:38 GMT

_Version update only_

## 2.10.0

Fri, 18 Dec 2020 18:24:01 GMT

_Version update only_

## 2.9.9

Sun, 13 Dec 2020 19:00:03 GMT

_Version update only_

## 2.9.8

Fri, 11 Dec 2020 02:57:36 GMT

_Version update only_

## 2.9.7

Wed, 09 Dec 2020 20:58:23 GMT

_Version update only_

## 2.9.6

Mon, 07 Dec 2020 18:40:48 GMT

_Version update only_

## 2.9.5

Sat, 05 Dec 2020 01:55:56 GMT

_Version update only_

## 2.9.4

Wed, 02 Dec 2020 20:55:40 GMT

_Version update only_

## 2.9.3

Mon, 23 Nov 2020 20:57:56 GMT

_Version update only_

## 2.9.2

Mon, 23 Nov 2020 15:33:50 GMT

_Version update only_

## 2.9.1

Thu, 19 Nov 2020 17:03:42 GMT

_Version update only_

## 2.9.0

Wed, 18 Nov 2020 16:01:50 GMT

### Updates

- Reexport HierarchyCacheMode and PresentationManagerMode types.

## 2.8.1

Tue, 03 Nov 2020 00:33:56 GMT

_Version update only_

## 2.8.0

Fri, 23 Oct 2020 17:04:02 GMT

_Version update only_

## 2.7.6

Wed, 11 Nov 2020 16:28:23 GMT

_Version update only_

## 2.7.5

Fri, 23 Oct 2020 16:23:50 GMT

_Version update only_

## 2.7.4

Mon, 19 Oct 2020 17:57:02 GMT

_Version update only_

## 2.7.3

Wed, 14 Oct 2020 17:00:59 GMT

_Version update only_

## 2.7.2

Tue, 13 Oct 2020 18:20:39 GMT

_Version update only_

## 2.7.1

Thu, 08 Oct 2020 13:04:35 GMT

_Version update only_

## 2.7.0

Fri, 02 Oct 2020 18:03:32 GMT

_Version update only_

## 2.6.5

Sat, 26 Sep 2020 16:06:34 GMT

_Version update only_

## 2.6.4

Tue, 22 Sep 2020 17:40:07 GMT

_Version update only_

## 2.6.3

Mon, 21 Sep 2020 14:47:10 GMT

_Version update only_

## 2.6.2

Mon, 21 Sep 2020 13:07:44 GMT

_Version update only_

## 2.6.1

Fri, 18 Sep 2020 13:15:09 GMT

_Version update only_

## 2.6.0

Thu, 17 Sep 2020 13:16:12 GMT

### Updates

- Moved ESLint configuration to a plugin

## 2.5.5

Wed, 02 Sep 2020 17:42:23 GMT

_Version update only_

## 2.5.4

Fri, 28 Aug 2020 15:34:15 GMT

_Version update only_

## 2.5.3

Wed, 26 Aug 2020 11:46:00 GMT

_Version update only_

## 2.5.2

Tue, 25 Aug 2020 22:09:08 GMT

_Version update only_

## 2.5.1

Mon, 24 Aug 2020 18:13:04 GMT

_Version update only_

## 2.5.0

Thu, 20 Aug 2020 20:57:10 GMT

### Updates

- Switch to ESLint

## 2.4.2

Fri, 14 Aug 2020 16:34:09 GMT

_Version update only_

## 2.4.1

Fri, 07 Aug 2020 19:57:43 GMT

_Version update only_

## 2.4.0

Tue, 28 Jul 2020 16:26:24 GMT

_Version update only_

## 2.3.3

Thu, 23 Jul 2020 12:57:15 GMT

_Version update only_

## 2.3.2

Tue, 14 Jul 2020 23:50:36 GMT

_Version update only_

## 2.3.1

Mon, 13 Jul 2020 18:50:14 GMT

_Version update only_

## 2.3.0

Fri, 10 Jul 2020 17:23:14 GMT

### Updates

- Fix presentation backend cache directly not being cleaned up

## 2.2.1

Tue, 07 Jul 2020 14:44:52 GMT

_Version update only_

## 2.2.0

Fri, 19 Jun 2020 14:10:03 GMT

_Version update only_

## 2.1.0

Thu, 28 May 2020 22:48:59 GMT

_Version update only_

## 2.0.0

Wed, 06 May 2020 13:17:49 GMT

### Updates

- react to renaming of imodeljs-clients-backend to backend-itwin-client
- react to changes in imodeljs-clients
- update tests to utilize FrontendAuthorizationClient
- Renamed OIDC constructs for consistency; Removed SAML support.
- Clean up deprecated APIs
- Change argument lists to props object
- Remove deprecated initialize
- Separate tests from source
- react to new clients packages from imodeljs-clients
- Upgrade to Rush 5.23.2
- Moved Property classes and interfaces to ui-abstract package.

## 1.14.1

Wed, 22 Apr 2020 19:04:00 GMT

_Version update only_

## 1.14.0

Tue, 31 Mar 2020 15:44:19 GMT

_Version update only_

## 1.13.0

Wed, 04 Mar 2020 16:16:31 GMT

_Version update only_

## 1.12.0

Wed, 12 Feb 2020 17:45:50 GMT

### Updates

- Consolidated sign-in across packages for integration tests

## 1.11.0

Wed, 22 Jan 2020 19:24:12 GMT

### Updates

- Upgrade to TypeScript 3.7.2.

## 1.10.0

Tue, 07 Jan 2020 19:44:01 GMT

_Version update only_

## 1.9.0

Tue, 10 Dec 2019 18:08:56 GMT

### Updates

- Update sinon version.

## 1.8.0

Fri, 22 Nov 2019 14:03:34 GMT

_Version update only_

## 1.7.0

Fri, 01 Nov 2019 13:28:37 GMT

### Updates

- Added a log in for authorization client in initialize

## 1.6.0

Wed, 09 Oct 2019 20:28:42 GMT

_Version update only_

## 1.5.0

Mon, 30 Sep 2019 22:28:48 GMT

### Updates

- Add module descriptions
- Upgrade to TypeScript 3.6.2

## 1.4.0

Tue, 10 Sep 2019 12:09:49 GMT

_Version update only_

## 1.3.0

Tue, 13 Aug 2019 20:25:53 GMT

_Version update only_

## 1.2.0

Wed, 24 Jul 2019 11:47:26 GMT

_Version update only_

## 1.1.0

Mon, 01 Jul 2019 19:04:29 GMT

### Updates

- Update to TypeScript 3.5

## 1.0.0

Mon, 03 Jun 2019 18:09:39 GMT

### Updates

- Add release tags

## 0.191.0

Mon, 13 May 2019 15:52:05 GMT

### Updates

- Import within package lint rule
- Fix tests initializer randomly failing with a file lock error
- Remove IModelApp subclasses
- Upgrade TypeDoc dependency to 0.14.2

## 0.190.0

Thu, 14 Mar 2019 14:26:49 GMT

_Version update only_

## 0.189.0

Wed, 06 Mar 2019 15:41:22 GMT

### Updates

- Use new buildIModelJsBuild script
- Added ContentBuilder, that allows testing how a given ruleset constructs content from an imodel.
- Move property definitions to imodeljs-frontend so they could be used by tools to define properties for tool settings.
- Upgrade to TypeScript 3.2.2

## 0.188.0

Wed, 16 Jan 2019 16:36:09 GMT

_Version update only_

## 0.187.0

Tue, 15 Jan 2019 15:18:59 GMT

_Version update only_

## 0.186.0

Mon, 14 Jan 2019 23:09:10 GMT

_Version update only_

## 0.185.0

Fri, 11 Jan 2019 18:29:00 GMT

_Version update only_

## 0.184.0

Thu, 10 Jan 2019 22:46:17 GMT

### Updates

- Added initialization/termination helpers.
