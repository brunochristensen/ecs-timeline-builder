/**
 * ECS Timeline Builder - Event Detail Panel Renderer
 */

const DetailRenderer = (function() {
    'use strict';

    /**
     * Check if object has any non-null values
     */
    function hasValues(obj) {
        return Object.values(obj).some(v => v !== null && v !== undefined && v !== '');
    }

    /**
     * Render a detail section
     */
    function renderSection(title, data) {
        let html = `
            <div class="detail-section">
                <div class="detail-section-title">${Utils.escapeHtml(title)}</div>
        `;

        for (const [key, value] of Object.entries(data)) {
            if (value !== null && value !== undefined && value !== '') {
                const displayValue = Array.isArray(value) ? value.join(', ') : value;
                html += `
                    <div class="detail-field">
                        <span class="detail-key">${Utils.escapeHtml(Utils.formatKey(key))}:</span>
                        <span class="detail-value">${Utils.escapeHtml(String(displayValue))}</span>
                    </div>
                `;
            }
        }

        html += '</div>';
        return html;
    }

    /**
     * Render event details HTML
     */
    function render(event) {
        let html = '';

        // Summary
        html += `
            <div class="detail-section">
                <div class="detail-section-title">Summary</div>
                <div class="detail-field">
                    <span class="detail-key">Event:</span>
                    <span class="detail-value">${Utils.escapeHtml(event.summary)}</span>
                </div>
                <div class="detail-field">
                    <span class="detail-key">Timestamp:</span>
                    <span class="detail-value">${event.timestamp.toISOString()}</span>
                </div>
                <div class="detail-field">
                    <span class="detail-key">Category:</span>
                    <span class="detail-value">${event.category}</span>
                </div>
            </div>
        `;

        // Render each detail section
        const details = event.details;
        const sections = [
            { key: 'event', title: 'Event Info' },
            { key: 'host', title: 'Host' },
            { key: 'network', title: 'Network' },
            { key: 'process', title: 'Process' },
            { key: 'file', title: 'File' },
            { key: 'user', title: 'User' },
            { key: 'dns', title: 'DNS' },
            { key: 'url', title: 'URL' },
            { key: 'http', title: 'HTTP' },
            { key: 'registry', title: 'Registry' },
            { key: 'threat', title: 'Threat Intel' },
            { key: 'observer', title: 'Observer' },
            { key: 'rule', title: 'Rule' }
        ];

        for (const section of sections) {
            if (details[section.key] && hasValues(details[section.key])) {
                html += renderSection(section.title, details[section.key]);
            }
        }

        // Raw JSON
        html += `
            <div class="detail-section">
                <div class="detail-section-title">Raw Event</div>
                <pre class="detail-raw">${Utils.escapeHtml(JSON.stringify(event.raw, null, 2))}</pre>
            </div>
        `;

        return html;
    }

    return {
        render
    };

})();
