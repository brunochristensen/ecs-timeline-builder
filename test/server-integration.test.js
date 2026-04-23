import { after, before, describe, it } from 'node:test';
import assert from 'node:assert';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import WebSocket from 'ws';

const START_TIMEOUT_MS = 10000;
const MESSAGE_TIMEOUT_MS = 5000;

let port;
let dataDir;
let serverProcess;

class TestClient {
    #queue = [];
    #waiters = [];

    constructor(url) {
        this.ws = new WebSocket(url);
    }

    async connect() {
        this.ws.on('message', (data) => {
            const message = JSON.parse(data.toString());
            const waiterIndex = this.#waiters.findIndex(waiter => waiter.type === message.type && waiter.predicate(message));

            if (waiterIndex >= 0) {
                const [waiter] = this.#waiters.splice(waiterIndex, 1);
                clearTimeout(waiter.timeoutId);
                waiter.resolve(message);
                return;
            }

            this.#queue.push(message);
        });

        await new Promise((resolve, reject) => {
            const onOpen = () => {
                cleanup();
                resolve();
            };
            const onError = (error) => {
                cleanup();
                reject(error);
            };
            const cleanup = () => {
                this.ws.off('open', onOpen);
                this.ws.off('error', onError);
            };

            this.ws.on('open', onOpen);
            this.ws.on('error', onError);
        });
    }

    send(message) {
        this.ws.send(JSON.stringify(message));
    }

    async waitFor(type, predicate = () => true, timeoutMs = MESSAGE_TIMEOUT_MS) {
        const queuedIndex = this.#queue.findIndex(message => message.type === type && predicate(message));
        if (queuedIndex >= 0) {
            return this.#queue.splice(queuedIndex, 1)[0];
        }

        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                this.#waiters = this.#waiters.filter(waiter => waiter.timeoutId !== timeoutId);
                reject(new Error(`Timed out waiting for message type "${type}"`));
            }, timeoutMs);

            this.#waiters.push({ type, predicate, resolve, timeoutId });
        });
    }

    async expectNoMessage(type, timeoutMs = 400) {
        const queuedIndex = this.#queue.findIndex(message => message.type === type);
        if (queuedIndex >= 0) {
            throw new Error(`Unexpected queued message of type "${type}"`);
        }

        await new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                this.#waiters = this.#waiters.filter(waiter => waiter.timeoutId !== timeoutId);
                resolve();
            }, timeoutMs);

            this.#waiters.push({
                type,
                predicate: () => true,
                timeoutId,
                resolve: () => {
                    clearTimeout(timeoutId);
                    reject(new Error(`Unexpected message of type "${type}"`));
                }
            });
        });
    }

    async close() {
        if (this.ws.readyState === WebSocket.CLOSED) return;

        await new Promise((resolve) => {
            this.ws.once('close', resolve);
            this.ws.close();
        });
    }
}

async function createClient() {
    const client = new TestClient(`ws://127.0.0.1:${port}`);
    await client.connect();
    await client.waitFor('TIMELINES_LIST');
    return client;
}

async function waitForServerReady(url, timeoutMs = START_TIMEOUT_MS) {
    const startedAt = Date.now();

    while ((Date.now() - startedAt) < timeoutMs) {
        try {
            const response = await fetch(url);
            if (response.ok) {
                return;
            }
        } catch {
            // Server not ready yet.
        }

        await new Promise(resolve => setTimeout(resolve, 100));
    }

    throw new Error('Timed out waiting for server to become ready');
}

async function stopServer() {
    if (!serverProcess) return;

    await new Promise((resolve) => {
        serverProcess.once('exit', resolve);
        serverProcess.kill('SIGTERM');
    });
}

before(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ecs-timeline-builder-test-'));
    port = 18000 + Math.floor(Math.random() * 1000);

    serverProcess = spawn(process.execPath, ['server.js'], {
        cwd: process.cwd(),
        env: {
            ...process.env,
            PORT: String(port),
            DATA_DIR: dataDir
        },
        stdio: ['ignore', 'pipe', 'pipe']
    });

    const serverErrors = [];
    serverProcess.stderr.on('data', chunk => {
        serverErrors.push(chunk.toString());
    });

    serverProcess.once('exit', (code) => {
        if (code !== 0 && code !== null) {
            console.error(serverErrors.join(''));
        }
    });

    await waitForServerReady(`http://127.0.0.1:${port}/health`);
});

