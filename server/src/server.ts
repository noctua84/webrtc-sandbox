import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import type {
    CreateRoomRequest,
    JoinRoomRequest,
    GetRoomInfoRequest,
    HealthStatus,
    RoomsInfo,
    ServerToClientEvents,
    ClientToServerEvents,
    InterServerEvents,
    SocketData,
    ReconnectRoomRequest,
    WebRTCOffer,
    WebRTCAnswer,
    WebRTCIceCandidate,
    MediaStatusUpdate, LeaveRoomRequest
} from './types.js';
import {RoomManager} from "./roomManager";
import {
    handleCreateRoom,
    handleGetRoomInfo,
    handleJoinRoom,
    handleLeaveRoom,
    handleReconnectRoom
} from "./handler/room.handler";
import {handleWebRTCAnswer, handleWebRTCIceCandidate, handleWebRTCOffer} from "./handler/webrtc.handler";
import {handleUpdateMediaStatus} from "./handler/media.handler";
import {handleDisconnect} from "./handler/connection.handler";
import {log} from "./logging";
import {getEnvironmentConfig, ROOM_CONFIG, SERVER_CONFIG} from "./config";
import {
    handleAddReaction,
    handleDeleteMessage,
    handleEditMessage,
    handleGetChatHistory, handleRemoveReaction,
    handleSendMessage,
    handleTypingIndicator
} from "./handler/chat.handler";

const app = express();
const server = createServer(app);
const cfg = getEnvironmentConfig()

// Configure CORS for Socket.IO
const io = new Server<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
>(server, {
    cors: {
        origin: SERVER_CONFIG.CORS.ORIGIN,
        methods: SERVER_CONFIG.CORS.METHODS,
        credentials: SERVER_CONFIG.CORS.CREDENTIALS,
    }
});

const manager = new RoomManager();

// Middleware
app.use(cors({
    origin: SERVER_CONFIG.CORS.ORIGIN,
    methods: SERVER_CONFIG.CORS.METHODS,
    credentials: SERVER_CONFIG.CORS.CREDENTIALS
}));
app.use(express.json());

// Socket.IO connection handling
io.on('connection', (socket) => {
    log('info', `New socket connection established`, { socketId: socket.id });

    // Handle room creation
    socket.on('create-room', (data: CreateRoomRequest, callback) => {
        log('info', `Socket requested to create room`, { socketId: socket.id, userName: data.userName });
        handleCreateRoom(socket, manager, data, callback )
    });

    // Handle joining existing room
    socket.on('join-room', (data: JoinRoomRequest, callback) => {
        log('info', `Socket requested to join room`, { socketId: socket.id, roomId: data.roomId });
        handleJoinRoom(socket, manager, data, callback)
    });

    // Handle explicit reconnection
    socket.on('reconnect-room', (data: ReconnectRoomRequest, callback) => {
        log('info', `Socket requested to reconnect to room`, { socketId: socket.id, roomId: data.roomId });
        handleReconnectRoom(socket, manager, data, callback)
    });

    // Handle getting room info
    socket.on('get-room-info', (data: GetRoomInfoRequest, callback) => {
        log('info', `Socket requested room info`, { socketId: socket.id, roomId: data.roomId });
        handleGetRoomInfo(socket, manager, data, callback);
    });

    // Handle leaving room explicitly
    socket.on('leave-room', (data: LeaveRoomRequest, callback) => {
        log('info', `Socket requested to leave room`, { socketId: socket.id, roomId: data.roomId });
        handleLeaveRoom(socket, manager, data, callback);
    });

    // WebRTC Signaling Event Handlers
    // Handle WebRTC offer
    socket.on('webrtc-offer', (data: WebRTCOffer, callback) => {
        log('info', `Received WebRTC offer`, {
            socketId: socket.id,
            roomId: data.roomId,
            targetParticipantId: data.targetParticipantId
        });
        handleWebRTCOffer(socket, manager, io, data, callback);
    });

    // Handle WebRTC answer
    socket.on('webrtc-answer', (data: WebRTCAnswer, callback) => {
        log('info', `Received WebRTC answer`, {
            socketId: socket.id,
            roomId: data.roomId,
            targetParticipantId: data.targetParticipantId
        });
        handleWebRTCAnswer(socket, manager, io, data, callback);
    });

    // Handle WebRTC ICE candidate
    socket.on('webrtc-ice-candidate', (data: WebRTCIceCandidate, callback) => {
        log('info', `Received WebRTC ICE candidate`, {
            socketId: socket.id,
            roomId: data.roomId,
            targetParticipantId: data.targetParticipantId
        });
        handleWebRTCIceCandidate(socket, manager, io, data, callback);
    });

    // Handle media status updates
    socket.on('update-media-status', (data: MediaStatusUpdate, callback) => {
        log('info', `Received media status update`, {
            socketId: socket.id,
            roomId: data.roomId,
            mediaStatus: {
                hasVideo: data.hasVideo,
                hasAudio: data.hasAudio,
                isScreenSharing: data.isScreenSharing
            }
        });
        handleUpdateMediaStatus(socket, manager, io, data, callback);
    });

    // Handle disconnect (not explicit leave)
    socket.on('disconnect', (reason) => {
        log('info', `Socket disconnected`, { socketId: socket.id, reason });
        handleDisconnect(socket, manager, io, reason);
    });

    // Handle generic errors
    socket.on('error' as any, (error: Error) => {
        log('error', `Socket error`, { socketId: socket.id, error: error.message });
    });

    // Handle chat messages
    socket.on('send-message', (data, callback) => {
        handleSendMessage(socket, manager, io, data, callback);
    });

    socket.on('edit-message', (data, callback) => {
        handleEditMessage(socket, manager, io, data, callback);
    });

    socket.on('delete-message', (data, callback) => {
        handleDeleteMessage(socket, manager, io, data, callback);
    });

    socket.on('typing-indicator', (data, callback) => {
        handleTypingIndicator(socket, manager, io, data, callback);
    });

    socket.on('get-chat-history', (data, callback) => {
        handleGetChatHistory(socket, manager, data, callback);
    });

    socket.on('add-reaction', (data, callback) => {
        log('info', `Received chat reaction added`, {
            socketId: socket.id,
            roomId: data.roomId,
            messageId: data.messageId,
            emoji: data.emoji
        });
        // Handle chat reaction added logic here
        handleAddReaction(socket, manager, io, data, callback);
    })

    socket.on('remove-reaction', (data, callback) => {
        log('info', `Received chat reaction removed`, {
            socketId: socket.id,
            roomId: data.roomId,
            messageId: data.messageId,
            emoji: data.emoji
        });
        handleRemoveReaction(socket, manager, io, data, callback);
    });
});

