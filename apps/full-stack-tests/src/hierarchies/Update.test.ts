/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import * as fs from "fs";
import { collect } from "presentation-test-utilities";
import { afterAll, afterEach, beforeAll, beforeEach, describe, it } from "vitest";
import {
  Element,
  ElementOwnsExternalSourceAspects,
  ElementRefersToElements,
  ExternalSourceAspect,
  IpcHost,
  PhysicalModel,
  PhysicalPartition,
  StandaloneDb,
  Subject,
  SubjectOwnsPartitionElements,
  SubjectOwnsSubjects,
  withEditTxn,
} from "@itwin/core-backend";
import { BeEvent, Guid, OpenMode } from "@itwin/core-bentley";
import {
  BisCodeSpec,
  EmptyLocalization,
  IModel,
  IModelReadRpcInterface,
  RpcConfiguration,
  RpcManager,
} from "@itwin/core-common";
import { BriefcaseConnection, IpcApp, NullRenderSystem } from "@itwin/core-frontend";
import { ECSchemaRpcInterface } from "@itwin/ecschema-rpcinterface-common";
import { ECSchemaRpcImpl } from "@itwin/ecschema-rpcinterface-impl";
import { registerTxnListeners } from "@itwin/presentation-core-interop";
import { ECSql, normalizeFullClassName } from "@itwin/presentation-shared";
import { createFileNameFromString, setupOutputFileLocation } from "../FilenameUtils.js";
import { NodeValidators, validateHierarchyLevel } from "./HierarchyValidation.js";
import { createClassECSqlSelector, createIModelAccess, createProvider } from "./Utils.js";

import type { Id64String } from "@itwin/core-bentley";
import type {
  ExternalSourceAspectProps,
  IpcListener,
  IpcSocketBackend,
  IpcSocketFrontend,
  RelationshipProps,
  RemoveFunction,
} from "@itwin/core-common";
import type { HierarchyDefinition } from "@itwin/presentation-hierarchies";

