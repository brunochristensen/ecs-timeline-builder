import { describe, it } from 'node:test';
import assert from 'node:assert';
import { TACTICS, TECHNIQUES, getTacticName, getTechniqueName } from '../js/mitre.js';

describe('MITRE ATT&CK constants', () => {

    describe('TACTICS', () => {

        it('should expose a non-empty array of tactics', () => {
            assert.ok(Array.isArray(TACTICS));
            assert.ok(TACTICS.length > 0);
        });

        it('should give each tactic a string id and name', () => {
            for (const tactic of TACTICS) {
                assert.strictEqual(typeof tactic.id, 'string');
                assert.strictEqual(typeof tactic.name, 'string');
                assert.ok(tactic.id.startsWith('TA'));
            }
        });

        it('should have unique tactic ids', () => {
            const ids = TACTICS.map(t => t.id);
            assert.strictEqual(new Set(ids).size, ids.length);
        });

    });

    describe('TECHNIQUES', () => {

        it('should key techniques by tactic id', () => {
            for (const tacticId of Object.keys(TECHNIQUES)) {
                assert.ok(
                    TACTICS.some(t => t.id === tacticId),
                    `TECHNIQUES key ${tacticId} should match a known tactic`
                );
            }
        });

        it('should give each technique a T-prefixed id and a name', () => {
            for (const list of Object.values(TECHNIQUES)) {
                assert.ok(Array.isArray(list));
                for (const tech of list) {
                    assert.strictEqual(typeof tech.id, 'string');
                    assert.strictEqual(typeof tech.name, 'string');
                    assert.ok(tech.id.startsWith('T'));
                }
            }
        });

    });

    describe('getTacticName()', () => {

        it('should return the name for a known tactic id', () => {
            assert.strictEqual(getTacticName('TA0001'), 'Initial Access');
            assert.strictEqual(getTacticName('TA0003'), 'Persistence');
        });

        it('should return the input id unchanged when the tactic is unknown', () => {
            assert.strictEqual(getTacticName('TA9999'), 'TA9999');
        });

    });

    describe('getTechniqueName()', () => {

        it('should return the name for a known technique id', () => {
            // T1078 is listed under multiple tactics (Initial Access, Persistence, Privilege Escalation)
            assert.strictEqual(getTechniqueName('T1078'), 'Valid Accounts');
            assert.strictEqual(getTechniqueName('T1566'), 'Phishing');
        });

        it('should return the input id unchanged when the technique is unknown', () => {
            assert.strictEqual(getTechniqueName('T9999'), 'T9999');
        });

    });

});
