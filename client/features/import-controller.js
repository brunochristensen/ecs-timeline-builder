import bus from '../event-bus.js';
import {EVENTS} from '../events.js';
import {state} from '../state.js';
import {requireTimelineReady, sendEventsToServer} from '../sync.js';

let dropZone;
let fileInput;
let jsonInput;
let parseBtn;
let initialized = false;

async function handleFiles(files) {
    let allContent = '';

    for (const file of files) {
        try {
            const content = await readFile(file);
            allContent += `${content}\n`;
        } catch (error) {
            console.error(`Error reading file ${file.name}:`, error);
            alert(`Error reading file ${file.name}: ${error.message}`);
        }
    }

    if (allContent.trim()) {
        jsonInput.value = allContent.trim();
        parseAndRender();
    }
}

function readFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => resolve(event.target.result);
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsText(file);
    });
}

function parseAndRender() {
    const input = jsonInput.value.trim();

    if (!input) {
        alert('Please enter or drop some ECS JSON data');
        return;
    }

    if (!requireTimelineReady('import events')) {
        return;
    }

    try {
        const result = state.addEvents(input);

        if (result.parsed === 0) {
            alert('No valid events found in the input');
            return;
        }

        if (result.added.length === 0) {
            alert(`All ${result.parsed} events already exist in the timeline`);
            jsonInput.value = '';
            return;
        }

        const rawEvents = result.added.map(event => ({_id: event.id, ...event.raw}));
        sendEventsToServer(rawEvents);

        jsonInput.value = '';

        if (result.duplicates > 0) {
            console.log(`Added ${result.added.length} events, skipped ${result.duplicates} duplicates`);
        }
    } catch (error) {
        console.error('Parse error:', error);
        alert(`Error parsing events: ${error.message}`);
    }
}

export function initImportController() {
    if (initialized) return;
    initialized = true;

    dropZone = document.getElementById('drop-zone');
    fileInput = document.getElementById('file-input');
    jsonInput = document.getElementById('json-input');
    parseBtn = document.getElementById('parse-btn');

    dropZone.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (event) => {
        if (event.target.files.length > 0) {
            handleFiles(Array.from(event.target.files));
        }
    });

    dropZone.addEventListener('dragover', (event) => {
        event.preventDefault();
        dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', (event) => {
        event.preventDefault();
        dropZone.classList.remove('drag-over');
    });

    dropZone.addEventListener('drop', (event) => {
        event.preventDefault();
        dropZone.classList.remove('drag-over');

        const files = Array.from(event.dataTransfer.files).filter(
            file => file.name.endsWith('.json') || file.name.endsWith('.ndjson')
        );

        if (files.length > 0) {
            handleFiles(files);
        }
    });

    parseBtn.addEventListener('click', parseAndRender);

    jsonInput.addEventListener('keydown', (event) => {
        if (event.ctrlKey && event.key === 'Enter') {
            parseAndRender();
        }
    });

    bus.on(EVENTS.EVENTS_CLEARED, () => {
        jsonInput.value = '';
    });
}
