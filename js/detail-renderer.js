import {escapeHtml, formatKey} from "./utils.js";
import {getNestedValue} from "./parser.js";
import {TACTICS, TECHNIQUES} from "./mitre.js";

/**
 * ECS Timeline Builder - Event Detail Panel Renderer
 */

/**
 * ECS field map for the detail panel.
 * Each section has a key, title, optional trigger paths (section is skipped if none match),
 * and a fields object mapping display keys to ECS dot-notation paths.
 */
const ECS_DETAIL_SECTIONS = [
    {
        key: 'event', title: 'Event Info',
        fields: {
            action: 'event.action', category: 'event.category', type: 'event.type',
            outcome: 'event.outcome', reason: 'event.reason', code: 'event.code',
            provider: 'event.provider', dataset: 'event.dataset', module: 'event.module',
            kind: 'event.kind', severity: 'event.severity', riskScore: 'event.risk_score'
        }
    },
    {
        key: 'host', title: 'Host',
        fields: {
            hostname: 'host.hostname', name: 'host.name', id: 'host.id',
            ip: 'host.ip', mac: 'host.mac', os: 'host.os.name',
            osVersion: 'host.os.version', osFamily: 'host.os.family',
            osPlatform: 'host.os.platform', architecture: 'host.architecture'
        }
    },
    {
        key: 'network', title: 'Network',
        trigger: ['source.ip', 'destination.ip'],
        fields: {
            sourceIp: 'source.ip', sourcePort: 'source.port',
            sourceDomain: 'source.domain', sourceBytes: 'source.bytes',
            sourcePackets: 'source.packets', sourceGeoCountry: 'source.geo.country_name',
            sourceGeoCity: 'source.geo.city_name',
            destIp: 'destination.ip', destPort: 'destination.port',
            destDomain: 'destination.domain', destBytes: 'destination.bytes',
            destPackets: 'destination.packets', destGeoCountry: 'destination.geo.country_name',
            destGeoCity: 'destination.geo.city_name',
            protocol: 'network.protocol', transport: 'network.transport',
            type: 'network.type', direction: 'network.direction',
            communityId: 'network.community_id', bytes: 'network.bytes',
            packets: 'network.packets', application: 'network.application'
        }
    },
    {
        key: 'process', title: 'Process',
        trigger: ['process.name', 'process.pid'],
        fields: {
            name: 'process.name', pid: 'process.pid', executable: 'process.executable',
            commandLine: 'process.command_line', args: 'process.args',
            workingDirectory: 'process.working_directory', entityId: 'process.entity_id',
            exitCode: 'process.exit_code',
            parentName: 'process.parent.name', parentPid: 'process.parent.pid',
            parentExecutable: 'process.parent.executable',
            parentCommandLine: 'process.parent.command_line',
            hashMd5: 'process.hash.md5', hashSha1: 'process.hash.sha1',
            hashSha256: 'process.hash.sha256'
        }
    },
    {
        key: 'file', title: 'File',
        trigger: ['file.path', 'file.name'],
        fields: {
            path: 'file.path', name: 'file.name', directory: 'file.directory',
            extension: 'file.extension', mimeType: 'file.mime_type', size: 'file.size',
            targetPath: 'file.target_path', type: 'file.type',
            hashMd5: 'file.hash.md5', hashSha1: 'file.hash.sha1',
            hashSha256: 'file.hash.sha256'
        }
    },
    {
        key: 'user', title: 'User',
        trigger: ['user.name', 'user.id'],
        fields: {
            name: 'user.name', fullName: 'user.full_name', domain: 'user.domain',
            id: 'user.id', email: 'user.email', roles: 'user.roles',
            targetName: 'user.target.name', targetDomain: 'user.target.domain',
            effectiveName: 'user.effective.name'
        }
    },
    {
        key: 'dns', title: 'DNS',
        trigger: ['dns.question.name'],
        fields: {
            questionName: 'dns.question.name', questionType: 'dns.question.type',
            questionClass: 'dns.question.class', responseCode: 'dns.response_code',
            resolvedIp: 'dns.resolved_ip', answers: 'dns.answers'
        }
    },
    {
        key: 'url', title: 'URL',
        trigger: ['url.full', 'url.domain'],
        fields: {
            full: 'url.full', domain: 'url.domain', path: 'url.path',
            query: 'url.query', scheme: 'url.scheme', port: 'url.port'
        }
    },
    {
        key: 'http', title: 'HTTP',
        trigger: ['http.request.method', 'http.response.status_code'],
        fields: {
            method: 'http.request.method', statusCode: 'http.response.status_code',
            requestBodyContent: 'http.request.body.content',
            responseBodyContent: 'http.response.body.content',
            userAgent: 'user_agent.original'
        }
    },
    {
        key: 'registry', title: 'Registry',
        trigger: ['registry.path', 'registry.key'],
        fields: {
            path: 'registry.path', key: 'registry.key', value: 'registry.value',
            dataStrings: 'registry.data.strings', dataType: 'registry.data.type',
            hive: 'registry.hive'
        }
    },
    {
        key: 'threat', title: 'Threat Intel',
        trigger: ['threat.indicator', 'threat.technique.name'],
        fields: {
            framework: 'threat.framework', tacticName: 'threat.tactic.name',
            tacticId: 'threat.tactic.id', techniqueName: 'threat.technique.name',
            techniqueId: 'threat.technique.id', indicator: 'threat.indicator'
        }
    },
    {
        key: 'observer', title: 'Observer',
        trigger: ['observer.name', 'observer.type'],
        fields: {
            name: 'observer.name', hostname: 'observer.hostname', ip: 'observer.ip',
            type: 'observer.type', vendor: 'observer.vendor',
            product: 'observer.product', version: 'observer.version'
        }
    },
    {
        key: 'rule', title: 'Rule',
        trigger: ['rule.name', 'rule.id'],
        fields: {
            name: 'rule.name', id: 'rule.id', category: 'rule.category',
            description: 'rule.description', ruleset: 'rule.ruleset',
            reference: 'rule.reference'
        }
    }
];

