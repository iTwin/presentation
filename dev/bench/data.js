window.BENCHMARK_DATA = {
  "lastUpdate": 1701942666818,
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
      }
    ]
  }
}