import { Socket, Server } from "socket.io";
import { Container } from "../di";
import {
    CreateRoomRequest,
    JoinRoomRequest,
    LeaveRoomRequest,
    ReconnectRoomRequest,
    GetRoomInfoRequest
} from "../types/room.types";
import {
    CreateRoomResponse,
    JoinRoomResponse,
    LeaveRoomResponse,
    ReconnectRoomResponse,
    GetRoomInfoResponse,
    ErrorResponse,
    RoomUpdateEvent
} from "../types/webrtc.types";
import { v4 as uuidv4 } from 'uuid';
import { createHandler } from "../di";

// ================================
// CREATE ROOM HANDLER
// ================================

export const createRoomHandler = createHandler(
    ['logger', 'metrics', 'roomManager', 'io'] as const,
    (logger, metrics, roomManager, io) =>
        async (socket: Socket, data: CreateRoomRequest, callback: (response: CreateRoomResponse | ErrorResponse) => void) => {
            const startTime = Date.now();

            try {
                logger.info('Received create-room request', {
                    socketId: socket.id,
                    data
                });

                const { roomId = uuidv4(), userName, reconnectionToken } = data;

                // Validate input
                if (!userName || userName.trim().length === 0) {
                    metrics.recordError('room', 'error', 'Invalid username provided');
                    logger.error('Invalid userName provided', { socketId: socket.id, userName });
                    const response: ErrorResponse = {
                        success: false,
                        error: 'Username is required and cannot be empty'
                    };
                    return callback(response);
                }

                // Check if room already exists
                let room = await roomManager.getRoomById(roomId);
                let isNewRoom = false;

                if (!room) {
                    // Create new room
                    const createResult = await roomManager.createRoom(roomId, socket.id);
                    if (!createResult.success) {
                        const response: ErrorResponse = {
                            success: false,
                            error: createResult.error || 'Failed to create room'
                        };
                        return callback(response);
                    }
                    room = await roomManager.getRoomById(roomId);
                    isNewRoom = true;
                } else if (!room.isActive) {
                    logger.error('Room exists but is not active', { roomId, socketId: socket.id });
                    const response: ErrorResponse = {
                        success: false,
                        error: 'Room exists but is no longer active'
                    };
                    return callback(response);
                }

                // Add creator as participant
                const participantResult = await roomManager.addParticipantToRoom(roomId, socket.id, {
                    userName: userName.trim(),
                    isCreator: isNewRoom
                }, reconnectionToken);

                if (!participantResult.success) {
                    logger.error('Failed to add creator to room', {
                        roomId,
                        socketId: socket.id,
                        error: participantResult.error
                    });
                    const response: ErrorResponse = {
                        success: false,
                        error: participantResult.error || 'Failed to join room'
                    };
                    return callback(response);
                }

                // Join socket to room channel
                socket.join(roomId);
                logger.info('Socket joined room channel', { socketId: socket.id, roomId });

                // Store socket data
                socket.data = {
                    ...socket.data,
                    roomId,
                    userName: userName.trim(),
                    isCreator: isNewRoom
                };

                // Record metrics
                const processingTime = Date.now() - startTime;
                metrics.recordSocketEvent('create-room', 'outbound', processingTime);

                const response: CreateRoomResponse = {
                    success: true,
                    room: {
                        id: room!.id,
                        createdAt: room!.createdAt.toISOString(),
                        lastActivity: room!.lastActivity.toISOString(),
                        participantCount: room!.participants.length,
                        maxParticipants: room!.maxParticipants,
                        isActive: room!.isActive,
                        timeoutDuration: room!.timeoutDuration
                    },
                    participant: {
                        socketId: participantResult.participant!.socketId,
                        userName: participantResult.participant!.userName,
                        isCreator: participantResult.participant!.isCreator,
                        joinedAt: participantResult.participant!.joinedAt.toISOString(),
                        lastSeen: participantResult.participant!.lastSeen.toISOString(),
                        reconnectionToken: participantResult.participant!.reconnectionToken!,
                        mediaStatus: {
                            hasVideo: false,
                            hasAudio: false,
                            isScreenSharing: false
                        },
                        id: participantResult.participant!.id,
                        roomId: participantResult.participant!.roomId
                    },
                    reconnectionToken: participantResult.participant!.reconnectionToken!
                };

                logger.success('Room created successfully', response);
                callback(response);

                // Broadcast room creation to other participants if rejoining existing room
                if (!isNewRoom) {
                    const updateEvent: RoomUpdateEvent = {
                        roomId,
                        participants: roomManager.participantsToArray(participantResult.room!.participants),
                        event: participantResult.isReconnection ? 'participant-reconnected' : 'participant-joined',
                        participant: response.participant
                    };
                    socket.to(roomId).emit('room-updated', updateEvent);
                }

            } catch (error: any) {
                const err = error as Error;
                metrics.recordError('room', 'error', err.message);
                logger.error('Error handling create-room', {
                    socketId: socket.id,
                    error: err.message,
                    stack: err.stack
                });

                const response: ErrorResponse = {
                    success: false,
                    error: 'Internal server error while creating room'
                };

                // Safe callback invocation
                if (callback && typeof callback === 'function') {
                    callback(response);
                }
            }
        }
);

