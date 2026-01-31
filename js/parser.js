/**
 * ECS Timeline Builder - ECS Event Parser
 * Parses Elastic Common Schema (ECS) events
 *
 * Based on ECS specification: https://www.elastic.co/guide/en/ecs/current/
 * Only uses standard ECS fields for maximum compatibility across different
 * Elasticsearch deployments and data sources.
 */

/**
 * Safely get a nested property from an object
 */
function getNestedValue(obj, path, defaultValue = null) {
    if (!obj || !path) return defaultValue;
    const keys = path.split('.');
    let current = obj;
    for (const key of keys) {
        if (current === null || current === undefined) return defaultValue;
        current = current[key];
    }
    return current !== undefined ? current : defaultValue;
}

/**
 * Normalize a value that might be an array. Returns the first element if
 * value is an array, otherwise the value itself
 */
function normalizeValue(value) {
    if (Array.isArray(value)) {
        return value.length > 0 ? value[0] : null;
    }
    return value;
}

/**
 * Get nested value and normalize it (handles Elasticsearch array fields)
 */
function getNestedString(obj, path, defaultValue = null) {
    const value = getNestedValue(obj, path, defaultValue);
    return normalizeValue(value);
}

/**
 * Try multiple paths and return the first non-null value
 */
function getFirstValue(obj, paths, defaultValue = null) {
    for (const path of paths) {
        const value = getNestedValue(obj, path);
        if (value !== null && value !== undefined && value !== '') {
            return value;
        }
    }
    return defaultValue;
}

/**
 * Try multiple paths and return the first non-null value, normalized to string
 * Handles Elasticsearch array fields by returning first element
 */
function getFirstString(obj, paths, defaultValue = null) {
    const value = getFirstValue(obj, paths, defaultValue);
    return normalizeValue(value);
}

/**
 * Parse timestamp from ECS timestamp fields
 * ECS standard: @timestamp is the primary field
 * Fallbacks use other ECS date fields
 */
function parseTimestamp(event) {
    // ECS standard timestamp fields (in priority order)
    const tsValue = getFirstValue(event, [
        '@timestamp',           // Primary ECS timestamp
        'event.created',        // When event was created
        'event.ingested',       // When event was ingested
        'event.start',          // When event started
        'event.end'             // When event ended (fallback)
    ]);

    if (tsValue) {
        const date = new Date(tsValue);
        return isNaN(date.getTime()) ? null : date;
    } else {
        return null;
    }
}

/**
 * Determine the host identifier for swim lane assignment
 * Uses only ECS standard fields from host.*, agent.*, and observer.* field sets
 */
function extractHostIdentifier(event) {
    // ECS host identification (priority order per ECS spec)
    // host.* - Information about the host
    // agent.* - Information about the agent collecting data
    // observer.* - Information about the observer (for network devices)
    // Use getFirstString to handle ES array values
    const hostname = getFirstString(event, [
        'host.hostname',        // ECS: Hostname of the host
        'host.name',            // ECS: Name of the host
        'agent.name',           // ECS: Custom name of the agent
        'observer.hostname',    // ECS: Hostname of observer
        'observer.name'         // ECS: Custom name of observer
    ]);

    // ECS IP fields - use getFirstString to handle arrays
    const ip = getFirstString(event, [
        'host.ip',              // ECS: Host IP address(es)
        'observer.ip'           // ECS: Observer IP address(es)
    ]);

    // If we have hostname or IP, use it
    if (hostname || ip) {
        return {
            hostname: hostname || ip || 'Unknown',
            ip: ip || null,
            displayName: hostname || ip || 'Unknown'
        };
    }

    // For network-only events (like firewall logs with empty host)
    // Try to use source IP as the host identifier
    const sourceIp = getNestedString(event, 'source.ip');
    if (sourceIp) {
        return {
            hostname: sourceIp,
            ip: sourceIp,
            displayName: sourceIp
        };
    }

    // Use destination IP if nothing else is available
    const destIp = getNestedString(event, 'destination.ip');
    if (destIp) {
        return {
            hostname: destIp,
            ip: destIp,
            displayName: destIp
        };
    }

    // For the off chance none of these fields can be populated
    return {
        hostname: 'Unknown',
        ip: null,
        displayName: 'Unknown'
    };
}