/**
 * Checks if an object contains any meaningful values.
 * Used to determine whether a detail section should be rendered.
 *
 * @param {Object} obj - Object to check
 * @returns {boolean} True if at least one property has a non-empty value
 */
function hasValues(obj) {
    return Object.values(obj).some(v => v !== null && v !== undefined && v !== '');
}

/**
 * Renders a single collapsible section of event details as HTML.
 * Iterates through object properties and formats each as a key-value pair.
 *
 * @param {string} title - Section heading (e.g., "Network", "Process")
 * @param {Object} data - Key-value pairs to display in this section
 * @returns {string} HTML string for the detail section
 */
function renderSection(title, data, sectionNum) {
    const num = String(sectionNum).padStart(2, '0');
    let html = `
            <div class="detail-section">
                <div class="detail-section-title" data-num="${num}">${escapeHtml(title)}</div>
        `;

    for (const [key, value] of Object.entries(data)) {
        if (value !== null && value !== undefined && value !== '') {
            const displayValue = Array.isArray(value) ? value.join(', ') : value;
            html += `
                    <div class="detail-field">
                        <span class="detail-key">${escapeHtml(formatKey(key))}</span>
                        <span class="detail-value">${escapeHtml(String(displayValue))}</span>
                    </div>
                `;
        }
    }

    html += '</div>';
    return html;
}

/**
 * Builds <option> HTML for a MITRE ATT&CK select, marking the selected id.
 *
 * @param {Array<{id: string, name: string}>|null|undefined} items - Tactic or technique list
 * @param {string} selectedId - Currently selected ID (empty string for none)
 * @param {string} placeholder - Placeholder label for the blank option
 * @returns {string} Options HTML including a blank placeholder first
 */
export function renderMitreOptions(items, selectedId, placeholder) {
    let html = `<option value="">${escapeHtml(placeholder)}</option>`;
    if (!items) return html;
    for (const item of items) {
        const selected = item.id === selectedId ? ' selected' : '';
        html += `<option value="${escapeHtml(item.id)}"${selected}>${escapeHtml(item.id)} - ${escapeHtml(item.name)}</option>`;
    }
    return html;
}

