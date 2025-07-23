import {Counter, Gauge, Histogram, Summary} from "prom-client";

// ================================
// Business Metrics
// ================================

// Room metrics
export const totalRooms = new Gauge({
    name: 'webrtc_rooms_total',
    help: 'Total number of rooms (active + inactive)',
    labelNames: ['status'] as const
});

export const activeRooms = new Gauge({
    name: 'webrtc_rooms_active',
    help: 'Number of active rooms'
});

export const roomsCreated = new Counter({
    name: 'webrtc_rooms_created_total',
    help: 'Total number of rooms created',
    labelNames: ['creator_type'] as const
});

export const roomsDestroyed = new Counter({
    name: 'webrtc_rooms_destroyed_total',
    help: 'Total number of rooms destroyed',
    labelNames: ['reason'] as const // 'timeout', 'manual', 'empty'
});

export const roomDuration = new Histogram({
    name: 'webrtc_room_duration_seconds',
    help: 'Room lifetime duration',
    buckets: [60, 300, 900, 1800, 3600, 7200, 14400] // 1m, 5m, 15m, 30m, 1h, 2h, 4h
});

// Participant metrics
export const totalParticipants = new Gauge({
    name: 'webrtc_participants_total',
    help: 'Total number of participants across all rooms'
});

export const connectedParticipants = new Gauge({
    name: 'webrtc_participants_connected',
    help: 'Number of currently connected participants'
});

export const participantJoins = new Counter({
    name: 'webrtc_participant_joins_total',
    help: 'Total number of participant joins',
    labelNames: ['join_type'] as const // 'new', 'reconnect'
});

export const participantLeaves = new Counter({
    name: 'webrtc_participant_leaves_total',
    help: 'Total number of participant leaves',
    labelNames: ['leave_type'] as const // 'manual', 'disconnect', 'timeout'
});

export const participantSessionDuration = new Histogram({
    name: 'webrtc_participant_session_duration_seconds',
    help: 'Participant session duration',
    buckets: [30, 60, 300, 900, 1800, 3600, 7200] // 30s, 1m, 5m, 15m, 30m, 1h, 2h
});

// WebRTC Connection metrics
export const peerConnections = new Gauge({
    name: 'webrtc_peer_connections_total',
    help: 'Number of active peer connections',
    labelNames: ['state'] as const // 'new', 'connecting', 'connected', 'disconnected', 'failed'
});

export const peerConnectionAttempts = new Counter({
    name: 'webrtc_peer_connection_attempts_total',
    help: 'Total peer connection attempts',
    labelNames: ['result'] as const // 'success', 'failure'
});

export const peerConnectionDuration = new Histogram({
    name: 'webrtc_peer_connection_establishment_duration_seconds',
    help: 'Time to establish peer connections',
    buckets: [0.1, 0.5, 1, 2, 5, 10, 30] // 100ms to 30s
});

export const iceConnectionStates = new Gauge({
    name: 'webrtc_ice_connections_total',
    help: 'ICE connection states',
    labelNames: ['state'] as const // 'new', 'checking', 'connected', 'completed', 'failed', 'disconnected', 'closed'
});

export const iceCandidatesGenerated = new Counter({
    name: 'webrtc_ice_candidates_generated_total',
    help: 'Total ICE candidates generated',
    labelNames: ['type'] as const // 'host', 'srflx', 'relay'
});

// Media metrics
export const mediaStreams = new Gauge({
    name: 'webrtc_media_streams_active',
    help: 'Active media streams',
    labelNames: ['type'] as const // 'video', 'audio', 'screen'
});

export const mediaToggleEvents = new Counter({
    name: 'webrtc_media_toggle_events_total',
    help: 'Media toggle events (on/off)',
    labelNames: ['type', 'action'] as const // type: 'video'|'audio'|'screen', action: 'enable'|'disable'
});

// Chat metrics
export const chatMessages = new Counter({
    name: 'webrtc_chat_messages_total',
    help: 'Total chat messages sent',
    labelNames: ['type'] as const // 'text', 'emoji', 'system'
});

export const chatMessageSize = new Histogram({
    name: 'webrtc_chat_message_size_bytes',
    help: 'Chat message size distribution',
    buckets: [10, 50, 100, 250, 500, 1000] // Small to max (1000 chars)
});

export const typingIndicators = new Counter({
    name: 'webrtc_typing_indicators_total',
    help: 'Typing indicator events',
    labelNames: ['action'] as const // 'start', 'stop'
});

// ================================
// Technical Metrics
// ================================

// Socket.IO metrics
export const socketConnections = new Gauge({
    name: 'webrtc_socket_connections_active',
    help: 'Number of active Socket.IO connections'
});

export const socketEvents = new Counter({
    name: 'webrtc_socket_events_total',
    help: 'Total Socket.IO events processed',
    labelNames: ['event_name', 'direction'] as const // direction: 'inbound', 'outbound'
});

export const socketEventDuration = new Histogram({
    name: 'webrtc_socket_event_duration_seconds',
    help: 'Socket event processing duration',
    labelNames: ['event_name'] as const,
    buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1] // 1ms to 1s
});

export const socketReconnections = new Counter({
    name: 'webrtc_socket_reconnections_total',
    help: 'Socket reconnection attempts',
    labelNames: ['result'] as const // 'success', 'failure'
});

// Redis/Memory metrics
export const stateOperations = new Counter({
    name: 'webrtc_state_operations_total',
    help: 'State operations',
    labelNames: ['operation', 'type'] as const // operation: 'get', 'set', 'delete'; type: 'participant', 'room', 'typing'
});

export const stateLatency = new Histogram({
    name: 'webrtc_state_latency_seconds',
    help: 'State operation latency',
    labelNames: ['operation'] as const,
    buckets: [0.0001, 0.0005, 0.001, 0.005, 0.01, 0.05] // 0.1ms to 50ms
});

// Database metrics
export const databaseOperations = new Counter({
    name: 'webrtc_database_operations_total',
    help: 'Database operations',
    labelNames: ['operation', 'table'] as const // operation: 'create', 'read', 'update', 'delete'
});

export const databaseLatency = new Histogram({
    name: 'webrtc_database_latency_seconds',
    help: 'Database operation latency',
    labelNames: ['operation'] as const,
    buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5] // 1ms to 5s
});

// ================================
// System Metrics
// ================================

export const uptime = new Gauge({
    name: 'webrtc_uptime_seconds',
    help: 'Server uptime in seconds'
});

export const memoryUsage = new Gauge({
    name: 'webrtc_memory_usage_bytes',
    help: 'Memory usage',
    labelNames: ['type'] as const // 'rss', 'heapTotal', 'heapUsed', 'external'
});

export const errorRate = new Counter({
    name: 'webrtc_errors_total',
    help: 'Total errors by type',
    labelNames: ['type', 'severity'] as const // type: 'socket', 'webrtc', 'database', 'validation'
});

// ================================
// Custom Summary Metrics
// ================================

export const requestProcessingTime = new Summary({
    name: 'webrtc_request_processing_duration_seconds',
    help: 'Request processing time',
    labelNames: ['method'] as const,
    percentiles: [0.5, 0.9, 0.95, 0.99]
});