/**
 * Extract event category for filtering and styling
 */
function extractCategory(event) {
    const category = getFirstValue(event, [
        'event.category',
        'event.type'
    ]);

    // Handle array categories
    const categoryValue = Array.isArray(category) ? category[0] : category;

    // Map to our standard categories
    const categoryMap = {
        'network': 'network',
        'file': 'file',
        'process': 'process',
        'authentication': 'authentication',
        'session': 'authentication',
        'registry': 'registry',
        'iam': 'authentication',
        'intrusion_detection': 'network',
        'malware': 'process',
        'package': 'file',
        'web': 'network',
        'database': 'network'
    };

    return categoryMap[categoryValue] || 'other';
}

/**
 * Extract network connection info for cross-host lines
 * Uses ECS source.*, destination.*, and network.* field sets
 */
function extractConnectionInfo(event) {
    // Use getNestedString to handle ES array values
    const sourceIp = getNestedString(event, 'source.ip');
    const destIp = getNestedString(event, 'destination.ip');

    if (!sourceIp || !destIp) return null;

    // Skip localhost connections
    if (sourceIp === destIp ||
        sourceIp === '127.0.0.1' ||
        destIp === '127.0.0.1' ||
        sourceIp.startsWith('::1') ||
        destIp.startsWith('::1')) {
        return null;
    }

    return {
        // ECS source.* fields
        sourceIp: sourceIp,
        sourcePort: getNestedString(event, 'source.port'),
        sourceHostname: getNestedString(event, 'source.domain'),
        sourceBytes: getNestedValue(event, 'source.bytes'),
        sourcePackets: getNestedValue(event, 'source.packets'),
        // ECS destination.* fields
        destIp: destIp,
        destPort: getNestedString(event, 'destination.port'),
        destHostname: getNestedString(event, 'destination.domain'),
        destBytes: getNestedValue(event, 'destination.bytes'),
        destPackets: getNestedValue(event, 'destination.packets'),
        // ECS network.* fields
        protocol: getFirstValue(event, ['network.transport', 'network.protocol']),
        direction: getNestedValue(event, 'network.direction'),
        communityId: getNestedValue(event, 'network.community_id'),
        networkType: getNestedValue(event, 'network.type'),
        networkBytes: getNestedValue(event, 'network.bytes')
    };
}

/**
 * Extract a human-readable summary of the event
 * Uses only ECS standard fields
 */
function extractSummary(event) {
    // ECS event.action is the primary descriptor
    const action = getFirstValue(event, [
        'event.action',         // ECS: Action captured by the event
        'event.type'            // ECS: Event type (array)
    ]);

    // Get action as string
    const actionStr = Array.isArray(action) ? action[0] : action;

    // ECS process.* fields (use getNestedString to handle ES array values)
    const processName = getNestedString(event, 'process.name');

    // ECS file.* fields
    const fileName = getNestedString(event, 'file.name');

    // ECS user.* fields
    const userName = getNestedString(event, 'user.name');

    // ECS destination.* fields
    const destIp = getNestedString(event, 'destination.ip');
    const destPort = getNestedString(event, 'destination.port');

    // ECS dns.* fields
    const dnsQuery = getNestedString(event, 'dns.question.name');

    // ECS url.* fields
    const urlDomain = getNestedString(event, 'url.domain');

    let summary = actionStr || 'Event';

    if (processName) {
        summary += ` [${processName}]`;
    }
    if (fileName) {
        summary += ` ${fileName}`;
    }
    if (destIp && destPort) {
        summary += ` -> ${destIp}:${destPort}`;
    } else if (destIp) {
        summary += ` -> ${destIp}`;
    }
    if (dnsQuery) {
        summary += ` (${dnsQuery})`;
    }
    if (urlDomain && !dnsQuery) {
        summary += ` (${urlDomain})`;
    }
    if (userName && !userName.toUpperCase().includes('SYSTEM')) {
        summary += ` by ${userName}`;
    }

    return summary;
}

/**
 * Extract key fields for the detail panel
 * Organized by ECS field sets
 */
