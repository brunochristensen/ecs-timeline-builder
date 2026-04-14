/**
 * ECS Timeline Builder - Persistence Layer
 * File I/O for loading and saving event data.
 * No knowledge of event structure, WebSocket, or business logic.
 */

import fs from 'fs';
import path from 'path';

/**
 * Loads timeline data from a JSON file.
 *
 * @param {string} filePath - Path to the JSON data file
 * @returns {{ events: Array, annotations: Object }} Loaded data
 */
export function loadData(filePath) {
    try {
        if (fs.existsSync(filePath)) {
            const raw = fs.readFileSync(filePath, 'utf8');
            const data = JSON.parse(raw);
            const events = data.events || [];
            const annotations = data.annotations || {};
            console.log(`Loaded ${events.length} events, ${Object.keys(annotations).length} annotations from ${filePath}`);
            return { events, annotations };
        }
        console.log('No existing data file, starting fresh');
        return { events: [], annotations: {} };
    } catch (error) {
        console.error('Error loading data:', error.message);
        return { events: [], annotations: {} };
    }
}

/**
 * Saves timeline data to a JSON file. Creates the directory if it doesn't exist.
 *
 * @param {string} filePath - Path to the JSON data file
 * @param {Array} events - Events array to save
 * @param {Object} annotations - Annotations object to save
 * @returns {boolean} True if save succeeded, false on failure
 */
export function saveData(filePath, events, annotations) {
    try {
        const dataDir = path.dirname(filePath);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        const data = { events, annotations };
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        console.log(`Saved ${events.length} events, ${Object.keys(annotations).length} annotations to ${filePath}`);
        return true;
    } catch (error) {
        console.error('Error saving data:', error.message);
        return false;
    }
}
