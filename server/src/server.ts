import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import type {
    CreateRoomRequest,
    JoinRoomRequest,
    GetRoomInfoRequest,
    CreateRoomResponse,
    JoinRoomResponse,
    GetRoomInfoResponse,
    ErrorResponse,
    RoomUpdateEvent,
    HealthStatus,
    RoomsInfo,
    ServerToClientEvents,
    ClientToServerEvents,
    InterServerEvents,
    SocketData, ReconnectRoomRequest, ReconnectRoomResponse
} from './types.js';
import {log} from "./logging";
import {RoomManager} from "./roomManager";
import {roomConfig} from "./config";

const app = express();
const server = createServer(app);
const roomCfg = roomConfig

// Configure CORS for Socket.IO
const io = new Server<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
>(server, {
    cors: {
        origin: "http://localhost:5173", // Vite default port
        methods: ["GET", "POST"],
        credentials: true
    }
});

const manager = new RoomManager();

// Middleware
app.use(cors());
app.use(express.json());

// Start cleanup interval
setInterval(manager.cleanupExpiredRooms, roomCfg.cleanupInterval);
log('info', `Room cleanup interval started`, {
    intervalMs: roomCfg.cleanupInterval,
    roomTimeoutMs: roomCfg.roomTimeoutDuration,
    reconnectionWindowMs: roomCfg.participantReconnectionWindow
});

