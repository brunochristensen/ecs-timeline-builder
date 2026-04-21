/**
 * ECS Timeline Builder - Persistence Layer
 * File I/O for timeline index and per-timeline data files.
 */

import fs from 'fs/promises';
import path from 'path';

const DATA_DIR = process.env.DATA_DIR || './data';
const INDEX_FILE = 'timelines.json';

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
 * Generates a short random ID for new timelines.
 */
export function generateTimelineId() {
    return Math.random().toString(36).substring(2, 10);
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
