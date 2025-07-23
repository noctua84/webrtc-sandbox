import express, { Request, Response } from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import type {
    HealthStatus,
    RoomsInfo,
    WebRTCOffer,
    WebRTCAnswer,
    WebRTCIceCandidate,
    MediaStatusUpdate
} from './types/webrtc.types.js';
import {RoomManager} from "./room/manager";
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
import {getConfig} from "./config";
import {
    handleAddReaction,
    handleDeleteMessage,
    handleEditMessage,
    handleGetChatHistory, handleRemoveReaction,
    handleSendMessage,
    handleTypingIndicator
} from "./handler/chat.handler";
import helmet from "helmet";
import { ErrorResponse, CreateRoomResponse, JoinRoomResponse, ReconnectRoomResponse, GetRoomInfoResponse, LeaveRoomResponse} from './types/webrtc.types.js';
import { DeleteMessageRequest, EditMessageRequest, SendMessageRequest, TypingIndicatorRequest} from './types/chat.types.js';
import {
    CreateRoomRequest,
    GetRoomInfoRequest,
    JoinRoomRequest,
    LeaveRoomRequest,
    ReconnectRoomRequest,
    Room
} from "./types/room.types";
import {ClientToServerEvents, ServerToClientEvents} from "./types/event.types";

const app = express();
const server = createServer(app);
const cfg = getConfig()

// Configure CORS for Socket.IO
const io = new Server<
    ClientToServerEvents,
    ServerToClientEvents
>(server, {
    cors: {
        origin: cfg.server.cors.origin,
        methods: cfg.server.cors.methods,
        credentials: cfg.server.cors.credentials,
    }
});

const manager = new RoomManager();

// Middleware
app.use(cors({
    origin: cfg.server.cors.origin,
    methods: cfg.server.cors.methods,
    credentials: cfg.server.cors.credentials
}));
app.use(helmet());
app.use(express.json());