function extractDetails(event) {
    const details = {};

    // ECS event.* - Event metadata
    details.event = {
        action: getNestedValue(event, 'event.action'),
        category: getNestedValue(event, 'event.category'),
        type: getNestedValue(event, 'event.type'),
        outcome: getNestedValue(event, 'event.outcome'),
        reason: getNestedValue(event, 'event.reason'),
        code: getNestedValue(event, 'event.code'),
        provider: getNestedValue(event, 'event.provider'),
        dataset: getNestedValue(event, 'event.dataset'),
        module: getNestedValue(event, 'event.module'),
        kind: getNestedValue(event, 'event.kind'),
        severity: getNestedValue(event, 'event.severity'),
        riskScore: getNestedValue(event, 'event.risk_score')
    };

    // ECS host.* - Host information
    details.host = {
        hostname: getNestedValue(event, 'host.hostname'),
        name: getNestedValue(event, 'host.name'),
        id: getNestedValue(event, 'host.id'),
        ip: getNestedValue(event, 'host.ip'),
        mac: getNestedValue(event, 'host.mac'),
        os: getNestedValue(event, 'host.os.name'),
        osVersion: getNestedValue(event, 'host.os.version'),
        osFamily: getNestedValue(event, 'host.os.family'),
        osPlatform: getNestedValue(event, 'host.os.platform'),
        architecture: getNestedValue(event, 'host.architecture')
    };

    // ECS source.* and destination.* - Network endpoints
    if (getNestedValue(event, 'source.ip') || getNestedValue(event, 'destination.ip')) {
        details.network = {
            sourceIp: getNestedValue(event, 'source.ip'),
            sourcePort: getNestedValue(event, 'source.port'),
            sourceDomain: getNestedValue(event, 'source.domain'),
            sourceBytes: getNestedValue(event, 'source.bytes'),
            sourcePackets: getNestedValue(event, 'source.packets'),
            sourceGeoCountry: getNestedValue(event, 'source.geo.country_name'),
            sourceGeoCity: getNestedValue(event, 'source.geo.city_name'),
            destIp: getNestedValue(event, 'destination.ip'),
            destPort: getNestedValue(event, 'destination.port'),
            destDomain: getNestedValue(event, 'destination.domain'),
            destBytes: getNestedValue(event, 'destination.bytes'),
            destPackets: getNestedValue(event, 'destination.packets'),
            destGeoCountry: getNestedValue(event, 'destination.geo.country_name'),
            destGeoCity: getNestedValue(event, 'destination.geo.city_name'),
            protocol: getNestedValue(event, 'network.protocol'),
            transport: getNestedValue(event, 'network.transport'),
            type: getNestedValue(event, 'network.type'),
            direction: getNestedValue(event, 'network.direction'),
            communityId: getNestedValue(event, 'network.community_id'),
            bytes: getNestedValue(event, 'network.bytes'),
            packets: getNestedValue(event, 'network.packets'),
            application: getNestedValue(event, 'network.application')
        };
    }

    // ECS process.* - Process information
    if (getNestedValue(event, 'process.name') || getNestedValue(event, 'process.pid')) {
        details.process = {
            name: getNestedValue(event, 'process.name'),
            pid: getNestedValue(event, 'process.pid'),
            executable: getNestedValue(event, 'process.executable'),
            commandLine: getNestedValue(event, 'process.command_line'),
            args: getNestedValue(event, 'process.args'),
            workingDirectory: getNestedValue(event, 'process.working_directory'),
            entityId: getNestedValue(event, 'process.entity_id'),
            exitCode: getNestedValue(event, 'process.exit_code'),
            parentName: getNestedValue(event, 'process.parent.name'),
            parentPid: getNestedValue(event, 'process.parent.pid'),
            parentExecutable: getNestedValue(event, 'process.parent.executable'),
            parentCommandLine: getNestedValue(event, 'process.parent.command_line'),
            hashMd5: getNestedValue(event, 'process.hash.md5'),
            hashSha1: getNestedValue(event, 'process.hash.sha1'),
            hashSha256: getNestedValue(event, 'process.hash.sha256')
        };
    }

    // ECS file.* - File information
    if (getNestedValue(event, 'file.path') || getNestedValue(event, 'file.name')) {
        details.file = {
            path: getNestedValue(event, 'file.path'),
            name: getNestedValue(event, 'file.name'),
            directory: getNestedValue(event, 'file.directory'),
            extension: getNestedValue(event, 'file.extension'),
            mimeType: getNestedValue(event, 'file.mime_type'),
            size: getNestedValue(event, 'file.size'),
            targetPath: getNestedValue(event, 'file.target_path'),
            type: getNestedValue(event, 'file.type'),
            hashMd5: getNestedValue(event, 'file.hash.md5'),
            hashSha1: getNestedValue(event, 'file.hash.sha1'),
            hashSha256: getNestedValue(event, 'file.hash.sha256')
        };
    }

    // ECS user.* - User information
    if (getNestedValue(event, 'user.name') || getNestedValue(event, 'user.id')) {
        details.user = {
            name: getNestedValue(event, 'user.name'),
            fullName: getNestedValue(event, 'user.full_name'),
            domain: getNestedValue(event, 'user.domain'),
            id: getNestedValue(event, 'user.id'),
            email: getNestedValue(event, 'user.email'),
            roles: getNestedValue(event, 'user.roles'),
            targetName: getNestedValue(event, 'user.target.name'),
            targetDomain: getNestedValue(event, 'user.target.domain'),
            effectiveName: getNestedValue(event, 'user.effective.name')
        };
    }

    // ECS dns.* - DNS query information
    if (getNestedValue(event, 'dns.question.name')) {
        details.dns = {
            questionName: getNestedValue(event, 'dns.question.name'),
            questionType: getNestedValue(event, 'dns.question.type'),
            questionClass: getNestedValue(event, 'dns.question.class'),
            responseCode: getNestedValue(event, 'dns.response_code'),
            resolvedIp: getNestedValue(event, 'dns.resolved_ip'),
            answers: getNestedValue(event, 'dns.answers')
        };
    }

    // ECS url.* - URL information
    if (getNestedValue(event, 'url.full') || getNestedValue(event, 'url.domain')) {
        details.url = {
            full: getNestedValue(event, 'url.full'),
            domain: getNestedValue(event, 'url.domain'),
            path: getNestedValue(event, 'url.path'),
            query: getNestedValue(event, 'url.query'),
            scheme: getNestedValue(event, 'url.scheme'),
            port: getNestedValue(event, 'url.port')
        };
    }

    // ECS http.* - HTTP information
    if (getNestedValue(event, 'http.request.method') || getNestedValue(event, 'http.response.status_code')) {
        details.http = {
            method: getNestedValue(event, 'http.request.method'),
            statusCode: getNestedValue(event, 'http.response.status_code'),
            requestBodyContent: getNestedValue(event, 'http.request.body.content'),
            responseBodyContent: getNestedValue(event, 'http.response.body.content'),
            userAgent: getNestedValue(event, 'user_agent.original')
        };
    }

    // ECS registry.* - Windows registry information
    if (getNestedValue(event, 'registry.path') || getNestedValue(event, 'registry.key')) {
        details.registry = {
            path: getNestedValue(event, 'registry.path'),
            key: getNestedValue(event, 'registry.key'),
            value: getNestedValue(event, 'registry.value'),
            dataStrings: getNestedValue(event, 'registry.data.strings'),
            dataType: getNestedValue(event, 'registry.data.type'),
            hive: getNestedValue(event, 'registry.hive')
        };
    }

    // ECS threat.* - Threat intelligence
    if (getNestedValue(event, 'threat.indicator') || getNestedValue(event, 'threat.technique.name')) {
        details.threat = {
            framework: getNestedValue(event, 'threat.framework'),
            tacticName: getNestedValue(event, 'threat.tactic.name'),
            tacticId: getNestedValue(event, 'threat.tactic.id'),
            techniqueName: getNestedValue(event, 'threat.technique.name'),
            techniqueId: getNestedValue(event, 'threat.technique.id'),
            indicator: getNestedValue(event, 'threat.indicator')
        };
    }

    // ECS observer.* - Observer/sensor information (firewalls, IDS, etc.)
    if (getNestedValue(event, 'observer.name') || getNestedValue(event, 'observer.type')) {
        details.observer = {
            name: getNestedValue(event, 'observer.name'),
            hostname: getNestedValue(event, 'observer.hostname'),
            ip: getNestedValue(event, 'observer.ip'),
            type: getNestedValue(event, 'observer.type'),
            vendor: getNestedValue(event, 'observer.vendor'),
            product: getNestedValue(event, 'observer.product'),
            version: getNestedValue(event, 'observer.version')
        };
    }

    // ECS rule.* - Detection rule information
    if (getNestedValue(event, 'rule.name') || getNestedValue(event, 'rule.id')) {
        details.rule = {
            name: getNestedValue(event, 'rule.name'),
            id: getNestedValue(event, 'rule.id'),
            category: getNestedValue(event, 'rule.category'),
            description: getNestedValue(event, 'rule.description'),
            ruleset: getNestedValue(event, 'rule.ruleset'),
            reference: getNestedValue(event, 'rule.reference')
        };
    }

    return details;
}

