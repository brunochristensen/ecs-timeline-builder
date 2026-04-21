/**
 * ECS Timeline Builder - Timeline Manager
 * Manages multiple timelines: CRUD operations on timeline metadata,
 * lazy-loading of EventStore instances, and coordinated persistence.
 */

import { EventStore } from './event-store.js';
import {
    migrateIfNeeded,
    loadTimelineIndex,
    saveTimelineIndex,
    loadTimelineData,
    saveTimelineData,
    deleteTimelineData,
    generateTimelineId
} from './persistence.js';

export class TimelineManager {
    #timelines = new Map();      // id → timeline metadata
    #stores = new Map();         // id → EventStore instance
    #dirty = new Set();          // timeline IDs with unsaved changes

    /**
     * Initializes the manager: runs migration if needed, loads index.
     */
    async initialize() {
        await migrateIfNeeded();
        const index = await loadTimelineIndex();

        for (const timeline of index.timelines) {
            this.#timelines.set(timeline.id, timeline);
        }

        console.log(`TimelineManager initialized with ${this.#timelines.size} timeline(s)`);
    }

    /**
     * Returns all timeline metadata as an array.
     */
    listTimelines() {
        return Array.from(this.#timelines.values());
    }

    /**
     * Returns metadata for a specific timeline.
     */
    getTimeline(id) {
        return this.#timelines.get(id) || null;
    }

    /**
     * Creates a new timeline with the given name and description.
     * Returns the new timeline metadata.
     */
    async createTimeline(name, description = '') {
        const id = generateTimelineId();
        const now = new Date().toISOString();

        const timeline = {
            id,
            name: name || 'Untitled Timeline',
            description,
            createdAt: now,
            updatedAt: now
        };

        this.#timelines.set(id, timeline);
        await this.#saveIndex();

        console.log(`Created timeline "${name}" (${id})`);
        return timeline;
    }

    /**
     * Updates a timeline's metadata (name and/or description).
     * Returns the updated timeline, or null if not found.
     */
    async updateTimeline(id, updates) {
        const timeline = this.#timelines.get(id);
        if (!timeline) return null;

        if (updates.name !== undefined) {
            timeline.name = updates.name;
        }
        if (updates.description !== undefined) {
            timeline.description = updates.description;
        }
        timeline.updatedAt = new Date().toISOString();

        await this.#saveIndex();

        console.log(`Updated timeline "${timeline.name}" (${id})`);
        return timeline;
    }

    /**
     * Deletes a timeline and its data.
     * Returns true if deleted, false if not found.
     */
    async deleteTimeline(id) {
        if (!this.#timelines.has(id)) return false;

        const timeline = this.#timelines.get(id);
        this.#timelines.delete(id);
        this.#stores.delete(id);
        this.#dirty.delete(id);

        await this.#saveIndex();
        await deleteTimelineData(id);

        console.log(`Deleted timeline "${timeline.name}" (${id})`);
        return true;
    }

    /**
     * Gets the EventStore for a timeline, loading it if necessary.
     * Creates the store on first access.
     */
    async getStore(id) {
        if (!this.#timelines.has(id)) {
            return null;
        }

        if (!this.#stores.has(id)) {
            const store = new EventStore();
            const data = await loadTimelineData(id);
            store.load(data.events, data.annotations);
            this.#stores.set(id, store);
            console.log(`Loaded EventStore for timeline "${id}"`);
        }

        return this.#stores.get(id);
    }

    /**
     * Marks a timeline as having unsaved changes.
     */
    markDirty(id) {
        if (this.#timelines.has(id)) {
            this.#dirty.add(id);

            const timeline = this.#timelines.get(id);
            timeline.updatedAt = new Date().toISOString();
        }
    }

    /**
     * Saves all dirty timelines and clears dirty flags.
     * Returns the number of timelines saved.
     */
    async saveAll() {
        let saved = 0;

        for (const id of this.#dirty) {
            const store = this.#stores.get(id);
            if (store) {
                await saveTimelineData(id, store.getAll(), store.getAnnotations());
                saved++;
            }
        }

        if (saved > 0) {
            await this.#saveIndex();
        }

        this.#dirty.clear();
        return saved;
    }

    /**
     * Saves a specific timeline if dirty.
     */
    async saveTimeline(id) {
        if (!this.#dirty.has(id)) return false;

        const store = this.#stores.get(id);
        if (!store) return false;

        await saveTimelineData(id, store.getAll(), store.getAnnotations());
        await this.#saveIndex();
        this.#dirty.delete(id);

        return true;
    }

    /**
     * Unloads a timeline's EventStore from memory (saves first if dirty).
     * Useful for memory management with many timelines.
     */
    async unloadStore(id) {
        if (this.#dirty.has(id)) {
            await this.saveTimeline(id);
        }
        this.#stores.delete(id);
        console.log(`Unloaded EventStore for timeline "${id}"`);
    }

    /**
     * Returns true if any timeline has unsaved changes.
     */
    hasDirtyTimelines() {
        return this.#dirty.size > 0;
    }

    /**
     * Returns the IDs of all loaded (in-memory) stores.
     */
    getLoadedStoreIds() {
        return Array.from(this.#stores.keys());
    }

    /**
     * Saves the timeline index to disk.
     */
    async #saveIndex() {
        const timelines = Array.from(this.#timelines.values());
        await saveTimelineIndex({ timelines });
    }
}
