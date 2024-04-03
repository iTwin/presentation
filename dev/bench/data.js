window.BENCHMARK_DATA = {
  "lastUpdate": 1712158278358,
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
          "id": "6d5fb05db8f49dfdc057f14f7bacb537bce8363b",
          "message": "Hierarchy builder: Hierarchy level filtering (#342)\n\n* Move some stuff around\r\n\r\n* WIP hierarchy level filtering\r\n\r\n* Allow hierarchy definitions to opt-in for hierarchy level filtering\r\n\r\n* Support filtering by advanced property types\r\n\r\n* 100% coverage\r\n\r\n* Add full stack tests for hierarchy level filtering\r\n\r\n* finalize",
          "timestamp": "2023-11-23T14:24:45Z",
          "tree_id": "b252973e2b626e97d592b4463b2169ce0c957cb7",
          "url": "https://github.com/iTwin/presentation/commit/6d5fb05db8f49dfdc057f14f7bacb537bce8363b"
        },
        "date": 1700749576357,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Initial Models Tree Load: Baytown.bim",
            "value": 404,
            "unit": "ms",
            "extra": "min: 404\nmax: 404\ncount: 1\nmean: 404\np50: 407.5\nmedian: 407.5\np75: 407.5\np90: 407.5\np95: 407.5\np99: 407.5\np999: 407.5"
          },
          {
            "name": "Full Models Tree Load: Baytown.bim",
            "value": 1807,
            "unit": "ms",
            "extra": "min: 1807\nmax: 1807\ncount: 1\nmean: 1807\np50: 1790.4\nmedian: 1790.4\np75: 1790.4\np90: 1790.4\np95: 1790.4\np99: 1790.4\np999: 1790.4"
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
          "id": "6aef4b81f1531de409a853ed59f8579f1946ac9e",
          "message": "Add properties grouping (#345)\n\n* Initial changes\r\n\r\n* Update propertyGrouping\r\n\r\n* Add properties grouping\r\n\r\n* changeset\r\n\r\n* Extract api\r\n\r\n* Update packages/hierarchy-builder/src/hierarchy-builder/HierarchyNode.ts\r\n\r\nCo-authored-by: Grigas <35135765+grigasp@users.noreply.github.com>\r\n\r\n* Update packages/hierarchy-builder/src/hierarchy-builder/HierarchyNode.ts\r\n\r\nCo-authored-by: Grigas <35135765+grigasp@users.noreply.github.com>\r\n\r\n* Update packages/hierarchy-builder/src/hierarchy-builder/HierarchyNode.ts\r\n\r\nCo-authored-by: Grigas <35135765+grigasp@users.noreply.github.com>\r\n\r\n* Update packages/hierarchy-builder/src/hierarchy-builder/HierarchyNode.ts\r\n\r\nCo-authored-by: Grigas <35135765+grigasp@users.noreply.github.com>\r\n\r\n* Update packages/hierarchy-builder/src/hierarchy-builder/HierarchyNode.ts\r\n\r\nCo-authored-by: Grigas <35135765+grigasp@users.noreply.github.com>\r\n\r\n* Update packages/hierarchy-builder/src/hierarchy-builder/HierarchyNode.ts\r\n\r\nCo-authored-by: Grigas <35135765+grigasp@users.noreply.github.com>\r\n\r\n* Update packages/hierarchy-builder/src/hierarchy-builder/HierarchyNode.ts\r\n\r\nCo-authored-by: Grigas <35135765+grigasp@users.noreply.github.com>\r\n\r\n* Update packages/hierarchy-builder/src/hierarchy-builder/HierarchyNode.ts\r\n\r\nCo-authored-by: Grigas <35135765+grigasp@users.noreply.github.com>\r\n\r\n* Update packages/hierarchy-builder/src/hierarchy-builder/HierarchyNode.ts\r\n\r\nCo-authored-by: Grigas <35135765+grigasp@users.noreply.github.com>\r\n\r\n* Update packages/hierarchy-builder/src/hierarchy-builder/HierarchyNode.ts\r\n\r\nCo-authored-by: Grigas <35135765+grigasp@users.noreply.github.com>\r\n\r\n* Update packages/hierarchy-builder/src/hierarchy-builder/HierarchyNode.ts\r\n\r\nCo-authored-by: Grigas <35135765+grigasp@users.noreply.github.com>\r\n\r\n* Update packages/hierarchy-builder/src/hierarchy-builder/HierarchyNode.ts\r\n\r\nCo-authored-by: Grigas <35135765+grigasp@users.noreply.github.com>\r\n\r\n* Update packages/hierarchy-builder/src/hierarchy-builder/HierarchyNode.ts\r\n\r\nCo-authored-by: Grigas <35135765+grigasp@users.noreply.github.com>\r\n\r\n* Update packages/hierarchy-builder/src/hierarchy-builder/HierarchyNode.ts\r\n\r\nCo-authored-by: Grigas <35135765+grigasp@users.noreply.github.com>\r\n\r\n* Update packages/hierarchy-builder/src/hierarchy-builder/queries/NodeSelectClauseFactory.ts\r\n\r\nCo-authored-by: Grigas <35135765+grigasp@users.noreply.github.com>\r\n\r\n* Update packages/hierarchy-builder/src/hierarchy-builder/queries/NodeSelectClauseFactory.ts\r\n\r\nCo-authored-by: Grigas <35135765+grigasp@users.noreply.github.com>\r\n\r\n* Update packages/hierarchy-builder/src/hierarchy-builder/internal/operators/grouping/PropertiesGrouping.ts\r\n\r\nCo-authored-by: Grigas <35135765+grigasp@users.noreply.github.com>\r\n\r\n* Update packages/hierarchy-builder/src/hierarchy-builder/internal/operators/grouping/PropertiesGrouping.ts\r\n\r\nCo-authored-by: Grigas <35135765+grigasp@users.noreply.github.com>\r\n\r\n* Update packages/hierarchy-builder/src/hierarchy-builder/internal/operators/grouping/PropertiesGrouping.ts\r\n\r\nCo-authored-by: Grigas <35135765+grigasp@users.noreply.github.com>\r\n\r\n* Apply renaming changes\r\n\r\n* Fix test\r\n\r\n* Move docs to PropertyGroup\r\n\r\n* Move addToPreviousPropertiesInfo to the beginning and remove function\r\n\r\n* change \"undefined\" to \"\"\r\n\r\n* Add clarification\r\n\r\n* Add export\r\n\r\n* Remove groupingInfo add export\r\n\r\n* Use localization\r\n\r\n* Use valueFormatter from HierarchyProvider\r\n\r\n* Small fixes\r\n\r\n* Renaming\r\n\r\n* Merge master and run extract api\r\n\r\n* Run extract api\r\n\r\n* Add translate\r\n\r\n* Add 100% coverage\r\n\r\n* Fix integration tests\r\n\r\n* Add tests\r\n\r\n* Remove .only\r\n\r\n* Fix tests\r\n\r\n* Fix merge conflicts\r\n\r\n* Update packages/hierarchy-builder/src/hierarchy-builder/internal/operators/grouping/PropertiesGrouping.ts\r\n\r\nCo-authored-by: Grigas <35135765+grigasp@users.noreply.github.com>\r\n\r\n* Update packages/hierarchy-builder/src/hierarchy-builder/internal/operators/grouping/PropertiesGrouping.ts\r\n\r\nCo-authored-by: Grigas <35135765+grigasp@users.noreply.github.com>\r\n\r\n* Update packages/hierarchy-builder/src/hierarchy-builder/queries/NodeSelectQueryFactory.ts\r\n\r\nCo-authored-by: Grigas <35135765+grigasp@users.noreply.github.com>\r\n\r\n* Rename ECSqlSelectClauseRange to ECSqlSelectClausePropertyValueRange\r\n\r\n* Remove unused json\r\n\r\n* Rename PropertyGroup to HierarchyNodePropertyGroup\r\n\r\n* Run extract-api\r\n\r\n* Rename Range to HierarchyNodePropertyValueRange\r\n\r\n* Merge getGroupingAutoExpandOptionsFromParentNode() and getGroupingHideOptionsFromParentNode()\r\n\r\n* Change fullClassName: to propertiesClassName:\r\n\r\n* Add docs to NodeSelectQueryFactory\r\n\r\n* Remove @beta tag\r\n\r\n* Rename extractedPropertyInfo to handlerGroupingParams\r\n\r\n* Add extra information to range formatting\r\n\r\n* Fix autoExpand\r\n\r\n* Update packages/full-stack-tests/src/hierarchy-builder/grouping/BaseClassGrouping.test.ts\r\n\r\nCo-authored-by: Grigas <35135765+grigasp@users.noreply.github.com>\r\n\r\n* Update packages/full-stack-tests/src/hierarchy-builder/grouping/AutoExpand.test.ts\r\n\r\nCo-authored-by: Grigas <35135765+grigasp@users.noreply.github.com>\r\n\r\n* Update packages/full-stack-tests/src/hierarchy-builder/grouping/PropertiesGrouping.test.ts\r\n\r\nCo-authored-by: Grigas <35135765+grigasp@users.noreply.github.com>\r\n\r\n* Update packages/hierarchy-builder/src/test/internal/operators/grouping/PropertiesGrouping.test.ts\r\n\r\nCo-authored-by: Grigas <35135765+grigasp@users.noreply.github.com>\r\n\r\n* Refactor multi level grouping tests\r\n\r\n* Do not extract ecproperty a second time\r\n\r\n* Not allow user to specify propertyValue\r\n\r\n* Define base object for tests\r\n\r\n* Resolve final comments\r\n\r\n* Run export api\r\n\r\n* Use property shorthand\r\n\r\n* Add check if index can be accessed.\r\n\r\n* Rename test and tweak it a little bit.\r\n\r\n* Update packages/full-stack-tests/src/hierarchy-builder/grouping/PropertiesGrouping.test.ts\r\n\r\nCo-authored-by: Grigas <35135765+grigasp@users.noreply.github.com>\r\n\r\n* Rename propertiesClassName to propertyClassName in NodeKeys\r\n\r\n* Remove unused properties from other grouping node\r\n\r\n* Change Shared, AutoExpand and GroupHiding\r\n\r\n* Fix docs\r\n\r\n* Update packages/hierarchy-builder/src/hierarchy-builder/queries/NodeSelectQueryFactory.ts\r\n\r\nCo-authored-by: Grigas <35135765+grigasp@users.noreply.github.com>\r\n\r\n* Fix localization\r\n\r\n* Remove TypedPrimitiveValue cast\r\n\r\n---------\r\n\r\nCo-authored-by: Grigas <35135765+grigasp@users.noreply.github.com>",
          "timestamp": "2023-11-30T16:24:44+02:00",
          "tree_id": "62a14cad88dae92b45d204d0fd2b2d1b78d99184",
          "url": "https://github.com/iTwin/presentation/commit/6aef4b81f1531de409a853ed59f8579f1946ac9e"
        },
        "date": 1701354377918,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Full Models Tree Load: Baytown.bim",
            "value": 1831,
            "unit": "ms",
            "extra": "min: 1831\nmax: 1831\ncount: 1\nmean: 1831\np50: 1826.6\nmedian: 1826.6\np75: 1826.6\np90: 1826.6\np95: 1826.6\np99: 1826.6\np999: 1826.6"
          },
          {
            "name": "Initial Models Tree Load: Baytown.bim",
            "value": 367,
            "unit": "ms",
            "extra": "min: 367\nmax: 367\ncount: 1\nmean: 367\np50: 368.8\nmedian: 368.8\np75: 368.8\np90: 368.8\np95: 368.8\np99: 368.8\np999: 368.8"
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
          "id": "b817000a345e4c20a7b365e24a669c2f2fb2cec7",
          "message": "Bump `itwinjs-core` dependencies to latest `4.3-rc` (#357)",
          "timestamp": "2023-12-07T09:53:47+02:00",
          "tree_id": "a69c35445029d2d678306feb2f1e21a39ec9a027",
          "url": "https://github.com/iTwin/presentation/commit/b817000a345e4c20a7b365e24a669c2f2fb2cec7"
        },
        "date": 1701935714640,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Initial Models Tree Load: Baytown.bim",
            "value": 388,
            "unit": "ms",
            "extra": "min: 388\nmax: 388\ncount: 1\nmean: 388\np50: 391.6\nmedian: 391.6\np75: 391.6\np90: 391.6\np95: 391.6\np99: 391.6\np999: 391.6"
          },
          {
            "name": "Full Models Tree Load: Baytown.bim",
            "value": 1849,
            "unit": "ms",
            "extra": "min: 1849\nmax: 1849\ncount: 1\nmean: 1849\np50: 1863.5\nmedian: 1863.5\np75: 1863.5\np90: 1863.5\np95: 1863.5\np99: 1863.5\np999: 1863.5"
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
          "id": "76a926beae23976b0fdeb6ecf1cee02a7c30c7c8",
          "message": "Unify label grouping and merging (#355)\n\n* Combine label grouping and merging\r\n\r\n* Rename mergeInstanceNodes to mergedInstanceNodes\r\n\r\n* Apply suggestion\r\n\r\n* Add resorting\r\n\r\n* Add mergeArraysByLabel operation\r\n\r\n* Update byLabel structure, so grouping could also have groupId\r\n\r\n* Fix lint\r\n\r\n* Fix lint\r\n\r\n* Change throw comment\r\n\r\n* Rename mergeArraysByLabel to mergeSortedArrays, make it reusable, and move it to common.ts\r\n\r\n* Move byLabelSelector checks to createLabelGroupingBaseParamsSelectors\r\n\r\n* Update packages/hierarchy-builder/src/hierarchy-builder/internal/operators/grouping/LabelGrouping.ts\r\n\r\nCo-authored-by: Grigas <35135765+grigasp@users.noreply.github.com>\r\n\r\n* Remove code duplication\r\n\r\n* Rename test\r\n\r\n* Simplify code\r\n\r\n* Re save files\r\n\r\n---------\r\n\r\nCo-authored-by: Grigas <35135765+grigasp@users.noreply.github.com>",
          "timestamp": "2023-12-07T09:50:04Z",
          "tree_id": "cfd6f6b580a02484fcd5ed7b74c24c7ae8d9275d",
          "url": "https://github.com/iTwin/presentation/commit/76a926beae23976b0fdeb6ecf1cee02a7c30c7c8"
        },
        "date": 1701942666365,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Initial Models Tree Load: Baytown.bim",
            "value": 350,
            "unit": "ms",
            "extra": "min: 350\nmax: 350\ncount: 1\nmean: 350\np50: 347.3\nmedian: 347.3\np75: 347.3\np90: 347.3\np95: 347.3\np99: 347.3\np999: 347.3"
          },
          {
            "name": "Full Models Tree Load: Baytown.bim",
            "value": 1786,
            "unit": "ms",
            "extra": "min: 1786\nmax: 1786\ncount: 1\nmean: 1786\np50: 1790.4\nmedian: 1790.4\np75: 1790.4\np90: 1790.4\np95: 1790.4\np99: 1790.4\np999: 1790.4"
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
          "id": "fb70af84c1b9655ff661015088267c9c0b85982f",
          "message": "Fixed models tree definition not handling hidden subjects appropriately (#364)",
          "timestamp": "2023-12-17T11:09:43+02:00",
          "tree_id": "1bc9ec5d498f8670914124c418b821998ed4ebc5",
          "url": "https://github.com/iTwin/presentation/commit/fb70af84c1b9655ff661015088267c9c0b85982f"
        },
        "date": 1702804250253,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Initial Models Tree Load: Baytown.bim",
            "value": 593,
            "unit": "ms",
            "extra": "min: 593\nmax: 593\ncount: 1\nmean: 593\np50: 596\nmedian: 596\np75: 596\np90: 596\np95: 596\np99: 596\np999: 596"
          },
          {
            "name": "Full Models Tree Load: Baytown.bim",
            "value": 1817,
            "unit": "ms",
            "extra": "min: 1817\nmax: 1817\ncount: 1\nmean: 1817\np50: 1826.6\nmedian: 1826.6\np75: 1826.6\np90: 1826.6\np95: 1826.6\np99: 1826.6\np999: 1826.6"
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
          "id": "20fbd7d5cec780240055d392d640f6b0adeab1f1",
          "message": "Option to override hierarchy level size limit for each hierarchy level (#366)\n\n* Add localization text\r\n\r\n* Add error type checker\r\n\r\n* Change backend to allow reseting size limit\r\n\r\n* Update tree widget\r\n\r\n* Add changeset\r\n\r\n* Remove space\r\n\r\n* Log error if it is not RowsLimitExceededError\r\n\r\n* Allow level limit to be unbounded\r\n\r\n* Move applyLimit usage to read()\r\n\r\n* Allow setting limit for specific hierarchy level\r\n\r\n* Export RowsLimitExceededError\r\n\r\n* Final fixes\r\n\r\n* Update Sample.json\r\n\r\n* Retrieve parentId only when it is needed\r\n\r\n* Update packages/hierarchy-builder/src/hierarchy-builder/HierarchyProvider.ts\r\n\r\nCo-authored-by: Grigas <35135765+grigasp@users.noreply.github.com>\r\n\r\n* Apply ctes\r\n\r\n* Include message\r\n\r\n* Change hierarchyLevelSizeLimit map to object\r\n\r\n* Remove limit setting\r\n\r\n* Use parentId to set/remove limit\r\n\r\n* applyLimit cleanup\r\n\r\n* Update packages/hierarchy-builder/src/hierarchy-builder/internal/TreeNodesReader.ts\r\n\r\nCo-authored-by: Grigas <35135765+grigasp@users.noreply.github.com>\r\n\r\n* simplify limit assignment; add comments to GetHierarchyNodesProps\r\n\r\n* Remove useCallback for nodeRenderer\r\n\r\n* Move stateless tree widget to a separate file\r\n\r\n* Fix test\r\n\r\n* Update packages/hierarchy-builder/src/hierarchy-builder/HierarchyProvider.ts\r\n\r\nCo-authored-by: Grigas <35135765+grigasp@users.noreply.github.com>\r\n\r\n* Update packages/hierarchy-builder/src/hierarchy-builder/HierarchyProvider.ts\r\n\r\nCo-authored-by: Grigas <35135765+grigasp@users.noreply.github.com>\r\n\r\n---------\r\n\r\nCo-authored-by: Grigas <35135765+grigasp@users.noreply.github.com>",
          "timestamp": "2024-01-04T09:16:58+02:00",
          "tree_id": "816c085ea19f91a9303f4e39c5c94483b411ad2d",
          "url": "https://github.com/iTwin/presentation/commit/20fbd7d5cec780240055d392d640f6b0adeab1f1"
        },
        "date": 1704352721263,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Initial Models Tree Load: Baytown.bim",
            "value": 339,
            "unit": "ms",
            "extra": "min: 339\nmax: 339\ncount: 1\nmean: 339\np50: 340.4\nmedian: 340.4\np75: 340.4\np90: 340.4\np95: 340.4\np99: 340.4\np999: 340.4"
          },
          {
            "name": "Full Models Tree Load: Baytown.bim",
            "value": 1860,
            "unit": "ms",
            "extra": "min: 1860\nmax: 1860\ncount: 1\nmean: 1860\np50: 1863.5\nmedian: 1863.5\np75: 1863.5\np90: 1863.5\np95: 1863.5\np99: 1863.5\np999: 1863.5"
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
          "id": "21c32ad173f02df9fea97b53d0a53cf10b9cbb0c",
          "message": "Hierarchy builder: Fix visible child nodes not loaded when hierarchy filter matches parent node and hidden child nodes (#379)\n\n* Fix visible child nodes not loaded when hierarchy filter matches parent node and hidden child nodes\r\n\r\n* Add some handling for very long test dataset paths\r\n\r\n* Fix non-matching child nodes not loaded from a matching hierarchy level definition when parent is a filter target\r\n\r\n* Fixup header filtering input status\r\n\r\n* Attempt to shorten temp schema file path as well\r\n\r\n* Child nodes of filter target should always be returned",
          "timestamp": "2024-01-16T16:08:53+02:00",
          "tree_id": "1b09b7a80cbe0b0860ba5be21cf7b6f2fb3086d2",
          "url": "https://github.com/iTwin/presentation/commit/21c32ad173f02df9fea97b53d0a53cf10b9cbb0c"
        },
        "date": 1705414226252,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Initial Models Tree Load: Baytown.bim",
            "value": 533,
            "unit": "ms",
            "extra": "min: 533\nmax: 533\ncount: 1\nmean: 533\np50: 528.6\nmedian: 528.6\np75: 528.6\np90: 528.6\np95: 528.6\np99: 528.6\np999: 528.6"
          },
          {
            "name": "Full Models Tree Load: Baytown.bim",
            "value": 1818,
            "unit": "ms",
            "extra": "min: 1818\nmax: 1818\ncount: 1\nmean: 1818\np50: 1826.6\nmedian: 1826.6\np75: 1826.6\np90: 1826.6\np95: 1826.6\np99: 1826.6\np999: 1826.6"
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
          "id": "f6ae78f6cafd8eecaee5c186b8cb6cdcb57e54e6",
          "message": "Creating hierarchy level descriptors for filtering stateless hierarchies (#378)\n\n* Add a way to create hierarchy level descriptor for filtering stateless hierarchies\r\n\r\n* changeset\r\n\r\n* Avoid exposing `rxjs` APIs through out barrel\r\n\r\n* Assign ruleset to hierarchy level descriptor\r\n\r\n* lint\r\n\r\n* Add missing docs",
          "timestamp": "2024-01-16T14:33:49Z",
          "tree_id": "fed960b018a942a34e62fac07d80283dc8b5a5b9",
          "url": "https://github.com/iTwin/presentation/commit/f6ae78f6cafd8eecaee5c186b8cb6cdcb57e54e6"
        },
        "date": 1705415721256,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Initial Models Tree Load: Baytown.bim",
            "value": 355,
            "unit": "ms",
            "extra": "min: 355\nmax: 355\ncount: 1\nmean: 355\np50: 354.3\nmedian: 354.3\np75: 354.3\np90: 354.3\np95: 354.3\np99: 354.3\np999: 354.3"
          },
          {
            "name": "Full Models Tree Load: Baytown.bim",
            "value": 1842,
            "unit": "ms",
            "extra": "min: 1842\nmax: 1842\ncount: 1\nmean: 1842\np50: 1826.6\nmedian: 1826.6\np75: 1826.6\np90: 1826.6\np95: 1826.6\np99: 1826.6\np999: 1826.6"
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
          "id": "9d0bad0c74e37d07401b418779abcd0c4c63c5ac",
          "message": "Hierarchy builder: Add ability to filter hierarchy by Element's ECInstanceId suffix (#380)\n\n* Add ability to filter hierarchy by Element's ECInstanceId suffix\r\n\r\n* extract-api",
          "timestamp": "2024-01-18T09:43:29+02:00",
          "tree_id": "f2349bebe4479c7f2e6a448e450cef8fdf02ac91",
          "url": "https://github.com/iTwin/presentation/commit/9d0bad0c74e37d07401b418779abcd0c4c63c5ac"
        },
        "date": 1705563880038,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Initial Models Tree Load: Baytown.bim",
            "value": 385,
            "unit": "ms",
            "extra": "min: 385\nmax: 385\ncount: 1\nmean: 385\np50: 383.8\nmedian: 383.8\np75: 383.8\np90: 383.8\np95: 383.8\np99: 383.8\np999: 383.8"
          },
          {
            "name": "Full Models Tree Load: Baytown.bim",
            "value": 1864,
            "unit": "ms",
            "extra": "min: 1864\nmax: 1864\ncount: 1\nmean: 1864\np50: 1863.5\nmedian: 1863.5\np75: 1863.5\np90: 1863.5\np95: 1863.5\np99: 1863.5\np999: 1863.5"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "name": "grigas.petraitis",
            "username": "grigasp",
            "email": "35135765+grigasp@users.noreply.github.com"
          },
          "committer": {
            "name": "grigas.petraitis",
            "username": "grigasp",
            "email": "35135765+grigasp@users.noreply.github.com"
          },
          "id": "7ac2299a32384691da7398c1f06ce7d51882882b",
          "message": "change",
          "timestamp": "2024-01-19T07:18:50Z",
          "url": "https://github.com/iTwin/presentation/commit/7ac2299a32384691da7398c1f06ce7d51882882b"
        },
        "date": 1705649771196,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Initial Models Tree Load: Baytown.bim",
            "value": 324,
            "unit": "ms",
            "extra": "min: 324\nmax: 324\ncount: 1\nmean: 324\np50: 327.1\nmedian: 327.1\np75: 327.1\np90: 327.1\np95: 327.1\np99: 327.1\np999: 327.1"
          },
          {
            "name": "Full Models Tree Load: Baytown.bim",
            "value": 2558,
            "unit": "ms",
            "extra": "min: 2558\nmax: 2558\ncount: 1\nmean: 2558\np50: 2566.3\nmedian: 2566.3\np75: 2566.3\np90: 2566.3\np95: 2566.3\np99: 2566.3\np999: 2566.3"
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
          "id": "e0c915134acc25f2643ce6271a90d726eba09ab6",
          "message": "Hierarchy builder: Unified selection support (#381)\n\n* Grouping nodes now know what instances they group\r\n\r\n* Add unified selection support to test app\r\n\r\n* change",
          "timestamp": "2024-01-23T12:44:14+02:00",
          "tree_id": "0939bb0dc7dcbe8c010a404a43fe475cccbb48d7",
          "url": "https://github.com/iTwin/presentation/commit/e0c915134acc25f2643ce6271a90d726eba09ab6"
        },
        "date": 1706006721091,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Initial Models Tree Load: Baytown.bim",
            "value": 342,
            "unit": "ms",
            "extra": "min: 342\nmax: 342\ncount: 1\nmean: 342\np50: 340.4\nmedian: 340.4\np75: 340.4\np90: 340.4\np95: 340.4\np99: 340.4\np999: 340.4"
          },
          {
            "name": "Full Models Tree Load: Baytown.bim",
            "value": 2522,
            "unit": "ms",
            "extra": "min: 2522\nmax: 2522\ncount: 1\nmean: 2522\np50: 2515.5\nmedian: 2515.5\np75: 2515.5\np90: 2515.5\np95: 2515.5\np99: 2515.5\np999: 2515.5"
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
          "id": "f2bf5afa09915c3dcc20e845e91d15edce7bea81",
          "message": "Hierarchy builder: Add results count limiting to hierarchy filtering (#383)\n\n* Add results count limiting to hierarchy filtering\r\n\r\n* Fixup test app\r\n\r\n* Avoid using `rxjs` and `rxjs-for-await` just for creating async iterators",
          "timestamp": "2024-01-23T11:16:32Z",
          "tree_id": "16d565e189cad0f439cf35e7bd83a0622bd766e4",
          "url": "https://github.com/iTwin/presentation/commit/f2bf5afa09915c3dcc20e845e91d15edce7bea81"
        },
        "date": 1706008687725,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Full Models Tree Load: Baytown.bim",
            "value": 2540,
            "unit": "ms",
            "extra": "min: 2540\nmax: 2540\ncount: 1\nmean: 2540\np50: 2515.5\nmedian: 2515.5\np75: 2515.5\np90: 2515.5\np95: 2515.5\np99: 2515.5\np999: 2515.5"
          },
          {
            "name": "Initial Models Tree Load: Baytown.bim",
            "value": 387,
            "unit": "ms",
            "extra": "min: 387\nmax: 387\ncount: 1\nmean: 387\np50: 383.8\nmedian: 383.8\np75: 383.8\np90: 383.8\np95: 383.8\np99: 383.8\np999: 383.8"
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
          "id": "84a3924f274f45c82ab57abf694229bd2c889060",
          "message": "Allow changing formatter without requerying. (#386)\n\n* Implement formatter setter\r\n\r\n* Add option to set formatter in test app\r\n\r\n* Add import\r\n\r\n* Add tests\r\n\r\n* Fix import order\r\n\r\n* Update api and add changeset\r\n\r\n* Minor styling changes\r\n\r\n* Move files to stateless folder\r\n\r\n* Remove event handler from useControlledTreeComponentsState\r\n\r\n* Fix test to use limitingQueryExecutor instead of queryExecutor\r\n\r\n* Change shareReplay to shareReplayWithErrors\r\n\r\n* Remove this.map.get from QueriesCache.add function\r\n\r\n* Remove formatter spy\r\n\r\n* Update packages/hierarchy-builder/src/hierarchy-builder/HierarchyProvider.ts\r\n\r\nCo-authored-by: Grigas <35135765+grigasp@users.noreply.github.com>\r\n\r\n* Add docs to setFormatter and fix test\r\n\r\n* Use string in test instead of Date\r\n\r\n* Simplify and merge full stack tests\r\n\r\n* Rename modelsTreeHierarchyProvider to hierarchyProvider\r\n\r\n* Update apps/test-app/frontend/src/components/tree-widget/stateless/CustomHooks.ts\r\n\r\nCo-authored-by: Saulius Skliutas <24278440+saskliutas@users.noreply.github.com>\r\n\r\n* Move createNewComponents outside useControlledTreeComponentsState\r\n\r\n* Use single menuItem\r\n\r\n* Add documentation for getNodes\r\n\r\n* Extract formatter dropdown menu to a separate component\r\n\r\n* Remove queryCache and add tests\r\n\r\n* Run extract api\r\n\r\n* Update packages/full-stack-tests/src/hierarchy-builder/Formatting.test.ts\r\n\r\nCo-authored-by: Grigas <35135765+grigasp@users.noreply.github.com>\r\n\r\n* Update packages/full-stack-tests/src/hierarchy-builder/Formatting.test.ts\r\n\r\nCo-authored-by: Grigas <35135765+grigasp@users.noreply.github.com>\r\n\r\n* Update packages/full-stack-tests/src/hierarchy-builder/Formatting.test.ts\r\n\r\nCo-authored-by: Grigas <35135765+grigasp@users.noreply.github.com>\r\n\r\n* Update packages/hierarchy-builder/src/test/internal/operators/HideIfNoChildren.test.ts\r\n\r\nCo-authored-by: Grigas <35135765+grigasp@users.noreply.github.com>\r\n\r\n* Update packages/full-stack-tests/src/hierarchy-builder/Formatting.test.ts\r\n\r\nCo-authored-by: Grigas <35135765+grigasp@users.noreply.github.com>\r\n\r\n* Update packages/hierarchy-builder/src/hierarchy-builder/HierarchyProvider.ts\r\n\r\nCo-authored-by: Grigas <35135765+grigasp@users.noreply.github.com>\r\n\r\n* Update packages/hierarchy-builder/src/test/internal/operators/HideNodesInHierarchy.test.ts\r\n\r\nCo-authored-by: Grigas <35135765+grigasp@users.noreply.github.com>\r\n\r\n* Change FormatterTogglerDropdownProps and fix the displayed text\r\n\r\n* Remove assert\r\n\r\n* Remove unused import\r\n\r\n* Fix import order\r\n\r\n* Set event handler\r\n\r\n* Add ...lhs to mergeNodes result\r\n\r\n* Create a new seed on each subscribe\r\n\r\n* Wrap useState initialization inside a callback\r\n\r\n---------\r\n\r\nCo-authored-by: Grigas <35135765+grigasp@users.noreply.github.com>\r\nCo-authored-by: Saulius Skliutas <24278440+saskliutas@users.noreply.github.com>",
          "timestamp": "2024-02-01T10:03:54+02:00",
          "tree_id": "112f0e7efa3c89a9190dfbdf77be8b1245bd7e3b",
          "url": "https://github.com/iTwin/presentation/commit/84a3924f274f45c82ab57abf694229bd2c889060"
        },
        "date": 1706774728213,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Full Models Tree Load: Baytown.bim",
            "value": 2554,
            "unit": "ms",
            "extra": "min: 2554\nmax: 2554\ncount: 1\nmean: 2554\np50: 2566.3\nmedian: 2566.3\np75: 2566.3\np90: 2566.3\np95: 2566.3\np99: 2566.3\np999: 2566.3"
          },
          {
            "name": "Initial Models Tree Load: Baytown.bim",
            "value": 406,
            "unit": "ms",
            "extra": "min: 406\nmax: 406\ncount: 1\nmean: 406\np50: 407.5\nmedian: 407.5\np75: 407.5\np90: 407.5\np95: 407.5\np99: 407.5\np999: 407.5"
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
          "id": "ebb4047479a216ca590d459457c283b63acbc828",
          "message": "Presentation: Misc. cleanup in hierarchy builder (#394)\n\n* Add query performance logging\r\n\r\n* Add an option to set query rows limit when creating a HierarchyProvider\r\n\r\n* Don't unnecessarily store node observables\r\n\r\n* Request consumers to provide `ILimitingECSqlQueryExecutor` rather than creating it internally\r\n\r\n* changeset",
          "timestamp": "2024-02-02T14:43:35+02:00",
          "tree_id": "32691ef86c397eea982acffef3dbfdd16c9e6866",
          "url": "https://github.com/iTwin/presentation/commit/ebb4047479a216ca590d459457c283b63acbc828"
        },
        "date": 1706877881749,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Initial Models Tree Load: Baytown.bim",
            "value": 395,
            "unit": "ms",
            "extra": "min: 395\nmax: 395\ncount: 1\nmean: 395\np50: 391.6\nmedian: 391.6\np75: 391.6\np90: 391.6\np95: 391.6\np99: 391.6\np999: 391.6"
          },
          {
            "name": "Full Models Tree Load: Baytown.bim",
            "value": 2586,
            "unit": "ms",
            "extra": "min: 2586\nmax: 2586\ncount: 1\nmean: 2586\np50: 2566.3\nmedian: 2566.3\np75: 2566.3\np90: 2566.3\np95: 2566.3\np99: 2566.3\np999: 2566.3"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "name": "Saulius Skliutas",
            "username": "saskliutas",
            "email": "24278440+saskliutas@users.noreply.github.com"
          },
          "committer": {
            "name": "Saulius Skliutas",
            "username": "saskliutas",
            "email": "24278440+saskliutas@users.noreply.github.com"
          },
          "id": "81d4ee2166694fce796365bee04d16052334c84b",
          "message": "change",
          "timestamp": "2024-02-02T15:12:09Z",
          "url": "https://github.com/iTwin/presentation/commit/81d4ee2166694fce796365bee04d16052334c84b"
        },
        "date": 1706888130261,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Initial Models Tree Load: Baytown.bim",
            "value": 379,
            "unit": "ms",
            "extra": "min: 379\nmax: 379\ncount: 1\nmean: 379\np50: 376.2\nmedian: 376.2\np75: 376.2\np90: 376.2\np95: 376.2\np99: 376.2\np999: 376.2"
          },
          {
            "name": "Full Models Tree Load: Baytown.bim",
            "value": 2575,
            "unit": "ms",
            "extra": "min: 2575\nmax: 2575\ncount: 1\nmean: 2575\np50: 2566.3\nmedian: 2566.3\np75: 2566.3\np90: 2566.3\np95: 2566.3\np99: 2566.3\np999: 2566.3"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "24278440+saskliutas@users.noreply.github.com",
            "name": "Saulius Skliutas",
            "username": "saskliutas"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "4373fd23a19204c879c7fde04f0b0a7eb55f04d6",
          "message": "Bump dev dependencies (#395)\n\n* Bump dev dependencies\r\n\r\n* Run prettier\r\n\r\n* change",
          "timestamp": "2024-02-02T17:38:38+02:00",
          "tree_id": "9aa7f807b22428301277eef0a4d643fce4aff250",
          "url": "https://github.com/iTwin/presentation/commit/4373fd23a19204c879c7fde04f0b0a7eb55f04d6"
        },
        "date": 1706888409681,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Initial Models Tree Load: Baytown.bim",
            "value": 320,
            "unit": "ms",
            "extra": "min: 320\nmax: 320\ncount: 1\nmean: 320\np50: 320.6\nmedian: 320.6\np75: 320.6\np90: 320.6\np95: 320.6\np99: 320.6\np999: 320.6"
          },
          {
            "name": "Full Models Tree Load: Baytown.bim",
            "value": 2574,
            "unit": "ms",
            "extra": "min: 2574\nmax: 2574\ncount: 1\nmean: 2574\np50: 2566.3\nmedian: 2566.3\np75: 2566.3\np90: 2566.3\np95: 2566.3\np99: 2566.3\np999: 2566.3"
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
          "id": "53893a975dce944a356ff7597103466c0fa8ff25",
          "message": "Updating hierarchies upon imodel data change (#396)\n\n* Updating hierarchies upon imodel data change\r\n\r\n* lint",
          "timestamp": "2024-02-05T13:44:12+02:00",
          "tree_id": "b4566a5f231b8f438a983f7d35e23e8bec6ae748",
          "url": "https://github.com/iTwin/presentation/commit/53893a975dce944a356ff7597103466c0fa8ff25"
        },
        "date": 1707133519432,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Full Models Tree Load: Baytown.bim",
            "value": 2599,
            "unit": "ms",
            "extra": "min: 2599\nmax: 2599\ncount: 1\nmean: 2599\np50: 2618.1\nmedian: 2618.1\np75: 2618.1\np90: 2618.1\np95: 2618.1\np99: 2618.1\np999: 2618.1"
          },
          {
            "name": "Initial Models Tree Load: Baytown.bim",
            "value": 236,
            "unit": "ms",
            "extra": "min: 236\nmax: 236\ncount: 1\nmean: 236\np50: 237.5\nmedian: 237.5\np75: 237.5\np90: 237.5\np95: 237.5\np99: 237.5\np999: 237.5"
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
          "id": "9835235fd18b3eb0f5bce5a0d3d17009e6add749",
          "message": "Change child nodes cache to use Dictionary instead of Map (#397)\n\n* Change map to dictionary\r\n\r\n* Add changeset and run extract api\r\n\r\n* Fix sorting problem\r\n\r\n* Resolve comments\r\n\r\n* Resolve comment",
          "timestamp": "2024-02-06T10:10:55+02:00",
          "tree_id": "673ec9e060ef12bc7af3279dfe825b2870f8843d",
          "url": "https://github.com/iTwin/presentation/commit/9835235fd18b3eb0f5bce5a0d3d17009e6add749"
        },
        "date": 1707207122703,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Initial Models Tree Load: Baytown.bim",
            "value": 482,
            "unit": "ms",
            "extra": "min: 482\nmax: 482\ncount: 1\nmean: 482\np50: 478.3\nmedian: 478.3\np75: 478.3\np90: 478.3\np95: 478.3\np99: 478.3\np999: 478.3"
          },
          {
            "name": "Full Models Tree Load: Baytown.bim",
            "value": 1854,
            "unit": "ms",
            "extra": "min: 1854\nmax: 1854\ncount: 1\nmean: 1854\np50: 1863.5\nmedian: 1863.5\np75: 1863.5\np90: 1863.5\np95: 1863.5\np99: 1863.5\np999: 1863.5"
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
          "id": "4d177c7ededefa0d12a4fefb41c402cf7ed791de",
          "message": "Remove `groupedInstanceKeys` property from `parentKeys` (#401)\n\n* Remove groupedInstanceKeys from parentKeys\r\n\r\n* Run extract api +add changeset\r\n\r\n* Fix prettier errors\r\n\r\n* Add ParentNodeKey type and move equals and compare checks to ParentNodeKey namespace\r\n\r\n* Move OmitOverUnion to utils and use ParentNodeKey namespace to do compare and equals checks\r\n\r\n* Fix tests, and use omit\r\n\r\n* Run extract api\r\n\r\n* Using omit where possible\r\n\r\n* Move HierarchyNodeKey namespace to be right below HierarchyNodeKey type\r\n\r\n* Add internal tag to OmitOverUnion\r\n\r\n* Remove Guid.createValue()\r\n\r\n* Change OmitOverUnion to have beta tag instead of internal",
          "timestamp": "2024-02-07T13:42:44Z",
          "tree_id": "48efdb999e96a2adbadbb6274e24d83401cc9b98",
          "url": "https://github.com/iTwin/presentation/commit/4d177c7ededefa0d12a4fefb41c402cf7ed791de"
        },
        "date": 1707313487998,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Full Models Tree Load: Baytown.bim",
            "value": 1766,
            "unit": "ms",
            "extra": "min: 1766\nmax: 1766\ncount: 1\nmean: 1766\np50: 1755\nmedian: 1755\np75: 1755\np90: 1755\np95: 1755\np99: 1755\np999: 1755"
          },
          {
            "name": "Initial Models Tree Load: Baytown.bim",
            "value": 366,
            "unit": "ms",
            "extra": "min: 366\nmax: 366\ncount: 1\nmean: 366\np50: 368.8\nmedian: 368.8\np75: 368.8\np90: 368.8\np95: 368.8\np99: 368.8\np999: 368.8"
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
          "id": "6e8aa1afd8a07a97d89e95bbbe07935a646b5133",
          "message": "Remove localization. Let consumers supply the two strings we need. (#404)\n\n* Remove localization. Let consumers supply the two strings we need.\r\n\r\n* change",
          "timestamp": "2024-02-07T18:03:05+02:00",
          "tree_id": "5c51b1026173764d331493c2db8447c7a5ab4e00",
          "url": "https://github.com/iTwin/presentation/commit/6e8aa1afd8a07a97d89e95bbbe07935a646b5133"
        },
        "date": 1707321848192,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Full Models Tree Load: Baytown.bim",
            "value": 1809,
            "unit": "ms",
            "extra": "min: 1809\nmax: 1809\ncount: 1\nmean: 1809\np50: 1826.6\nmedian: 1826.6\np75: 1826.6\np90: 1826.6\np95: 1826.6\np99: 1826.6\np999: 1826.6"
          },
          {
            "name": "Initial Models Tree Load: Baytown.bim",
            "value": 368,
            "unit": "ms",
            "extra": "min: 368\nmax: 368\ncount: 1\nmean: 368\np50: 368.8\nmedian: 368.8\np75: 368.8\np90: 368.8\np95: 368.8\np99: 368.8\np999: 368.8"
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
          "id": "94be1d03fb4557856c3cf555382c011caf7f35fe",
          "message": "Bump `itwinjs-core` dev dependencies to `4.4.0-dev.35` (#406)\n\n* Bump `itwinjs-core` dev dependencies to `4.4.0-dev.35`\r\n\r\n* change",
          "timestamp": "2024-02-09T10:20:57+02:00",
          "tree_id": "04c4da6cfe179b8508cb198e7cec288453c7c1c5",
          "url": "https://github.com/iTwin/presentation/commit/94be1d03fb4557856c3cf555382c011caf7f35fe"
        },
        "date": 1707466955792,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Initial Models Tree Load: Baytown.bim",
            "value": 319,
            "unit": "ms",
            "extra": "min: 319\nmax: 319\ncount: 1\nmean: 319\np50: 320.6\nmedian: 320.6\np75: 320.6\np90: 320.6\np95: 320.6\np99: 320.6\np999: 320.6"
          },
          {
            "name": "Full Models Tree Load: Baytown.bim",
            "value": 1838,
            "unit": "ms",
            "extra": "min: 1838\nmax: 1838\ncount: 1\nmean: 1838\np50: 1826.6\nmedian: 1826.6\np75: 1826.6\np90: 1826.6\np95: 1826.6\np99: 1826.6\np999: 1826.6"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "24278440+saskliutas@users.noreply.github.com",
            "name": "Saulius Skliutas",
            "username": "saskliutas"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "7510b87cd46269433559c9207ce4dcf54f380b34",
          "message": "Remove typemoq (#411)\n\n* Remove mockPresentationManager\r\n\r\n* Remove typemoq usage in `presentation-components`\r\n\r\n* Remove last reference to typemoq in presentation-components\r\n\r\n* Remove typemoq references in presentation-testing\r\n\r\n* Remove typemoq\r\n\r\n* Run prettier\r\n\r\n* lint\r\n\r\n* prettier\r\n\r\n* Bump mocha\r\n\r\n---------\r\n\r\nCo-authored-by: Grigas <35135765+grigasp@users.noreply.github.com>",
          "timestamp": "2024-02-12T14:44:03+02:00",
          "tree_id": "519a0aa046eec59a5a58e175602dcd31c60557cc",
          "url": "https://github.com/iTwin/presentation/commit/7510b87cd46269433559c9207ce4dcf54f380b34"
        },
        "date": 1707741922958,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Initial Models Tree Load: Baytown.bim",
            "value": 334,
            "unit": "ms",
            "extra": "min: 334\nmax: 334\ncount: 1\nmean: 334\np50: 333.7\nmedian: 333.7\np75: 333.7\np90: 333.7\np95: 333.7\np99: 333.7\np999: 333.7"
          },
          {
            "name": "Full Models Tree Load: Baytown.bim",
            "value": 1830,
            "unit": "ms",
            "extra": "min: 1830\nmax: 1830\ncount: 1\nmean: 1830\np50: 1826.6\nmedian: 1826.6\np75: 1826.6\np90: 1826.6\np95: 1826.6\np99: 1826.6\np999: 1826.6"
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
          "id": "d264b90aa5907d78cd21b272480cba662f4b91a9",
          "message": "`itwinjs-core@4.4.0` (#412)",
          "timestamp": "2024-02-13T09:34:14+02:00",
          "tree_id": "61fa3e935152d85357a09549a734a03bd4d47c05",
          "url": "https://github.com/iTwin/presentation/commit/d264b90aa5907d78cd21b272480cba662f4b91a9"
        },
        "date": 1707809729424,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Initial Models Tree Load: Baytown.bim",
            "value": 343,
            "unit": "ms",
            "extra": "min: 343\nmax: 343\ncount: 1\nmean: 343\np50: 340.4\nmedian: 340.4\np75: 340.4\np90: 340.4\np95: 340.4\np99: 340.4\np999: 340.4"
          },
          {
            "name": "Full Models Tree Load: Baytown.bim",
            "value": 1810,
            "unit": "ms",
            "extra": "min: 1810\nmax: 1810\ncount: 1\nmean: 1810\np50: 1826.6\nmedian: 1826.6\np75: 1826.6\np90: 1826.6\np95: 1826.6\np99: 1826.6\np999: 1826.6"
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
          "id": "9b8403910ced8830ebeab1e64a1a128e66ab1a5b",
          "message": "Reduce getClass calls in baseClassGrouping (#413)",
          "timestamp": "2024-02-14T09:29:30+02:00",
          "tree_id": "d71e3262307a5b922a184cbe116410a9ca1a7e1d",
          "url": "https://github.com/iTwin/presentation/commit/9b8403910ced8830ebeab1e64a1a128e66ab1a5b"
        },
        "date": 1707895835176,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Initial Models Tree Load: Baytown.bim",
            "value": 390,
            "unit": "ms",
            "extra": "min: 390\nmax: 390\ncount: 1\nmean: 390\np50: 391.6\nmedian: 391.6\np75: 391.6\np90: 391.6\np95: 391.6\np99: 391.6\np999: 391.6"
          },
          {
            "name": "Full Models Tree Load: Baytown.bim",
            "value": 1850,
            "unit": "ms",
            "extra": "min: 1850\nmax: 1850\ncount: 1\nmean: 1850\np50: 1863.5\nmedian: 1863.5\np75: 1863.5\np90: 1863.5\np95: 1863.5\np99: 1863.5\np999: 1863.5"
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
          "id": "edd180e892056187073b9a848fe45e6ff1f1657c",
          "message": "Reduce getClass calls for property grouping (#414)",
          "timestamp": "2024-02-15T11:36:30Z",
          "tree_id": "757afe687bd602ba82ef88e78ada2912226285d4",
          "url": "https://github.com/iTwin/presentation/commit/edd180e892056187073b9a848fe45e6ff1f1657c"
        },
        "date": 1707997048581,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Full Models Tree Load: Baytown.bim",
            "value": 1833,
            "unit": "ms",
            "extra": "min: 1833\nmax: 1833\ncount: 1\nmean: 1833\np50: 1826.6\nmedian: 1826.6\np75: 1826.6\np90: 1826.6\np95: 1826.6\np99: 1826.6\np999: 1826.6"
          },
          {
            "name": "Initial Models Tree Load: Baytown.bim",
            "value": 395,
            "unit": "ms",
            "extra": "min: 395\nmax: 395\ncount: 1\nmean: 395\np50: 391.6\nmedian: 391.6\np75: 391.6\np90: 391.6\np95: 391.6\np99: 391.6\np999: 391.6"
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
          "id": "1c3a8c1164d726c1d305cbb1bf2deb934a6dce64",
          "message": "Add missing API docs (#426)",
          "timestamp": "2024-02-19T11:05:28Z",
          "tree_id": "c26a582a34382669f9be4aad4fa5077020d471d0",
          "url": "https://github.com/iTwin/presentation/commit/1c3a8c1164d726c1d305cbb1bf2deb934a6dce64"
        },
        "date": 1708340788779,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Full Models Tree Load: Baytown.bim",
            "value": 1842,
            "unit": "ms",
            "extra": "min: 1842\nmax: 1842\ncount: 1\nmean: 1842\np50: 1826.6\nmedian: 1826.6\np75: 1826.6\np90: 1826.6\np95: 1826.6\np99: 1826.6\np999: 1826.6"
          },
          {
            "name": "Initial Models Tree Load: Baytown.bim",
            "value": 387,
            "unit": "ms",
            "extra": "min: 387\nmax: 387\ncount: 1\nmean: 387\np50: 383.8\nmedian: 383.8\np75: 383.8\np90: 383.8\np95: 383.8\np99: 383.8\np999: 383.8"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "24278440+saskliutas@users.noreply.github.com",
            "name": "Saulius Skliutas",
            "username": "saskliutas"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "d2d12b1705f5b002e3b35b275a572f63c24ed68e",
          "message": "Bump artillery version (#429)",
          "timestamp": "2024-02-20T11:45:57+02:00",
          "tree_id": "76e4006898ec2c82ee7d46ef6eed7f572c2f21bc",
          "url": "https://github.com/iTwin/presentation/commit/d2d12b1705f5b002e3b35b275a572f63c24ed68e"
        },
        "date": 1708422434512,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Initial Models Tree Load: Baytown.bim",
            "value": 354,
            "unit": "ms",
            "extra": "min: 354\nmax: 354\ncount: 1\nmean: 354\np50: 354.3\nmedian: 354.3\np75: 354.3\np90: 354.3\np95: 354.3\np99: 354.3\np999: 354.3"
          },
          {
            "name": "Full Models Tree Load: Baytown.bim",
            "value": 1831,
            "unit": "ms",
            "extra": "min: 1831\nmax: 1831\ncount: 1\nmean: 1831\np50: 1826.6\nmedian: 1826.6\np75: 1826.6\np90: 1826.6\np95: 1826.6\np99: 1826.6\np999: 1826.6"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "24278440+saskliutas@users.noreply.github.com",
            "name": "Saulius Skliutas",
            "username": "saskliutas"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "bf1fcfbcd4d52a23bc19ae113314f5811ead3674",
          "message": "[core-interop]: Returns input keys with hierarchy level descriptor (#440)\n\n* Returns input keys with hierarchy level descriptor\r\n\r\n* Update full-stack-tests\r\n\r\n* Add return type",
          "timestamp": "2024-02-28T14:37:56+02:00",
          "tree_id": "c41379059f4c8c9b6c4384b06fa5fcd8158e4b7f",
          "url": "https://github.com/iTwin/presentation/commit/bf1fcfbcd4d52a23bc19ae113314f5811ead3674"
        },
        "date": 1709123945372,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Initial Models Tree Load: Baytown.bim",
            "value": 222,
            "unit": "ms",
            "extra": "min: 222\nmax: 222\ncount: 1\nmean: 222\np50: 223.7\nmedian: 223.7\np75: 223.7\np90: 223.7\np95: 223.7\np99: 223.7\np999: 223.7"
          },
          {
            "name": "Full Models Tree Load: Baytown.bim",
            "value": 1907,
            "unit": "ms",
            "extra": "min: 1907\nmax: 1907\ncount: 1\nmean: 1907\np50: 1901.1\nmedian: 1901.1\np75: 1901.1\np90: 1901.1\np95: 1901.1\np99: 1901.1\np999: 1901.1"
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
          "id": "4bb0c41496edb7ade9161dc9409414bfcbbe5eb1",
          "message": "Hierarchy builder: Limiting child nodes cache size (#436)\n\n* Keep grouped nodes' observables associated with their parsed nodes observables in child nodes cache\r\n\r\n* Re-create a branch when requesting a sub-branch that's been pushed-out of cache\r\n\r\n* Update packages/hierarchy-builder/src/hierarchy-builder/HierarchyNode.ts\r\n\r\nCo-authored-by: Saulius Skliutas <24278440+saskliutas@users.noreply.github.com>\r\n\r\n* extract-api\r\n\r\n* Do not throw when attempting to cache grouped node observable without matching query observable\r\n\r\n* Don't send requests for every possible parent node all at once... send at most 10.\r\n\r\n---------\r\n\r\nCo-authored-by: Saulius Skliutas <24278440+saskliutas@users.noreply.github.com>",
          "timestamp": "2024-03-05T12:37:35Z",
          "tree_id": "369a64a0e10b0d9b2f8aaa4588d196bf531777af",
          "url": "https://github.com/iTwin/presentation/commit/4bb0c41496edb7ade9161dc9409414bfcbbe5eb1"
        },
        "date": 1709642331369,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Initial Models Tree Load: Baytown.bim",
            "value": 348,
            "unit": "ms",
            "extra": "min: 348\nmax: 348\ncount: 1\nmean: 348\np50: 347.3\nmedian: 347.3\np75: 347.3\np90: 347.3\np95: 347.3\np99: 347.3\np999: 347.3"
          },
          {
            "name": "Full Models Tree Load: Baytown.bim",
            "value": 3134,
            "unit": "ms",
            "extra": "min: 3134\nmax: 3134\ncount: 1\nmean: 3134\np50: 3134.5\nmedian: 3134.5\np75: 3134.5\np90: 3134.5\np95: 3134.5\np99: 3134.5\np999: 3134.5"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "24278440+saskliutas@users.noreply.github.com",
            "name": "Saulius Skliutas",
            "username": "saskliutas"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "b596e07e6d25167b68e621feaa0a2c509c50679c",
          "message": "Stateless tree hierarchy level filtering (#447)\n\n* Initial\r\n\r\n* Reload tree\r\n\r\n* Update test-app\r\n\r\n* set enableVirtualization to true\r\n\r\n* remove produce()\r\n\r\n* Add unified selection to tree\r\n\r\n* Fix presentation data localization\r\n\r\n* Bump itwinUI\r\n\r\n* Fix tree model reload\r\n\r\n* Split code\r\n\r\n* Persist tree state between searches\r\n\r\n* Add ability to remove hierarchy level limit\r\n\r\n* Persist selection\r\n\r\n* Cleanup tree component\r\n\r\n* Cleanup TreeWidget component\r\n\r\n* Cleanup Tree API\r\n\r\n* Update itwinui-react\r\n\r\n* Copy all assets from dependencies\r\n\r\n* Fix assets copying\r\n\r\n* Fix assets copying again\r\n\r\n* Fix trees layout\r\n\r\n* Switch to unified selection\r\n\r\n* Do not expose HierarchyNode\r\n\r\n* Cleanup pre-commit actions\r\n\r\n* Add ability to reload sub tree\r\n\r\n* Update hierarchy-builder to use GenericInstanceFilter from core-common\r\n\r\n* Add filtering dialog to stateless tree V2\r\n\r\n* Review changes\r\n\r\n* Update tree mode lto store GenericInstanceFilter\r\n\r\n* Run prettier\r\n\r\n* Add support for converting initial filter with delay loaded descriptor\r\n\r\n* Rename function\r\n\r\n* Rename placeholder node type\r\n\r\n* Add comment\r\n\r\n* Run prettier\r\n\r\n* prettier\r\n\r\n* change\r\n\r\n* extract-api\r\n\r\n* extract-api hierarchy-builder\r\n\r\n* Update packages/hierarchy-builder/src/test/queries/NodeSelectQueryFactory.test.ts\r\n\r\n* Fix build\r\n\r\n---------\r\n\r\nCo-authored-by: JonasDov <100586436+JonasDov@users.noreply.github.com>\r\nCo-authored-by: Grigas <35135765+grigasp@users.noreply.github.com>",
          "timestamp": "2024-03-05T16:22:41+02:00",
          "tree_id": "c343dc615b98db83b5c473a2359a7a9d92c409a7",
          "url": "https://github.com/iTwin/presentation/commit/b596e07e6d25167b68e621feaa0a2c509c50679c"
        },
        "date": 1709648637354,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Initial Models Tree Load: Baytown.bim",
            "value": 233,
            "unit": "ms",
            "extra": "min: 233\nmax: 233\ncount: 1\nmean: 233\np50: 232.8\nmedian: 232.8\np75: 232.8\np90: 232.8\np95: 232.8\np99: 232.8\np999: 232.8"
          },
          {
            "name": "Full Models Tree Load: Baytown.bim",
            "value": 3184,
            "unit": "ms",
            "extra": "min: 3184\nmax: 3184\ncount: 1\nmean: 3184\np50: 3197.8\nmedian: 3197.8\np75: 3197.8\np90: 3197.8\np95: 3197.8\np99: 3197.8\np999: 3197.8"
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
          "id": "995b3079ef22117300747fbc616cb74bf691869d",
          "message": "Hierarchy builder: Grouped instance keys on node (#458)\n\n* Move `groupedInstanceKeys` from node key to node\r\n\r\n* `ParentNodeKey` is now unnecessary\r\n\r\n* `ClassGroupingNodeKey` doesn't need class label\r\n\r\n* fixup test app",
          "timestamp": "2024-03-06T08:00:25Z",
          "tree_id": "217214826d633990f45b98f0760a2fe0efb64384",
          "url": "https://github.com/iTwin/presentation/commit/995b3079ef22117300747fbc616cb74bf691869d"
        },
        "date": 1709712095322,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Initial Models Tree Load: Baytown.bim",
            "value": 311,
            "unit": "ms",
            "extra": "min: 311\nmax: 311\ncount: 1\nmean: 311\np50: 308\nmedian: 308\np75: 308\np90: 308\np95: 308\np99: 308\np999: 308"
          },
          {
            "name": "Full Models Tree Load: Baytown.bim",
            "value": 3083,
            "unit": "ms",
            "extra": "min: 3083\nmax: 3083\ncount: 1\nmean: 3083\np50: 3072.4\nmedian: 3072.4\np75: 3072.4\np90: 3072.4\np95: 3072.4\np99: 3072.4\np999: 3072.4"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "name": "Dmitrij Kuzmiciov",
            "username": "Yato333",
            "email": "yato333@users.noreply.github.com"
          },
          "committer": {
            "name": "Dmitrij Kuzmiciov",
            "username": "Yato333",
            "email": "yato333@users.noreply.github.com"
          },
          "id": "b8cb8ccf3a8cced79568d3dd86e2c8300a988861",
          "message": "Fix output path",
          "timestamp": "2024-03-07T11:30:23Z",
          "url": "https://github.com/iTwin/presentation/commit/b8cb8ccf3a8cced79568d3dd86e2c8300a988861"
        },
        "date": 1709811146475,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "loads initial hierarchy",
            "value": 74,
            "unit": "ms",
            "extra": "maxBlockingTime: 0\ntotalBlockingTime: 0"
          },
          {
            "name": "loads full hierarchy",
            "value": 2583,
            "unit": "ms",
            "extra": "maxBlockingTime: 200\ntotalBlockingTime: 321"
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
          "id": "23d915c37699c90c27e0b32c9992b91ce73614df",
          "message": "Hierarchy builder: Filtering grouping nodes (#463)\n\n* Type improvements & full stack tests for grouped hierarchy level filtering\r\n\r\n* when requesting children for grouping nodes, take instance filter from the closest non-grouping ancestor node",
          "timestamp": "2024-03-07T16:09:49+02:00",
          "tree_id": "5cebb2e5f0ee79594254a3dad894e3aa358c14da",
          "url": "https://github.com/iTwin/presentation/commit/23d915c37699c90c27e0b32c9992b91ce73614df"
        },
        "date": 1709820654664,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Initial Models Tree Load: Baytown.bim",
            "value": 332,
            "unit": "ms",
            "extra": "min: 332\nmax: 332\ncount: 1\nmean: 332\np50: 333.7\nmedian: 333.7\np75: 333.7\np90: 333.7\np95: 333.7\np99: 333.7\np999: 333.7"
          },
          {
            "name": "Full Models Tree Load: Baytown.bim",
            "value": 3129,
            "unit": "ms",
            "extra": "min: 3129\nmax: 3129\ncount: 1\nmean: 3129\np50: 3134.5\nmedian: 3134.5\np75: 3134.5\np90: 3134.5\np95: 3134.5\np99: 3134.5\np999: 3134.5"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "name": "Dmitrij Kuzmiciov",
            "username": "Yato333",
            "email": "yato333@users.noreply.github.com"
          },
          "committer": {
            "name": "Dmitrij Kuzmiciov",
            "username": "Yato333",
            "email": "yato333@users.noreply.github.com"
          },
          "id": "c18823e56cbbd71832ff6f028346ecb4a9b9d842",
          "message": "Save main benchmark results only when run on master branch",
          "timestamp": "2024-03-07T14:25:48Z",
          "url": "https://github.com/iTwin/presentation/commit/c18823e56cbbd71832ff6f028346ecb4a9b9d842"
        },
        "date": 1709821726879,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "loads initial hierarchy",
            "value": 79,
            "unit": "ms",
            "extra": "maxBlockingTime: 0\ntotalBlockingTime: 0"
          },
          {
            "name": "loads full hierarchy",
            "value": 2640,
            "unit": "ms",
            "extra": "maxBlockingTime: 221\ntotalBlockingTime: 363"
          }
        ]
      },
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
          "id": "23d915c37699c90c27e0b32c9992b91ce73614df",
          "message": "Hierarchy builder: Filtering grouping nodes (#463)\n\n* Type improvements & full stack tests for grouped hierarchy level filtering\r\n\r\n* when requesting children for grouping nodes, take instance filter from the closest non-grouping ancestor node",
          "timestamp": "2024-03-07T14:09:49Z",
          "url": "https://github.com/iTwin/presentation/commit/23d915c37699c90c27e0b32c9992b91ce73614df"
        },
        "date": 1709822148149,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "Initial Models Tree Load: Baytown.bim",
            "value": 343,
            "unit": "ms",
            "extra": "min: 343\nmax: 343\ncount: 1\nmean: 343\np50: 340.4\nmedian: 340.4\np75: 340.4\np90: 340.4\np95: 340.4\np99: 340.4\np999: 340.4"
          },
          {
            "name": "Full Models Tree Load: Baytown.bim",
            "value": 3120,
            "unit": "ms",
            "extra": "min: 3120\nmax: 3120\ncount: 1\nmean: 3120\np50: 3134.5\nmedian: 3134.5\np75: 3134.5\np90: 3134.5\np95: 3134.5\np99: 3134.5\np999: 3134.5"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "29233962+Yato333@users.noreply.github.com",
            "name": "Dmitrij Kuzmičiov",
            "username": "Yato333"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "0ab2c5c4a51620c6bd2af3e39ef55cbaca9dcb79",
          "message": "Add performance tests (#461)\n\n* Initial refactor\r\n\r\n* Add arguments aliases and a debugger option\r\n\r\n* Fix merge issue\r\n\r\n* remove extra parameters\r\n\r\n* refactor\r\n\r\n* Move changes to a new project\r\n\r\n* Setup test reporter\r\n\r\n* Fix performance tests\r\n\r\n* Remove unnecessary stuff\r\n\r\n* Set up global benchmark script\r\n\r\n* Update readme\r\n\r\n* Adjust pipeline\r\n\r\n* Fix output path\r\n\r\n* Remove test results file\r\n\r\n* Fix formatting issue\r\n\r\n* Fix eslint config\r\n\r\n* Save main benchmark results only when run on master branch\r\n\r\n* Fix condition\r\n\r\n* Fix eslint problems\r\n\r\n* Remove start script\r\n\r\n* Change file structure\r\n\r\n* Use public query executor\r\n\r\n* Refactor blocking stats\r\n\r\n* Add table dependency\r\n\r\n* Remove logging from hierarchy provider\r\n\r\n* Improve test reporter console output\r\n\r\n* Remove check leaks option\r\n\r\n* Remove pid from profile name\r\n\r\n* Remove pre-caching of iModels\r\n\r\n* Simplify float rounding\r\n\r\n* Fix p95\r\n\r\n* Add additional entries for benchmark\r\n\r\n* Fix import being on top of header\r\n\r\n* Fix debugger crashing on startup\r\n\r\n* Fix issue of TestReporter measuring time from `beforeEach` to test end.\r\n\r\n* Add undefined check\r\n\r\n* Improve comment\r\n\r\n* Rename itMeasures to run\r\n\r\n* Improve text for blocking benchmark entries\r\n\r\n---------\r\n\r\nCo-authored-by: Dmitrij Kuzmiciov <yato333@users.noreply.github.com>",
          "timestamp": "2024-03-12T10:16:21+02:00",
          "tree_id": "bded88b95325e87c9de255d6b86a7c0ba6d1641b",
          "url": "https://github.com/iTwin/presentation/commit/0ab2c5c4a51620c6bd2af3e39ef55cbaca9dcb79"
        },
        "date": 1710231450176,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "stateless hierarchy loads initial hierarchy",
            "value": 77.65,
            "unit": "ms"
          },
          {
            "name": "stateless hierarchy loads initial hierarchy (P95 of main thread blocks)",
            "value": 35,
            "unit": "ms",
            "extra": "count: 1\nmax: 35\np95: 35\nmedian: 35"
          },
          {
            "name": "stateless hierarchy loads full hierarchy",
            "value": 2629.56,
            "unit": "ms"
          },
          {
            "name": "stateless hierarchy loads full hierarchy (P95 of main thread blocks)",
            "value": 224,
            "unit": "ms",
            "extra": "count: 4\nmax: 224\np95: 224\nmedian: 89"
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
          "id": "994f2c51ccaf9d785e4960fa93577c65790279d2",
          "message": "Hierarchies: Fix models tree filtering (#468)\n\n* escape class names\r\n\r\n* Fix children check for \"hide if no children\" using parent's instance filter\r\n\r\n* Reduce the amount of query logs. Queries are large and there's no point to log it more than once\r\n\r\n* Allow the property source class alias to be omitted\r\n\r\n* More extensive hierarchy level filtering tests\r\n\r\n* Fix filtering on child Subject hierarchy level not working\r\n\r\n* Fix hierarchy level filtering not working on sub-modeled elements' child hierarchy levels\r\n\r\n* Fix hierarchy level filtering for categories loaded under Subject parent nodes\r\n\r\n* workaround for ECSQL issue\r\n\r\n* improve hiding operators logging",
          "timestamp": "2024-03-12T13:13:41+02:00",
          "tree_id": "5fcd11a3bc48798b6717ca780731983d48d72278",
          "url": "https://github.com/iTwin/presentation/commit/994f2c51ccaf9d785e4960fa93577c65790279d2"
        },
        "date": 1710242076708,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "stateless hierarchy loads initial hierarchy",
            "value": 76.17,
            "unit": "ms"
          },
          {
            "name": "stateless hierarchy loads initial hierarchy (P95 of main thread blocks)",
            "value": 35,
            "unit": "ms",
            "extra": "count: 1\nmax: 35\np95: 35\nmedian: 35"
          },
          {
            "name": "stateless hierarchy loads full hierarchy",
            "value": 2965.14,
            "unit": "ms"
          },
          {
            "name": "stateless hierarchy loads full hierarchy (P95 of main thread blocks)",
            "value": 219,
            "unit": "ms",
            "extra": "count: 6\nmax: 219\np95: 219\nmedian: 50.5"
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
          "id": "45fc138566040bcbb4b45f34aca057e0fdd40d3f",
          "message": "Hierarchies: Logging improvements (#473)\n\n* Add a way to get logging severity from core logger\r\n\r\n* Avoid creating a log message if severity for its category is not high enough",
          "timestamp": "2024-03-12T15:01:22+02:00",
          "tree_id": "ecbcaf5f8bab0ee1f1b189e3a835a62dfee5ba25",
          "url": "https://github.com/iTwin/presentation/commit/45fc138566040bcbb4b45f34aca057e0fdd40d3f"
        },
        "date": 1710248542632,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "stateless hierarchy loads initial hierarchy",
            "value": 98.9,
            "unit": "ms"
          },
          {
            "name": "stateless hierarchy loads initial hierarchy (P95 of main thread blocks)",
            "value": 47,
            "unit": "ms",
            "extra": "count: 1\nmax: 47\np95: 47\nmedian: 47"
          },
          {
            "name": "stateless hierarchy loads full hierarchy",
            "value": 2612.2,
            "unit": "ms"
          },
          {
            "name": "stateless hierarchy loads full hierarchy (P95 of main thread blocks)",
            "value": 243,
            "unit": "ms",
            "extra": "count: 4\nmax: 243\np95: 243\nmedian: 83.5"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "24278440+saskliutas@users.noreply.github.com",
            "name": "Saulius Skliutas",
            "username": "saskliutas"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "c265582591b915bc9b32d188cf71537c1197ceb1",
          "message": "Initial `@itwin/presentation-hierarchies-react` setup (#474)\n\n* Move `useTree` API to new package\r\n\r\n* Add icon support\r\n\r\n* Fix unified selection\r\n\r\n* Revive hierarchy level filtering\r\n\r\n* Add missing headers\r\n\r\n* Remove commented code\r\n\r\n* Setup API extraction\r\n\r\n* Remove test script\r\n\r\n* Add missing header",
          "timestamp": "2024-03-13T18:12:25+02:00",
          "tree_id": "74b7085b5028a0b52a2ab4995c13b30a96b68f36",
          "url": "https://github.com/iTwin/presentation/commit/c265582591b915bc9b32d188cf71537c1197ceb1"
        },
        "date": 1710346410278,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "stateless hierarchy loads initial hierarchy",
            "value": 81.81,
            "unit": "ms"
          },
          {
            "name": "stateless hierarchy loads initial hierarchy (P95 of main thread blocks)",
            "value": 36,
            "unit": "ms",
            "extra": "count: 1\nmax: 36\np95: 36\nmedian: 36"
          },
          {
            "name": "stateless hierarchy loads full hierarchy",
            "value": 2564.19,
            "unit": "ms"
          },
          {
            "name": "stateless hierarchy loads full hierarchy (P95 of main thread blocks)",
            "value": 233,
            "unit": "ms",
            "extra": "count: 4\nmax: 233\np95: 233\nmedian: 79"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "29233962+Yato333@users.noreply.github.com",
            "name": "Dmitrij Kuzmičiov",
            "username": "Yato333"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "bf3449398336b90285287cf641e61bd37f559673",
          "message": "Add an additional test iModel to the performance tests (#475)\n\n- Move test iModel creation code from the presentation-full-stack-tests project to a new project that will not have unnecessary dependencies like presentation-frontend, AppUI or React.\r\n- Add a large flat iModel to performance test dataset.\r\n- Implement caching of datasets in the Github workflow.",
          "timestamp": "2024-03-14T14:32:49Z",
          "tree_id": "da93b1cb20f640d662c228c2b1a4d1d2b40610d9",
          "url": "https://github.com/iTwin/presentation/commit/bf3449398336b90285287cf641e61bd37f559673"
        },
        "date": 1710426852987,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "flat 50k elements list",
            "value": 4494.2,
            "unit": "ms"
          },
          {
            "name": "flat 50k elements list (P95 of main thread blocks)",
            "value": 0,
            "unit": "ms",
            "extra": "count: 0\nmax: N/A\np95: N/A\nmedian: N/A"
          },
          {
            "name": "models tree initial (Baytown)",
            "value": 56.96,
            "unit": "ms"
          },
          {
            "name": "models tree initial (Baytown) (P95 of main thread blocks)",
            "value": 0,
            "unit": "ms",
            "extra": "count: 0\nmax: N/A\np95: N/A\nmedian: N/A"
          },
          {
            "name": "models tree full (Baytown)",
            "value": 2457.83,
            "unit": "ms"
          },
          {
            "name": "models tree full (Baytown) (P95 of main thread blocks)",
            "value": 211,
            "unit": "ms",
            "extra": "count: 5\nmax: 211\np95: 211\nmedian: 41"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "29233962+Yato333@users.noreply.github.com",
            "name": "Dmitrij Kuzmičiov",
            "username": "Yato333"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "4b1dbcf71d961a267b9152770625944b0367d542",
          "message": "Add performance tests for all grouping types (#479)\n\n- Add a custom schema to the 50k element iModel.\r\n- Add tests for grouping by label, class, base class, properties and all of the above at the same time.\r\n- Add only and skip parameters for the run function.\r\n- Add logging of iTwin.js errors.",
          "timestamp": "2024-03-18T09:04:22Z",
          "tree_id": "d01e76d3f3c57b66cd8e041927a16baa4a7fd0b3",
          "url": "https://github.com/iTwin/presentation/commit/4b1dbcf71d961a267b9152770625944b0367d542"
        },
        "date": 1710752804546,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "flat 50k elements list",
            "value": 4761.02,
            "unit": "ms"
          },
          {
            "name": "flat 50k elements list (P95 of main thread blocks)",
            "value": 0,
            "unit": "ms",
            "extra": "count: 0\nmax: N/A\np95: N/A\nmedian: N/A"
          },
          {
            "name": "models tree initial (Baytown)",
            "value": 56.85,
            "unit": "ms"
          },
          {
            "name": "models tree initial (Baytown) (P95 of main thread blocks)",
            "value": 0,
            "unit": "ms",
            "extra": "count: 0\nmax: N/A\np95: N/A\nmedian: N/A"
          },
          {
            "name": "models tree full (Baytown)",
            "value": 2553.82,
            "unit": "ms"
          },
          {
            "name": "models tree full (Baytown) (P95 of main thread blocks)",
            "value": 207,
            "unit": "ms",
            "extra": "count: 4\nmax: 207\np95: 207\nmedian: 82"
          },
          {
            "name": "grouping by label",
            "value": 8732,
            "unit": "ms"
          },
          {
            "name": "grouping by label (P95 of main thread blocks)",
            "value": 0,
            "unit": "ms",
            "extra": "count: 0\nmax: N/A\np95: N/A\nmedian: N/A"
          },
          {
            "name": "grouping by class",
            "value": 8527.82,
            "unit": "ms"
          },
          {
            "name": "grouping by class (P95 of main thread blocks)",
            "value": 0,
            "unit": "ms",
            "extra": "count: 0\nmax: N/A\np95: N/A\nmedian: N/A"
          },
          {
            "name": "grouping by property",
            "value": 9304.43,
            "unit": "ms"
          },
          {
            "name": "grouping by property (P95 of main thread blocks)",
            "value": 439,
            "unit": "ms",
            "extra": "count: 1\nmax: 439\np95: 439\nmedian: 439"
          },
          {
            "name": "grouping by base class (10 classes)",
            "value": 24027.52,
            "unit": "ms"
          },
          {
            "name": "grouping by base class (10 classes) (P95 of main thread blocks)",
            "value": 5968,
            "unit": "ms",
            "extra": "count: 7\nmax: 5968\np95: 5968\nmedian: 1007"
          },
          {
            "name": "grouping by multiple attributes",
            "value": 10185.26,
            "unit": "ms"
          },
          {
            "name": "grouping by multiple attributes (P95 of main thread blocks)",
            "value": 350,
            "unit": "ms",
            "extra": "count: 2\nmax: 350\np95: 350\nmedian: 341.5"
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
          "id": "02c17410f4a58c8d9a523b884edad662dd430754",
          "message": "Rename `presentation-hierarchy-builder` to `presentation-hierarchies` (#483)",
          "timestamp": "2024-03-20T12:10:28+02:00",
          "tree_id": "8f3338e06a964600ca48a7e58e775bccc043a5dc",
          "url": "https://github.com/iTwin/presentation/commit/02c17410f4a58c8d9a523b884edad662dd430754"
        },
        "date": 1710929561562,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "flat 50k elements list",
            "value": 4945.53,
            "unit": "ms"
          },
          {
            "name": "flat 50k elements list (P95 of main thread blocks)",
            "value": 0,
            "unit": "ms",
            "extra": "count: 0\nmax: N/A\np95: N/A\nmedian: N/A"
          },
          {
            "name": "models tree initial (Baytown)",
            "value": 56.64,
            "unit": "ms"
          },
          {
            "name": "models tree initial (Baytown) (P95 of main thread blocks)",
            "value": 0,
            "unit": "ms",
            "extra": "count: 0\nmax: N/A\np95: N/A\nmedian: N/A"
          },
          {
            "name": "models tree full (Baytown)",
            "value": 2593.16,
            "unit": "ms"
          },
          {
            "name": "models tree full (Baytown) (P95 of main thread blocks)",
            "value": 229,
            "unit": "ms",
            "extra": "count: 4\nmax: 229\np95: 229\nmedian: 91"
          },
          {
            "name": "grouping by label",
            "value": 8595.25,
            "unit": "ms"
          },
          {
            "name": "grouping by label (P95 of main thread blocks)",
            "value": 0,
            "unit": "ms",
            "extra": "count: 0\nmax: N/A\np95: N/A\nmedian: N/A"
          },
          {
            "name": "grouping by class",
            "value": 8643.57,
            "unit": "ms"
          },
          {
            "name": "grouping by class (P95 of main thread blocks)",
            "value": 0,
            "unit": "ms",
            "extra": "count: 0\nmax: N/A\np95: N/A\nmedian: N/A"
          },
          {
            "name": "grouping by property",
            "value": 9511.84,
            "unit": "ms"
          },
          {
            "name": "grouping by property (P95 of main thread blocks)",
            "value": 448,
            "unit": "ms",
            "extra": "count: 1\nmax: 448\np95: 448\nmedian: 448"
          },
          {
            "name": "grouping by base class (10 classes)",
            "value": 23607.28,
            "unit": "ms"
          },
          {
            "name": "grouping by base class (10 classes) (P95 of main thread blocks)",
            "value": 6175,
            "unit": "ms",
            "extra": "count: 7\nmax: 6175\np95: 6175\nmedian: 1013"
          },
          {
            "name": "grouping by multiple attributes",
            "value": 9693.57,
            "unit": "ms"
          },
          {
            "name": "grouping by multiple attributes (P95 of main thread blocks)",
            "value": 359,
            "unit": "ms",
            "extra": "count: 2\nmax: 359\np95: 359\nmedian: 352.5"
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
          "id": "69288798eadf04cdb6c2302233d734635f036e3d",
          "message": "Fix same schemas being loaded more than once (#486)",
          "timestamp": "2024-03-22T09:13:27+02:00",
          "tree_id": "96e96fd8d39324c5c40b42c8d19b45cb46adb6fe",
          "url": "https://github.com/iTwin/presentation/commit/69288798eadf04cdb6c2302233d734635f036e3d"
        },
        "date": 1711091739652,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "flat 50k elements list",
            "value": 4791.38,
            "unit": "ms"
          },
          {
            "name": "flat 50k elements list (P95 of main thread blocks)",
            "value": 0,
            "unit": "ms",
            "extra": "count: 0\nmax: N/A\np95: N/A\nmedian: N/A"
          },
          {
            "name": "models tree initial (Baytown)",
            "value": 54.46,
            "unit": "ms"
          },
          {
            "name": "models tree initial (Baytown) (P95 of main thread blocks)",
            "value": 0,
            "unit": "ms",
            "extra": "count: 0\nmax: N/A\np95: N/A\nmedian: N/A"
          },
          {
            "name": "models tree full (Baytown)",
            "value": 2549.33,
            "unit": "ms"
          },
          {
            "name": "models tree full (Baytown) (P95 of main thread blocks)",
            "value": 181,
            "unit": "ms",
            "extra": "count: 4\nmax: 181\np95: 181\nmedian: 92"
          },
          {
            "name": "grouping by label",
            "value": 8897.34,
            "unit": "ms"
          },
          {
            "name": "grouping by label (P95 of main thread blocks)",
            "value": 0,
            "unit": "ms",
            "extra": "count: 0\nmax: N/A\np95: N/A\nmedian: N/A"
          },
          {
            "name": "grouping by class",
            "value": 8933.51,
            "unit": "ms"
          },
          {
            "name": "grouping by class (P95 of main thread blocks)",
            "value": 0,
            "unit": "ms",
            "extra": "count: 0\nmax: N/A\np95: N/A\nmedian: N/A"
          },
          {
            "name": "grouping by property",
            "value": 9668.39,
            "unit": "ms"
          },
          {
            "name": "grouping by property (P95 of main thread blocks)",
            "value": 454,
            "unit": "ms",
            "extra": "count: 1\nmax: 454\np95: 454\nmedian: 454"
          },
          {
            "name": "grouping by base class (10 classes)",
            "value": 23797.7,
            "unit": "ms"
          },
          {
            "name": "grouping by base class (10 classes) (P95 of main thread blocks)",
            "value": 6080,
            "unit": "ms",
            "extra": "count: 7\nmax: 6080\np95: 6080\nmedian: 1045"
          },
          {
            "name": "grouping by multiple attributes",
            "value": 10076.08,
            "unit": "ms"
          },
          {
            "name": "grouping by multiple attributes (P95 of main thread blocks)",
            "value": 349,
            "unit": "ms",
            "extra": "count: 2\nmax: 349\np95: 349\nmedian: 342"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "29233962+Yato333@users.noreply.github.com",
            "name": "Dmitrij Kuzmičiov",
            "username": "Yato333"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "3e028dc6cc520f2aff43119b8b72b4766f44a381",
          "message": "Base class grouping performance optimizations (#485)\n\n- BaseClassChecker instance will now be constructed in the HierarchyBuilder's constructor. This will help to prevent unnecessary base class checks when calling getNodes the next time. Due to this, BaseClassChecker will now have an LRU cache to limit the consumed amount of memory.\r\n- Made it so isECClassOfBaseECClass returns a Promise only when the result is not cached.\r\n- Removed some instances of unnecessary traversals of all instance nodes.",
          "timestamp": "2024-03-22T11:05:31Z",
          "tree_id": "29a958eab9a5e3c8c574f578d92981bd6353306e",
          "url": "https://github.com/iTwin/presentation/commit/3e028dc6cc520f2aff43119b8b72b4766f44a381"
        },
        "date": 1711105658787,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "flat 50k elements list",
            "value": 4759.88,
            "unit": "ms"
          },
          {
            "name": "flat 50k elements list (P95 of main thread blocks)",
            "value": 0,
            "unit": "ms",
            "extra": "count: 0\nmax: N/A\np95: N/A\nmedian: N/A"
          },
          {
            "name": "models tree initial (Baytown)",
            "value": 54.16,
            "unit": "ms"
          },
          {
            "name": "models tree initial (Baytown) (P95 of main thread blocks)",
            "value": 0,
            "unit": "ms",
            "extra": "count: 0\nmax: N/A\np95: N/A\nmedian: N/A"
          },
          {
            "name": "models tree full (Baytown)",
            "value": 3589.2,
            "unit": "ms"
          },
          {
            "name": "models tree full (Baytown) (P95 of main thread blocks)",
            "value": 992,
            "unit": "ms",
            "extra": "count: 5\nmax: 992\np95: 992\nmedian: 55"
          },
          {
            "name": "grouping by label",
            "value": 8947.43,
            "unit": "ms"
          },
          {
            "name": "grouping by label (P95 of main thread blocks)",
            "value": 0,
            "unit": "ms",
            "extra": "count: 0\nmax: N/A\np95: N/A\nmedian: N/A"
          },
          {
            "name": "grouping by class",
            "value": 9090.03,
            "unit": "ms"
          },
          {
            "name": "grouping by class (P95 of main thread blocks)",
            "value": 0,
            "unit": "ms",
            "extra": "count: 0\nmax: N/A\np95: N/A\nmedian: N/A"
          },
          {
            "name": "grouping by property",
            "value": 9794.84,
            "unit": "ms"
          },
          {
            "name": "grouping by property (P95 of main thread blocks)",
            "value": 447,
            "unit": "ms",
            "extra": "count: 1\nmax: 447\np95: 447\nmedian: 447"
          },
          {
            "name": "grouping by base class (10 classes)",
            "value": 16215.32,
            "unit": "ms"
          },
          {
            "name": "grouping by base class (10 classes) (P95 of main thread blocks)",
            "value": 5402,
            "unit": "ms",
            "extra": "count: 7\nmax: 5402\np95: 5402\nmedian: 1051"
          },
          {
            "name": "grouping by multiple attributes",
            "value": 10144.32,
            "unit": "ms"
          },
          {
            "name": "grouping by multiple attributes (P95 of main thread blocks)",
            "value": 361,
            "unit": "ms",
            "extra": "count: 2\nmax: 361\np95: 361\nmedian: 351.5"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "24278440+saskliutas@users.noreply.github.com",
            "name": "Saulius Skliutas",
            "username": "saskliutas"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "cd7d9f6b7d84a024e242858762d8d5a3e40e42da",
          "message": "Fix security vulnerability (#487)\n\n* Update deps\r\n\r\n* Add missing peer deps\r\n\r\n* Turn off auto install peers\r\n\r\n---------\r\n\r\nCo-authored-by: Grigas <35135765+grigasp@users.noreply.github.com>",
          "timestamp": "2024-03-25T09:25:05+02:00",
          "tree_id": "672e954119196ef6385360dec72b6a4e7839f672",
          "url": "https://github.com/iTwin/presentation/commit/cd7d9f6b7d84a024e242858762d8d5a3e40e42da"
        },
        "date": 1711351633600,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "flat 50k elements list",
            "value": 4847.12,
            "unit": "ms"
          },
          {
            "name": "flat 50k elements list (P95 of main thread blocks)",
            "value": 0,
            "unit": "ms",
            "extra": "count: 0\nmax: N/A\np95: N/A\nmedian: N/A"
          },
          {
            "name": "models tree initial (Baytown)",
            "value": 53.71,
            "unit": "ms"
          },
          {
            "name": "models tree initial (Baytown) (P95 of main thread blocks)",
            "value": 0,
            "unit": "ms",
            "extra": "count: 0\nmax: N/A\np95: N/A\nmedian: N/A"
          },
          {
            "name": "models tree full (Baytown)",
            "value": 2484.81,
            "unit": "ms"
          },
          {
            "name": "models tree full (Baytown) (P95 of main thread blocks)",
            "value": 189,
            "unit": "ms",
            "extra": "count: 4\nmax: 189\np95: 189\nmedian: 91"
          },
          {
            "name": "grouping by label",
            "value": 8546.48,
            "unit": "ms"
          },
          {
            "name": "grouping by label (P95 of main thread blocks)",
            "value": 0,
            "unit": "ms",
            "extra": "count: 0\nmax: N/A\np95: N/A\nmedian: N/A"
          },
          {
            "name": "grouping by class",
            "value": 8626.38,
            "unit": "ms"
          },
          {
            "name": "grouping by class (P95 of main thread blocks)",
            "value": 0,
            "unit": "ms",
            "extra": "count: 0\nmax: N/A\np95: N/A\nmedian: N/A"
          },
          {
            "name": "grouping by property",
            "value": 9343.38,
            "unit": "ms"
          },
          {
            "name": "grouping by property (P95 of main thread blocks)",
            "value": 440,
            "unit": "ms",
            "extra": "count: 2\nmax: 440\np95: 440\nmedian: 249"
          },
          {
            "name": "grouping by base class (10 classes)",
            "value": 15548.99,
            "unit": "ms"
          },
          {
            "name": "grouping by base class (10 classes) (P95 of main thread blocks)",
            "value": 5218,
            "unit": "ms",
            "extra": "count: 7\nmax: 5218\np95: 5218\nmedian: 977"
          },
          {
            "name": "grouping by multiple attributes",
            "value": 9751.08,
            "unit": "ms"
          },
          {
            "name": "grouping by multiple attributes (P95 of main thread blocks)",
            "value": 394,
            "unit": "ms",
            "extra": "count: 2\nmax: 394\np95: 394\nmedian: 372"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "24278440+saskliutas@users.noreply.github.com",
            "name": "Saulius Skliutas",
            "username": "saskliutas"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "4348f00ef66fa39f5702a8e3463713b5daaea744",
          "message": "Add missing license field (#495)\n\n* Add license field to package.json\r\n\r\n* Change",
          "timestamp": "2024-03-26T11:26:54+02:00",
          "tree_id": "c34c73572d63e529e77efe0e854cdcb7f86480d6",
          "url": "https://github.com/iTwin/presentation/commit/4348f00ef66fa39f5702a8e3463713b5daaea744"
        },
        "date": 1711445346421,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "flat 50k elements list",
            "value": 4900.3,
            "unit": "ms"
          },
          {
            "name": "flat 50k elements list (P95 of main thread blocks)",
            "value": 0,
            "unit": "ms",
            "extra": "count: 0\nmax: N/A\np95: N/A\nmedian: N/A"
          },
          {
            "name": "models tree initial (Baytown)",
            "value": 56.12,
            "unit": "ms"
          },
          {
            "name": "models tree initial (Baytown) (P95 of main thread blocks)",
            "value": 0,
            "unit": "ms",
            "extra": "count: 0\nmax: N/A\np95: N/A\nmedian: N/A"
          },
          {
            "name": "models tree full (Baytown)",
            "value": 2604.4,
            "unit": "ms"
          },
          {
            "name": "models tree full (Baytown) (P95 of main thread blocks)",
            "value": 203,
            "unit": "ms",
            "extra": "count: 4\nmax: 203\np95: 203\nmedian: 94"
          },
          {
            "name": "grouping by label",
            "value": 9332.97,
            "unit": "ms"
          },
          {
            "name": "grouping by label (P95 of main thread blocks)",
            "value": 0,
            "unit": "ms",
            "extra": "count: 0\nmax: N/A\np95: N/A\nmedian: N/A"
          },
          {
            "name": "grouping by class",
            "value": 9408.38,
            "unit": "ms"
          },
          {
            "name": "grouping by class (P95 of main thread blocks)",
            "value": 0,
            "unit": "ms",
            "extra": "count: 0\nmax: N/A\np95: N/A\nmedian: N/A"
          },
          {
            "name": "grouping by property",
            "value": 10355.43,
            "unit": "ms"
          },
          {
            "name": "grouping by property (P95 of main thread blocks)",
            "value": 471,
            "unit": "ms",
            "extra": "count: 2\nmax: 471\np95: 471\nmedian: 263.5"
          },
          {
            "name": "grouping by base class (10 classes)",
            "value": 16249.06,
            "unit": "ms"
          },
          {
            "name": "grouping by base class (10 classes) (P95 of main thread blocks)",
            "value": 5504,
            "unit": "ms",
            "extra": "count: 7\nmax: 5504\np95: 5504\nmedian: 1029"
          },
          {
            "name": "grouping by multiple attributes",
            "value": 10530.57,
            "unit": "ms"
          },
          {
            "name": "grouping by multiple attributes (P95 of main thread blocks)",
            "value": 348,
            "unit": "ms",
            "extra": "count: 2\nmax: 348\np95: 348\nmedian: 345.5"
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
          "id": "3a2a190213e5e83d2db1ab54917025579cf02d5c",
          "message": "Hierarchies: Grouping refactor (#498)\n\n* fix test\r\n\r\n* Type guards for property grouping nodes, add metadata to `PropertyOtherValuesGroupingNodeKey`\r\n\r\n* Refactor grouping to create only one level of grouping at a time\r\n\r\n* Fix invalid file name being created when input string contains ` or ' characters.\r\n\r\n* cleanup\r\n\r\n* Default to 0 size query cache\r\n\r\n* Add a test for grouping nodes whose parents are hidden\r\n\r\n* Sort nodes on finalize, without converting to array first\r\n\r\n* extract-api\r\n\r\n* fixup merge",
          "timestamp": "2024-03-27T12:55:38+02:00",
          "tree_id": "4b8814c818977c9b0725b5e372b536588c4f4cea",
          "url": "https://github.com/iTwin/presentation/commit/3a2a190213e5e83d2db1ab54917025579cf02d5c"
        },
        "date": 1711537042008,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "flat 50k elements list",
            "value": 5591.72,
            "unit": "ms"
          },
          {
            "name": "flat 50k elements list (P95 of main thread blocks)",
            "value": 0,
            "unit": "ms",
            "extra": "count: 0\nmax: N/A\np95: N/A\nmedian: N/A"
          },
          {
            "name": "models tree initial (Baytown)",
            "value": 57.45,
            "unit": "ms"
          },
          {
            "name": "models tree initial (Baytown) (P95 of main thread blocks)",
            "value": 0,
            "unit": "ms",
            "extra": "count: 0\nmax: N/A\np95: N/A\nmedian: N/A"
          },
          {
            "name": "models tree full (Baytown)",
            "value": 2546.53,
            "unit": "ms"
          },
          {
            "name": "models tree full (Baytown) (P95 of main thread blocks)",
            "value": 213,
            "unit": "ms",
            "extra": "count: 5\nmax: 213\np95: 213\nmedian: 41"
          },
          {
            "name": "grouping by label",
            "value": 6187.56,
            "unit": "ms"
          },
          {
            "name": "grouping by label (P95 of main thread blocks)",
            "value": 155,
            "unit": "ms",
            "extra": "count: 23\nmax: 1034\np95: 155\nmedian: 95"
          },
          {
            "name": "grouping by class",
            "value": 6096.99,
            "unit": "ms"
          },
          {
            "name": "grouping by class (P95 of main thread blocks)",
            "value": 154,
            "unit": "ms",
            "extra": "count: 27\nmax: 1003\np95: 154\nmedian: 94"
          },
          {
            "name": "grouping by property",
            "value": 6748.23,
            "unit": "ms"
          },
          {
            "name": "grouping by property (P95 of main thread blocks)",
            "value": 446,
            "unit": "ms",
            "extra": "count: 24\nmax: 953\np95: 446\nmedian: 99.5"
          },
          {
            "name": "grouping by base class (10 classes)",
            "value": 7010.52,
            "unit": "ms"
          },
          {
            "name": "grouping by base class (10 classes) (P95 of main thread blocks)",
            "value": 5938,
            "unit": "ms",
            "extra": "count: 4\nmax: 5938\np95: 5938\nmedian: 225"
          },
          {
            "name": "grouping by multiple attributes",
            "value": 7518.96,
            "unit": "ms"
          },
          {
            "name": "grouping by multiple attributes (P95 of main thread blocks)",
            "value": 343,
            "unit": "ms",
            "extra": "count: 31\nmax: 779\np95: 343\nmedian: 113"
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
          "id": "28e622473d1e8d983e37ff7b7df5839d97b27c72",
          "message": "Hierarchies: \"Hide if no children\" performance improvement (#503)\n\n* load tests aren't used for benchmarking anymore\r\n\r\n* Split perf tests into separate files\r\n\r\n* Node `18.18` added a distinction between `Timer` and `Timeout`. `setInterval` returns a `Timeout`.\r\n\r\n* Add performance tests for \"hide if no children\"\r\n\r\n* Improve performance of \"hide if no children\" handling\r\n\r\n* Load tests - misc\r\n\r\n* Fix `ModelsTreeDefinition` - max function arguments is 127, not 128",
          "timestamp": "2024-03-28T16:49:37+02:00",
          "tree_id": "a03476c8e89a344b3b3f115149da0410d4bc7361",
          "url": "https://github.com/iTwin/presentation/commit/28e622473d1e8d983e37ff7b7df5839d97b27c72"
        },
        "date": 1711637536172,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "flat 50k elements list",
            "value": 5392.97,
            "unit": "ms"
          },
          {
            "name": "flat 50k elements list (P95 of main thread blocks)",
            "value": 0,
            "unit": "ms",
            "extra": "count: 0\nmax: N/A\np95: N/A\nmedian: N/A"
          },
          {
            "name": "grouping by label",
            "value": 6148.46,
            "unit": "ms"
          },
          {
            "name": "grouping by label (P95 of main thread blocks)",
            "value": 148,
            "unit": "ms",
            "extra": "count: 21\nmax: 1107\np95: 148\nmedian: 92"
          },
          {
            "name": "grouping by class",
            "value": 6032.18,
            "unit": "ms"
          },
          {
            "name": "grouping by class (P95 of main thread blocks)",
            "value": 107,
            "unit": "ms",
            "extra": "count: 22\nmax: 1151\np95: 107\nmedian: 90.5"
          },
          {
            "name": "grouping by property",
            "value": 6746.76,
            "unit": "ms"
          },
          {
            "name": "grouping by property (P95 of main thread blocks)",
            "value": 479,
            "unit": "ms",
            "extra": "count: 24\nmax: 942\np95: 479\nmedian: 98.5"
          },
          {
            "name": "grouping by base class (10 classes)",
            "value": 6893.74,
            "unit": "ms"
          },
          {
            "name": "grouping by base class (10 classes) (P95 of main thread blocks)",
            "value": 5780,
            "unit": "ms",
            "extra": "count: 6\nmax: 5780\np95: 5780\nmedian: 220.5"
          },
          {
            "name": "grouping by multiple attributes",
            "value": 7015.61,
            "unit": "ms"
          },
          {
            "name": "grouping by multiple attributes (P95 of main thread blocks)",
            "value": 372,
            "unit": "ms",
            "extra": "count: 28\nmax: 628\np95: 372\nmedian: 107.5"
          },
          {
            "name": "hide if no children required to finalize root, w/o children",
            "value": 55762.3,
            "unit": "ms"
          },
          {
            "name": "hide if no children required to finalize root, w/o children (P95 of main thread blocks)",
            "value": 65,
            "unit": "ms",
            "extra": "count: 17\nmax: 65\np95: 65\nmedian: 32"
          },
          {
            "name": "hide if no children required to finalize root, w/ children",
            "value": 166.37,
            "unit": "ms"
          },
          {
            "name": "hide if no children required to finalize root, w/ children (P95 of main thread blocks)",
            "value": 24,
            "unit": "ms",
            "extra": "count: 1\nmax: 24\np95: 24\nmedian: 24"
          },
          {
            "name": "models tree initial (Baytown)",
            "value": 37.81,
            "unit": "ms"
          },
          {
            "name": "models tree initial (Baytown) (P95 of main thread blocks)",
            "value": 0,
            "unit": "ms",
            "extra": "count: 0\nmax: N/A\np95: N/A\nmedian: N/A"
          },
          {
            "name": "models tree full (Baytown)",
            "value": 2380.69,
            "unit": "ms"
          },
          {
            "name": "models tree full (Baytown) (P95 of main thread blocks)",
            "value": 162,
            "unit": "ms",
            "extra": "count: 5\nmax: 162\np95: 162\nmedian: 27"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "33428304+jasdom@users.noreply.github.com",
            "name": "Dominykas Jasiūnas",
            "username": "jasdom"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "a36b17930d6d9ca054d398705bf6c4573d309b78",
          "message": "Hierarchy level creation error handling (#502)",
          "timestamp": "2024-03-28T15:31:27Z",
          "tree_id": "a34c7f8d5f7ea46a1facc79642325a216d3aa696",
          "url": "https://github.com/iTwin/presentation/commit/a36b17930d6d9ca054d398705bf6c4573d309b78"
        },
        "date": 1711640040086,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "flat 50k elements list",
            "value": 5388.02,
            "unit": "ms"
          },
          {
            "name": "flat 50k elements list (P95 of main thread blocks)",
            "value": 0,
            "unit": "ms",
            "extra": "count: 0\nmax: N/A\np95: N/A\nmedian: N/A"
          },
          {
            "name": "grouping by label",
            "value": 6291.76,
            "unit": "ms"
          },
          {
            "name": "grouping by label (P95 of main thread blocks)",
            "value": 139,
            "unit": "ms",
            "extra": "count: 26\nmax: 1103\np95: 139\nmedian: 96.5"
          },
          {
            "name": "grouping by class",
            "value": 5946.83,
            "unit": "ms"
          },
          {
            "name": "grouping by class (P95 of main thread blocks)",
            "value": 107,
            "unit": "ms",
            "extra": "count: 24\nmax: 1106\np95: 107\nmedian: 91.5"
          },
          {
            "name": "grouping by property",
            "value": 6597.79,
            "unit": "ms"
          },
          {
            "name": "grouping by property (P95 of main thread blocks)",
            "value": 908,
            "unit": "ms",
            "extra": "count: 19\nmax: 908\np95: 908\nmedian: 98"
          },
          {
            "name": "grouping by base class (10 classes)",
            "value": 6880.41,
            "unit": "ms"
          },
          {
            "name": "grouping by base class (10 classes) (P95 of main thread blocks)",
            "value": 5750,
            "unit": "ms",
            "extra": "count: 4\nmax: 5750\np95: 5750\nmedian: 244.5"
          },
          {
            "name": "grouping by multiple attributes",
            "value": 6985.31,
            "unit": "ms"
          },
          {
            "name": "grouping by multiple attributes (P95 of main thread blocks)",
            "value": 367,
            "unit": "ms",
            "extra": "count: 33\nmax: 621\np95: 367\nmedian: 105"
          },
          {
            "name": "hide if no children required to finalize root, w/o children",
            "value": 54495.76,
            "unit": "ms"
          },
          {
            "name": "hide if no children required to finalize root, w/o children (P95 of main thread blocks)",
            "value": 62,
            "unit": "ms",
            "extra": "count: 18\nmax: 62\np95: 62\nmedian: 33"
          },
          {
            "name": "hide if no children required to finalize root, w/ children",
            "value": 149.59,
            "unit": "ms"
          },
          {
            "name": "hide if no children required to finalize root, w/ children (P95 of main thread blocks)",
            "value": 22,
            "unit": "ms",
            "extra": "count: 1\nmax: 22\np95: 22\nmedian: 22"
          },
          {
            "name": "models tree initial (Baytown)",
            "value": 33.92,
            "unit": "ms"
          },
          {
            "name": "models tree initial (Baytown) (P95 of main thread blocks)",
            "value": 0,
            "unit": "ms",
            "extra": "count: 0\nmax: N/A\np95: N/A\nmedian: N/A"
          },
          {
            "name": "models tree full (Baytown)",
            "value": 2307.11,
            "unit": "ms"
          },
          {
            "name": "models tree full (Baytown) (P95 of main thread blocks)",
            "value": 155,
            "unit": "ms",
            "extra": "count: 4\nmax: 155\np95: 155\nmedian: 30"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "29233962+Yato333@users.noreply.github.com",
            "name": "Dmitrij Kuzmičiov",
            "username": "Yato333"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "f6f6d2ca19f8850a468d0119a4f972cb84936dca",
          "message": "Fix block handler showing incorrect results (#504)\n\nCurrently performance tests do not account for long main thread blocks that last until the end of the test.\r\nNow, before stopping the block handler, we will wait until block handler's callback is run the last time before stopping it.\r\n\r\nBlock handler will now use a much more convenient node's timers/promises/setInterval function which returns an async iterator.\r\nSince blocked library is very simple and doesn't provide anything of value, the dependency will be removed in favor of custom blocking time measuring logic.\r\n\r\nAdditionally, new optional logging will be added which might help the debugging experience:\r\n\r\n- Logging of start and end times of the blocks\r\n- Ability to log \"pings\" of the main thread",
          "timestamp": "2024-04-02T10:42:03+03:00",
          "tree_id": "c89a4892e066a19eabb79e775c9d047adab8e97d",
          "url": "https://github.com/iTwin/presentation/commit/f6f6d2ca19f8850a468d0119a4f972cb84936dca"
        },
        "date": 1712043893370,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "flat 50k elements list",
            "value": 5351.7,
            "unit": "ms"
          },
          {
            "name": "flat 50k elements list (P95 of main thread blocks)",
            "value": 5182,
            "unit": "ms",
            "extra": "count: 1\nmax: 5182\np95: 5182\nmedian: 5182"
          },
          {
            "name": "grouping by label",
            "value": 6068.31,
            "unit": "ms"
          },
          {
            "name": "grouping by label (P95 of main thread blocks)",
            "value": 135,
            "unit": "ms",
            "extra": "count: 24\nmax: 1111\np95: 135\nmedian: 91.5"
          },
          {
            "name": "grouping by class",
            "value": 6039.54,
            "unit": "ms"
          },
          {
            "name": "grouping by class (P95 of main thread blocks)",
            "value": 116,
            "unit": "ms",
            "extra": "count: 23\nmax: 1104\np95: 116\nmedian: 91"
          },
          {
            "name": "grouping by property",
            "value": 6642.31,
            "unit": "ms"
          },
          {
            "name": "grouping by property (P95 of main thread blocks)",
            "value": 492,
            "unit": "ms",
            "extra": "count: 28\nmax: 935\np95: 492\nmedian: 95.5"
          },
          {
            "name": "grouping by base class (10 classes)",
            "value": 6775.15,
            "unit": "ms"
          },
          {
            "name": "grouping by base class (10 classes) (P95 of main thread blocks)",
            "value": 5696,
            "unit": "ms",
            "extra": "count: 5\nmax: 5696\np95: 5696\nmedian: 218"
          },
          {
            "name": "grouping by multiple attributes",
            "value": 7084.46,
            "unit": "ms"
          },
          {
            "name": "grouping by multiple attributes (P95 of main thread blocks)",
            "value": 368,
            "unit": "ms",
            "extra": "count: 31\nmax: 622\np95: 368\nmedian: 106"
          },
          {
            "name": "hide if no children required to finalize root, w/o children",
            "value": 55186.89,
            "unit": "ms"
          },
          {
            "name": "hide if no children required to finalize root, w/o children (P95 of main thread blocks)",
            "value": 70,
            "unit": "ms",
            "extra": "count: 16\nmax: 70\np95: 70\nmedian: 33"
          },
          {
            "name": "hide if no children required to finalize root, w/ children",
            "value": 148.48,
            "unit": "ms"
          },
          {
            "name": "hide if no children required to finalize root, w/ children (P95 of main thread blocks)",
            "value": 21,
            "unit": "ms",
            "extra": "count: 1\nmax: 21\np95: 21\nmedian: 21"
          },
          {
            "name": "models tree initial (Baytown)",
            "value": 38.08,
            "unit": "ms"
          },
          {
            "name": "models tree initial (Baytown) (P95 of main thread blocks)",
            "value": 0,
            "unit": "ms",
            "extra": "count: 0\nmax: N/A\np95: N/A\nmedian: N/A"
          },
          {
            "name": "models tree full (Baytown)",
            "value": 2301.39,
            "unit": "ms"
          },
          {
            "name": "models tree full (Baytown) (P95 of main thread blocks)",
            "value": 160,
            "unit": "ms",
            "extra": "count: 4\nmax: 160\np95: 160\nmedian: 28.5"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "33428304+jasdom@users.noreply.github.com",
            "name": "Dominykas Jasiūnas",
            "username": "jasdom"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "0081e761e3e8224d553fbc2fc43a467283f3c0d5",
          "message": "Unified selection hilite set API (#488)",
          "timestamp": "2024-04-02T11:40:19+03:00",
          "tree_id": "9b840adbe4dee475f0399db85e5006bc6a4e1f60",
          "url": "https://github.com/iTwin/presentation/commit/0081e761e3e8224d553fbc2fc43a467283f3c0d5"
        },
        "date": 1712047394997,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "flat 50k elements list",
            "value": 5483.28,
            "unit": "ms"
          },
          {
            "name": "flat 50k elements list (P95 of main thread blocks)",
            "value": 5271,
            "unit": "ms",
            "extra": "count: 1\nmax: 5271\np95: 5271\nmedian: 5271"
          },
          {
            "name": "grouping by label",
            "value": 6096.93,
            "unit": "ms"
          },
          {
            "name": "grouping by label (P95 of main thread blocks)",
            "value": 140,
            "unit": "ms",
            "extra": "count: 25\nmax: 1124\np95: 140\nmedian: 91"
          },
          {
            "name": "grouping by class",
            "value": 6317.54,
            "unit": "ms"
          },
          {
            "name": "grouping by class (P95 of main thread blocks)",
            "value": 115,
            "unit": "ms",
            "extra": "count: 22\nmax: 1121\np95: 115\nmedian: 94"
          },
          {
            "name": "grouping by property",
            "value": 6902.41,
            "unit": "ms"
          },
          {
            "name": "grouping by property (P95 of main thread blocks)",
            "value": 487,
            "unit": "ms",
            "extra": "count: 31\nmax: 1077\np95: 487\nmedian: 99"
          },
          {
            "name": "grouping by base class (10 classes)",
            "value": 7009.64,
            "unit": "ms"
          },
          {
            "name": "grouping by base class (10 classes) (P95 of main thread blocks)",
            "value": 5921,
            "unit": "ms",
            "extra": "count: 5\nmax: 5921\np95: 5921\nmedian: 222"
          },
          {
            "name": "grouping by multiple attributes",
            "value": 7267.39,
            "unit": "ms"
          },
          {
            "name": "grouping by multiple attributes (P95 of main thread blocks)",
            "value": 432,
            "unit": "ms",
            "extra": "count: 32\nmax: 676\np95: 432\nmedian: 108.5"
          },
          {
            "name": "hide if no children required to finalize root, w/o children",
            "value": 56768.36,
            "unit": "ms"
          },
          {
            "name": "hide if no children required to finalize root, w/o children (P95 of main thread blocks)",
            "value": 68,
            "unit": "ms",
            "extra": "count: 20\nmax: 68\np95: 68\nmedian: 35.5"
          },
          {
            "name": "hide if no children required to finalize root, w/ children",
            "value": 161.1,
            "unit": "ms"
          },
          {
            "name": "hide if no children required to finalize root, w/ children (P95 of main thread blocks)",
            "value": 21,
            "unit": "ms",
            "extra": "count: 1\nmax: 21\np95: 21\nmedian: 21"
          },
          {
            "name": "models tree initial (Baytown)",
            "value": 35.33,
            "unit": "ms"
          },
          {
            "name": "models tree initial (Baytown) (P95 of main thread blocks)",
            "value": 0,
            "unit": "ms",
            "extra": "count: 0\nmax: N/A\np95: N/A\nmedian: N/A"
          },
          {
            "name": "models tree full (Baytown)",
            "value": 2479.07,
            "unit": "ms"
          },
          {
            "name": "models tree full (Baytown) (P95 of main thread blocks)",
            "value": 165,
            "unit": "ms",
            "extra": "count: 6\nmax: 165\np95: 165\nmedian: 37"
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
          "id": "42c8d88fc8421ae7dd203ec8f5132e7a394c8fbc",
          "message": "Hierarchies: Performance fix for Models tree initial load case",
          "timestamp": "2024-04-02T10:21:13Z",
          "tree_id": "ab3ac27fd4929aec1188505ee8fa4d43cab5bd87",
          "url": "https://github.com/iTwin/presentation/commit/42c8d88fc8421ae7dd203ec8f5132e7a394c8fbc"
        },
        "date": 1712053424312,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "flat 50k elements list",
            "value": 5746.08,
            "unit": "ms"
          },
          {
            "name": "flat 50k elements list (P95 of main thread blocks)",
            "value": 5536,
            "unit": "ms",
            "extra": "count: 1\nmax: 5536\np95: 5536\nmedian: 5536"
          },
          {
            "name": "grouping by label",
            "value": 6379.93,
            "unit": "ms"
          },
          {
            "name": "grouping by label (P95 of main thread blocks)",
            "value": 143,
            "unit": "ms",
            "extra": "count: 23\nmax: 1148\np95: 143\nmedian: 95"
          },
          {
            "name": "grouping by class",
            "value": 6321.49,
            "unit": "ms"
          },
          {
            "name": "grouping by class (P95 of main thread blocks)",
            "value": 114,
            "unit": "ms",
            "extra": "count: 21\nmax: 1199\np95: 114\nmedian: 94"
          },
          {
            "name": "grouping by property",
            "value": 7161.26,
            "unit": "ms"
          },
          {
            "name": "grouping by property (P95 of main thread blocks)",
            "value": 496,
            "unit": "ms",
            "extra": "count: 27\nmax: 996\np95: 496\nmedian: 105"
          },
          {
            "name": "grouping by base class (10 classes)",
            "value": 7186.27,
            "unit": "ms"
          },
          {
            "name": "grouping by base class (10 classes) (P95 of main thread blocks)",
            "value": 6036,
            "unit": "ms",
            "extra": "count: 5\nmax: 6036\np95: 6036\nmedian: 219"
          },
          {
            "name": "grouping by multiple attributes",
            "value": 7296.2,
            "unit": "ms"
          },
          {
            "name": "grouping by multiple attributes (P95 of main thread blocks)",
            "value": 377,
            "unit": "ms",
            "extra": "count: 35\nmax: 704\np95: 377\nmedian: 109"
          },
          {
            "name": "hide if no children required to finalize root, w/o children",
            "value": 51819.92,
            "unit": "ms"
          },
          {
            "name": "hide if no children required to finalize root, w/o children (P95 of main thread blocks)",
            "value": 82,
            "unit": "ms",
            "extra": "count: 14\nmax: 82\np95: 82\nmedian: 34.5"
          },
          {
            "name": "hide if no children required to finalize root, w/ children",
            "value": 148.43,
            "unit": "ms"
          },
          {
            "name": "hide if no children required to finalize root, w/ children (P95 of main thread blocks)",
            "value": 23,
            "unit": "ms",
            "extra": "count: 1\nmax: 23\np95: 23\nmedian: 23"
          },
          {
            "name": "models tree initial (Baytown)",
            "value": 35.34,
            "unit": "ms"
          },
          {
            "name": "models tree initial (Baytown) (P95 of main thread blocks)",
            "value": 0,
            "unit": "ms",
            "extra": "count: 0\nmax: N/A\np95: N/A\nmedian: N/A"
          },
          {
            "name": "models tree full (Baytown)",
            "value": 2357.44,
            "unit": "ms"
          },
          {
            "name": "models tree full (Baytown) (P95 of main thread blocks)",
            "value": 150,
            "unit": "ms",
            "extra": "count: 4\nmax: 150\np95: 150\nmedian: 31"
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
          "id": "a5c9edaf334f4ccf2b5f05c36987ed0f5fc706ca",
          "message": "Hierarchies: Hierarchy builder -> Hierarchies (#507)\n\n* Move full stack tests from `hierarchy-builder` to `hierarchies` subfolder\r\n\r\n* Rename test config\r\n\r\n* Update logging namespace\r\n\r\n* Remove regression pipeline\r\n\r\n* Rename full stack tests from \"Stateless hierarchy builder\" to \"Hierarchies\"\r\n\r\n* fix build",
          "timestamp": "2024-04-02T12:59:36Z",
          "tree_id": "2cab0f4b68c2badfba9f2bd6bed21c9f02f5dacf",
          "url": "https://github.com/iTwin/presentation/commit/a5c9edaf334f4ccf2b5f05c36987ed0f5fc706ca"
        },
        "date": 1712062930083,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "flat 50k elements list",
            "value": 5689.37,
            "unit": "ms"
          },
          {
            "name": "flat 50k elements list (P95 of main thread blocks)",
            "value": 5516,
            "unit": "ms",
            "extra": "count: 1\nmax: 5516\np95: 5516\nmedian: 5516"
          },
          {
            "name": "grouping by label",
            "value": 6149.52,
            "unit": "ms"
          },
          {
            "name": "grouping by label (P95 of main thread blocks)",
            "value": 1120,
            "unit": "ms",
            "extra": "count: 20\nmax: 1120\np95: 1120\nmedian: 93.5"
          },
          {
            "name": "grouping by class",
            "value": 6288.41,
            "unit": "ms"
          },
          {
            "name": "grouping by class (P95 of main thread blocks)",
            "value": 105,
            "unit": "ms",
            "extra": "count: 21\nmax: 1105\np95: 105\nmedian: 96"
          },
          {
            "name": "grouping by property",
            "value": 7142.87,
            "unit": "ms"
          },
          {
            "name": "grouping by property (P95 of main thread blocks)",
            "value": 493,
            "unit": "ms",
            "extra": "count: 26\nmax: 1127\np95: 493\nmedian: 101"
          },
          {
            "name": "grouping by base class (10 classes)",
            "value": 7286.52,
            "unit": "ms"
          },
          {
            "name": "grouping by base class (10 classes) (P95 of main thread blocks)",
            "value": 6193,
            "unit": "ms",
            "extra": "count: 4\nmax: 6193\np95: 6193\nmedian: 225"
          },
          {
            "name": "grouping by multiple attributes",
            "value": 7273.7,
            "unit": "ms"
          },
          {
            "name": "grouping by multiple attributes (P95 of main thread blocks)",
            "value": 429,
            "unit": "ms",
            "extra": "count: 29\nmax: 653\np95: 429\nmedian: 107"
          },
          {
            "name": "hide if no children required to finalize root, w/o children",
            "value": 52587.03,
            "unit": "ms"
          },
          {
            "name": "hide if no children required to finalize root, w/o children (P95 of main thread blocks)",
            "value": 71,
            "unit": "ms",
            "extra": "count: 18\nmax: 71\np95: 71\nmedian: 33"
          },
          {
            "name": "hide if no children required to finalize root, w/ children",
            "value": 156.32,
            "unit": "ms"
          },
          {
            "name": "hide if no children required to finalize root, w/ children (P95 of main thread blocks)",
            "value": 0,
            "unit": "ms",
            "extra": "count: 0\nmax: N/A\np95: N/A\nmedian: N/A"
          },
          {
            "name": "models tree initial (Baytown)",
            "value": 38.51,
            "unit": "ms"
          },
          {
            "name": "models tree initial (Baytown) (P95 of main thread blocks)",
            "value": 0,
            "unit": "ms",
            "extra": "count: 0\nmax: N/A\np95: N/A\nmedian: N/A"
          },
          {
            "name": "models tree full (Baytown)",
            "value": 2482.87,
            "unit": "ms"
          },
          {
            "name": "models tree full (Baytown) (P95 of main thread blocks)",
            "value": 172,
            "unit": "ms",
            "extra": "count: 5\nmax: 172\np95: 172\nmedian: 34"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "29233962+Yato333@users.noreply.github.com",
            "name": "Dmitrij Kuzmičiov",
            "username": "Yato333"
          },
          "committer": {
            "email": "noreply@github.com",
            "name": "GitHub",
            "username": "web-flow"
          },
          "distinct": true,
          "id": "af897e528a7b7e75c1dd9bff39b5f204eb90d0b0",
          "message": "Reduce blocking for flat hierarchies (#508)\n\n- Add MainThreadBlockHandler class which helps to release the main thread when sufficient time is passed.\r\n- Add a `setTimeout(..., 0)` after each 100th emitted post-processed node.",
          "timestamp": "2024-04-03T10:36:17+03:00",
          "tree_id": "0882c33d1118de0214ba240805f6f4bef254da27",
          "url": "https://github.com/iTwin/presentation/commit/af897e528a7b7e75c1dd9bff39b5f204eb90d0b0"
        },
        "date": 1712129931164,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "flat 50k elements list",
            "value": 4896.91,
            "unit": "ms"
          },
          {
            "name": "flat 50k elements list (P95 of main thread blocks)",
            "value": 38,
            "unit": "ms",
            "extra": "count: 3\nmax: 38\np95: 38\nmedian: 32"
          },
          {
            "name": "grouping by label",
            "value": 6675.61,
            "unit": "ms"
          },
          {
            "name": "grouping by label (P95 of main thread blocks)",
            "value": 70,
            "unit": "ms",
            "extra": "count: 45\nmax: 234\np95: 70\nmedian: 44"
          },
          {
            "name": "grouping by class",
            "value": 6573.76,
            "unit": "ms"
          },
          {
            "name": "grouping by class (P95 of main thread blocks)",
            "value": 85,
            "unit": "ms",
            "extra": "count: 44\nmax: 204\np95: 85\nmedian: 45.5"
          },
          {
            "name": "grouping by property",
            "value": 7343.94,
            "unit": "ms"
          },
          {
            "name": "grouping by property (P95 of main thread blocks)",
            "value": 175,
            "unit": "ms",
            "extra": "count: 47\nmax: 350\np95: 175\nmedian: 52"
          },
          {
            "name": "grouping by base class (10 classes)",
            "value": 6056.57,
            "unit": "ms"
          },
          {
            "name": "grouping by base class (10 classes) (P95 of main thread blocks)",
            "value": 582,
            "unit": "ms",
            "extra": "count: 7\nmax: 582\np95: 582\nmedian: 115"
          },
          {
            "name": "grouping by multiple attributes",
            "value": 10231.17,
            "unit": "ms"
          },
          {
            "name": "grouping by multiple attributes (P95 of main thread blocks)",
            "value": 122,
            "unit": "ms",
            "extra": "count: 52\nmax: 135\np95: 122\nmedian: 47.5"
          },
          {
            "name": "hide if no children required to finalize root, w/o children",
            "value": 50780.41,
            "unit": "ms"
          },
          {
            "name": "hide if no children required to finalize root, w/o children (P95 of main thread blocks)",
            "value": 38,
            "unit": "ms",
            "extra": "count: 15\nmax: 38\np95: 38\nmedian: 28"
          },
          {
            "name": "hide if no children required to finalize root, w/ children",
            "value": 145.52,
            "unit": "ms"
          },
          {
            "name": "hide if no children required to finalize root, w/ children (P95 of main thread blocks)",
            "value": 23,
            "unit": "ms",
            "extra": "count: 1\nmax: 23\np95: 23\nmedian: 23"
          },
          {
            "name": "models tree initial (Baytown)",
            "value": 39.31,
            "unit": "ms"
          },
          {
            "name": "models tree initial (Baytown) (P95 of main thread blocks)",
            "value": 0,
            "unit": "ms",
            "extra": "count: 0\nmax: N/A\np95: N/A\nmedian: N/A"
          },
          {
            "name": "models tree full (Baytown)",
            "value": 2210.22,
            "unit": "ms"
          },
          {
            "name": "models tree full (Baytown) (P95 of main thread blocks)",
            "value": 155,
            "unit": "ms",
            "extra": "count: 4\nmax: 155\np95: 155\nmedian: 36.5"
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
          "id": "bdd678f67b407d0c4aee84d443a0bca5cec8768e",
          "message": "core-interop: API cleanup, README, LICENSE (#509)",
          "timestamp": "2024-04-03T18:28:46+03:00",
          "tree_id": "17d0c72465a0b623d06cd0e1ffc176e6e507fc04",
          "url": "https://github.com/iTwin/presentation/commit/bdd678f67b407d0c4aee84d443a0bca5cec8768e"
        },
        "date": 1712158277926,
        "tool": "customSmallerIsBetter",
        "benches": [
          {
            "name": "flat 50k elements list",
            "value": 4671.77,
            "unit": "ms"
          },
          {
            "name": "flat 50k elements list (P95 of main thread blocks)",
            "value": 42,
            "unit": "ms",
            "extra": "count: 5\nmax: 42\np95: 42\nmedian: 32"
          },
          {
            "name": "grouping by label",
            "value": 6567.35,
            "unit": "ms"
          },
          {
            "name": "grouping by label (P95 of main thread blocks)",
            "value": 72,
            "unit": "ms",
            "extra": "count: 48\nmax: 206\np95: 72\nmedian: 47.5"
          },
          {
            "name": "grouping by class",
            "value": 6457.11,
            "unit": "ms"
          },
          {
            "name": "grouping by class (P95 of main thread blocks)",
            "value": 117,
            "unit": "ms",
            "extra": "count: 44\nmax: 173\np95: 117\nmedian: 45.5"
          },
          {
            "name": "grouping by property",
            "value": 7321.81,
            "unit": "ms"
          },
          {
            "name": "grouping by property (P95 of main thread blocks)",
            "value": 105,
            "unit": "ms",
            "extra": "count: 50\nmax: 365\np95: 105\nmedian: 47.5"
          },
          {
            "name": "grouping by base class (10 classes)",
            "value": 6188.6,
            "unit": "ms"
          },
          {
            "name": "grouping by base class (10 classes) (P95 of main thread blocks)",
            "value": 654,
            "unit": "ms",
            "extra": "count: 7\nmax: 654\np95: 654\nmedian: 119"
          },
          {
            "name": "grouping by multiple attributes",
            "value": 9981.88,
            "unit": "ms"
          },
          {
            "name": "grouping by multiple attributes (P95 of main thread blocks)",
            "value": 121,
            "unit": "ms",
            "extra": "count: 51\nmax: 134\np95: 121\nmedian: 48"
          },
          {
            "name": "hide if no children required to finalize root, w/o children",
            "value": 50235.26,
            "unit": "ms"
          },
          {
            "name": "hide if no children required to finalize root, w/o children (P95 of main thread blocks)",
            "value": 76,
            "unit": "ms",
            "extra": "count: 13\nmax: 76\np95: 76\nmedian: 27"
          },
          {
            "name": "hide if no children required to finalize root, w/ children",
            "value": 156.11,
            "unit": "ms"
          },
          {
            "name": "hide if no children required to finalize root, w/ children (P95 of main thread blocks)",
            "value": 23,
            "unit": "ms",
            "extra": "count: 1\nmax: 23\np95: 23\nmedian: 23"
          },
          {
            "name": "models tree initial (Baytown)",
            "value": 36.69,
            "unit": "ms"
          },
          {
            "name": "models tree initial (Baytown) (P95 of main thread blocks)",
            "value": 0,
            "unit": "ms",
            "extra": "count: 0\nmax: N/A\np95: N/A\nmedian: N/A"
          },
          {
            "name": "models tree full (Baytown)",
            "value": 2214.09,
            "unit": "ms"
          },
          {
            "name": "models tree full (Baytown) (P95 of main thread blocks)",
            "value": 167,
            "unit": "ms",
            "extra": "count: 4\nmax: 167\np95: 167\nmedian: 34"
          }
        ]
      }
    ]
  }
}