// ================================
// JOIN ROOM HANDLER
// ================================

export const joinRoomHandler = createHandler(
    ['logger', 'metrics', 'roomManager', 'io'] as const,
    (logger, metrics, roomManager, io) =>
        async (socket: Socket, data: JoinRoomRequest, callback: (response: JoinRoomResponse | ErrorResponse) => void) => {
            const startTime = Date.now();

            try {
                logger.info('Received join-room request', {
                    socketId: socket.id,
                    data
                });

                const { roomId, userName, reconnectionToken } = data;

                // Validate input
                if (!roomId) {
                    const response: ErrorResponse = {
                        success: false,
                        error: 'Room ID is required'
                    };
                    return callback(response);
                }

                if (!userName || userName.trim().length === 0) {
                    const response: ErrorResponse = {
                        success: false,
                        error: 'Username is required and cannot be empty'
                    };
                    return callback(response);
                }

                // Add participant to room
                const result = await roomManager.addParticipantToRoom(roomId, socket.id, {
                    userName: userName.trim(),
                    isCreator: false
                }, reconnectionToken);

                if (!result.success) {
                    logger.error('Failed to join room', {
                        roomId,
                        socketId: socket.id,
                        error: result.error
                    });
                    const response: ErrorResponse = {
                        success: false,
                        error: result.error || 'Failed to join room'
                    };
                    return callback(response);
                }

                // Join socket to room channel
                socket.join(roomId);
                logger.info('Socket joined room channel', { socketId: socket.id, roomId });

                // Store socket data
                socket.data = {
                    ...socket.data,
                    roomId,
                    userName: userName.trim(),
                    isCreator: false
                };

                // Record metrics
                const processingTime = Date.now() - startTime;
                metrics.recordSocketEvent('join-room', 'outbound', processingTime);

                const response: JoinRoomResponse = {
                    success: true,
                    room: {
                        id: result.room!.id,
                        createdAt: result.room!.createdAt.toISOString(),
                        lastActivity: result.room!.lastActivity.toISOString(),
                        participantCount: result.room!.participants.length,
                        maxParticipants: result.room!.maxParticipants,
                        isActive: result.room!.isActive,
                        timeoutDuration: result.room!.timeoutDuration
                    },
                    participant: {
                        id: result.participant!.id,
                        roomId: result.participant!.roomId,
                        socketId: result.participant!.socketId,
                        userName: result.participant!.userName,
                        isCreator: result.participant!.isCreator,
                        joinedAt: result.participant!.joinedAt.toISOString(),
                        lastSeen: result.participant!.lastSeen.toISOString(),
                        reconnectionToken: result.participant!.reconnectionToken!,
                        mediaStatus: {
                            hasVideo: false,
                            hasAudio: false,
                            isScreenSharing: false
                        }
                    },
                    participants: roomManager.participantsToArray(result.room!.participants),
                    reconnectionToken: result.participant!.reconnectionToken!
                };

                logger.success('Successfully joined room', response);
                callback(response);

                // Broadcast to other participants
                const eventType = result.isReconnection ? 'participant-reconnected' : 'participant-joined';
                const updateEvent: RoomUpdateEvent = {
                    roomId,
                    participants: roomManager.participantsToArray(result.room!.participants),
                    event: eventType,
                    participant: response.participant
                };
                socket.to(roomId).emit('room-updated', updateEvent);

            } catch (error: any) {
                const err = error as Error;
                metrics.recordError('room', 'error', err.message);
                logger.error('Error handling join-room', {
                    socketId: socket.id,
                    error: err.message,
                    stack: err.stack
                });

                const response: ErrorResponse = {
                    success: false,
                    error: 'Internal server error while joining room'
                };

                // Safe callback invocation
                if (callback && typeof callback === 'function') {
                    callback(response);
                }
            }
        }
);