// Socket.IO connection handling
io.on('connection', (socket) => {
    log('info', `New socket connection established`, {socketId: socket.id});

    // Handle room creation
    socket.on('create-room', (data: CreateRoomRequest, callback: (arg0: ErrorResponse | CreateRoomResponse) => void) => {
        log('info', `Socket requested to create room`, {socketId: socket.id, userName: data.userName});
        handleCreateRoom(socket, manager, data, callback)
    });

    // Handle joining existing room
    socket.on('join-room', (data: JoinRoomRequest, callback: (arg0: ErrorResponse | JoinRoomResponse) => void) => {
        log('info', `Socket requested to join room`, {socketId: socket.id, roomId: data.roomId});
        handleJoinRoom(socket, manager, data, callback)
    });

    // Handle explicit reconnection
    socket.on('reconnect-room', (data: ReconnectRoomRequest, callback: (arg0: ErrorResponse | ReconnectRoomResponse) => void) => {
        log('info', `Socket requested to reconnect to room`, {socketId: socket.id, roomId: data.roomId});
        handleReconnectRoom(socket, manager, data, callback)
    });

    // Handle getting room info
    socket.on('get-room-info', (data: GetRoomInfoRequest, callback: (arg0: ErrorResponse | GetRoomInfoResponse) => void) => {
        log('info', `Socket requested room info`, {socketId: socket.id, roomId: data.roomId});
        handleGetRoomInfo(socket, manager, data, callback);
    });

    // Handle leaving room explicitly
    socket.on('leave-room', (data: LeaveRoomRequest, callback: (arg0: ErrorResponse | LeaveRoomResponse) => void) => {
        log('info', `Socket requested to leave room`, {socketId: socket.id, roomId: data.roomId});
        handleLeaveRoom(socket, manager, data, callback);
    });

    // WebRTC Signaling Event Handlers
    // Handle WebRTC offer
    socket.on('webrtc-offer', (data: WebRTCOffer, callback: ((response: any) => void) | undefined) => {
        log('info', `Received WebRTC offer`, {
            socketId: socket.id,
            roomId: data.roomId,
            targetParticipantId: data.targetParticipantId
        });
        handleWebRTCOffer(socket, manager, io, data, callback);
    });

    // Handle WebRTC answer
    socket.on('webrtc-answer', (data: WebRTCAnswer, callback: ((response: any) => void) | undefined) => {
        log('info', `Received WebRTC answer`, {
            socketId: socket.id,
            roomId: data.roomId,
            targetParticipantId: data.targetParticipantId
        });
        handleWebRTCAnswer(socket, manager, io, data, callback);
    });

    // Handle WebRTC ICE candidate
    socket.on('webrtc-ice-candidate', (data: WebRTCIceCandidate, callback: ((response: any) => void) | undefined) => {
        log('info', `Received WebRTC ICE candidate`, {
            socketId: socket.id,
            roomId: data.roomId,
            targetParticipantId: data.targetParticipantId
        });
        handleWebRTCIceCandidate(socket, manager, io, data, callback);
    });

    // Handle media status updates
    socket.on('update-media-status', (data: MediaStatusUpdate, callback: (response: any) => void) => {
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
        log('info', `Socket disconnected`, {socketId: socket.id, reason});
        handleDisconnect(socket, manager, io, reason);
    });

    // Handle generic errors
    socket.on('error' as any, (error: Error) => {
        log('error', `Socket error`, {socketId: socket.id, error: error.message});
    });

    // Handle chat messages
    socket.on('send-message', (data: SendMessageRequest, callback: (response: any) => void) => {
        handleSendMessage(socket, manager, io, data, callback);
    });

    socket.on('edit-message', (data: EditMessageRequest, callback: (response: any) => void) => {
        handleEditMessage(socket, manager, io, data, callback);
    });

    socket.on('delete-message', (data: DeleteMessageRequest, callback: (response: any) => void) => {
        handleDeleteMessage(socket, manager, io, data, callback);
    });

    socket.on('typing-indicator', (data: TypingIndicatorRequest, callback: (response: any) => void) => {
        handleTypingIndicator(socket, manager, io, data, callback);
    });

    socket.on('get-chat-history', (data: { roomId: string; }, callback: (response: any) => void) => {
        handleGetChatHistory(socket, manager, data, callback);
    });

    socket.on('add-reaction', (data: { roomId: any; messageId: any; emoji: any; }, callback: (response: any) => void) => {
        log('info', `Received chat reaction added`, {
            socketId: socket.id,
            roomId: data.roomId,
            messageId: data.messageId,
            emoji: data.emoji
        });
        // Handle chat reaction added logic here
        handleAddReaction(socket, manager, io, data, callback);
    })

    socket.on('remove-reaction', (data: { roomId: any; messageId: any; emoji: any; userId: string; }, callback: (response: any) => void) => {
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
app.get('/health', (req: Request, res: Response) => {
    const rooms = manager.getRooms();
    const activeRooms = Array.from(rooms.values()).filter((room: any) => room.isActive);
    const connectedParticipants = Array.from(rooms.values())
        .flatMap((room: any) => Array.from(room.participants.values()))
        .filter((participant: any) => participant.isConnected);

    const health: HealthStatus = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        rooms: rooms.size,
        activeRooms: activeRooms.length,
        totalParticipants: Array.from(rooms.values()).reduce((sum: any, room: any) => sum + room.participants.size, 0),
        connectedParticipants: connectedParticipants.length
    };

    log('info', `Health check requested`, health);
    res.json(health);
});

// Get rooms info endpoint
app.get('/rooms', (req: Request, res: Response) => {
    const rooms = manager.getRooms();

    const allRooms = Array.from(rooms.values()).map((room: any) => ({
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

app.post('/api/turn-credentials', (req: Request, res: Response) => {
    const userName = req.body.userName;
    const credentials = manager.generateTurnCredentials(userName);

    res.json({
        success: true,
        timestamp: new Date().toISOString(),
        userName: credentials.username,
        password: credentials.password,
        ttl: credentials.ttl,
        servers: credentials.urls
    });
})

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

const PORT = cfg.server.port || 3001;

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
        roomTimeoutMinutes: cfg.room.timeoutDuration / 60000,
        reconnectionWindowMinutes: cfg.room.participantReconnectionWindow / 60000,
        cleanupIntervalMinutes: cfg.room.cleanupInterval / 60000
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
