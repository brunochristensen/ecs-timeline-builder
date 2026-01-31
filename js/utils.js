/**
 * ECS Timeline Builder - Utility Functions
 */

/**
 * Converts a duration in milliseconds to a human-readable string.
 * Automatically selects the most appropriate units (days, hours, minutes, seconds).
 *
 * @param {number} ms - Duration in milliseconds
 * @returns {string} Formatted string like "2d 5h", "3h 45m", "12m 30s", or "45s"
 */
export function formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
        return `${days}d ${hours % 24}h`;
    } else if (hours > 0) {
        return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
        return `${minutes}m ${seconds % 60}s`;
    } else {
        return `${seconds}s`;
    }
}

/**
 * Converts a camelCase or snake_case key into a human-readable label.
 * Handles common abbreviations (IP, DNS, URL, HTTP, ID, PID, MAC, OS).
 *
 * @param {string} key - The key to format (e.g., "sourceIp", "process_name")
 * @returns {string} Formatted label (e.g., "Source IP", "Process Name")
 */
export function formatKey(key) {
    return key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
}

/**
 * Escapes HTML special characters to prevent XSS attacks when
 * inserting user-provided or event data into the DOM.
 *
 * @param {string} str - The string to escape
 * @returns {string} HTML-safe string with &, <, >, ", ' escaped
 */
export function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

