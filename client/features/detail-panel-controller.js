import bus from '../event-bus.js';
import {EVENTS} from '../events.js';
import {renderEventDetailPanel, renderMitreOptions} from '../detail-renderer.js';
import {
    isTimelineReady,
    sendDeleteToServer,
    sendAnnotationToServer,
    sendDeleteAnnotationToServer
} from '../sync.js';
import {state} from '../state.js';
import {TECHNIQUES} from '../mitre.js';
import {sessionState} from '../stores/session-store.js';

let eventDetail;
let detailContent;
let closeDetailBtn;
let currentDetailEvent = null;
let initialized = false;

function requireTimelineReady(actionLabel) {
    if (isTimelineReady()) {
        return true;
    }

    sessionState.setLastError(`Cannot ${actionLabel} while timeline sync is not ready.`);
    return false;
}

function hideEventDetail() {
    if (eventDetail) {
        eventDetail.hidden = true;
    }
}

function refreshDetailIfOpen(eventId) {
    if (currentDetailEvent && currentDetailEvent.id === eventId) {
        showEventDetail(currentDetailEvent);
    }
}

export function showEventDetail(event) {
    currentDetailEvent = event;
    const annotation = state.annotations.get(event.id) || null;
    detailContent.innerHTML = renderEventDetailPanel(event, annotation);
    eventDetail.hidden = false;

    const deleteBtn = document.getElementById('delete-event-btn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', () => {
            const eventId = deleteBtn.dataset.eventId;
            if (confirm('Delete this event? This cannot be undone.')) {
                if (requireTimelineReady('delete events')) {
                    sendDeleteToServer(eventId);
                }
            }
        });
    }

    const tacticSelect = document.getElementById('annotation-tactic');
    const techniqueSelect = document.getElementById('annotation-technique');
    if (tacticSelect && techniqueSelect) {
        tacticSelect.addEventListener('change', () => {
            const techniqueList = TECHNIQUES[tacticSelect.value] || null;
            techniqueSelect.innerHTML = renderMitreOptions(techniqueList, '', '-- Select Technique --');
        });
    }

    const saveAnnotationBtn = document.getElementById('save-annotation-btn');
    if (saveAnnotationBtn) {
        saveAnnotationBtn.addEventListener('click', () => {
            const comment = document.getElementById('annotation-comment').value;
            const mitreTactic = document.getElementById('annotation-tactic').value;
            const mitreTechnique = document.getElementById('annotation-technique').value;
            const annotationData = {comment, mitreTactic, mitreTechnique};

            if (requireTimelineReady('save annotations')) {
                sendAnnotationToServer(event.id, annotationData);
            }
        });
    }

    const deleteAnnotationBtn = document.getElementById('delete-annotation-btn');
    if (deleteAnnotationBtn) {
        deleteAnnotationBtn.addEventListener('click', () => {
            if (requireTimelineReady('delete annotations')) {
                sendDeleteAnnotationToServer(event.id);
            }
        });
    }
}

export function initDetailPanelController() {
    if (initialized) return;
    initialized = true;

    eventDetail = document.getElementById('event-detail');
    detailContent = document.getElementById('detail-content');
    closeDetailBtn = document.getElementById('close-detail');

    closeDetailBtn.addEventListener('click', hideEventDetail);

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !eventDetail.hidden) {
            hideEventDetail();
        }
    });

    bus.on(EVENTS.ANNOTATION_UPDATED, refreshDetailIfOpen);
    bus.on(EVENTS.ANNOTATION_DELETED, refreshDetailIfOpen);
    bus.on(EVENTS.EVENT_DELETED, () => hideEventDetail());
    bus.on(EVENTS.EVENTS_CLEARED, () => hideEventDetail());
}