// Health check endpoint
app.get('/health', (req, res) => {
    const rooms = manager.getRooms();
    const activeRooms = Array.from(rooms.values()).filter(room => room.isActive);
    const connectedParticipants = Array.from(rooms.values())
        .flatMap(room => Array.from(room.participants.values()))
        .filter(participant => participant.isConnected);

    const health: HealthStatus = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        rooms: rooms.size,
        activeRooms: activeRooms.length,
        totalParticipants: Array.from(rooms.values()).reduce((sum, room) => sum + room.participants.size, 0),
        connectedParticipants: connectedParticipants.length
    };

    log('info', `Health check requested`, health);
    res.json(health);
});

// Get rooms info endpoint
app.get('/rooms', (req, res) => {
    const rooms = manager.getRooms();

    const allRooms = Array.from(rooms.values()).map(room => ({
        id: room.id,
        createdAt: room.createdAt,
        lastActivity: room.lastActivity,
        participantCount: room.participants.size,
        maxParticipants: room.maxParticipants,
        isActive: room.isActive,
        timeoutDuration: room.timeoutDuration
    }));

    const activeRooms = allRooms.filter(room => room.isActive);

    const roomsInfo: RoomsInfo = {
        rooms: allRooms,
        activeRooms: activeRooms
    };

    const tokens = manager.getReconnectionTokens();

    log('info', `Rooms info requested`, {
        totalRooms: allRooms.length,
        activeRooms: activeRooms.length,
        reconnectionTokens: tokens.size
    });
    res.json(roomsInfo);
});

// Room cleanup endpoint for debugging
app.post('/cleanup', (req, res) => {
    log('info', 'Manual cleanup requested');
    const rooms = manager.getRooms();
    manager.performCleanup();

    const tokens = manager.getReconnectionTokens();

    res.json({
        success: true,
        timestamp: new Date().toISOString(),
        remainingRooms: rooms.size,
        remainingTokens: tokens.size
    });
});

const PORT = SERVER_CONFIG.PORT|| 3001;

server.listen(PORT, () => {
    log('info', `🚀 WebRTC Signaling Server started`, {
        port: PORT,
        environment: process.env.NODE_ENV || 'development'
    });
    log('info', `📡 Socket.IO server ready for connections`);
    log('info', `🏥 Health check available at http://localhost:${PORT}/health`);
    log('info', `📋 Rooms info available at http://localhost:${PORT}/rooms`);
    log('info', `🧹 Manual cleanup available at http://localhost:${PORT}/cleanup`);
    log('info', `⚙️ Configuration:`, {
        roomTimeoutMinutes: cfg.roomTimeout / 60000,
        reconnectionWindowMinutes: ROOM_CONFIG.PARTICIPANT_RECONNECTION_WINDOW / 60000,
        cleanupIntervalMinutes: cfg.cleanupInterval / 60000
    });
});

// Graceful shutdown
process.on('SIGTERM', () => {
    log('info', 'Received SIGTERM, shutting down gracefully');
    server.close(() => {
        log('info', 'Server closed');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    log('info', 'Received SIGINT, shutting down gracefully');
    server.close(() => {
        log('info', 'Server closed');
        process.exit(0);
    });
});