after(async () => {
    await stopServer();
    if (dataDir) {
        await fs.rm(dataDir, { recursive: true, force: true });
    }
});

describe('Server WebSocket integration', () => {
    it('creates a timeline and allows clients to join it', async () => {
        const creator = await createClient();
        const observer = await createClient();

        try {
            creator.send({ type: 'CREATE_TIMELINE', name: 'Integration Timeline', description: 'test' });

            const createdForCreator = await creator.waitFor('TIMELINE_CREATED');
            const createdForObserver = await observer.waitFor('TIMELINE_CREATED');

            assert.strictEqual(createdForCreator.timeline.name, 'Integration Timeline');
            assert.strictEqual(createdForObserver.timeline.id, createdForCreator.timeline.id);

            creator.send({ type: 'JOIN_TIMELINE', timelineId: createdForCreator.timeline.id });
            observer.send({ type: 'JOIN_TIMELINE', timelineId: createdForCreator.timeline.id });

            const joinedCreator = await creator.waitFor('JOINED_TIMELINE');
            const joinedObserver = await observer.waitFor('JOINED_TIMELINE');

            assert.strictEqual(joinedCreator.timelineId, createdForCreator.timeline.id);
            assert.strictEqual(joinedObserver.timelineId, createdForCreator.timeline.id);
            assert.deepStrictEqual(joinedCreator.events, []);
            assert.deepStrictEqual(joinedCreator.annotations, {});
        } finally {
            await creator.close();
            await observer.close();
        }
    });

    it('broadcasts events only within the joined timeline room', async () => {
        const alphaA = await createClient();
        const alphaB = await createClient();
        const beta = await createClient();

        try {
            alphaA.send({ type: 'CREATE_TIMELINE', name: 'Alpha' });
            const alphaCreated = await alphaA.waitFor('TIMELINE_CREATED');
            await alphaB.waitFor('TIMELINE_CREATED');
            await beta.waitFor('TIMELINE_CREATED');

            beta.send({ type: 'CREATE_TIMELINE', name: 'Beta' });
            const betaCreated = await beta.waitFor('TIMELINE_CREATED', message => message.timeline.name === 'Beta');
            await alphaA.waitFor('TIMELINE_CREATED', message => message.timeline.id === betaCreated.timeline.id);
            await alphaB.waitFor('TIMELINE_CREATED', message => message.timeline.id === betaCreated.timeline.id);

            alphaA.send({ type: 'JOIN_TIMELINE', timelineId: alphaCreated.timeline.id });
            alphaB.send({ type: 'JOIN_TIMELINE', timelineId: alphaCreated.timeline.id });
            beta.send({ type: 'JOIN_TIMELINE', timelineId: betaCreated.timeline.id });

            await alphaA.waitFor('JOINED_TIMELINE', message => message.timelineId === alphaCreated.timeline.id);
            await alphaB.waitFor('JOINED_TIMELINE', message => message.timelineId === alphaCreated.timeline.id);
            await beta.waitFor('JOINED_TIMELINE', message => message.timelineId === betaCreated.timeline.id);

            alphaA.send({
                type: 'ADD_EVENTS',
                events: [{
                    _id: 'room-alpha-event',
                    '@timestamp': '2024-01-01T00:00:00.000Z',
                    host: { hostname: 'alpha-host' }
                }]
            });

            const confirmation = await alphaA.waitFor('ADD_CONFIRMED');
            const broadcast = await alphaB.waitFor('EVENTS_ADDED');

            assert.strictEqual(confirmation.count, 1);
            assert.strictEqual(broadcast.events[0]._id, 'room-alpha-event');

            await beta.expectNoMessage('EVENTS_ADDED');
        } finally {
            await alphaA.close();
            await alphaB.close();
            await beta.close();
        }
    });

    it('syncs annotations to other clients in the same timeline', async () => {
        const writer = await createClient();
        const reader = await createClient();

        try {
            writer.send({ type: 'CREATE_TIMELINE', name: 'Annotations' });
            const created = await writer.waitFor('TIMELINE_CREATED');
            await reader.waitFor('TIMELINE_CREATED', message => message.timeline.id === created.timeline.id);

            writer.send({ type: 'JOIN_TIMELINE', timelineId: created.timeline.id });
            reader.send({ type: 'JOIN_TIMELINE', timelineId: created.timeline.id });

            await writer.waitFor('JOINED_TIMELINE');
            await reader.waitFor('JOINED_TIMELINE');

            writer.send({
                type: 'ADD_EVENTS',
                events: [{
                    _id: 'annotated-event',
                    '@timestamp': '2024-02-02T00:00:00.000Z',
                    host: { hostname: 'annotated-host' }
                }]
            });

            await writer.waitFor('ADD_CONFIRMED');
            await reader.waitFor('EVENTS_ADDED');

            writer.send({
                type: 'ANNOTATE_EVENT',
                eventId: 'annotated-event',
                comment: 'Needs review',
                mitreTactic: 'TA0001',
                mitreTechnique: 'T1078'
            });

            const annotationUpdate = await reader.waitFor('ANNOTATION_UPDATED');

            assert.strictEqual(annotationUpdate.eventId, 'annotated-event');
            assert.strictEqual(annotationUpdate.annotation.comment, 'Needs review');
            assert.strictEqual(annotationUpdate.annotation.mitreTactic, 'TA0001');
        } finally {
            await writer.close();
            await reader.close();
        }
    });

    it('notifies joined clients when the active timeline is deleted and rejects further room-scoped writes', async () => {
        const owner = await createClient();
        const peer = await createClient();

        try {
            owner.send({ type: 'CREATE_TIMELINE', name: 'Delete Me' });
            const created = await owner.waitFor('TIMELINE_CREATED');
            await peer.waitFor('TIMELINE_CREATED', message => message.timeline.id === created.timeline.id);

            owner.send({ type: 'JOIN_TIMELINE', timelineId: created.timeline.id });
            peer.send({ type: 'JOIN_TIMELINE', timelineId: created.timeline.id });

            await owner.waitFor('JOINED_TIMELINE');
            await peer.waitFor('JOINED_TIMELINE');

            owner.send({ type: 'DELETE_TIMELINE', timelineId: created.timeline.id });

            const deletedForOwner = await owner.waitFor('TIMELINE_DELETED', message => message.timelineId === created.timeline.id);
            const deletedForPeer = await peer.waitFor('TIMELINE_DELETED', message => message.timelineId === created.timeline.id);

            assert.strictEqual(deletedForOwner.timelineId, created.timeline.id);
            assert.strictEqual(deletedForPeer.timelineId, created.timeline.id);
            await owner.expectNoMessage('TIMELINE_DELETED');
            await peer.expectNoMessage('TIMELINE_DELETED');

            peer.send({
                type: 'ADD_EVENTS',
                events: [{
                    _id: 'after-delete',
                    '@timestamp': '2024-03-03T00:00:00.000Z',
                    host: { hostname: 'ghost-host' }
                }]
            });

            const error = await peer.waitFor('ERROR');
            assert.strictEqual(error.message, 'ADD_EVENTS: not in a timeline');
        } finally {
            await owner.close();
            await peer.close();
        }
    });

    it('rejects invalid timeline metadata and accepts normalized create defaults', async () => {
        const client = await createClient();

        try {
            client.send({type: 'CREATE_TIMELINE'});
            const defaultCreated = await client.waitFor('TIMELINE_CREATED');
            assert.strictEqual(defaultCreated.timeline.name, 'Untitled Timeline');
            assert.strictEqual(defaultCreated.timeline.description, '');

            client.send({type: 'CREATE_TIMELINE', name: {bad: true}});
            const invalidCreate = await client.waitFor('ERROR');
            assert.strictEqual(invalidCreate.message, 'CREATE_TIMELINE: invalid name');

            client.send({
                type: 'UPDATE_TIMELINE',
                timelineId: defaultCreated.timeline.id,
                description: {bad: true}
            });
            const invalidUpdate = await client.waitFor('ERROR');
            assert.strictEqual(invalidUpdate.message, 'UPDATE_TIMELINE: invalid description');

            client.send({
                type: 'UPDATE_TIMELINE',
                timelineId: defaultCreated.timeline.id,
                name: ' Renamed Timeline ',
                description: ' trimmed '
            });

            const updated = await client.waitFor('TIMELINE_UPDATED', message => message.timeline.id === defaultCreated.timeline.id);
            assert.strictEqual(updated.timeline.name, 'Renamed Timeline');
            assert.strictEqual(updated.timeline.description, 'trimmed');
        } finally {
            await client.close();
        }
    });
});
