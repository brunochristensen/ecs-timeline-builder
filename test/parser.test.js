const { describe, it, before } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ECSParser = require('../js/parser.js');

/**
 * Helper to load test data files
 * Handles the Elastic integrations test format with { expected: [...] } wrapper
 */
function loadTestData(filename) {
    const filePath = path.join(__dirname, '..', 'test-data', filename);
    const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    // Handle Elastic's test format with "expected" wrapper
    return content.expected || content.events || content;
}

describe('ECSParser', () => {

    describe('parse()', () => {

        it('should parse a simple ECS event with @timestamp', () => {
            const event = {
                '@timestamp': '2024-01-15T10:30:00.000Z',
                'host': { 'hostname': 'webserver-01' },
                'event': { 'category': ['network'], 'action': 'connection_established' }
            };

            const result = ECSParser.parse([event]);

            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].host.hostname, 'webserver-01');
            assert.strictEqual(result[0].category, 'network');
            assert.ok(result[0].timestamp instanceof Date);
        });

        it('should skip events without valid timestamps', () => {
            const events = [
                { '@timestamp': '2024-01-15T10:30:00.000Z', 'host': { 'hostname': 'server1' } },
                { 'host': { 'hostname': 'server2' } }, // No timestamp
                { '@timestamp': 'invalid-date', 'host': { 'hostname': 'server3' } }
            ];

            const result = ECSParser.parse(events);

            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].host.hostname, 'server1');
        });

        it('should handle JSON string input', () => {
            const json = JSON.stringify([{
                '@timestamp': '2024-01-15T10:30:00.000Z',
                'host': { 'hostname': 'test-host' }
            }]);

            const result = ECSParser.parse(json);

            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].host.hostname, 'test-host');
        });

        it('should handle JSON array string input', () => {
            // Parser prefers JSON arrays over NDJSON for multi-event input
            const jsonArray = JSON.stringify([
                { '@timestamp': '2024-01-15T10:30:00.000Z', 'host': { 'hostname': 'host1' } },
                { '@timestamp': '2024-01-15T10:31:00.000Z', 'host': { 'hostname': 'host2' } }
            ]);

            const result = ECSParser.parse(jsonArray);

            assert.strictEqual(result.length, 2);
            assert.strictEqual(result[0].host.hostname, 'host1');
            assert.strictEqual(result[1].host.hostname, 'host2');
        });

        it('should handle Elasticsearch _source wrapper format', () => {
            const esFormat = [{
                '_id': 'abc123',
                '_source': {
                    '@timestamp': '2024-01-15T10:30:00.000Z',
                    'host': { 'hostname': 'es-host' }
                }
            }];

            const result = ECSParser.parse(esFormat);

            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].id, 'abc123');
            assert.strictEqual(result[0].host.hostname, 'es-host');
        });

        it('should handle array-valued fields (Elasticsearch format)', () => {
            const event = {
                '@timestamp': '2024-01-15T10:30:00.000Z',
                'host': {
                    'hostname': ['server-01'],  // Array instead of string
                    'ip': ['192.168.1.100', '10.0.0.100']
                }
            };

            const result = ECSParser.parse([event]);

            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].host.hostname, 'server-01');
            assert.strictEqual(result[0].host.ip, '192.168.1.100');
        });

    });

    describe('category extraction', () => {

        it('should categorize network events', () => {
            const event = {
                '@timestamp': '2024-01-15T10:30:00.000Z',
                'host': { 'hostname': 'firewall' },
                'event': { 'category': ['network'] }
            };

            const result = ECSParser.parse([event]);
            assert.strictEqual(result[0].category, 'network');
        });

        it('should categorize authentication events', () => {
            const event = {
                '@timestamp': '2024-01-15T10:30:00.000Z',
                'host': { 'hostname': 'dc01' },
                'event': { 'category': ['authentication'] }
            };

            const result = ECSParser.parse([event]);
            assert.strictEqual(result[0].category, 'authentication');
        });

        it('should categorize process events', () => {
            const event = {
                '@timestamp': '2024-01-15T10:30:00.000Z',
                'host': { 'hostname': 'workstation' },
                'event': { 'category': ['process'] }
            };

            const result = ECSParser.parse([event]);
            assert.strictEqual(result[0].category, 'process');
        });

        it('should map intrusion_detection to network category', () => {
            const event = {
                '@timestamp': '2024-01-15T10:30:00.000Z',
                'host': { 'hostname': 'ids-sensor' },
                'event': { 'category': ['intrusion_detection'] }
            };

            const result = ECSParser.parse([event]);
            assert.strictEqual(result[0].category, 'network');
        });

        it('should default to "other" for unknown categories', () => {
            const event = {
                '@timestamp': '2024-01-15T10:30:00.000Z',
                'host': { 'hostname': 'server' },
                'event': { 'category': ['custom_category'] }
            };

            const result = ECSParser.parse([event]);
            assert.strictEqual(result[0].category, 'other');
        });

    });

    describe('connection extraction', () => {

        it('should extract network connection info', () => {
            const event = {
                '@timestamp': '2024-01-15T10:30:00.000Z',
                'host': { 'hostname': 'firewall' },
                'source': { 'ip': '192.168.1.100', 'port': 54321 },
                'destination': { 'ip': '10.0.0.50', 'port': 443 },
                'network': { 'transport': 'tcp', 'direction': 'outbound' }
            };

            const result = ECSParser.parse([event]);

            assert.ok(result[0].connection);
            assert.strictEqual(result[0].connection.sourceIp, '192.168.1.100');
            assert.strictEqual(result[0].connection.destIp, '10.0.0.50');
            assert.strictEqual(result[0].connection.destPort, 443);
            assert.strictEqual(result[0].connection.protocol, 'tcp');
        });

        it('should skip localhost connections', () => {
            const event = {
                '@timestamp': '2024-01-15T10:30:00.000Z',
                'host': { 'hostname': 'server' },
                'source': { 'ip': '127.0.0.1', 'port': 54321 },
                'destination': { 'ip': '127.0.0.1', 'port': 8080 }
            };

            const result = ECSParser.parse([event]);
            assert.strictEqual(result[0].connection, null);
        });

        it('should skip same-IP connections', () => {
            const event = {
                '@timestamp': '2024-01-15T10:30:00.000Z',
                'host': { 'hostname': 'server' },
                'source': { 'ip': '192.168.1.100', 'port': 54321 },
                'destination': { 'ip': '192.168.1.100', 'port': 8080 }
            };

            const result = ECSParser.parse([event]);
            assert.strictEqual(result[0].connection, null);
        });

    });

    describe('buildHostRegistry()', () => {

        it('should build registry from parsed events', () => {
            const events = ECSParser.parse([
                { '@timestamp': '2024-01-15T10:30:00.000Z', 'host': { 'hostname': 'server-01', 'ip': '192.168.1.10' } },
                { '@timestamp': '2024-01-15T10:31:00.000Z', 'host': { 'hostname': 'server-01', 'ip': '192.168.1.10' } },
                { '@timestamp': '2024-01-15T10:32:00.000Z', 'host': { 'hostname': 'server-02', 'ip': '192.168.1.20' } }
            ]);

            const registry = ECSParser.buildHostRegistry(events);
            const hostList = registry.getHostList();

            assert.strictEqual(hostList.length, 2);
            assert.ok(hostList.some(h => h.hostname === 'server-01'));
            assert.ok(hostList.some(h => h.hostname === 'server-02'));
        });

        it('should resolve IPs to hostnames', () => {
            const events = ECSParser.parse([
                { '@timestamp': '2024-01-15T10:30:00.000Z', 'host': { 'hostname': 'web-server', 'ip': '10.0.0.100' } }
            ]);

            const registry = ECSParser.buildHostRegistry(events);

            assert.strictEqual(registry.resolveIp('10.0.0.100'), 'web-server');
            assert.strictEqual(registry.resolveIp('10.0.0.200'), '10.0.0.200'); // Unknown IP returns itself
        });

    });

    describe('identifyConnections()', () => {

        it('should identify cross-host connections', () => {
            const events = ECSParser.parse([
                {
                    '@timestamp': '2024-01-15T10:30:00.000Z',
                    'host': { 'hostname': 'client', 'ip': '192.168.1.100' },
                    'source': { 'ip': '192.168.1.100', 'port': 54321 },
                    'destination': { 'ip': '192.168.1.200', 'port': 443 }
                },
                {
                    '@timestamp': '2024-01-15T10:31:00.000Z',
                    'host': { 'hostname': 'server', 'ip': '192.168.1.200' }
                }
            ]);

            const registry = ECSParser.buildHostRegistry(events);
            const connections = ECSParser.identifyConnections(events, registry);

            assert.strictEqual(connections.length, 1);
            assert.strictEqual(connections[0].sourceHost, 'client');
            assert.strictEqual(connections[0].destHost, 'server');
        });

    });

    describe('getNestedValue()', () => {

        it('should extract nested values', () => {
            const obj = { a: { b: { c: 'value' } } };
            assert.strictEqual(ECSParser.getNestedValue(obj, 'a.b.c'), 'value');
        });

        it('should return default for missing paths', () => {
            const obj = { a: { b: 1 } };
            assert.strictEqual(ECSParser.getNestedValue(obj, 'a.c.d', 'default'), 'default');
        });

        it('should handle null objects gracefully', () => {
            assert.strictEqual(ECSParser.getNestedValue(null, 'a.b'), null);
            assert.strictEqual(ECSParser.getNestedValue(undefined, 'a.b', 'default'), 'default');
        });

    });

});

