import {LogData, LogLevel} from "./types";
import {Server} from "socket.io";

export const log = (level: LogLevel, message: string, data: LogData | null = null): void => {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;

    if (data) {
        console.log(logMessage, JSON.stringify(data, null, 2));
    } else {
        console.log(logMessage);
    }
}

// ============================================================================
// ENHANCED CONNECTION MONITORING
// ============================================================================

export const logWebRTCConnectionSummary = (
    io: Server,
    roomId: string,
    eventType: 'offer-answer-complete' | 'ice-exchange-active' | 'connection-attempt'
) => {
    const room = io.sockets.adapter.rooms.get(roomId);
    const participants = room ? Array.from(room) : [];

    log('info', `📊 [SUMMARY] WebRTC ${eventType} in room ${roomId}`, {
        roomId,
        eventType,
        participantCount: participants.length,
        participants: participants.map(socketId => ({
            socketId,
            connected: io.sockets.sockets.has(socketId)
        })),
        timestamp: new Date().toISOString(),
        roomActive: !!room && room.size > 0
    });
};