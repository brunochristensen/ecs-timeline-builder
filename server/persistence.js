/**
 * ECS Timeline Builder - Persistence Layer
 * File I/O for loading and saving event data.
 * No knowledge of event structure, WebSocket, or business logic.
 */

import fs from 'fs/promises';
import path from 'path';

/**
 * Loads timeline data from a JSON file.
 *
 * @param {string} filePath - Path to the JSON data file
 * @returns {Promise<{ events: Array, annotations: Object }>} Loaded data
 */
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

/**
 * Saves timeline data to a JSON file. Creates the directory if it doesn't exist.
 *
 * @param {string} filePath - Path to the JSON data file
 * @param {Array} events - Events array to save
 * @param {Object} annotations - Annotations object to save
 * @returns {Promise<boolean>} True if save succeeded, false on failure
 */
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
