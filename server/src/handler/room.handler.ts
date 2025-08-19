import { Socket } from "socket.io";
import { Container } from "../di";
import {
    JoinRoomRequest,
    LeaveRoomRequest,
    ReconnectRoomRequest,
    GetRoomInfoRequest
} from "../types/room.types";
import {
    JoinRoomResponse,
    LeaveRoomResponse,
    ReconnectRoomResponse,
    GetRoomInfoResponse,
    ErrorResponse,
    RoomUpdateEvent
} from "../types/webrtc.types";
import {Room} from "@prisma/client";
import {createSocketHandler} from "../di/helpers";

// ================================
// JOIN ROOM HANDLER
// ================================

export const joinRoomHandler = createSocketHandler(
    ['logger', 'metrics', 'roomManager', 'io', 'eventManager'] as const,
    (logger, metrics, roomManager, io, eventManager) =>
        async (socket: Socket, data: JoinRoomRequest, callback: (response: JoinRoomResponse | ErrorResponse) => void) => {
            const startTime = Date.now();

            console.log(`Join room handler called for socket ${socket.id} with data:`, data);

            try {
                logger.info('Received join-room request', {
                    socketId: socket.id,
                    data
                });

                // Validate required fields
                if (!data.eventId || !data.extUserId || !data.userName || !data.userEmail) {
                   logger.error('Missing required fields for join-room', {
                        socketId: socket.id,
                        eventId: data.eventId,
                        extUserId: data.extUserId,
                        userName: data.userName,
                        userEmail: data.userEmail
                    })
                    const response: ErrorResponse = {
                        success: false,
                        error: 'Event ID, external user ID, username, and email are required'
                    };
                    if (callback && typeof callback === 'function') {
                        callback(response);
                    }
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
                    if (callback && typeof callback === 'function') {
                       callback(response);
                    }
                }

                // Validate input
                if (!data.roomId) {
                    metrics.recordError('room', 'error', 'Room ID is required for joining');
                    logger.error('Room ID is required for joining', { socketId: socket.id, roomId: data.roomId });
                    const response: ErrorResponse = {
                        success: false,
                        error: 'Room ID is required'
                    };
                    if (callback && typeof callback === 'function') {
                        callback(response);
                    }
                }

                // Add participant to room
                const result = await roomManager.addParticipantToRoom(
                    data.roomId,
                    socket.id,
                    {
                        extUserId: data.extUserId.trim(),
                        userName: data.userName.trim(),
                        userEmail: data.userEmail.trim()
                    },
                    data.reconnectionToken
                );

                console.log(result)

                if (!result.success) {
                    metrics.recordError('room', 'error', result.error || 'Failed to join room');
                    logger.error('Failed to join room', {
                        roomId: data.roomId,
                        socketId: socket.id,
                        error: result.error
                    });
                    const response: ErrorResponse = {
                        success: false,
                        error: result.error || 'Failed to join room'
                    };

                    if (callback && typeof callback === 'function') {
                        callback(response);
                    }
                }

                // Join socket to room channel
                socket.join(data.roomId);
                logger.info('Socket joined room channel', { socketId: socket.id, roomId: data.roomId });

                // Store socket data
                socket.data = {
                    ...socket.data,
                    roomId: data.roomId,
                    userName: data.userName.trim(),
                    userEmail: data.userEmail.trim(),
                    extUserId: data.extUserId,
                    eventId: data.eventId
                };

                // Record metrics
                const processingTime = Date.now() - startTime;
                metrics.recordSocketEvent('join-room', 'outbound', processingTime);

                console.log(result)
                console.log(result.participant)

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
                        roomId: data.roomId,
                        socketId: result.participant!.socketId!,
                        userName: result.participant!.userName,
                        userEmail: result.participant!.userEmail,
                        extUserId: result.participant!.extUserId,
                        isCreator: result.participant.id === result.room!.creatorId,
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
                    roomId: data.roomId,
                    participants: roomManager.participantsToArray(result.room!.participants),
                    event: eventType,
                    participant: response.participant
                };
                socket.to(data.roomId).emit('room-updated', updateEvent);

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

                return;
            }
        }
);

// ================================
// LEAVE ROOM HANDLER
// ================================

export const leaveRoomHandler = createSocketHandler(
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

export const getRoomInfoHandler = createSocketHandler(
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

export const reconnectRoomHandler = createSocketHandler(
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
    const joinRoom = joinRoomHandler(container);
    const leaveRoom = leaveRoomHandler(container);
    const getRoomInfo = getRoomInfoHandler(container);
    const reconnectRoom = reconnectRoomHandler(container);

    // Register socket event listeners
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
        joinRoom,
        leaveRoom,
        getRoomInfo,
        reconnectRoom
    };
}