/**
 * ECS Timeline Builder - Persistence Layer
 * File I/O for timeline index and per-timeline data files.
 * Handles migration from legacy single-file format.
 */

import fs from 'fs/promises';
import path from 'path';

const DATA_DIR = process.env.DATA_DIR || './data';
const INDEX_FILE = 'timelines.json';
const LEGACY_FILE = 'timeline.json';

/**
 * Ensures the data directory exists.
 */
async function ensureDataDir() {
    await fs.mkdir(DATA_DIR, { recursive: true });
}

/**
 * Returns the path to the timeline index file.
 */
function getIndexPath() {
    return path.join(DATA_DIR, INDEX_FILE);
}

/**
 * Returns the path to a timeline's data file.
 */
function getTimelinePath(id) {
    return path.join(DATA_DIR, `timeline-${id}.json`);
}

/**
 * Returns the path to the legacy single-timeline file.
 */
function getLegacyPath() {
    return path.join(DATA_DIR, LEGACY_FILE);
}

/**
 * Generates a short random ID for new timelines.
 */
export function generateTimelineId() {
    return Math.random().toString(36).substring(2, 10);
}

/**
 * Checks if legacy timeline.json exists and needs migration.
 * If so, creates the index and renames the legacy file.
 *
 * @returns {Promise<boolean>} True if migration was performed
 */
export async function migrateIfNeeded() {
    await ensureDataDir();

    const indexPath = getIndexPath();
    const legacyPath = getLegacyPath();

    try {
        await fs.access(indexPath);
        return false;
    } catch {
        // Index doesn't exist, check for legacy file
    }

    let hasLegacyData = false;
    let legacyEventCount = 0;

    try {
        const raw = await fs.readFile(legacyPath, 'utf8');
        const data = JSON.parse(raw);
        legacyEventCount = data.events?.length || 0;
        hasLegacyData = legacyEventCount > 0 || Object.keys(data.annotations || {}).length > 0;
    } catch {
        // No legacy file or empty/invalid
    }

    if (hasLegacyData) {
        const defaultTimeline = {
            id: 'default',
            name: 'Default Timeline',
            description: 'Migrated from legacy timeline.json',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        await fs.rename(legacyPath, getTimelinePath('default'));
        await saveTimelineIndex({ timelines: [defaultTimeline] });

        console.log(`Migrated legacy timeline.json (${legacyEventCount} events) to multi-timeline format`);
        return true;
    }

    // No legacy data, create empty index
    await saveTimelineIndex({ timelines: [] });
    console.log('Initialized empty timeline index');
    return false;
}

/**
 * Loads the timeline index.
 *
 * @returns {Promise<{ timelines: Array }>} Index data
 */
export async function loadTimelineIndex() {
    try {
        const raw = await fs.readFile(getIndexPath(), 'utf8');
        return JSON.parse(raw);
    } catch (error) {
        if (error.code === 'ENOENT') {
            return { timelines: [] };
        }
        console.error('Error loading timeline index:', error.message);
        return { timelines: [] };
    }
}

/**
 * Saves the timeline index.
 *
 * @param {Object} index - { timelines: Array }
 * @returns {Promise<boolean>} True if save succeeded
 */
export async function saveTimelineIndex(index) {
    try {
        await ensureDataDir();
        await fs.writeFile(getIndexPath(), JSON.stringify(index, null, 2));
        return true;
    } catch (error) {
        console.error('Error saving timeline index:', error.message);
        return false;
    }
}

/**
 * Loads a single timeline's data (events + annotations).
 *
 * @param {string} id - Timeline ID
 * @returns {Promise<{ events: Array, annotations: Object }>} Timeline data
 */
export async function loadTimelineData(id) {
    try {
        const raw = await fs.readFile(getTimelinePath(id), 'utf8');
        const data = JSON.parse(raw);
        const events = data.events || [];
        const annotations = data.annotations || {};
        console.log(`Loaded timeline "${id}": ${events.length} events, ${Object.keys(annotations).length} annotations`);
        return { events, annotations };
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log(`Timeline "${id}" has no data file, starting fresh`);
        } else {
            console.error(`Error loading timeline "${id}":`, error.message);
        }
        return { events: [], annotations: {} };
    }
}

/**
 * Saves a single timeline's data.
 *
 * @param {string} id - Timeline ID
 * @param {Array} events - Events array
 * @param {Object} annotations - Annotations object
 * @returns {Promise<boolean>} True if save succeeded
 */
export async function saveTimelineData(id, events, annotations) {
    try {
        await ensureDataDir();
        const data = { events, annotations };
        await fs.writeFile(getTimelinePath(id), JSON.stringify(data));
        console.log(`Saved timeline "${id}": ${events.length} events, ${Object.keys(annotations).length} annotations`);
        return true;
    } catch (error) {
        console.error(`Error saving timeline "${id}":`, error.message);
        return false;
    }
}

/**
 * Deletes a timeline's data file.
 *
 * @param {string} id - Timeline ID
 * @returns {Promise<boolean>} True if deletion succeeded or file didn't exist
 */
export async function deleteTimelineData(id) {
    try {
        await fs.unlink(getTimelinePath(id));
        console.log(`Deleted timeline data file for "${id}"`);
        return true;
    } catch (error) {
        if (error.code === 'ENOENT') {
            return true;
        }
        console.error(`Error deleting timeline "${id}":`, error.message);
        return false;
    }
}

// Legacy exports for backwards compatibility during transition
export async function loadData(filePath) {
    try {
        const raw = await fs.readFile(filePath, 'utf8');
        const data = JSON.parse(raw);
        const events = data.events || [];
        const annotations = data.annotations || {};
        console.log(`Loaded ${events.length} events, ${Object.keys(annotations).length} annotations from ${filePath}`);
        return { events, annotations };
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log('No existing data file, starting fresh');
        } else {
            console.error('Error loading data:', error.message);
        }
        return { events: [], annotations: {} };
    }
}

export async function saveData(filePath, events, annotations) {
    try {
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        const data = { events, annotations };
        await fs.writeFile(filePath, JSON.stringify(data));
        console.log(`Saved ${events.length} events, ${Object.keys(annotations).length} annotations to ${filePath}`);
        return true;
    } catch (error) {
        console.error('Error saving data:', error.message);
        return false;
    }
}