/**
 * Generate a unique ID for an event based on its content
 * Uses timestamp + host + category for uniqueness
 */
function generateEventId(event, timestamp, index) {
    // Try to use ECS event.id if available
    const eventId = getNestedValue(event, 'event.id');
    if (eventId) return eventId;

    // Generate from content
    const host = getFirstString(event, ['host.hostname', 'host.name', 'host.ip']) || 'unknown';
    const ts = timestamp ? timestamp.getTime() : Date.now();
    return `${ts}-${host}-${index}`;
}

/**
 * Parse a single event
 * Accepts both raw ECS events and Elasticsearch export format (with _source wrapper)
 */
function parseEvent(rawEvent, index) {
    // Handle Elasticsearch export format (unwrap _source if present)
    // Preserve _id from ES wrapper for deduplication
    const esId = rawEvent._id || null;
    const event = rawEvent._source || rawEvent;

    const timestamp = parseTimestamp(event);
    if (!timestamp) {
        console.warn(`Event ${index} has no valid timestamp, skipping`);
        return null;
    }

    const hostInfo = extractHostIdentifier(event);
    const category = extractCategory(event);
    const connection = extractConnectionInfo(event);
    const summary = extractSummary(event);
    const details = extractDetails(event);

    // Use ES _id if available, otherwise generate one
    const eventId = esId || generateEventId(event, timestamp, index);

    return {
        id: eventId,
        timestamp: timestamp,
        host: hostInfo,
        category: category,
        connection: connection,
        summary: summary,
        details: details,
        raw: event
    };
}

