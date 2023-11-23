window.BENCHMARK_DATA = {
  "lastUpdate": 1700729821405,
  "repoUrl": "https://github.com/iTwin/presentation",
  "entries": {
    "Benchmark": [
      {
        "commit": {
          "author": {
            "name": "Grigas",
            "username": "grigasp",
            "email": "35135765+grigasp@users.noreply.github.com"
          },
          "committer": {
            "name": "GitHub",
            "username": "web-flow",
            "email": "noreply@github.com"
          },
          "id": "1f1e8cdd0b3d4f823df8ca18be42ed535d498f35",
          "message": "Allow manually dispatching perf benchmark workflow (#335)",
          "timestamp": "2023-11-10T15:13:01Z",
          "url": "https://github.com/iTwin/presentation/commit/1f1e8cdd0b3d4f823df8ca18be42ed535d498f35"
        },
        "date": 1699629287456,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Initial Models Tree Load: Baytown.bim",
            "value": 361,
            "unit": "ms",
            "extra": "min: 361\nmax: 361\ncount: 1\nmean: 361\np50: 361.5\nmedian: 361.5\np75: 361.5\np90: 361.5\np95: 361.5\np99: 361.5\np999: 361.5"
          },
          {
            "name": "Full Models Tree Load: Baytown.bim",
            "value": 1845,
            "unit": "ms",
            "extra": "min: 1845\nmax: 1845\ncount: 1\nmean: 1845\np50: 1826.6\nmedian: 1826.6\np75: 1826.6\np90: 1826.6\np95: 1826.6\np99: 1826.6\np999: 1826.6"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "35135765+grigasp@users.noreply.github.com",
            "name": "Grigas",
            "username": "grigasp"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "eff3091248199449d86772d450324c1888de7d8e",
          "message": "Stop exposing internal APIs (#348)\n\n* Cleanup `@internal` APIs from `presentation-testing` barrel\r\n\r\n* Cleanup `@internal` APIs from `presentation-components` barrel\r\n\r\n* Fix `@internal` detection script to allow non-root level `@internal` APIs\r\n\r\n* Some renames to get creating root level API exports summary working\r\n\r\n* changeset",
          "timestamp": "2023-11-22T14:40:49Z",
          "tree_id": "eb5ec2d809132c48e55073247040df877cabc327",
          "url": "https://github.com/iTwin/presentation/commit/eff3091248199449d86772d450324c1888de7d8e"
        },
        "date": 1700664136600,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Initial Models Tree Load: Baytown.bim",
            "value": 409,
            "unit": "ms",
            "extra": "min: 409\nmax: 409\ncount: 1\nmean: 409\np50: 407.5\nmedian: 407.5\np75: 407.5\np90: 407.5\np95: 407.5\np99: 407.5\np999: 407.5"
          },
          {
            "name": "Full Models Tree Load: Baytown.bim",
            "value": 1793,
            "unit": "ms",
            "extra": "min: 1793\nmax: 1793\ncount: 1\nmean: 1793\np50: 1790.4\nmedian: 1790.4\np75: 1790.4\np90: 1790.4\np95: 1790.4\np99: 1790.4\np999: 1790.4"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "100586436+JonasDov@users.noreply.github.com",
            "name": "JonasDov",
            "username": "JonasDov"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "3a212a51d635264a663bfccc8b8a099ca7f28ce3",
          "message": "Add localization to core-interop and hierarchy-builder packages (#349)\n\n* Add localization\r\n\r\n* Add changeset\r\n\r\n* Add eslint disable\r\n\r\n* Resolve comments\r\n\r\n* Add test for 100% coverage\r\n\r\n* Remove unused export\r\n\r\n* Run extract api",
          "timestamp": "2023-11-23T08:32:25Z",
          "tree_id": "04f1a50addbeb58bc85a59d6c74bbe4951b95f24",
          "url": "https://github.com/iTwin/presentation/commit/3a212a51d635264a663bfccc8b8a099ca7f28ce3"
        },
        "date": 1700728411197,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Initial Models Tree Load: Baytown.bim",
            "value": 429,
            "unit": "ms",
            "extra": "min: 429\nmax: 429\ncount: 1\nmean: 429\np50: 432.7\nmedian: 432.7\np75: 432.7\np90: 432.7\np95: 432.7\np99: 432.7\np999: 432.7"
          },
          {
            "name": "Full Models Tree Load: Baytown.bim",
            "value": 1872,
            "unit": "ms",
            "extra": "min: 1872\nmax: 1872\ncount: 1\nmean: 1872\np50: 1863.5\nmedian: 1863.5\np75: 1863.5\np90: 1863.5\np95: 1863.5\np99: 1863.5\np999: 1863.5"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "35135765+grigasp@users.noreply.github.com",
            "name": "Grigas",
            "username": "grigasp"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "13f2a5fa9cbb33ef1653d687a6fc1689c80e1ca4",
          "message": "Bump `@itwin` dependencies (#352)\n\n* Bump `itwinjs-core` dependencies\r\n\r\n* empty changeset",
          "timestamp": "2023-11-23T08:55:30Z",
          "tree_id": "10cf1e5f1bef60f2e6cd7b147bcf2e196e3b9327",
          "url": "https://github.com/iTwin/presentation/commit/13f2a5fa9cbb33ef1653d687a6fc1689c80e1ca4"
        },
        "date": 1700729820743,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Initial Models Tree Load: Baytown.bim",
            "value": 356,
            "unit": "ms",
            "extra": "min: 356\nmax: 356\ncount: 1\nmean: 356\np50: 354.3\nmedian: 354.3\np75: 354.3\np90: 354.3\np95: 354.3\np99: 354.3\np999: 354.3"
          },
          {
            "name": "Full Models Tree Load: Baytown.bim",
            "value": 1800,
            "unit": "ms",
            "extra": "min: 1800\nmax: 1800\ncount: 1\nmean: 1800\np50: 1790.4\nmedian: 1790.4\np75: 1790.4\np90: 1790.4\np95: 1790.4\np99: 1790.4\np999: 1790.4"
          }
        ]
      }
    ]
  }
}