describe("Hierarchies", () => {
  describe("Updating hierarchies upon iModel change", () => {
    let db: StandaloneDb;
    let connection: BriefcaseConnection;

    beforeAll(async () => {
      const socket = new TestSocket();
      await IpcHost.startup({ ipcHost: { socket }, iModelHost: { profileName: Guid.createValue() } });

      // eslint-disable-next-line @itwin/no-internal
      RpcManager.registerImpl(ECSchemaRpcInterface, ECSchemaRpcImpl);
      await IpcApp.startup(socket, {
        iModelApp: {
          // eslint-disable-next-line @itwin/no-internal
          renderSys: new NullRenderSystem(),
          noRender: true,
          localization: new EmptyLocalization(),
        },
      });
      RpcConfiguration.developmentMode = true;
      // eslint-disable-next-line @itwin/no-internal
      RpcManager.initializeInterface(IModelReadRpcInterface);
      // eslint-disable-next-line @itwin/no-internal
      RpcManager.initializeInterface(ECSchemaRpcInterface);
    });

    afterAll(async () => {
      // eslint-disable-next-line @itwin/no-internal
      await IpcApp.shutdown();
      await IpcHost.shutdown();
    });

    beforeEach(async (ctx) => {
      const fileName = createFileNameFromString(ctx.task.name);
      const filePath = setupOutputFileLocation(fileName);

      if (fs.existsSync(filePath)) {
        fs.rmSync(filePath);
      }
      db = StandaloneDb.createEmpty(filePath, {
        rootSubject: { name: fileName },
        allowEdit: JSON.stringify({ txns: true }),
      });
      db.close();

      // we want connection to point to the exact same imodel and the only way to do this is to first open
      // connection and only then open the db
      connection = await BriefcaseConnection.openStandalone(filePath, OpenMode.ReadWrite);
      db = StandaloneDb.findByKey(connection.key);
    });

    afterEach(async () => {
      const filePath = db.pathName;
      await connection.close();
      db.close();
      fs.rmSync(filePath);
    });

    [
      { name: "on the backend", getIModel: () => db },
      { name: "on the frontend", getIModel: () => connection },
    ].forEach(({ name, getIModel }) => {
      describe(name, () => {
        let imodel: StandaloneDb | BriefcaseConnection;
        beforeEach(() => {
          imodel = getIModel();
        });

        it("updates hierarchy when an element is inserted", async () => {
          const provider = createRootSubjectChildrenProvider();
          validateHierarchyLevel({ nodes: await collect(provider.getNodes({ parentNode: undefined })), expect: [] });

          const subjectId = insertSubject("0x1", "test subject");

          validateHierarchyLevel({
            nodes: await collect(provider.getNodes({ parentNode: undefined })),
            expect: [
              NodeValidators.createForInstanceNode({
                instanceKeys: [{ className: normalizeFullClassName(Subject.classFullName), id: subjectId }],
              }),
            ],
          });
        });

        it("updates hierarchy when an element is updated", async () => {
          const subjectId = insertSubject("0x1", "test subject");

          const provider = createRootSubjectChildrenProvider();
          validateHierarchyLevel({
            nodes: await collect(provider.getNodes({ parentNode: undefined })),
            expect: [
              NodeValidators.createForInstanceNode({
                instanceKeys: [{ className: normalizeFullClassName(Subject.classFullName), id: subjectId }],
                label: "test subject",
              }),
            ],
          });

          updateSubject(subjectId, "modified label");

          validateHierarchyLevel({
            nodes: await collect(provider.getNodes({ parentNode: undefined })),
            expect: [
              NodeValidators.createForInstanceNode({
                instanceKeys: [{ className: normalizeFullClassName(Subject.classFullName), id: subjectId }],
                label: "modified label",
              }),
            ],
          });
        });

        it("updates hierarchy when an element is deleted", async () => {
          const subjectId = insertSubject("0x1", "test subject");

          const provider = createRootSubjectChildrenProvider();
          validateHierarchyLevel({
            nodes: await collect(provider.getNodes({ parentNode: undefined })),
            expect: [
              NodeValidators.createForInstanceNode({
                instanceKeys: [{ className: normalizeFullClassName(Subject.classFullName), id: subjectId }],
                label: "test subject",
              }),
            ],
          });

          deleteElement(subjectId);

          validateHierarchyLevel({ nodes: await collect(provider.getNodes({ parentNode: undefined })), expect: [] });
        });

        it("updates hierarchy when an aspect is inserted", async () => {
          const subjectId = insertSubject("0x1", "test subject");

          const provider = createRootSubjectChildrenProvider({ label: "aspectIdentifier" });
          validateHierarchyLevel({
            nodes: await collect(provider.getNodes({ parentNode: undefined })),
            expect: [
              NodeValidators.createForInstanceNode({
                instanceKeys: [{ className: normalizeFullClassName(Subject.classFullName), id: subjectId }],
                label: "",
              }),
            ],
          });

          insertExternalSourceAspect(subjectId, "test aspect");

          validateHierarchyLevel({
            nodes: await collect(provider.getNodes({ parentNode: undefined })),
            expect: [
              NodeValidators.createForInstanceNode({
                instanceKeys: [{ className: normalizeFullClassName(Subject.classFullName), id: subjectId }],
                label: "test aspect",
              }),
            ],
          });
        });

        it("updates hierarchy when an aspect is updated", async () => {
          const subjectId = insertSubject("0x1", "test subject");
          const aspectId = insertExternalSourceAspect(subjectId, "test aspect");

          const provider = createRootSubjectChildrenProvider({ label: "aspectIdentifier" });
          validateHierarchyLevel({
            nodes: await collect(provider.getNodes({ parentNode: undefined })),
            expect: [
              NodeValidators.createForInstanceNode({
                instanceKeys: [{ className: normalizeFullClassName(Subject.classFullName), id: subjectId }],
                label: "test aspect",
              }),
            ],
          });

          updateExternalSourceAspect(aspectId, "modified aspect");

          validateHierarchyLevel({
            nodes: await collect(provider.getNodes({ parentNode: undefined })),
            expect: [
              NodeValidators.createForInstanceNode({
                instanceKeys: [{ className: normalizeFullClassName(Subject.classFullName), id: subjectId }],
                label: "modified aspect",
              }),
            ],
          });
        });

        it("updates hierarchy when an aspect is deleted", async () => {
          const subjectId = insertSubject("0x1", "test subject");
          const aspectId = insertExternalSourceAspect(subjectId, "test aspect");

          const provider = createRootSubjectChildrenProvider({ label: "aspectIdentifier" });
          validateHierarchyLevel({
            nodes: await collect(provider.getNodes({ parentNode: undefined })),
            expect: [
              NodeValidators.createForInstanceNode({
                instanceKeys: [{ className: normalizeFullClassName(Subject.classFullName), id: subjectId }],
                label: "test aspect",
              }),
            ],
          });

          deleteAspect(aspectId);

          validateHierarchyLevel({
            nodes: await collect(provider.getNodes({ parentNode: undefined })),
            expect: [
              NodeValidators.createForInstanceNode({
                instanceKeys: [{ className: normalizeFullClassName(Subject.classFullName), id: subjectId }],
                label: "",
              }),
            ],
          });
        });

        it("updates hierarchy when a model is inserted", async () => {
          const partitionId = insertPhysicalPartition("0x1");

          const provider = createPhysicalModelsProvider();
          validateHierarchyLevel({ nodes: await collect(provider.getNodes({ parentNode: undefined })), expect: [] });

          const modelId = insertPhysicalModel(partitionId, false);

          validateHierarchyLevel({
            nodes: await collect(provider.getNodes({ parentNode: undefined })),
            expect: [
              NodeValidators.createForInstanceNode({
                instanceKeys: [{ className: normalizeFullClassName(PhysicalModel.classFullName), id: modelId }],
              }),
            ],
          });
        });

        it("updates hierarchy when a model is updated", async () => {
          const partitionId = insertPhysicalPartition("0x1", "test");
          const modelId = insertPhysicalModel(partitionId, false);

          const provider = createPhysicalModelsProvider();
          validateHierarchyLevel({
            nodes: await collect(provider.getNodes({ parentNode: undefined })),
            expect: [
              NodeValidators.createForInstanceNode({
                instanceKeys: [{ className: normalizeFullClassName(PhysicalModel.classFullName), id: modelId }],
                label: "test. IsPrivate: false",
              }),
            ],
          });

          updatePhysicalModel(modelId, true);

          validateHierarchyLevel({
            nodes: await collect(provider.getNodes({ parentNode: undefined })),
            expect: [
              NodeValidators.createForInstanceNode({
                instanceKeys: [{ className: normalizeFullClassName(PhysicalModel.classFullName), id: modelId }],
                label: "test. IsPrivate: true",
              }),
            ],
          });
        });

        it("updates hierarchy when a model is deleted", async () => {
          const partitionId = insertPhysicalPartition("0x1");
          const modelId = insertPhysicalModel(partitionId, false);

          const provider = createPhysicalModelsProvider();
          validateHierarchyLevel({
            nodes: await collect(provider.getNodes({ parentNode: undefined })),
            expect: [
              NodeValidators.createForInstanceNode({
                instanceKeys: [{ className: normalizeFullClassName(PhysicalModel.classFullName), id: modelId }],
              }),
            ],
          });

          deleteModel(modelId);

          validateHierarchyLevel({ nodes: await collect(provider.getNodes({ parentNode: undefined })), expect: [] });
        });

        /** The test crashes when trying to insert the ElementRefersToElements relationship */
        it.skip("updates hierarchy when a many-to-many relationship is inserted", async function () {
          const subjectId = insertSubject("0x1", "test subject");

          const provider = createRootSubjectReferredElementsProvider();
          validateHierarchyLevel({ nodes: await collect(provider.getNodes({ parentNode: undefined })), expect: [] });

          insertElementRefersToElementRelationship("0x1", subjectId);

          validateHierarchyLevel({
            nodes: await collect(provider.getNodes({ parentNode: undefined })),
            expect: [
              NodeValidators.createForInstanceNode({
                instanceKeys: [{ className: normalizeFullClassName(Subject.classFullName), id: subjectId }],
              }),
            ],
          });
        });

        /** The test crashes when trying to insert the ElementRefersToElements relationship */
        it.skip("updates hierarchy when a many-to-many relationship is updated", async function () {
          const subject1Id = insertSubject("0x1", "test subject 1");
          const subject2Id = insertSubject("0x1", "test subject 2");
          const relationshipProps = insertElementRefersToElementRelationship("0x1", subject1Id);

          const provider = createRootSubjectReferredElementsProvider();
          validateHierarchyLevel({
            nodes: await collect(provider.getNodes({ parentNode: undefined })),
            expect: [
              NodeValidators.createForInstanceNode({
                instanceKeys: [{ className: normalizeFullClassName(Subject.classFullName), id: subject1Id }],
              }),
            ],
          });

          updateElementRefersToElementRelationship({ ...relationshipProps, targetId: subject2Id });

          validateHierarchyLevel({
            nodes: await collect(provider.getNodes({ parentNode: undefined })),
            expect: [
              NodeValidators.createForInstanceNode({
                instanceKeys: [{ className: normalizeFullClassName(Subject.classFullName), id: subject2Id }],
              }),
            ],
          });
        });

        /** The test crashes when trying to insert the ElementRefersToElements relationship */
        it.skip("updates hierarchy when a many-to-many relationship is deleted", async function () {
          const subjectId = insertSubject("0x1", "test subject");
          const relationshipProps = insertElementRefersToElementRelationship("0x1", subjectId);

          const provider = createRootSubjectReferredElementsProvider();
          validateHierarchyLevel({
            nodes: await collect(provider.getNodes({ parentNode: undefined })),
            expect: [
              NodeValidators.createForInstanceNode({
                instanceKeys: [{ className: normalizeFullClassName(Subject.classFullName), id: subjectId }],
              }),
            ],
          });

          deleteRelationship(relationshipProps);

          validateHierarchyLevel({ nodes: await collect(provider.getNodes({ parentNode: undefined })), expect: [] });
        });

        function createRootSubjectChildrenProvider(
          props: { label: "codeValue" | "aspectIdentifier" } = { label: "codeValue" },
        ) {
          const hierarchy: HierarchyDefinition = {
            async defineHierarchyLevel({ createSelectClause }) {
              return [
                {
                  fullClassName: normalizeFullClassName(Subject.classFullName),
                  query: {
                    ecsql: `
                      SELECT ${await createSelectClause({
                        ecClassId: { selector: `this.ECClassId` },
                        ecInstanceId: { selector: `this.ECInstanceId` },
                        nodeLabel: { selector: props.label === "codeValue" ? `this.CodeValue` : `aspect.Identifier` },
                      })}
                      FROM ${createClassECSqlSelector(Subject.classFullName)} AS this
                      LEFT JOIN ${createClassECSqlSelector(ExternalSourceAspect.classFullName)} AS aspect ON aspect.Element.Id = this.ECInstanceId
                      WHERE this.Parent.Id = 0x1
                    `,
                  },
                },
              ];
            },
          };
          const imodelChanged = new BeEvent();
          const provider = createProvider({ imodel, imodelChanged, hierarchy });
          registerTxnListeners(imodel.txns, () => imodelChanged.raiseEvent());
          return provider;
        }

        function createRootSubjectReferredElementsProvider() {
          const hierarchy: HierarchyDefinition = {
            async defineHierarchyLevel({ createSelectClause }) {
              return [
                {
                  fullClassName: normalizeFullClassName(Element.classFullName),
                  query: {
                    ecsql: `
                      SELECT ${await createSelectClause({
                        ecClassId: { selector: `this.ECClassId` },
                        ecInstanceId: { selector: `this.ECInstanceId` },
                        nodeLabel: { selector: `this.CodeValue` },
                      })}
                      FROM ${createClassECSqlSelector(Element.classFullName)} AS this
                      JOIN ${createClassECSqlSelector(ElementRefersToElements.classFullName)} AS rel ON rel.TargetECInstanceId = this.ECInstanceId
                      WHERE rel.SourceECInstanceId = 0x1
                    `,
                  },
                },
              ];
            },
          };
          const imodelChanged = new BeEvent();
          const provider = createProvider({ imodel, imodelChanged, hierarchy });
          registerTxnListeners(imodel.txns, () => imodelChanged.raiseEvent());
          return provider;
        }

        function createPhysicalModelsProvider() {
          const imodelAccess = createIModelAccess(imodel);
          const hierarchy: HierarchyDefinition = {
            async defineHierarchyLevel({ createSelectClause }) {
              return [
                {
                  fullClassName: normalizeFullClassName(Subject.classFullName),
                  query: {
                    ecsql: `
                      SELECT ${await createSelectClause({
                        ecClassId: { selector: `this.ECClassId` },
                        ecInstanceId: { selector: `this.ECInstanceId` },
                        nodeLabel: {
                          selector: ECSql.createConcatenatedValueJsonSelector([
                            await ECSql.createPrimitivePropertyValueSelectorProps({
                              schemaProvider: imodelAccess,
                              propertyClassName: normalizeFullClassName(Element.classFullName),
                              propertyClassAlias: "modeledElement",
                              propertyName: "CodeValue",
                            }),
                            { type: "String", value: ". IsPrivate: " },
                            await ECSql.createPrimitivePropertyValueSelectorProps({
                              schemaProvider: imodelAccess,
                              propertyClassName: normalizeFullClassName(PhysicalModel.classFullName),
                              propertyClassAlias: "this",
                              propertyName: "IsPrivate",
                            }),
                          ]),
                        },
                      })}
                      FROM ${createClassECSqlSelector(PhysicalModel.classFullName)} AS this
                      JOIN ${createClassECSqlSelector(Element.classFullName)} AS modeledElement ON modeledElement.ECInstanceId = this.ModeledElement.Id
                    `,
                  },
                },
              ];
            },
          };
          const imodelChanged = new BeEvent();
          const provider = createProvider({ imodel, imodelChanged, hierarchy });
          registerTxnListeners(imodel.txns, () => imodelChanged.raiseEvent());
          return provider;
        }

        function insertSubject(parentId: Id64String, codeValue: string) {
          return withEditTxn(db, (txn) => {
            return txn.insertElement({
              classFullName: "BisCore.Subject",
              model: IModel.repositoryModelId,
              parent: { id: parentId, relClassName: SubjectOwnsSubjects.classFullName },
              code: { scope: parentId, spec: db.codeSpecs.getByName(BisCodeSpec.subject).id, value: codeValue },
            });
          });
        }

        function updateSubject(subjectId: Id64String, newCodeValue: string) {
          const props = db.elements.getElementProps(subjectId);
          withEditTxn(db, (txn) => {
            txn.updateElement({ ...props, code: { ...props.code, value: newCodeValue } });
          });
        }

        function deleteElement(subjectId: Id64String) {
          withEditTxn(db, (txn) => {
            txn.deleteElement(subjectId);
          });
        }

        function insertExternalSourceAspect(elementId: Id64String, identifier: string) {
          return withEditTxn(db, (txn) => {
            return txn.insertAspect({
              classFullName: ExternalSourceAspect.classFullName,
              element: { relClassName: ElementOwnsExternalSourceAspects.classFullName, id: elementId },
              identifier,
            } as ExternalSourceAspectProps);
          });
        }

        function updateExternalSourceAspect(aspectId: Id64String, newIdentifier: string) {
          const props = db.elements.getAspect(aspectId).toJSON();
          withEditTxn(db, (txn) => {
            txn.updateAspect({ ...props, identifier: newIdentifier } as ExternalSourceAspectProps);
          });
        }

        function deleteAspect(aspectId: Id64String) {
          withEditTxn(db, (txn) => {
            txn.deleteAspect(aspectId);
          });
        }

        function insertPhysicalPartition(parentSubjectId: Id64String, codeValue = "test partition") {
          return withEditTxn(db, (txn) => {
            return txn.insertElement({
              classFullName: PhysicalPartition.classFullName,
              model: IModel.repositoryModelId,
              parent: { id: parentSubjectId, relClassName: SubjectOwnsPartitionElements.classFullName },
              code: {
                scope: parentSubjectId,
                spec: db.codeSpecs.getByName(BisCodeSpec.informationPartitionElement).id,
                value: codeValue,
              },
            });
          });
        }

        function insertPhysicalModel(modeledElementId: Id64String, isPrivate: boolean) {
          return withEditTxn(db, (txn) => {
            return txn.insertModel({
              classFullName: PhysicalModel.classFullName,
              modeledElement: { id: modeledElementId },
              isPrivate,
            });
          });
        }

        function updatePhysicalModel(modelId: Id64String, newIsPrivate: boolean) {
          const props = db.models.getModelProps(modelId);
          withEditTxn(db, (txn) => {
            txn.updateModel({ ...props, isPrivate: newIsPrivate });
          });
        }

        function deleteModel(modelId: Id64String) {
          withEditTxn(db, (txn) => {
            txn.deleteModel(modelId);
          });
        }

        function insertElementRefersToElementRelationship(
          sourceId: Id64String,
          targetId: Id64String,
        ): RelationshipProps {
          return withEditTxn(db, (txn) => {
            const props: RelationshipProps = {
              classFullName: ElementRefersToElements.classFullName,
              sourceId,
              targetId,
            };
            const id = txn.insertRelationship(props);
            return { ...props, id };
          });
        }

        function updateElementRefersToElementRelationship(props: RelationshipProps) {
          withEditTxn(db, (txn) => {
            txn.updateRelationship(props);
          });
        }

        function deleteRelationship(props: RelationshipProps) {
          withEditTxn(db, (txn) => {
            txn.deleteRelationship(props);
          });
        }
      });
    });
  });

  class TestSocket implements IpcSocketBackend, IpcSocketFrontend {
    private _handlers = new Map<string, (...args: any[]) => Promise<any>>();
    private _listeners = new Map<string, IpcListener[]>();

    /**
     * Send a message to the backend via `channel` and expect a result asynchronously.
     * @param channel The name of the channel for the method.  Must begin with the [[iTwinChannel]] prefix.
     * @see Electron [ipcRenderer.invoke](https://www.electronjs.org/docs/api/ipc-renderer) documentation for details.
     * Note that this interface *may* be implemented via Electron for desktop apps, or via
     * [WebSockets](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API) for mobile or web-based
     * Ipc connections. In either case, the Electron documentation provides the specifications for how it works.
     * @note `args` are serialized with the [Structured Clone Algorithm](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm), so only
     * primitive types and `ArrayBuffers` are allowed.
     */
    public async invoke(channel: string, ...args: any[]): Promise<any> {
      const handler = this._handlers.get(channel);
      if (!handler) {
        throw new Error(`no handler for channel "${channel}"`);
      }
      return handler({}, ...args);
    }

    /**
     * Establish a backend implementation of an Ipc interface for a channel.
     * @param channel The name of the channel for this handler. Must begin with the [[iTwinChannel]] prefix.
     * @param handler A function that supplies the implementation for methods invoked over `channel` via [[IpcSocketFrontend.invoke]]
     * @note returns A function to call to remove the handler.
     */
    public handle(channel: string, handler: (...args: any[]) => Promise<any>): RemoveFunction {
      this._handlers.set(channel, handler);
      return () => {
        this._handlers.delete(channel);
      };
    }

    /**
     * Send a message over the socket.
     * @param channel The name of the channel for the message. Must begin with the [[iTwinChannel]] prefix.
     * @param data The optional data of the message.
     * @note `data` is serialized with the [Structured Clone Algorithm](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm), so only
     * primitive types and `ArrayBuffers` are allowed.
     */
    public send(channel: string, ...data: any[]): void {
      const listeners = this._listeners.get(channel);
      if (!listeners) {
        return;
      }
      listeners.forEach((l) => l({} as Event, ...data));
    }

    /**
     * Establish a handler to receive messages for a channel through a socket.
     * @param channel The name of the channel for the messages. Must begin with the [[iTwinChannel]] prefix.
     * @param listener A function called when messages are sent over `channel`
     * @note returns A function to call to remove the listener.
     */
    public addListener(channel: string, listener: IpcListener): RemoveFunction {
      let listeners = this._listeners.get(channel);
      if (!listeners) {
        listeners = [];
        this._listeners.set(channel, listeners);
      }
      listeners.push(listener);
      return () => {
        this.removeListener(channel, listener);
      };
    }

    /**
     * Remove a previously registered listener
     * @param channel The name of the channel for the listener previously registered with [[addListener]]
     * @param listener The function passed to [[addListener]]
     */
    public removeListener(channel: string, listener: IpcListener): void {
      const listeners = this._listeners.get(channel);
      if (!listeners) {
        return;
      }
      const index = listeners.findIndex((l) => l === listener);
      if (index !== -1) {
        listeners.splice(index, 1);
      }
    }
  }
});