/**
 * Parses raw ECS JSON/NDJSON input into normalized event objects.
 * Handles both single events and newline-delimited event streams.
 * Extracts timestamps, categories, and creates unique IDs for deduplication.
 *
 * @param {string|Array} input - JSON string, NDJSON string, or array of event objects
 * @returns {Array} Array of parsed event objects with id, timestamp, category, summary, details, and raw properties
 */
export function parseEvents(input) {
    let rawEvents = [];

    if (typeof input === 'string') {
        // Try to parse as JSON
        const trimmed = input.trim();

        if (trimmed.startsWith('[')) {
            // JSON array
            try {
                rawEvents = JSON.parse(trimmed);
            } catch (e) {
                throw new Error(`Failed to parse JSON array: ${e.message}`);
            }
        } else if (trimmed.startsWith('{')) {
            // Could be single/multi-line JSON object or NDJSON
            // First, try to parse as a complete JSON object (handles pretty-printed)
            try {
                rawEvents = [JSON.parse(trimmed)];
            } catch (e) {
                // If that fails, try NDJSON (one JSON object per line)
                const lines = trimmed.split('\n').filter(line => line.trim());
                rawEvents = lines.map((line, i) => {
                    try {
                        return JSON.parse(line);
                    } catch (e2) {
                        console.warn(`Failed to parse line ${i + 1}: ${e2.message}`);
                        return null;
                    }
                }).filter(Boolean);

                // If NDJSON also failed to produce results, throw original error
                if (rawEvents.length === 0) {
                    // Check if this looks like multiple back-to-back objects
                    // Pattern: closing brace followed by opening brace (with optional whitespace)
                    if (/}\s*\n\s*\{/.test(trimmed) || /}\s*\{/.test(trimmed)) {
                        throw new Error(
                            'Multiple JSON objects detected. Please use one of these formats:\n' +
                            '• Wrap objects in an array: [{...}, {...}]\n' +
                            '• Use NDJSON: one minified object per line'
                        );
                    }
                    throw new Error(`Failed to parse JSON: ${e.message}`);
                }
            }
        } else {
            throw new Error('Input does not appear to be valid JSON');
        }
    } else if (Array.isArray(input)) {
        rawEvents = input;
    } else if (typeof input === 'object') {
        rawEvents = [input];
    } else {
        throw new Error('Invalid input type');
    }

    // Parse each event
    return rawEvents
        .map((event, index) => parseEvent(event, index))
        .filter(Boolean);
}