// ================================
// LEAVE ROOM HANDLER
// ================================

export const leaveRoomHandler = createHandler(
    ['logger', 'metrics', 'roomManager', 'io'] as const,
    (logger, metrics, roomManager, io) =>
        async (socket: Socket, data: LeaveRoomRequest, callback: (response: LeaveRoomResponse | ErrorResponse) => void) => {
            const startTime = Date.now();

            try {
                logger.info('Received leave-room request', {
                    socketId: socket.id,
                    data
                });

                // Validate input
                if (!data.roomId) {
                    const response: ErrorResponse = {
                        success: false,
                        error: 'Room ID is required'
                    };
                    return callback(response);
                }

                // Check if user is actually in this room
                const currentRoomId = await roomManager.getRoomBySocketId(socket.id);
                if (currentRoomId !== data.roomId) {
                    logger.warning('User attempted to leave room they\'re not in', {
                        socketId: socket.id,
                        requestedRoomId: data.roomId,
                        actualRoomId: currentRoomId
                    });
                    const response: ErrorResponse = {
                        success: false,
                        error: 'You are not in this room'
                    };
                    return callback(response);
                }

                // Remove participant from room
                const success = await roomManager.removeParticipantFromRoom(socket.id);

                if (!success) {
                    const response: ErrorResponse = {
                        success: false,
                        error: 'Failed to leave room'
                    };
                    return callback(response);
                }

                // Leave socket room channel
                socket.leave(data.roomId);
                logger.info('Socket left room channel', { socketId: socket.id, roomId: data.roomId });

                // Clear socket data
                socket.data = {
                    ...socket.data,
                    roomId: undefined,
                    userName: undefined,
                    isCreator: undefined
                };

                // Record metrics
                const processingTime = Date.now() - startTime;
                metrics.recordSocketEvent('leave-room', 'outbound', processingTime);

                const response: LeaveRoomResponse = {
                    success: true,
                };

                logger.success('Successfully left room', response);
                callback(response);

                // Broadcast participant left to remaining participants
                const room = await roomManager.getRoomById(data.roomId);
                if (room) {
                    const updateEvent: RoomUpdateEvent = {
                        roomId: data.roomId,
                        participants: roomManager.participantsToArray(room.participants),
                        event: 'participant-left',
                        participant: {
                            socketId: socket.id,
                            userName: socket.data?.userName || 'Unknown',
                            isCreator: socket.data?.isCreator || false,
                            joinedAt: new Date(),
                            lastSeen: new Date(),
                            reconnectionToken: '',
                            mediaStatus: {
                                hasVideo: false,
                                hasAudio: false,
                                isScreenSharing: false
                            },
                            roomId: data.roomId,
                            id: ""
                        }
                    };
                    socket.to(data.roomId).emit('room-updated', updateEvent);
                }

            } catch (error: any) {
                const err = error as Error;
                metrics.recordError('room', 'error', err.message);
                logger.error('Error handling leave-room', {
                    socketId: socket.id,
                    error: err.message,
                    stack: err.stack
                });

                const response: ErrorResponse = {
                    success: false,
                    error: 'Internal server error while leaving room'
                };
                // Safe callback invocation
                if (callback && typeof callback === 'function') {
                    callback(response);
                }
            }
        }
);

