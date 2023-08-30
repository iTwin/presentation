/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { expect } from "chai";
import * as rimraf from "rimraf";
import * as sinon from "sinon";
import { IModelHost } from "@itwin/core-backend";
import { Guid } from "@itwin/core-bentley";
import { IModelApp, NoRenderApp } from "@itwin/core-frontend";
import { Presentation as PresentationBackend, PresentationProps } from "@itwin/presentation-backend";
import { Presentation as PresentationFrontend } from "@itwin/presentation-frontend";
import { HierarchyCacheMode, initialize, PresentationTestingInitProps, terminate } from "../presentation-testing/Helpers";

describe("Helpers", () => {
  let backendInitializationStub: sinon.SinonStub;
  let frontendInitializationStub: sinon.SinonStub;
  let backendTerminationStub: sinon.SinonStub;
  let frontendTerminationStub: sinon.SinonStub;

  beforeEach(() => {
    backendInitializationStub = sinon.stub(PresentationBackend, "initialize");
    frontendInitializationStub = sinon.stub(PresentationFrontend, "initialize");
    backendTerminationStub = sinon.stub(PresentationBackend, "terminate");
    frontendTerminationStub = sinon.stub(PresentationFrontend, "terminate");
    sinon.stub(IModelHost, "startup");
    sinon.stub(NoRenderApp, "startup");
    sinon.stub(IModelApp, "localization").get(() => ({ getLanguageList: () => ["en"] }));
  });

  describe("initialize", () => {
    afterEach(async () => {
      await terminate();
    });

    it("initializes PresentationBackend and PresentationFrontend on initialize", async () => {
      await initialize();
      expect(backendInitializationStub).to.be.calledOnce;
      expect(frontendInitializationStub).to.be.calledOnce;
    });

    it("does not initialize PresentationBackend and PresentationFrontend on second call to initialize", async () => {
      await initialize();
      expect(backendInitializationStub).to.be.calledOnce;
      expect(frontendInitializationStub).to.be.calledOnce;

      sinon.resetHistory();

      await initialize();
      expect(backendInitializationStub).to.not.be.called;
      expect(frontendInitializationStub).to.not.be.called;
    });

    it("initializes PresentationBackend and PresentationFrontend with provided props", async () => {
      const frontendAppStartupSpy = sinon.spy();
      const props: PresentationTestingInitProps = {
        backendProps: { id: Guid.createValue() },
        frontendApp: { startup: frontendAppStartupSpy },
        frontendProps: { presentation: { clientId: Guid.createValue() } },
      };

      await initialize(props);
      expect(backendInitializationStub).to.be.calledOnceWith(props.backendProps);
      expect(frontendInitializationStub).to.be.calledOnceWith(props.frontendProps);
      expect(frontendAppStartupSpy).to.be.calledOnce;
    });
  });

  describe("terminate", () => {
    let rimrafSyncStub: sinon.SinonStub;

    beforeEach(() => {
      rimrafSyncStub = sinon.stub(rimraf, "sync");
    });

    it("terminates PresentationBackend and PresentationFrontend on terminate", async () => {
      await initialize();

      await terminate();
      expect(backendTerminationStub).to.be.calledOnce;
      expect(frontendTerminationStub).to.be.calledOnce;
    });

    it("does not terminate PresentationBackend and PresentationFrontend on second call to terminate", async () => {
      await initialize();

      await terminate();
      expect(backendTerminationStub).to.be.calledOnce;
      expect(frontendTerminationStub).to.be.calledOnce;

      sinon.resetHistory();

      await terminate();
      expect(backendTerminationStub).to.not.be.called;
      expect(frontendTerminationStub).to.not.be.called;
    });

    it("clears cache directory when PresentationBackend has DiskHierarchyCacheConfig in initProps", async () => {
      const testDirectory = "/test/directory/";
      const cachingProps: PresentationProps = { caching: { hierarchies: { mode: HierarchyCacheMode.Disk, directory: testDirectory } } };
      sinon.stub(PresentationBackend, "initProps").get(() => cachingProps);
      await initialize();

      await terminate();
      expect(rimrafSyncStub).to.be.calledOnceWith(testDirectory);
    });

    it("clears cache directory when PresentationBackend has HybridCacheConfig in initProps", async () => {
      const testDirectory = "/test/directory/";
      const cachingProps: PresentationProps = {
        caching: { hierarchies: { mode: HierarchyCacheMode.Hybrid, disk: { mode: HierarchyCacheMode.Disk, directory: testDirectory } } },
      };
      sinon.stub(PresentationBackend, "initProps").get(() => cachingProps);
      await initialize();

      await terminate();
      expect(rimrafSyncStub).to.be.calledOnceWith(testDirectory);
    });
  });
});