/**
 * Creates a host registry mapping hostnames to their associated events.
 * Used to organize events into swim lanes on the timeline visualization.
 *
 * @param {Array} events - Array of parsed event objects
 * @returns {Object} Host registry with getHostList() and getEventsForHost(hostname) methods
 */
export function buildHostRegistry(events) {
    const registry = new Map();
    const ipToHost = new Map();

    // First pass: collect all host info
    events.forEach(event => {
        if (event.host && event.host.hostname !== 'Unknown') {
            const key = event.host.hostname.toLowerCase();

            if (!registry.has(key)) {
                registry.set(key, {
                    hostname: event.host.hostname,
                    ips: new Set(),
                    displayName: event.host.displayName
                });
            }

            if (event.host.ip) {
                registry.get(key).ips.add(event.host.ip);
            }
        }

        // Also collect IPs from connections
        if (event.connection) {
            if (event.connection.sourceHostname) {
                const sourceKey = event.connection.sourceHostname.toLowerCase();
                if (!registry.has(sourceKey)) {
                    registry.set(sourceKey, {
                        hostname: event.connection.sourceHostname,
                        ips: new Set(),
                        displayName: event.connection.sourceHostname
                    });
                }
                registry.get(sourceKey).ips.add(event.connection.sourceIp);
            }

            if (event.connection.destHostname) {
                const destKey = event.connection.destHostname.toLowerCase();
                if (!registry.has(destKey)) {
                    registry.set(destKey, {
                        hostname: event.connection.destHostname,
                        ips: new Set(),
                        displayName: event.connection.destHostname
                    });
                }
                registry.get(destKey).ips.add(event.connection.destIp);
            }
        }
    });

    // Build IP to host mapping
    registry.forEach((host, key) => {
        host.ips.forEach(ip => {
            ipToHost.set(ip, key);
        });
        // Convert Set to Array for easier use
        host.ips = Array.from(host.ips);
    });

    return {
        hosts: registry,
        ipToHost: ipToHost,

        // Resolve an IP to a hostname
        resolveIp: function (ip) {
            const hostKey = this.ipToHost.get(ip);
            if (hostKey && this.hosts.has(hostKey)) {
                return this.hosts.get(hostKey).hostname;
            }
            return ip; // Return IP if no hostname found
        },

        // Get all unique hosts as array
        getHostList: function () {
            return Array.from(this.hosts.values());
        }
    };
}

/**
 * Analyzes network events to identify connections between hosts.
 * Matches source/destination IPs and ports across events to find related activity.
 *
 * @param {Array} events - Array of parsed event objects
 * @param {Object} hostRegistry - Host registry from buildHostRegistry()
 * @returns {Array} Array of connection objects with source, destination, and related event references
 */
export function identifyConnections(events, hostRegistry) {
    const connections = [];

    events.forEach(event => {
        if (!event.connection) return;

        const conn = event.connection;

        // Resolve IPs to hostnames
        const sourceHost = hostRegistry.resolveIp(conn.sourceIp);
        const destHost = hostRegistry.resolveIp(conn.destIp);

        // Skip if same host (after resolution)
        if (sourceHost.toLowerCase() === destHost.toLowerCase()) return;

        connections.push({
            eventId: event.id,
            timestamp: event.timestamp,
            sourceHost: sourceHost,
            sourceIp: conn.sourceIp,
            sourcePort: conn.sourcePort,
            destHost: destHost,
            destIp: conn.destIp,
            destPort: conn.destPort,
            protocol: conn.protocol,
            direction: conn.direction,
            communityId: conn.communityId
        });
    });

    return connections;
}