// ================================
// GET ROOM INFO HANDLER
// ================================

export const getRoomInfoHandler = createHandler(
    ['logger', 'metrics', 'roomManager'] as const,
    (logger, metrics, roomManager) =>
        async (socket: Socket, data: GetRoomInfoRequest, callback: (response: GetRoomInfoResponse | ErrorResponse) => void) => {
            const startTime = Date.now();

            try {
                logger.info('Received get-room-info request', {
                    socketId: socket.id,
                    data
                });

                const { roomId } = data;

                if (!roomId) {
                    const response: ErrorResponse = {
                        success: false,
                        error: 'Room ID is required'
                    };
                    return callback(response);
                }

                const room = await roomManager.getRoomById(roomId);
                if (!room) {
                    logger.info('Room info requested for non-existent room', { roomId, socketId: socket.id });
                    const response: ErrorResponse = {
                        success: false,
                        error: 'Room not found'
                    };
                    return callback(response);
                }

                // Record metrics
                const processingTime = Date.now() - startTime;
                metrics.recordSocketEvent('get-room-info', 'outbound', processingTime);

                const response: GetRoomInfoResponse = {
                    success: true,
                    room: {
                        id: room.id,
                        createdAt: room.createdAt.toISOString(),
                        lastActivity: room.lastActivity.toISOString(),
                        participantCount: room.participants.length,
                        maxParticipants: room.maxParticipants,
                        isActive: room.isActive,
                        timeoutDuration: room.timeoutDuration
                    },
                    participants: roomManager.participantsToArray(room.participants)
                };

                logger.info('Room info provided', response);
                callback(response);

            } catch (error: any) {
                const err = error as Error;
                metrics.recordError('room', 'error', err.message);
                logger.error('Error handling get-room-info', {
                    socketId: socket.id,
                    error: err.message,
                    stack: err.stack
                });

                const response: ErrorResponse = {
                    success: false,
                    error: 'Internal server error while getting room info'
                };
                // Safe callback invocation
                if (callback && typeof callback === 'function') {
                    callback(response);
                }
            }
        }
);

// ================================
// RECONNECT ROOM HANDLER
// ================================