/**
 * Renders the annotation form HTML for an event.
 *
 * @param {string} eventId - The event ID
 * @param {Object|null} annotation - Existing annotation, or null
 * @returns {string} HTML string for the annotation section
 */
function renderAnnotationForm(eventId, annotation) {
    const comment = annotation ? escapeHtml(annotation.comment || '') : '';
    const selectedTactic = annotation ? annotation.mitreTactic || '' : '';
    const selectedTechnique = annotation ? annotation.mitreTechnique || '' : '';

    const tacticOptions = renderMitreOptions(TACTICS, selectedTactic, '-- Select Tactic --');
    const techniqueList = selectedTactic ? TECHNIQUES[selectedTactic] : null;
    const techniqueOptions = renderMitreOptions(techniqueList, selectedTechnique, '-- Select Technique --');

    let html = `
        <div class="detail-section annotation-section">
            <div class="detail-section-title" data-num="§">Annotation</div>
            <div class="annotation-form" data-event-id="${escapeHtml(String(eventId))}">
                <label class="annotation-label">Comment</label>
                <textarea id="annotation-comment" class="annotation-input" rows="3" placeholder="Analyst notes...">${comment}</textarea>
                <label class="annotation-label">MITRE Tactic</label>
                <select id="annotation-tactic" class="annotation-select">${tacticOptions}</select>
                <label class="annotation-label">MITRE Technique</label>
                <select id="annotation-technique" class="annotation-select">${techniqueOptions}</select>
                <div class="annotation-actions">
                    <button id="save-annotation-btn" class="btn-save-annotation">Save Annotation</button>`;

    if (annotation) {
        html += `
                    <button id="delete-annotation-btn" class="btn-delete-annotation">Remove Annotation</button>`;
    }

    html += `
                </div>
            </div>
        </div>`;

    return html;
}

/**
 * Renders the complete event detail panel HTML for display in the sidebar.
 * Includes summary, annotation form, categorized ECS field sections, and raw JSON view.
 *
 * @param {Object} event - Parsed event object with summary, timestamp, category, details, and raw properties
 * @param {Object|null} annotation - Existing annotation for this event, or null
 * @returns {string} Complete HTML string for the detail panel content
 */
export function renderEventDetailPanel(event, annotation) {
    let html = '';
    let sectionNum = 1;

    // Summary
    html += `
            <div class="detail-section">
                <div class="detail-section-title" data-num="${String(sectionNum++).padStart(2, '0')}">Summary</div>
                <div class="detail-field">
                    <span class="detail-key">Event</span>
                    <span class="detail-value">${escapeHtml(event.summary)}</span>
                </div>
                <div class="detail-field">
                    <span class="detail-key">Timestamp</span>
                    <span class="detail-value">${event.timestamp.toISOString()}</span>
                </div>
                <div class="detail-field">
                    <span class="detail-key">Category</span>
                    <span class="detail-value">${event.category}</span>
                </div>
                <button id="delete-event-btn" class="btn-delete" data-event-id="${escapeHtml(String(event.id))}">Delete Event</button>
            </div>
        `;

    // Annotation form
    html += renderAnnotationForm(event.id, annotation || null);

    // Render each detail section by reading directly from raw ECS data
    for (const section of ECS_DETAIL_SECTIONS) {
        if (section.trigger && !section.trigger.some(p => getNestedValue(event.raw, p))) {
            continue;
        }
        const data = {};
        for (const [key, path] of Object.entries(section.fields)) {
            data[key] = getNestedValue(event.raw, path);
        }
        if (hasValues(data)) {
            html += renderSection(section.title, data, sectionNum++);
        }
    }

    // Raw JSON
    html += `
            <div class="detail-section">
                <div class="detail-section-title" data-num="${String(sectionNum).padStart(2, '0')}">Raw Event</div>
                <pre class="detail-raw">${escapeHtml(JSON.stringify(event.raw, null, 2))}</pre>
            </div>
        `;

    return html;
}

