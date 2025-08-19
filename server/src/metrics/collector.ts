import {
    activeRooms,
    chatMessages,
    chatMessageSize,
    connectedParticipants,
    errorRate,
    iceCandidatesGenerated,
    iceConnectionStates,
    memoryUsage,
    participantJoins,
    participantLeaves,
    participantSessionDuration,
    peerConnectionAttempts,
    peerConnectionDuration,
    peerConnections,
    requestProcessingTime,
    roomDuration,
    roomsCreated,
    roomsDestroyed,
    socketConnections,
    socketEventDuration,
    socketEvents,
    socketReconnections,
    totalParticipants,
    totalRooms,
    typingIndicators, uptime,
    stateLatency,
    stateOperations, httpErrorRate
} from "./metrics";
import {register} from "prom-client";

type ConnectionState = 'new' | 'checking' | 'connected' | 'completed' | 'failed' | 'disconnected' | 'closed';

export class MetricsCollector {
    private startTime = Date.now();

    constructor() {
        // Register all metrics when the collector is instantiated
        this.registerMetrics();

        // Log registered metrics for debugging
        register.getMetricsAsJSON().then(metrics => {
            const names = metrics.map(m => m.name);
            console.log('Registered metrics:', names);
        })
    }

    private registerMetrics(): void {
        // Register all metrics with Prometheus
        const metrics = [
            uptime,
            memoryUsage,
            totalParticipants,
            connectedParticipants,
            totalRooms,
            activeRooms,
            roomsCreated,
            roomsDestroyed,
            participantJoins,
            participantLeaves,
            participantSessionDuration,
            peerConnectionAttempts,
            peerConnectionDuration,
            peerConnections,
            iceConnectionStates,
            iceCandidatesGenerated,
            chatMessages,
            chatMessageSize,
            typingIndicators,
            socketConnections,
            socketEvents,
            socketEventDuration,
            socketReconnections,
            stateOperations,
            stateLatency,
            errorRate,
            requestProcessingTime,
            httpErrorRate
        ];

        metrics.forEach(metric => {
            register.registerMetric(metric as any);
        })

    }

    // Update system metrics
    updateSystemMetrics(): void {
        const memUsage = process.memoryUsage();

        uptime.set((Date.now() - this.startTime) / 1000);
        memoryUsage.labels('rss').set(memUsage.rss);
        memoryUsage.labels('heapTotal').set(memUsage.heapTotal);
        memoryUsage.labels('heapUsed').set(memUsage.heapUsed);
        memoryUsage.labels('external').set(memUsage.external);
    }

    // Record HTTP request metrics
    recordHttpRequest(method: string, path: string, statusCode: number, duration: number): void {
        requestProcessingTime.labels(method, path, statusCode.toString()).observe(duration / 1000); // Convert to seconds
    }

    recordHttpError(method: string, path: string, reason: string, statusCode: number): void {
        httpErrorRate.labels(method, statusCode.toString(), path, reason).inc();
    }

    // Record room metrics
    recordRoomCreated(creatorType: 'user' | 'system' = 'user'): void {
        roomsCreated.labels(creatorType).inc();
    }

    recordRoomDestroyed(reason: 'timeout' | 'manual' | 'empty', duration: number): void {
        roomsDestroyed.labels(reason).inc();
        roomDuration.observe(duration / 1000); // Convert to seconds
    }

    // Record participant metrics
    recordParticipantJoin(joinType: 'new' | 'reconnect'): void {
        participantJoins.labels(joinType).inc();
    }

    recordParticipantLeave(leaveType: 'manual' | 'disconnect' | 'timeout', sessionDuration: number): void {
        participantLeaves.labels(leaveType).inc();
        participantSessionDuration.observe(sessionDuration / 1000);
    }

    // Record WebRTC metrics
    recordPeerConnectionAttempt(success: boolean, duration?: number): void {
        peerConnectionAttempts.labels(success ? 'success' : 'failure').inc();
        if (success && duration !== undefined) {
            peerConnectionDuration.observe(duration / 1000);
        }
    }

    updatePeerConnectionStates(stateCounts: Record<string, number>): void {
        for (const [state, count] of Object.entries(stateCounts)) {
            peerConnections.labels(state as any).set(count); // ✅ Absolute values
        }
    }

    updateIceConnectionStates(stateCounts: Record<string, number>): void {
        for (const [state, count] of Object.entries(stateCounts)) {
            iceConnectionStates.labels(state as any).set(count);
        }
    }

    recordIceCandidateGenerated(type: 'host' | 'srflx' | 'relay'): void {
        iceCandidatesGenerated.labels(type).inc();
    }

    // Record chat metrics
    recordChatMessage(type: 'text' | 'emoji' | 'system', size: number): void {
        chatMessages.labels(type).inc();
        chatMessageSize.observe(size);
    }

    recordTypingIndicator(action: 'start' | 'stop'): void {
        typingIndicators.labels(action).inc();
    }

    // Record socket metrics
    recordSocketConnection(connected: boolean): void {
        if (connected) {
            socketConnections.inc();
        } else {
            socketConnections.dec();
        }
    }

    recordSocketEvent(eventName: string, direction: 'inbound' | 'outbound' | 'handled', duration?: number): void {
        socketEvents.labels(eventName, direction).inc();
        if (duration !== undefined) {
            socketEventDuration.labels(eventName).observe(duration / 1000);
        }
    }

    recordSocketReconnection(success: boolean): void {
        socketReconnections.labels(success ? 'success' : 'failure').inc();
    }

    // Record volatile state operations
    recordStateOperation(operation: 'get' | 'set' | 'delete', type: 'participant' | 'room' | 'typing', latency?: number): void {
        stateOperations.labels(operation, type).inc();
        if (latency !== undefined) {
            stateLatency.labels(operation).observe(latency / 1000);
        }
    }

    recordError(type: 'socket' | 'webrtc' | 'database' | 'validation' | 'system' | 'chat' | 'room', severity: 'error' | 'warning' | 'critical', reason: string): void {
        errorRate.labels(type, severity, reason).inc();
    }

    // Record request processing time
    recordRequestProcessingTime(method: string, duration: number): void {
        requestProcessingTime.labels(method).observe(duration / 1000);
    }

    // Update gauge metrics (called periodically)
    async updateGaugeMetrics(volatileStateManager: any): Promise<void> {
        try {
            // Get current counts from volatile state
            const stats = await volatileStateManager.getHealthStats();

            // Update participant counts
            totalParticipants.set(stats.participantStates);

            // Get connected participants (would need to be implemented in volatileStateManager)
            const roomSummaries = await this.getAllRoomSummaries(volatileStateManager);
            let connectedCount = 0;
            let activeRoomCount = 0;

            for (const summary of roomSummaries) {
                connectedCount += summary.connectedCount;
                if (summary.participants.length > 0) activeRoomCount++;
            }

            connectedParticipants.set(connectedCount);
            totalRooms.labels('active').set(activeRoomCount);
            totalRooms.labels('total').set(stats.roomStates);
            activeRooms.set(activeRoomCount);

            this.updateSystemMetrics();
        } catch (error) {
            this.recordError('system', 'error', 'Failed to update gauge metrics');
        }
    }

    // Helper method to get all room summaries
    private async getAllRoomSummaries(volatileStateManager: any): Promise<any[]> {
        // This would need to be implemented based on your VolatileStateManager
        // For now, return empty array
        return [];
    }
}