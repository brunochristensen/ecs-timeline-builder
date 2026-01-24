/**
 * ECS Timeline Builder - Utility Functions
 */

const Utils = (function() {
    'use strict';

    /**
     * Format duration in human-readable form
     */
    function formatDuration(ms) {
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
     * Format camelCase key to readable form
     */
    function formatKey(key) {
        return key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
    }

    /**
     * Escape HTML to prevent XSS
     */
    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    return {
        formatDuration,
        formatKey,
        escapeHtml
    };

})();
