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
import {Room} from "@prisma/client";

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

                const { eventId, userName, userEmail, reconnectionToken } = data;

                // Validate input - eventId is now required
                if (!eventId) {
                    metrics.recordError('room', 'error', 'Event ID is required for room creation');
                    logger.error('Event ID is required', { socketId: socket.id });
                    const response: ErrorResponse = {
                        success: false,
                        error: 'Event ID is required for room creation'
                    };
                    return callback(response);
                }

                if (!userName || userName.trim().length === 0) {
                    metrics.recordError('room', 'error', 'Invalid username provided');
                    logger.error('Invalid userName provided', { socketId: socket.id, userName });
                    const response: ErrorResponse = {
                        success: false,
                        error: 'Username is required and cannot be empty'
                    };
                    return callback(response);
                }

                if (!userEmail || userEmail.trim().length === 0) {
                    metrics.recordError('room', 'error', 'Invalid email provided');
                    logger.error('Invalid userEmail provided', { socketId: socket.id, userEmail });
                    const response: ErrorResponse = {
                        success: false,
                        error: 'Email is required and cannot be empty'
                    };
                    return callback(response);
                }

                // Extract extUserId from socket or data
                const extUserId = socket.data?.userId || socket.data?.extUserId || socket.id;

                // Check if room already exists for this event
                let room = await roomManager.getRoomByEventId(eventId);
                let isNewRoom = false;

                if (!room) {
                    // Create new room for the event
                    const createResult = await roomManager.createRoomForEvent(
                        eventId,
                        extUserId,
                        { userName: userName.trim(), userEmail: userEmail.trim() }
                    );

                    if (!createResult.success) {
                        const response: ErrorResponse = {
                            success: false,
                            error: createResult.error || 'Failed to create room'
                        };
                        return callback(response);
                    }
                    room = createResult.room!;
                    isNewRoom = true;
                } else if (!room.isActive) {
                    logger.error('Room exists but is not active', { eventId, socketId: socket.id });
                    const response: ErrorResponse = {
                        success: false,
                        error: 'Room exists but is no longer active'
                    };
                    return callback(response);
                }

                // Add creator as participant
                const participantResult = await roomManager.addParticipantToRoom(
                    room.id,
                    socket.id,
                    {
                        extUserId,
                        userName: userName.trim(),
                        userEmail: userEmail.trim()
                    },
                    reconnectionToken
                );

                if (!participantResult.success) {
                    logger.error('Failed to add creator to room', {
                        roomId: room.id,
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
                socket.join(room.id);
                logger.info('Socket joined room channel', { socketId: socket.id, roomId: room.id });

                // Store socket data
                socket.data = {
                    ...socket.data,
                    roomId: room.id,
                    userName: userName.trim(),
                    userEmail: userEmail.trim(),
                    extUserId,
                    eventId
                };

                // Record metrics
                const processingTime = Date.now() - startTime;
                metrics.recordSocketEvent('create-room', 'outbound', processingTime);

                const response: CreateRoomResponse = {
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
                    participant: {
                        id: participantResult.participant!.id,
                        socketId: participantResult.participant!.socketId!,
                        userName: participantResult.participant!.userName,
                        userEmail: participantResult.participant!.userEmail,
                        extUserId: participantResult.participant!.extUserId,
                        isCreator: participantResult.participant!.creatorOf.length > 0,
                        joinedAt: participantResult.participant!.joinedAt?.toISOString() || new Date().toISOString(),
                        lastSeen: participantResult.participant!.lastSeen?.toISOString() || new Date().toISOString(),
                        reconnectionToken: participantResult.participant!.reconnectionToken!,
                        mediaStatus: {
                            hasVideo: false,
                            hasAudio: false,
                            isScreenSharing: false
                        },
                        roomId: room.id
                    },
                    reconnectionToken: participantResult.participant!.reconnectionToken!
                };

                logger.success('Room created successfully', response);
                callback(response);

                // Broadcast room creation to other participants if rejoining existing room
                if (!isNewRoom) {
                    const updateEvent: RoomUpdateEvent = {
                        roomId: room.id,
                        participants: roomManager.participantsToArray(participantResult.room!.participants),
                        event: participantResult.isReconnection ? 'participant-reconnected' : 'participant-joined',
                        participant: response.participant
                    };
                    socket.to(room.id).emit('room-updated', updateEvent);
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
    ['logger', 'metrics', 'roomManager', 'io', 'eventManager'] as const,
    (logger, metrics, roomManager, io, eventManager) =>
        async (socket: Socket, data: JoinRoomRequest, callback: (response: JoinRoomResponse | ErrorResponse) => void) => {
            const startTime = Date.now();

            try {
                logger.info('Received join-room request', {
                    socketId: socket.id,
                    data
                });

                // Validate required fields
                if (!data.eventId || !data.extUserId || !data.userName || !data.userEmail) {
                    const response: ErrorResponse = {
                        success: false,
                        error: 'Event ID, external user ID, username, and email are required'
                    };
                    return callback(response);
                }

                const isAuthorized = await eventManager.isUserAuthorizedForEvent(
                    data.eventId,
                    data.extUserId
                );

                if (!isAuthorized) {
                    logger.error('Unauthorized join-room attempt', {
                        socketId: socket.id,
                        eventId: data.eventId,
                        extUserId: data.extUserId
                    });
                    metrics.recordError('room', 'error', 'User not authorized to join room');
                    const response: ErrorResponse = {
                        success: false,
                        error: 'You are not authorized to join this room'
                    };
                    return callback(response);
                }

                const { roomId, userName, userEmail, extUserId, reconnectionToken } = data;

                // Validate input
                if (!roomId) {
                    metrics.recordError('room', 'error', 'Room ID is required for joining');
                    logger.error('Room ID is required for joining', { socketId: socket.id, roomId });
                    const response: ErrorResponse = {
                        success: false,
                        error: 'Room ID is required'
                    };
                    return callback(response);
                }

                // Add participant to room
                const result = await roomManager.addParticipantToRoom(
                    roomId,
                    socket.id,
                    {
                        extUserId,
                        userName: userName.trim(),
                        userEmail: userEmail.trim()
                    },
                    reconnectionToken
                );

                if (!result.success) {
                    metrics.recordError('room', 'error', result.error || 'Failed to join room');
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
                    userEmail: userEmail.trim(),
                    extUserId,
                    eventId: data.eventId
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
                        roomId: roomId,
                        socketId: result.participant!.socketId!,
                        userName: result.participant!.userName,
                        userEmail: result.participant!.userEmail,
                        extUserId: result.participant!.extUserId,
                        isCreator: result.participant!.creatorOf.length > 0,
                        joinedAt: result.participant!.joinedAt?.toISOString() || new Date().toISOString(),
                        lastSeen: result.participant!.lastSeen?.toISOString() || new Date().toISOString(),
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
                            joinedAt: new Date().toISOString(),
                            lastSeen: new Date().toISOString(),
                            reconnectionToken: '',
                            mediaStatus: {
                                hasVideo: false,
                                hasAudio: false,
                                isScreenSharing: false
                            },
                            roomId: data.roomId,
                            id: "",
                            userEmail: "",
                            extUserId: ""
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

                // Get participant by token to validate and get their info
                const participant = await roomManager.getParticipantByToken(reconnectionToken);
                if (!participant || (!participant.createdRoom || participant.createdRoom.id !== roomId) &&
                    !participant.participantRooms.some((room: Room) => room.id === roomId)) {
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
                        extUserId: participant.extUserId,
                        userName: participant.userName,
                        userEmail: participant.userEmail
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
                    userEmail: participant.userEmail,
                    extUserId: participant.extUserId
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
                        id: result.participant!.id,
                        socketId: result.participant!.socketId!,
                        userName: result.participant!.userName,
                        userEmail: result.participant!.userEmail,
                        extUserId: result.participant!.extUserId,
                        isCreator: result.participant!.creatorOf.length > 0,
                        joinedAt: result.participant!.joinedAt?.toISOString() || new Date().toISOString(),
                        lastSeen: result.participant!.lastSeen?.toISOString() || new Date().toISOString(),
                        reconnectionToken: result.participant!.reconnectionToken!,
                        mediaStatus: {
                            hasVideo: false,
                            hasAudio: false,
                            isScreenSharing: false
                        },
                        roomId: result.participant!.participantRooms[0]?.id || roomId
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