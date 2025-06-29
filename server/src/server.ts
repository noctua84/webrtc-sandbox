import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import type {
    Room,
    Participant,
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
    AddParticipantResult,
    RemoveParticipantResult,
    LogLevel,
    LogData,
    ServerToClientEvents,
    ClientToServerEvents,
    InterServerEvents,
    SocketData
} from './types.js';

const app = express();
const server = createServer(app);

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

// Middleware
app.use(cors());
app.use(express.json());

// Store active rooms and their participants
const rooms = new Map<string, Room>();
const socketToRoom = new Map<string, string>();

// Utility function for detailed logging
function log(level: LogLevel, message: string, data: LogData | null = null): void {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;

    if (data) {
        console.log(logMessage, JSON.stringify(data, null, 2));
    } else {
        console.log(logMessage);
    }
}

// Room management functions
function createRoom(roomId: string, creatorSocketId: string): Room {
    log('info', `Creating new room: ${roomId}`);

    const room: Room = {
        id: roomId,
        creator: creatorSocketId,
        participants: new Map<string, Participant>(),
        createdAt: new Date().toISOString(),
        maxParticipants: 4 // Simple limit for demo
    };

    rooms.set(roomId, room);
    log('info', `Room created successfully`, { roomId, creatorSocketId });
    return room;
}

function addParticipantToRoom(
    roomId: string,
    socketId: string,
    participantInfo: Omit<Participant, 'socketId'>
): AddParticipantResult {
    log('info', `Adding participant to room`, { roomId, socketId, participantInfo });

    const room = rooms.get(roomId);
    if (!room) {
        log('error', `Room not found: ${roomId}`);
        return { success: false, error: 'Room not found' };
    }

    if (room.participants.size >= room.maxParticipants) {
        log('error', `Room is full`, {
            roomId,
            currentCount: room.participants.size,
            maxCount: room.maxParticipants
        });
        return { success: false, error: 'Room is full' };
    }

    const participant: Participant = {
        socketId,
        ...participantInfo,
        joinedAt: new Date().toISOString()
    };

    room.participants.set(socketId, participant);
    socketToRoom.set(socketId, roomId);

    log('info', `Participant added successfully`, {
        roomId,
        socketId,
        totalParticipants: room.participants.size
    });

    return { success: true, room, participant };
}

function removeParticipantFromRoom(socketId: string): { roomId: string; room: Room | undefined } | null {
    const roomId = socketToRoom.get(socketId);
    if (!roomId) {
        log('info', `Socket ${socketId} was not in any room`);
        return null;
    }

    log('info', `Removing participant from room`, { socketId, roomId });

    const room = rooms.get(roomId);
    if (room) {
        room.participants.delete(socketId);

        // If room is empty, delete it
        if (room.participants.size === 0) {
            rooms.delete(roomId);
            log('info', `Room deleted (empty)`, { roomId });
        } else {
            log('info', `Participant removed`, {
                roomId,
                socketId,
                remainingParticipants: room.participants.size
            });
        }
    }

    socketToRoom.delete(socketId);
    return { roomId, room };
}

function participantsToArray(participants: Map<string, Participant>): Participant[] {
    return Array.from(participants.values());
}

// Socket.IO connection handling
io.on('connection', (socket) => {
    log('info', `New socket connection established`, { socketId: socket.id });

    // Handle room creation
    socket.on('create-room', (data: CreateRoomRequest, callback) => {
        log('info', `Received create-room request`, { socketId: socket.id, data });

        try {
            const { roomId = uuidv4(), userName } = data;

            // Validate input
            if (!userName || userName.trim().length === 0) {
                log('error', `Invalid userName provided`, { socketId: socket.id, userName });
                const response: ErrorResponse = {
                    success: false,
                    error: 'Username is required and cannot be empty'
                };
                return callback(response);
            }

            // Check if room already exists
            if (rooms.has(roomId)) {
                log('error', `Room already exists`, { roomId, socketId: socket.id });
                const response: ErrorResponse = {
                    success: false,
                    error: 'Room with this ID already exists'
                };
                return callback(response);
            }

            // Create room
            const room = createRoom(roomId, socket.id);

            // Add creator as participant
            const participantResult = addParticipantToRoom(roomId, socket.id, {
                userName: userName.trim(),
                isCreator: true,
                joinedAt: new Date().toISOString()
            });

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
                    participantCount: room.participants.size,
                    maxParticipants: room.maxParticipants
                },
                participant: participantResult.participant!
            };

            log('info', `Room created and creator added successfully`, response);
            callback(response);

            // Broadcast room update to all participants
            const updateEvent: RoomUpdateEvent = {
                roomId,
                participants: participantsToArray(room.participants),
                event: 'participant-joined'
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
            const { roomId, userName } = data;

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
            if (!rooms.has(roomId)) {
                log('error', `Room not found for join`, { roomId, socketId: socket.id });
                const response: ErrorResponse = {
                    success: false,
                    error: 'Room not found'
                };
                return callback(response);
            }

            // Add participant to room
            const result = addParticipantToRoom(roomId, socket.id, {
                userName: userName.trim(),
                isCreator: false,
                joinedAt: new Date().toISOString()
            });

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
                    participantCount: result.room!.participants.size,
                    maxParticipants: result.room!.maxParticipants
                },
                participant: result.participant!,
                participants: participantsToArray(result.room!.participants)
            };

            log('info', `Successfully joined room`, response);
            callback(response);

            // Broadcast to other participants that someone joined
            const updateEvent: RoomUpdateEvent = {
                roomId,
                participants: participantsToArray(result.room!.participants),
                event: 'participant-joined',
                newParticipant: result.participant!
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

            const room = rooms.get(roomId);
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
                    participantCount: room.participants.size,
                    maxParticipants: room.maxParticipants
                },
                participants: participantsToArray(room.participants)
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

    // Handle disconnect
    socket.on('disconnect', (reason) => {
        log('info', `Socket disconnected`, { socketId: socket.id, reason });

        try {
            const result = removeParticipantFromRoom(socket.id);

            if (result && result.room) {
                // Notify remaining participants
                const updateEvent: RoomUpdateEvent = {
                    roomId: result.roomId,
                    participants: participantsToArray(result.room.participants),
                    event: 'participant-left',
                    leftParticipantId: socket.id
                };

                socket.to(result.roomId).emit('room-updated', updateEvent);

                log('info', `Notified remaining participants about disconnect`, {
                    roomId: result.roomId,
                    remainingCount: result.room.participants.size
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
    socket.on('error', (error) => {
        log('error', `Socket error`, { socketId: socket.id, error: error.message });
    });
});

// Health check endpoint
app.get('/health', (req, res) => {
    const health: HealthStatus = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        rooms: rooms.size,
        totalParticipants: Array.from(rooms.values()).reduce((sum, room) => sum + room.participants.size, 0)
    };

    log('info', `Health check requested`, health);
    res.json(health);
});

// Get rooms info endpoint
app.get('/rooms', (req, res) => {
    const roomsInfo: RoomsInfo = {
        rooms: Array.from(rooms.values()).map(room => ({
            id: room.id,
            createdAt: room.createdAt,
            participantCount: room.participants.size,
            maxParticipants: room.maxParticipants
        }))
    };

    log('info', `Rooms info requested`, { roomCount: roomsInfo.rooms.length });
    res.json(roomsInfo);
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
