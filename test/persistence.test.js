import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

let dataDir;
let persistence;
let TimelineManager;

async function resetDataDir() {
    await fs.rm(dataDir, { recursive: true, force: true });
    await fs.mkdir(dataDir, { recursive: true });
}

before(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ecs-timeline-persistence-'));
    process.env.DATA_DIR = dataDir;

    persistence = await import(`../server/persistence.js?test=${Date.now()}-${Math.random()}`);
    ({ TimelineManager } = await import(`../server/timeline-manager.js?test=${Date.now()}-${Math.random()}`));
});

beforeEach(async () => {
    await resetDataDir();
});

after(async () => {
    await fs.rm(dataDir, { recursive: true, force: true });
    delete process.env.DATA_DIR;
});

describe('persistence', () => {
    it('loads an empty timeline index when no files exist', async () => {
        const index = await persistence.loadTimelineIndex();
        assert.deepStrictEqual(index, { timelines: [] });
    });

    it('saves and reloads the timeline index', async () => {
        const index = {
            timelines: [
                { id: 'alpha', name: 'Alpha', description: '', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }
            ]
        };

        const saved = await persistence.saveTimelineIndex(index);
        const loaded = await persistence.loadTimelineIndex();

        assert.strictEqual(saved, true);
        assert.deepStrictEqual(loaded, index);
    });

    it('saves and reloads timeline data', async () => {
        const events = [{ _id: 'evt-1', '@timestamp': '2026-01-01T00:00:00.000Z' }];
        const annotations = {
            'evt-1': { eventId: 'evt-1', comment: 'note', mitreTactic: 'TA0001', mitreTechnique: '', updatedAt: 1 }
        };

        const saved = await persistence.saveTimelineData('alpha', events, annotations);
        const loaded = await persistence.loadTimelineData('alpha');

        assert.strictEqual(saved, true);
        assert.deepStrictEqual(loaded, { events, annotations });
    });

    it('deletes a timeline data file', async () => {
        await persistence.saveTimelineData('alpha', [{ _id: 'evt-1' }], {});

        const deleted = await persistence.deleteTimelineData('alpha');
        const loaded = await persistence.loadTimelineData('alpha');

        assert.strictEqual(deleted, true);
        assert.deepStrictEqual(loaded, { events: [], annotations: {} });
    });
});

describe('TimelineManager', () => {
    it('creates and lists timelines after initialization', async () => {
        const manager = new TimelineManager();
        await manager.initialize();

        const created = await manager.createTimeline('Incident A', 'initial');
        const listed = manager.listTimelines();

        assert.strictEqual(listed.length, 1);
        assert.strictEqual(listed[0].id, created.id);
        assert.strictEqual(listed[0].name, 'Incident A');
    });

    it('lazy-loads stores and reuses the same in-memory instance', async () => {
        const manager = new TimelineManager();
        await manager.initialize();
        const timeline = await manager.createTimeline('Incident B');

        const storeA = await manager.getStore(timeline.id);
        const storeB = await manager.getStore(timeline.id);

        assert.ok(storeA);
        assert.strictEqual(storeA, storeB);
        assert.deepStrictEqual(manager.getLoadedStoreIds(), [timeline.id]);
    });

    it('saves dirty timeline data through saveAll', async () => {
        const manager = new TimelineManager();
        await manager.initialize();
        const timeline = await manager.createTimeline('Incident C');
        const store = await manager.getStore(timeline.id);

        store.addEvents([{ _id: 'evt-1', '@timestamp': '2026-01-01T00:00:00.000Z' }]);
        store.setAnnotation('evt-1', { comment: 'saved' });
        manager.markDirty(timeline.id);

        const savedCount = await manager.saveAll();
        const loaded = await persistence.loadTimelineData(timeline.id);

        assert.strictEqual(savedCount, 1);
        assert.strictEqual(loaded.events.length, 1);
        assert.strictEqual(loaded.annotations['evt-1'].comment, 'saved');
        assert.strictEqual(manager.hasDirtyTimelines(), false);
    });

    it('deletes timeline metadata and data files', async () => {
        const manager = new TimelineManager();
        await manager.initialize();
        const timeline = await manager.createTimeline('Incident D');
        const store = await manager.getStore(timeline.id);

        store.addEvents([{ _id: 'evt-1' }]);
        manager.markDirty(timeline.id);
        await manager.saveAll();

        const deleted = await manager.deleteTimeline(timeline.id);
        const index = await persistence.loadTimelineIndex();
        const data = await persistence.loadTimelineData(timeline.id);

        assert.strictEqual(deleted, true);
        assert.deepStrictEqual(index.timelines, []);
        assert.deepStrictEqual(data, { events: [], annotations: {} });
    });
});