// Socket.IO connection handling
io.on('connection', (socket) => {
    log('info', `New socket connection established`, { socketId: socket.id });

    // Handle room creation
    socket.on('create-room', (data: CreateRoomRequest, callback) => {
        log('info', `Received create-room request`, { socketId: socket.id, data });

        try {
            const { roomId = uuidv4(), userName, reconnectionToken } = data;

            // Validate input
            if (!userName || userName.trim().length === 0) {
                log('error', `Invalid userName provided`, { socketId: socket.id, userName });
                const response: ErrorResponse = {
                    success: false,
                    error: 'Username is required and cannot be empty'
                };
                return callback(response);
            }

            // Check if room already exists and handle accordingly
            let room = manager.getRoomById(roomId);
            let isNewRoom = false;

            if (!room) {
                // Create new room
                room = manager.createRoom(roomId, socket.id);
                isNewRoom = true;
            } else if (!room.isActive) {
                log('error', `Room exists but is not active`, { roomId, socketId: socket.id });
                const response: ErrorResponse = {
                    success: false,
                    error: 'Room exists but is no longer active'
                };
                return callback(response);
            }

            // Add creator as participant
            const participantResult = manager.addParticipantToRoom(roomId, socket.id, {
                userName: userName.trim(),
                isCreator: isNewRoom, // Only first creator gets creator status
                joinedAt: new Date().toISOString()
            }, reconnectionToken);

            if (!participantResult.success) {
                log('error', `Failed to add creator to room`, {
                    roomId,
                    socketId: socket.id,
                    error: participantResult.error
                });
                return callback(participantResult as ErrorResponse);
            }

            // Join socket to room for broadcasting
            socket.join(roomId);
            log('info', `Socket joined room channel`, { socketId: socket.id, roomId });

            // Prepare response
            const response: CreateRoomResponse = {
                success: true,
                room: {
                    id: room.id,
                    createdAt: room.createdAt,
                    lastActivity: room.lastActivity,
                    participantCount: room.participants.size,
                    maxParticipants: room.maxParticipants,
                    isActive: room.isActive,
                    timeoutDuration: room.timeoutDuration
                },
                participant: participantResult.participant!,
                reconnectionToken: participantResult.participant!.reconnectionToken!
            };

            log('info', `Room ${isNewRoom ? 'created' : 'joined'} and participant added successfully`, {
                ...response,
                isReconnection: participantResult.isReconnection
            });
            callback(response);

            // Broadcast room update to all participants
            const eventType = participantResult.isReconnection ? 'participant-reconnected' : 'participant-joined';
            const updateEvent: RoomUpdateEvent = {
                roomId,
                participants: manager.participantsToArray(room.participants),
                event: eventType,
                participant: participantResult.participant!
            };

            socket.to(roomId).emit('room-updated', updateEvent);

        } catch (error) {
            const err = error as Error;
            log('error', `Error in create-room handler`, {
                socketId: socket.id,
                error: err.message,
                stack: err.stack
            });

            const response: ErrorResponse = {
                success: false,
                error: 'Internal server error while creating room'
            };
            callback(response);
        }
    });

    // Handle joining existing room
    socket.on('join-room', (data: JoinRoomRequest, callback) => {
        log('info', `Received join-room request`, { socketId: socket.id, data });

        try {
            const { roomId, userName, reconnectionToken } = data;

            // Validate input
            if (!roomId || !userName || userName.trim().length === 0) {
                log('error', `Invalid join-room data`, { socketId: socket.id, roomId, userName });
                const response: ErrorResponse = {
                    success: false,
                    error: 'Room ID and username are required'
                };
                return callback(response);
            }

            // Check if room exists
            const room = manager.getRoomById(roomId);
            if (!room) {
                log('error', `Room not found for join`, { roomId, socketId: socket.id });
                const response: ErrorResponse = {
                    success: false,
                    error: 'Room not found'
                };
                return callback(response);
            }

            if (!room.isActive) {
                log('error', `Room is not active for join`, { roomId, socketId: socket.id });
                const response: ErrorResponse = {
                    success: false,
                    error: 'Room is no longer active'
                };
                return callback(response);
            }

            // Add participant to room
            const result = manager.addParticipantToRoom(roomId, socket.id, {
                userName: userName.trim(),
                isCreator: false,
                joinedAt: new Date().toISOString()
            }, reconnectionToken);

            if (!result.success) {
                log('error', `Failed to join room`, {
                    roomId,
                    socketId: socket.id,
                    error: result.error
                });
                return callback(result as ErrorResponse);
            }

            // Join socket to room channel
            socket.join(roomId);
            log('info', `Socket joined room channel`, { socketId: socket.id, roomId });

            const response: JoinRoomResponse = {
                success: true,
                room: {
                    id: result.room!.id,
                    createdAt: result.room!.createdAt,
                    lastActivity: result.room!.lastActivity,
                    participantCount: result.room!.participants.size,
                    maxParticipants: result.room!.maxParticipants,
                    isActive: result.room!.isActive,
                    timeoutDuration: result.room!.timeoutDuration
                },
                participant: result.participant!,
                participants: manager.participantsToArray(result.room!.participants),
                reconnectionToken: result.participant!.reconnectionToken!
            };

            log('info', `Successfully joined room`, { ...response, isReconnection: result.isReconnection });
            callback(response);

            // Broadcast to other participants
            const eventType = result.isReconnection ? 'participant-reconnected' : 'participant-joined';
            const updateEvent: RoomUpdateEvent = {
                roomId,
                participants: manager.participantsToArray(result.room!.participants),
                event: eventType,
                participant: result.participant!
            };

            socket.to(roomId).emit('room-updated', updateEvent);

        } catch (error) {
            const err = error as Error;
            log('error', `Error in join-room handler`, {
                socketId: socket.id,
                error: err.message,
                stack: err.stack
            });

            const response: ErrorResponse = {
                success: false,
                error: 'Internal server error while joining room'
            };
            callback(response);
        }
    });

    // Handle explicit reconnection
    socket.on('reconnect-room', (data: ReconnectRoomRequest, callback) => {
        log('info', `Received reconnect-room request`, { socketId: socket.id, data });

        try {
            const { roomId, reconnectionToken } = data;

            // Validate input
            if (!roomId || !reconnectionToken) {
                log('error', `Invalid reconnect-room data`, { socketId: socket.id, roomId, reconnectionToken });
                const response: ErrorResponse = {
                    success: false,
                    error: 'Room ID and reconnection token are required'
                };
                return callback(response);
            }

            // Check reconnection data
            const reconnectionData = manager.getParticipantReconnectionToken(reconnectionToken);
            if (!reconnectionData || reconnectionData.roomId !== roomId) {
                log('error', `Invalid reconnection token`, {
                    socketId: socket.id,
                    roomId,
                    reconnectionToken,
                    tokenExists: !!reconnectionData,
                    tokenRoomId: reconnectionData?.roomId
                });
                const response: ErrorResponse = {
                    success: false,
                    error: 'Invalid reconnection token or room'
                };
                return callback(response);
            }

            const room = manager.getRoomById(roomId);
            if (!room || !room.isActive) {
                log('error', `Room not found or inactive for reconnection`, { roomId, socketId: socket.id });
                const response: ErrorResponse = {
                    success: false,
                    error: 'Room not found or no longer active'
                };
                return callback(response);
            }

            // Perform reconnection
            const participant = reconnectionData.participantData;
            participant.socketId = socket.id;
            participant.lastSeen = new Date().toISOString();
            participant.isConnected = true;

            manager.setRoomParticipant(room.id, participant);

            manager.updateRoomActivity(roomId);

            // Join socket to room channel
            socket.join(roomId);
            log('info', `Socket joined room channel after reconnection`, { socketId: socket.id, roomId });

            const response: ReconnectRoomResponse = {
                success: true,
                room: {
                    id: room.id,
                    createdAt: room.createdAt,
                    lastActivity: room.lastActivity,
                    participantCount: room.participants.size,
                    maxParticipants: room.maxParticipants,
                    isActive: room.isActive,
                    timeoutDuration: room.timeoutDuration
                },
                participant,
                participants: manager.participantsToArray(room.participants)
            };

            log('success', `Successfully reconnected to room`, response);
            callback(response);

            // Broadcast reconnection to other participants
            const updateEvent: RoomUpdateEvent = {
                roomId,
                participants: manager.participantsToArray(room.participants),
                event: 'participant-reconnected',
                participant
            };

            socket.to(roomId).emit('room-updated', updateEvent);

        } catch (error) {
            const err = error as Error;
            log('error', `Error in reconnect-room handler`, {
                socketId: socket.id,
                error: err.message,
                stack: err.stack
            });

            const response: ErrorResponse = {
                success: false,
                error: 'Internal server error while reconnecting to room'
            };
            callback(response);
        }
    });

    // Handle getting room info
    socket.on('get-room-info', (data: GetRoomInfoRequest, callback) => {
        log('info', `Received get-room-info request`, { socketId: socket.id, data });

        try {
            const { roomId } = data;

            if (!roomId) {
                const response: ErrorResponse = {
                    success: false,
                    error: 'Room ID is required'
                };
                return callback(response);
            }

            const room = manager.getRoomById(roomId);
            if (!room) {
                log('info', `Room info requested for non-existent room`, { roomId, socketId: socket.id });
                const response: ErrorResponse = {
                    success: false,
                    error: 'Room not found'
                };
                return callback(response);
            }

            const response: GetRoomInfoResponse = {
                success: true,
                room: {
                    id: room.id,
                    createdAt: room.createdAt,
                    lastActivity: room.lastActivity,
                    participantCount: room.participants.size,
                    maxParticipants: room.maxParticipants,
                    isActive: room.isActive,
                    timeoutDuration: room.timeoutDuration
                },
                participants: manager.participantsToArray(room.participants)
            };

            log('info', `Room info provided`, response);
            callback(response);

        } catch (error) {
            const err = error as Error;
            log('error', `Error in get-room-info handler`, {
                socketId: socket.id,
                error: err.message,
                stack: err.stack
            });

            const response: ErrorResponse = {
                success: false,
                error: 'Internal server error while getting room info'
            };
            callback(response);
        }
    });

    // Handle leaving room explicitly
    socket.on('leave-room', (data: { roomId: string }, callback) => {
        log('info', `Received leave-room request`, { socketId: socket.id, data });

        try {
            const { roomId } = data;

            // Validate input
            if (!roomId) {
                const response: ErrorResponse = {
                    success: false,
                    error: 'Room ID is required'
                };
                return callback(response);
            }

            // Check if user is actually in this room
            const currentRoomId = manager.getRoomBySocketId(socket.id);
            if (currentRoomId !== roomId) {
                log('warning', `User attempted to leave room they're not in`, {
                    socketId: socket.id,
                    requestedRoomId: roomId,
                    actualRoomId: currentRoomId
                });
                const response: ErrorResponse = {
                    success: false,
                    error: 'You are not in this room'
                };
                return callback(response);
            }

            // Remove participant from room (explicit leave)
            const result = manager.removeParticipantFromRoom(socket.id, true);

            if (result && result.room) {
                // Leave the socket.io room
                socket.leave(roomId);
                log('info', `Socket left room channel`, { socketId: socket.id, roomId });

                // Notify remaining participants about the explicit leave
                const updateEvent: RoomUpdateEvent = {
                    roomId: result.roomId,
                    participants: manager.participantsToArray(result.room.participants),
                    event: 'participant-left',
                    leftParticipantId: socket.id
                };

                socket.to(result.roomId).emit('room-updated', updateEvent);

                log('success', `User explicitly left room`, {
                    socketId: socket.id,
                    roomId: result.roomId,
                    remainingParticipants: result.room.participants.size
                });

                const response: { success: true } = { success: true };
                callback(response);
            } else {
                log('warning', `No room data found when leaving`, { socketId: socket.id, roomId });
                const response: { success: true } = { success: true };
                callback(response);
            }

        } catch (error) {
            const err = error as Error;
            log('error', `Error in leave-room handler`, {
                socketId: socket.id,
                error: err.message,
                stack: err.stack
            });

            const response: ErrorResponse = {
                success: false,
                error: 'Internal server error while leaving room'
            };
            callback(response);
        }
    });

    // Handle disconnect (not explicit leave)
    socket.on('disconnect', (reason) => {
        log('info', `Socket disconnected`, { socketId: socket.id, reason });

        try {
            const result = manager.removeParticipantFromRoom(socket.id, false); // Not an explicit leave

            if (result && result.room && result.wasConnected) {
                // Notify remaining participants about disconnection (not complete removal)
                const updateEvent: RoomUpdateEvent = {
                    roomId: result.roomId,
                    participants: manager.participantsToArray(result.room.participants),
                    event: 'participant-disconnected',
                    leftParticipantId: socket.id
                };

                socket.to(result.roomId).emit('room-updated', updateEvent);

                // Check if any connected participants remain to send reconnection info
                const connectedParticipants = Array.from(result.room.participants.values()).filter(p => p.isConnected);
                if (connectedParticipants.length > 0) {
                    const reconnectionToken = manager.getSocketToReconnectionToken(socket.id);
                    if (reconnectionToken) {
                        // Notify about potential reconnection window
                        io.to(result.roomId).emit('reconnection-available', {
                            roomId: result.roomId,
                            timeLeft: roomCfg.participantReconnectionWindow / 1000 // in seconds
                        });
                    }
                }

                log('info', `Notified remaining participants about disconnect`, {
                    roomId: result.roomId,
                    connectedCount: connectedParticipants.length,
                    reason
                });
            }

        } catch (error) {
            const err = error as Error;
            log('error', `Error handling disconnect`, {
                socketId: socket.id,
                error: err.message,
                stack: err.stack
            });
        }
    });

    // Handle generic errors
    socket.on('error' as any, (error: Error) => {
        log('error', `Socket error`, { socketId: socket.id, error: error.message });
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
    manager.cleanupExpiredRooms();

    const tokens = manager.getReconnectionTokens();

    res.json({
        success: true,
        timestamp: new Date().toISOString(),
        remainingRooms: rooms.size,
        remainingTokens: tokens.size
    });
});

const PORT = process.env.PORT || 3001;

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
        roomTimeoutMinutes: roomCfg.roomTimeoutDuration / 60000,
        reconnectionWindowMinutes: roomCfg.participantReconnectionWindow / 60000,
        cleanupIntervalMinutes: roomCfg.cleanupInterval / 60000
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
