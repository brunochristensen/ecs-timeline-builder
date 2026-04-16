/**
 * MITRE ATT&CK tactic and technique constants.
 * Subset of the ATT&CK Enterprise matrix for analyst tagging.
 */

export const TACTICS = [
    { id: 'TA0043', name: 'Reconnaissance' },
    { id: 'TA0042', name: 'Resource Development' },
    { id: 'TA0001', name: 'Initial Access' },
    { id: 'TA0002', name: 'Execution' },
    { id: 'TA0003', name: 'Persistence' },
    { id: 'TA0004', name: 'Privilege Escalation' },
    { id: 'TA0005', name: 'Defense Evasion' },
    { id: 'TA0006', name: 'Credential Access' },
    { id: 'TA0007', name: 'Discovery' },
    { id: 'TA0008', name: 'Lateral Movement' },
    { id: 'TA0009', name: 'Collection' },
    { id: 'TA0011', name: 'Command and Control' },
    { id: 'TA0010', name: 'Exfiltration' },
    { id: 'TA0040', name: 'Impact' }
];

export const TECHNIQUES = {
    'TA0043': [
        { id: 'T1595', name: 'Active Scanning' },
        { id: 'T1592', name: 'Gather Victim Host Information' },
        { id: 'T1589', name: 'Gather Victim Identity Information' },
        { id: 'T1590', name: 'Gather Victim Network Information' }
    ],
    'TA0042': [
        { id: 'T1583', name: 'Acquire Infrastructure' },
        { id: 'T1586', name: 'Compromise Accounts' },
        { id: 'T1587', name: 'Develop Capabilities' },
        { id: 'T1585', name: 'Establish Accounts' }
    ],
    'TA0001': [
        { id: 'T1189', name: 'Drive-by Compromise' },
        { id: 'T1190', name: 'Exploit Public-Facing Application' },
        { id: 'T1133', name: 'External Remote Services' },
        { id: 'T1566', name: 'Phishing' },
        { id: 'T1078', name: 'Valid Accounts' },
        { id: 'T1199', name: 'Trusted Relationship' }
    ],
    'TA0002': [
        { id: 'T1059', name: 'Command and Scripting Interpreter' },
        { id: 'T1203', name: 'Exploitation for Client Execution' },
        { id: 'T1047', name: 'Windows Management Instrumentation' },
        { id: 'T1053', name: 'Scheduled Task/Job' },
        { id: 'T1204', name: 'User Execution' }
    ],
    'TA0003': [
        { id: 'T1098', name: 'Account Manipulation' },
        { id: 'T1136', name: 'Create Account' },
        { id: 'T1053', name: 'Scheduled Task/Job' },
        { id: 'T1505', name: 'Server Software Component' },
        { id: 'T1078', name: 'Valid Accounts' }
    ],
    'TA0004': [
        { id: 'T1548', name: 'Abuse Elevation Control Mechanism' },
        { id: 'T1134', name: 'Access Token Manipulation' },
        { id: 'T1068', name: 'Exploitation for Privilege Escalation' },
        { id: 'T1078', name: 'Valid Accounts' }
    ],
    'TA0005': [
        { id: 'T1140', name: 'Deobfuscate/Decode Files' },
        { id: 'T1070', name: 'Indicator Removal' },
        { id: 'T1036', name: 'Masquerading' },
        { id: 'T1027', name: 'Obfuscated Files or Information' },
        { id: 'T1562', name: 'Impair Defenses' }
    ],
    'TA0006': [
        { id: 'T1110', name: 'Brute Force' },
        { id: 'T1003', name: 'OS Credential Dumping' },
        { id: 'T1552', name: 'Unsecured Credentials' },
        { id: 'T1558', name: 'Steal or Forge Kerberos Tickets' }
    ],
    'TA0007': [
        { id: 'T1087', name: 'Account Discovery' },
        { id: 'T1083', name: 'File and Directory Discovery' },
        { id: 'T1046', name: 'Network Service Discovery' },
        { id: 'T1057', name: 'Process Discovery' },
        { id: 'T1018', name: 'Remote System Discovery' }
    ],
    'TA0008': [
        { id: 'T1021', name: 'Remote Services' },
        { id: 'T1080', name: 'Taint Shared Content' },
        { id: 'T1550', name: 'Use Alternate Authentication Material' },
        { id: 'T1570', name: 'Lateral Tool Transfer' }
    ],
    'TA0009': [
        { id: 'T1560', name: 'Archive Collected Data' },
        { id: 'T1005', name: 'Data from Local System' },
        { id: 'T1039', name: 'Data from Network Shared Drive' },
        { id: 'T1114', name: 'Email Collection' }
    ],
    'TA0011': [
        { id: 'T1071', name: 'Application Layer Protocol' },
        { id: 'T1132', name: 'Data Encoding' },
        { id: 'T1105', name: 'Ingress Tool Transfer' },
        { id: 'T1572', name: 'Protocol Tunneling' },
        { id: 'T1090', name: 'Proxy' }
    ],
    'TA0010': [
        { id: 'T1041', name: 'Exfiltration Over C2 Channel' },
        { id: 'T1048', name: 'Exfiltration Over Alternative Protocol' },
        { id: 'T1567', name: 'Exfiltration Over Web Service' },
        { id: 'T1029', name: 'Scheduled Transfer' }
    ],
    'TA0040': [
        { id: 'T1485', name: 'Data Destruction' },
        { id: 'T1486', name: 'Data Encrypted for Impact' },
        { id: 'T1489', name: 'Service Stop' },
        { id: 'T1490', name: 'Inhibit System Recovery' }
    ]
};

/**
 * Look up a tactic name by ID.
 *
 * @param {string} tacticId - MITRE ATT&CK tactic ID (e.g., "TA0003")
 * @returns {string} Human-readable name, or the original ID if not found
 */
export function getTacticName(tacticId) {
    const tactic = TACTICS.find(t => t.id === tacticId);
    return tactic ? tactic.name : tacticId;
}

/**
 * Look up a technique name by ID, searching across all tactic groups.
 *
 * @param {string} techniqueId - MITRE ATT&CK technique ID (e.g., "T1053")
 * @returns {string} Human-readable name, or the original ID if not found
 */
export function getTechniqueName(techniqueId) {
    for (const techniques of Object.values(TECHNIQUES)) {
        const match = techniques.find(t => t.id === techniqueId);
        if (match) return match.name;
    }
    return techniqueId;
}
