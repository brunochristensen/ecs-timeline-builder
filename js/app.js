(function() {
    'use strict';

    // State
    let currentEvents = [];
    let currentHostRegistry = null;
    let currentConnections = [];
    let syncEnabled = false;

    // DOM Elements
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const jsonInput = document.getElementById('json-input');
    const parseBtn = document.getElementById('parse-btn');
    const clearBtn = document.getElementById('clear-btn');
    const exportBtn = document.getElementById('export-btn');
    const eventDetail = document.getElementById('event-detail');
    const detailContent = document.getElementById('detail-content');
    const closeDetailBtn = document.getElementById('close-detail');

    // Sidebar elements
    const sidebar = document.getElementById('sidebar');
    const sidebarToggle = document.getElementById('sidebar-toggle');

    // Filter checkboxes
    const filterNetwork = document.getElementById('filter-network');
    const filterFile = document.getElementById('filter-file');
    const filterProcess = document.getElementById('filter-process');
    const filterAuth = document.getElementById('filter-auth');
    const filterOther = document.getElementById('filter-other');

    // Zoom buttons
    const zoomInBtn = document.getElementById('zoom-in');
    const zoomOutBtn = document.getElementById('zoom-out');
    const zoomResetBtn = document.getElementById('zoom-reset');

    /**
     * Initialize the application
     */
    function init() {
        // Initialize timeline visualization
        TimelineVis.init('#timeline-container', showEventDetail);

        // Set up event listeners
        setupDragDrop();
        setupPasteInput();
        setupFilters();
        setupZoomControls();
        setupDetailPanel();
        setupSidebar();
        setupHeaderControls();

        // Initialize sync if available (when running with server)
        initSync();
    }

    /**
     * Initialize WebSocket sync
     */
    function initSync() {
        // Check if we're running from a server. This might not be optimal
        if (window.location.protocol === 'file:') {
            console.log('Running locally, sync disabled');
            document.getElementById('stat-users').textContent = 'Local';
            return;
        }

        // Dynamically load sync module only when needed
        const script = document.createElement('script');
        script.src = 'js/sync.js';
        script.onload = function() {
            if (typeof TimelineSync !== 'undefined') {
                syncEnabled = true;
                TimelineSync.init({
                    onSync: handleFullSync,
                    onEventsAdded: handleEventsAdded,
                    onCleared: handleRemoteCleared,
                    onUserCount: handleUserCount,
                    onConnectionChange: handleConnectionChange
                });
            }
        };
        script.onerror = function() {
            console.log('Sync module not available');
        };
        document.head.appendChild(script);
    }

    /**
     * Handle full sync from server (on connect or reconnect)
     */
    function handleFullSync(rawEvents) {
        // Clear current state
        currentEvents = [];

        if (rawEvents.length > 0) {
            // Parse and render the synced events
            currentEvents = ECSParser.parse(rawEvents);
            currentHostRegistry = ECSParser.buildHostRegistry(currentEvents);
            currentConnections = ECSParser.identifyConnections(currentEvents, currentHostRegistry);

            updateStats(currentEvents, currentHostRegistry, currentConnections);
            clearBtn.disabled = false;
            exportBtn.disabled = false;

            TimelineVis.render(currentEvents, currentHostRegistry, currentConnections);
        } else {
            // Empty timeline
            currentHostRegistry = null;
            currentConnections = [];
            resetStats();
            clearBtn.disabled = true;
            exportBtn.disabled = true;
            TimelineVis.clear();
        }
    }

    /**
     * Handle new events from another client
     */
    function handleEventsAdded(rawEvents) {
        if (rawEvents.length === 0) return;

        // Parse the new events
        const newParsed = ECSParser.parse(rawEvents);

        // Deduplicate
        const existingIds = new Set(currentEvents.map(e => e.id));
        const uniqueNew = newParsed.filter(e => !existingIds.has(e.id));

        if (uniqueNew.length > 0) {
            currentEvents = [...currentEvents, ...uniqueNew];
            currentHostRegistry = ECSParser.buildHostRegistry(currentEvents);
            currentConnections = ECSParser.identifyConnections(currentEvents, currentHostRegistry);

            updateStats(currentEvents, currentHostRegistry, currentConnections);
            clearBtn.disabled = false;
            exportBtn.disabled = false;

            TimelineVis.render(currentEvents, currentHostRegistry, currentConnections);
        }
    }

    /**
     * Handle remote clear (another client cleared the timeline)
     */
    function handleRemoteCleared() {
        currentEvents = [];
        currentHostRegistry = null;
        currentConnections = [];

        jsonInput.value = '';
        eventDetail.hidden = true;

        clearBtn.disabled = true;
        exportBtn.disabled = true;

        resetStats();
        TimelineVis.clear();
    }

    /**
     * Handle user count update
     */
    function handleUserCount(count) {
        document.getElementById('stat-users').textContent = count;
    }

    /**
     * Handle connection state change
     */
    function handleConnectionChange(connected) {
        const usersEl = document.getElementById('stat-users');
        if (!connected) {
            usersEl.textContent = 'Reconnecting...';
        }
    }

    /**
     * Reset stats display
     */
    function resetStats() {
        document.getElementById('stat-events').textContent = '0';
        document.getElementById('stat-hosts').textContent = '0';
        document.getElementById('stat-connections').textContent = '0';
        document.getElementById('stat-timespan').textContent = '-';
    }

    /**
     * Set up drag and drop functionality
     */
    function setupDragDrop() {
        // Click to select files
        dropZone.addEventListener('click', () => fileInput.click());

        // File input change
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                handleFiles(Array.from(e.target.files));
            }
        });

        // Drag events
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('drag-over');
        });

        dropZone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            dropZone.classList.remove('drag-over');
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('drag-over');

            const files = Array.from(e.dataTransfer.files).filter(
                f => f.name.endsWith('.json') || f.name.endsWith('.ndjson')
            );

            if (files.length > 0) {
                handleFiles(files);
            }
        });
    }

    /**
     * Handle dropped/selected files
     */
    async function handleFiles(files) {
        let allContent = '';

        for (const file of files) {
            try {
                const content = await readFile(file);
                allContent += content + '\n';
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

    /**
     * Read a file as text
     */
    function readFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsText(file);
        });
    }

    /**
     * Set up paste/parse functionality
     */
    function setupPasteInput() {
        parseBtn.addEventListener('click', parseAndRender);

        // Also parse on Ctrl+Enter
        jsonInput.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'Enter') {
                parseAndRender();
            }
        });
    }

    /**
     * Parse input and render timeline
     * Events accumulate - new events are added to existing ones (deduplicated by _id)
     */
    function parseAndRender() {
        const input = jsonInput.value.trim();

        if (!input) {
            alert('Please enter or drop some ECS JSON data');
            return;
        }

        try {
            // Parse new events
            const newEvents = ECSParser.parse(input);

            if (newEvents.length === 0) {
                alert('No valid events found in the input');
                return;
            }

            // Deduplicate: build set of existing event IDs
            const existingIds = new Set(currentEvents.map(e => e.id));

            // Filter out duplicates and count them
            const uniqueNewEvents = newEvents.filter(e => !existingIds.has(e.id));
            const duplicateCount = newEvents.length - uniqueNewEvents.length;

            if (uniqueNewEvents.length === 0) {
                alert(`All ${newEvents.length} events already exist in the timeline`);
                jsonInput.value = '';
                return;
            }

            // If sync is enabled, send raw events to server
            if (syncEnabled && TimelineSync.connected()) {
                // Extract raw events for the unique parsed ones
                const uniqueRawEvents = uniqueNewEvents.map(e => e.raw);
                TimelineSync.addEvents(uniqueRawEvents);
            }

            // Add new events to cumulative list
            currentEvents = [...currentEvents, ...uniqueNewEvents];

            // Rebuild host registry and connections from full event list
            currentHostRegistry = ECSParser.buildHostRegistry(currentEvents);
            currentConnections = ECSParser.identifyConnections(currentEvents, currentHostRegistry);

            // Update stats with cumulative totals
            updateStats(currentEvents, currentHostRegistry, currentConnections);

            // Enable action buttons
            clearBtn.disabled = false;
            exportBtn.disabled = false;

            // Clear textarea
            jsonInput.value = '';

            // Render timeline with all events
            TimelineVis.render(currentEvents, currentHostRegistry, currentConnections);

            // Notify user if some duplicates were skipped
            if (duplicateCount > 0) {
                console.log(`Added ${uniqueNewEvents.length} events, skipped ${duplicateCount} duplicates`);
            }

        } catch (error) {
            console.error('Parse error:', error);
            alert(`Error parsing events: ${error.message}`);
        }
    }

    /**
     * Update statistics display
     */
    function updateStats(events, hostRegistry, connections) {
        document.getElementById('stat-events').textContent = events.length;
        document.getElementById('stat-hosts').textContent = hostRegistry.getHostList().length;
        document.getElementById('stat-connections').textContent = connections.length;

        // Calculate time span
        const timestamps = events.map(e => e.timestamp).sort((a, b) => a - b);
        if (timestamps.length > 1) {
            const duration = timestamps[timestamps.length - 1] - timestamps[0];
            document.getElementById('stat-timespan').textContent = Utils.formatDuration(duration);
        } else {
            document.getElementById('stat-timespan').textContent = '-';
        }
    }

    /**
     * Set up filter checkboxes
     */
    function setupFilters() {
        const updateFilters = () => {
            TimelineVis.setFilters({
                network: filterNetwork.checked,
                file: filterFile.checked,
                process: filterProcess.checked,
                authentication: filterAuth.checked,
                other: filterOther.checked
            });
        };

        filterNetwork.addEventListener('change', updateFilters);
        filterFile.addEventListener('change', updateFilters);
        filterProcess.addEventListener('change', updateFilters);
        filterAuth.addEventListener('change', updateFilters);
        filterOther.addEventListener('change', updateFilters);
    }

    /**
     * Set up zoom controls
     */
    function setupZoomControls() {
        zoomInBtn.addEventListener('click', () => TimelineVis.zoomIn());
        zoomOutBtn.addEventListener('click', () => TimelineVis.zoomOut());
        zoomResetBtn.addEventListener('click', () => TimelineVis.zoomReset());
    }

    /**
     * Set up event detail panel
     */
    function setupDetailPanel() {
        closeDetailBtn.addEventListener('click', hideEventDetail);

        // Close on escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !eventDetail.hidden) {
                hideEventDetail();
            }
        });
    }

    /**
     * Set up sidebar toggle
     */
    function setupSidebar() {
        sidebarToggle.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
        });
    }

    /**
     * Show event detail panel
     */
    function showEventDetail(event) {
        detailContent.innerHTML = DetailRenderer.render(event);
        eventDetail.hidden = false;
    }

    /**
     * Hide event detail panel
     */
    function hideEventDetail() {
        eventDetail.hidden = true;
    }

    /**
     * Set up header control buttons
     */
    function setupHeaderControls() {
        clearBtn.addEventListener('click', clearTimeline);
        exportBtn.addEventListener('click', exportTimeline);
    }

    /**
     * Export timeline events as JSON file
     */
    function exportTimeline() {
        if (currentEvents.length === 0) {
            alert('No events to export');
            return;
        }

        // Extract raw events for export
        const rawEvents = currentEvents.map(e => e.raw);

        // Create JSON string
        const jsonString = JSON.stringify(rawEvents, null, 2);

        // Create blob and download link
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        // Generate filename with timestamp
        const now = new Date();
        const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const filename = `ecs-timeline-${timestamp}.json`;

        // Trigger download
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        // Clean up
        URL.revokeObjectURL(url);
    }

    /**
     * Clear the timeline and reset state
     */
    function clearTimeline() {
        // If sync is enabled, notify server (which will broadcast to all clients)
        if (syncEnabled && TimelineSync.connected()) {
            TimelineSync.clear();
            // The handleRemoteCleared callback will handle the actual clearing
            return;
        }

        // Local-only clear
        currentEvents = [];
        currentHostRegistry = null;
        currentConnections = [];

        jsonInput.value = '';
        eventDetail.hidden = true;

        clearBtn.disabled = true;
        exportBtn.disabled = true;

        resetStats();
        TimelineVis.clear();
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