describe('Real ECS Data Tests', () => {

    describe('Sysmon Events', () => {
        let sysmonEvents;

        before(() => {
            sysmonEvents = loadTestData('sysmon-events.json');
        });

        it('should load Sysmon test data', () => {
            assert.ok(Array.isArray(sysmonEvents));
            assert.ok(sysmonEvents.length > 0, 'Should have test events');
        });

        it('should parse Sysmon events with @timestamp', () => {
            const parsed = ECSParser.parse(sysmonEvents.slice(0, 10));
            assert.ok(parsed.length > 0, 'Should parse at least some events');
            // Verify timestamps were parsed
            assert.ok(parsed[0].timestamp instanceof Date);
        });

        it('should extract event details from Sysmon events', () => {
            const parsed = ECSParser.parse(sysmonEvents.slice(0, 10));
            // Sysmon events have winlog.computer_name, not host.hostname
            // Parser will set host to Unknown but event still parses
            assert.ok(parsed.length > 0);
            // Check that event details are extracted
            assert.ok(parsed[0].details);
        });

    });

    describe('Suricata Alerts', () => {
        let suricataEvents;

        before(() => {
            suricataEvents = loadTestData('suricata-alerts.json');
        });

        it('should load Suricata test data', () => {
            assert.ok(Array.isArray(suricataEvents));
            assert.ok(suricataEvents.length > 0, 'Should have test events');
        });

        it('should parse Suricata events', () => {
            const parsed = ECSParser.parse(suricataEvents.slice(0, 10));
            assert.ok(parsed.length > 0, 'Should parse at least some events');
        });

        it('should extract network connections from Suricata events', () => {
            const parsed = ECSParser.parse(suricataEvents.slice(0, 20));
            const withConnections = parsed.filter(e => e.connection !== null);
            assert.ok(withConnections.length > 0, 'Should have events with connection info');
        });

        it('should categorize Suricata events as network', () => {
            const parsed = ECSParser.parse(suricataEvents.slice(0, 10));
            const networkEvents = parsed.filter(e => e.category === 'network');
            assert.ok(networkEvents.length > 0, 'Should categorize as network events');
        });

    });

    describe('Linux Audit Events', () => {
        let sudoEvents;

        before(() => {
            sudoEvents = loadTestData('linux-sudo.json');
        });

        it('should load Linux audit test data', () => {
            assert.ok(Array.isArray(sudoEvents));
            assert.ok(sudoEvents.length > 0, 'Should have test events');
        });

        it('should have authentication category in raw events', () => {
            // Note: These are "expected" output from Elastic ingest pipeline tests
            // They may lack @timestamp since that's added during ingestion
            const firstEvent = sudoEvents[0];
            assert.ok(firstEvent.event);
            assert.ok(firstEvent.event.category);
            assert.ok(firstEvent.event.category.includes('authentication'));
        });

        it('should have process information in audit events', () => {
            const firstEvent = sudoEvents[0];
            assert.ok(firstEvent.process);
            assert.strictEqual(firstEvent.process.executable, '/usr/bin/sudo');
        });

    });

    describe('PowerShell Events', () => {
        let psEvents;

        before(() => {
            psEvents = loadTestData('powershell-events.json');
        });

        it('should load PowerShell test data', () => {
            assert.ok(Array.isArray(psEvents));
            assert.ok(psEvents.length > 0, 'Should have test events');
        });

        it('should parse PowerShell events', () => {
            const parsed = ECSParser.parse(psEvents.slice(0, 10));
            assert.ok(parsed.length > 0, 'Should parse at least some events');
        });

    });

    describe('AWS CloudTrail Events', () => {
        let awsEvents;

        before(() => {
            awsEvents = loadTestData('aws-assume-role.json');
        });

        it('should load AWS CloudTrail test data', () => {
            assert.ok(Array.isArray(awsEvents));
            assert.ok(awsEvents.length > 0, 'Should have test events');
        });

        it('should parse AWS CloudTrail events', () => {
            const parsed = ECSParser.parse(awsEvents.slice(0, 10));
            assert.ok(parsed.length > 0, 'Should parse at least some events');
        });

    });

});
