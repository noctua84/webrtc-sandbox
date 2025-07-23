import {
    activeRooms,
    chatMessages,
    chatMessageSize,
    connectedParticipants,
    databaseLatency,
    databaseOperations,
    errorRate,
    iceCandidatesGenerated,
    iceConnectionStates,
    mediaStreams,
    mediaToggleEvents,
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
    stateOperations
} from "./metrics";

export class MetricsCollector {
    private startTime = Date.now();

    // Update system metrics
    updateSystemMetrics(): void {
        const memUsage = process.memoryUsage();

        uptime.set((Date.now() - this.startTime) / 1000);
        memoryUsage.labels('rss').set(memUsage.rss);
        memoryUsage.labels('heapTotal').set(memUsage.heapTotal);
        memoryUsage.labels('heapUsed').set(memUsage.heapUsed);
        memoryUsage.labels('external').set(memUsage.external);
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

    recordPeerConnectionStateChange(newState: 'new' | 'connecting' | 'connected' | 'disconnected' | 'failed'): void {
        // For gauge metrics, we'd need to track current state counts
        // This is a simplification - in practice you'd increment/decrement based on state transitions
        peerConnections.labels(newState).inc();
    }

    recordIceConnectionStateChange(newState: 'new' | 'checking' | 'connected' | 'completed' | 'failed' | 'disconnected' | 'closed'): void {
        iceConnectionStates.labels(newState).inc();
    }

    recordIceCandidateGenerated(type: 'host' | 'srflx' | 'relay'): void {
        iceCandidatesGenerated.labels(type).inc();
    }

    recordMediaStreamChange(type: 'video' | 'audio' | 'screen', active: boolean): void {
        // Update gauge - increment if active, decrement if inactive
        if (active) {
            mediaStreams.labels(type).inc();
        } else {
            mediaStreams.labels(type).dec();
        }
    }

    recordMediaToggle(type: 'video' | 'audio' | 'screen', action: 'enable' | 'disable'): void {
        mediaToggleEvents.labels(type, action).inc();
        // Also update the active streams gauge
        this.recordMediaStreamChange(type, action === 'enable');
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

    recordSocketEvent(eventName: string, direction: 'inbound' | 'outbound', duration?: number): void {
        socketEvents.labels(eventName, direction).inc();
        if (duration !== undefined) {
            socketEventDuration.labels(eventName).observe(duration / 1000);
        }
    }

    recordSocketReconnection(success: boolean): void {
        socketReconnections.labels(success ? 'success' : 'failure').inc();
    }

    // Record volatile state operations
    recordVolatileStateOperation(operation: 'get' | 'set' | 'delete', type: 'participant' | 'room' | 'typing', latency?: number): void {
        stateOperations.labels(operation, type).inc();
        if (latency !== undefined) {
            stateLatency.labels(operation).observe(latency / 1000);
        }
    }

    // Record database operations
    recordDatabaseOperation(operation: 'create' | 'read' | 'update' | 'delete', table: string, latency?: number): void {
        databaseOperations.labels(operation, table).inc();
        if (latency !== undefined) {
            databaseLatency.labels(operation).observe(latency / 1000);
        }
    }

    recordError(type: 'socket' | 'webrtc' | 'database' | 'validation' | 'system', severity: 'error' | 'warning' | 'critical'): void {
        errorRate.labels(type, severity).inc();
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
            this.recordError('system', 'error');
        }
    }

    // Helper method to get all room summaries
    private async getAllRoomSummaries(volatileStateManager: any): Promise<any[]> {
        // This would need to be implemented based on your VolatileStateManager
        // For now, return empty array
        return [];
    }
}