# Change Log - @itwin/presentation-opentelemetry

## 4.2.1

### Patch Changes

- [#982](https://github.com/iTwin/presentation/pull/982): Update itwinjs-core dependencies to v5.0.0

## 4.2.0

### Minor Changes

- [#834](https://github.com/iTwin/presentation/pull/834): Updated peer dependencies to support iTwin.js Core v5 packages.

## 4.1.1

### Patch Changes

- [#760](https://github.com/iTwin/presentation/pull/760): Added missing `package.json` file under `cjs` folder. It is needed for package to work as commonjs module.

## 4.1.0

### Minor Changes

- [#740](https://github.com/iTwin/presentation/pull/740): Define `type` and `exports` attributes in `package.json`.

  The change moves this package a step closer towards dropping CommonJS support - it's now transpiled from ESM to CommonJS instead of the opposite.

  In addition, the `exports` attribute has been added to `package.json` to prohibit access to APIs that are not intended to be used by external consumers.

This log was last generated on Thu, 31 Aug 2023 11:51:06 GMT and should not be manually modified.

<!-- Start content -->

## 4.0.2

Thu, 31 Aug 2023 11:51:06 GMT

### Patches

- Update dependencies ([commit](https://github.com/iTwin/presentation/commit/585bfe098c3c388c48ffa4f311c4722f1b6835df))

## 4.0.1

Wed, 09 Aug 2023 11:47:16 GMT

### Patches

- Set span status to error when it contains error logs ([commit](https://github.com/iTwin/presentation/commit/ea3a0ea2c27f773ba9ecf49c81d25af4cfd7caf8))
- Update package dependencies ([commit](https://github.com/iTwin/presentation/commit/22593a8fddc52b5c547c024d64e7cc5659c81d01))

## 4.0.0

Tue, 02 May 2023 11:39:31 GMT

### Major changes

- **BREAKING CHANGE:** Remove `convertToReadableSpans` function in favor of `exportDiagnostics`. ([commit](https://github.com/iTwin/presentation/commit/3ea71c980ec134087ea5efaac8a91468e360d044))
- Drop Node 12 and Node 14. ([commit](https://github.com/iTwin/presentation/commit/4a853c7d99ddf3fe920d657f5b1ac5a6169c19b2))
- Drop Node 16 support. ([commit](https://github.com/iTwin/presentation/commit/4a853c7d99ddf3fe920d657f5b1ac5a6169c19b2))

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

_Version update only_

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

_Version update only_

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

- Updated Node types declaration to support latest v16
- The package contains functions for making interop between OpenTelemetry and iTwin.js Presentation types easier.