export const reconnectRoomHandler = createHandler(
    ['logger', 'metrics', 'roomManager', 'io'] as const,
    (logger, metrics, roomManager, io) =>
        async (socket: Socket, data: ReconnectRoomRequest, callback: (response: ReconnectRoomResponse | ErrorResponse) => void) => {
            const startTime = Date.now();

            try {
                logger.info('Received reconnect-room request', {
                    socketId: socket.id,
                    data
                });

                const { roomId, reconnectionToken } = data;

                // Validate input
                if (!roomId || !reconnectionToken) {
                    const response: ErrorResponse = {
                        success: false,
                        error: 'Room ID and reconnection token are required'
                    };
                    return callback(response);
                }

                // Validate reconnection token
                const participant = await roomManager.validateReconnectionToken(reconnectionToken, roomId);
                if (!participant) {
                    logger.warning('Invalid reconnection attempt', {
                        socketId: socket.id,
                        roomId,
                        token: reconnectionToken.substring(0, 8) + '...'
                    });
                    const response: ErrorResponse = {
                        success: false,
                        error: 'Invalid or expired reconnection token'
                    };
                    return callback(response);
                }

                // Add participant back to room (this handles the reconnection logic)
                const result = await roomManager.addParticipantToRoom(
                    roomId,
                    socket.id,
                    {
                        userName: participant.userName,
                        isCreator: participant.isCreator
                    },
                    reconnectionToken
                );

                if (!result.success) {
                    const response: ErrorResponse = {
                        success: false,
                        error: result.error || 'Failed to reconnect to room'
                    };
                    return callback(response);
                }

                // Join socket to room channel
                socket.join(roomId);
                logger.info('Socket rejoined room channel', { socketId: socket.id, roomId });

                // Store socket data
                socket.data = {
                    ...socket.data,
                    roomId,
                    userName: participant.userName,
                    isCreator: participant.isCreator
                };

                // Record metrics
                const processingTime = Date.now() - startTime;
                metrics.recordSocketEvent('reconnect-room', 'outbound', processingTime);

                const response: ReconnectRoomResponse = {
                    success: true,
                    room: {
                        id: result.room!.id,
                        createdAt: result.room!.createdAt.toISOString(),
                        lastActivity: result.room!.lastActivity.toISOString(),
                        participantCount: result.room!.participants.length,
                        maxParticipants: result.room!.maxParticipants,
                        isActive: result.room!.isActive,
                        timeoutDuration: result.room!.timeoutDuration
                    },
                    participant: {
                        socketId: result.participant!.socketId,
                        userName: result.participant!.userName,
                        isCreator: result.participant!.isCreator,
                        joinedAt: result.participant!.joinedAt.toISOString(),
                        lastSeen: result.participant!.lastSeen.toISOString(),
                        reconnectionToken: result.participant!.reconnectionToken!,
                        mediaStatus: {
                            hasVideo: false,
                            hasAudio: false,
                            isScreenSharing: false
                        },
                        id: "",
                        roomId: result.participant!.roomId
                    },
                    participants: roomManager.participantsToArray(result.room!.participants)
                };

                logger.success('Successfully reconnected to room', response);
                callback(response);

                // Broadcast reconnection to other participants
                const updateEvent: RoomUpdateEvent = {
                    roomId,
                    participants: roomManager.participantsToArray(result.room!.participants),
                    event: 'participant-reconnected',
                    participant: response.participant
                };
                socket.to(roomId).emit('room-updated', updateEvent);

            } catch (error: any) {
                const err = error as Error;
                metrics.recordError('room', 'error', err.message);
                logger.error('Error handling reconnect-room', {
                    socketId: socket.id,
                    error: err.message,
                    stack: err.stack
                });

                const response: ErrorResponse = {
                    success: false,
                    error: 'Internal server error while reconnecting to room'
                };
                // Safe callback invocation
                if (callback && typeof callback === 'function') {
                    callback(response);
                }
            }
        }
);

// ================================
// HANDLER REGISTRATION FUNCTION
// ================================

export function registerRoomHandlers(container: Container, context: any) {
    const logger = container.get<'logger'>('logger');

    logger.info('Registering room handlers', { socketId: context.connectionId });

    // Convert handlers to actual functions using the container
    const createRoom = createRoomHandler(container);
    const joinRoom = joinRoomHandler(container);
    const leaveRoom = leaveRoomHandler(container);
    const getRoomInfo = getRoomInfoHandler(container);
    const reconnectRoom = reconnectRoomHandler(container);

    // Register socket event listeners
    context.socket.on('create-room', createRoom);
    context.socket.on('join-room', joinRoom);
    context.socket.on('leave-room', leaveRoom);
    context.socket.on('get-room-info', getRoomInfo);
    context.socket.on('reconnect-room', reconnectRoom);

    logger.success('Room handlers registered successfully', {
        socketId: context.connectionId,
        handlers: [
            'create-room',
            'join-room',
            'leave-room',
            'get-room-info',
            'reconnect-room'
        ]
    });

    // Return handlers for testing or cleanup
    return {
        createRoom,
        joinRoom,
        leaveRoom,
        getRoomInfo,
        reconnectRoom
    };
}