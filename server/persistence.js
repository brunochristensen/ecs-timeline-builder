/**
 * ECS Timeline Builder - Persistence Layer
 * File I/O for loading and saving event data.
 * No knowledge of event structure, WebSocket, or business logic.
 */

import fs from 'fs';
import path from 'path';

/**
 * Loads events from a JSON file.
 *
 * @param {string} filePath - Path to the JSON data file
 * @returns {Array} Parsed events array, or empty array on failure
 */
export function loadEvents(filePath) {
    try {
        if (fs.existsSync(filePath)) {
            const data = fs.readFileSync(filePath, 'utf8');
            const events = JSON.parse(data);
            console.log(`Loaded ${events.length} events from ${filePath}`);
            return events;
        }
        console.log('No existing data file, starting fresh');
        return [];
    } catch (error) {
        console.error('Error loading data:', error.message);
        return [];
    }
}

/**
 * Saves events to a JSON file. Creates the directory if it doesn't exist.
 *
 * @param {string} filePath - Path to the JSON data file
 * @param {Array} events - Events array to save
 * @returns {boolean} True if save succeeded, false on failure
 */
export function saveEvents(filePath, events) {
    try {
        const dataDir = path.dirname(filePath);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        fs.writeFileSync(filePath, JSON.stringify(events, null, 2));
        console.log(`Saved ${events.length} events to ${filePath}`);
        return true;
    } catch (error) {
        console.error('Error saving data:', error.message);
        return false;
    }
}
