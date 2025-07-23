// ================================
// Event-Based Room Management API
// ================================

import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { MetricsCollector } from './metrics/collector';

const router = Router();
const prisma = new PrismaClient();

// ================================
// Validation Schemas
// ================================

const CreateEventRoomSchema = z.object({
    eventId: z.string().min(1, 'Event ID is required'),
    eventTitle: z.string().min(1, 'Event title is required'),
    eventDescription: z.string().optional(),
    scheduledStartTime: z.string().datetime('Invalid date format'),
    hostUserId: z.string().min(1, 'Host user ID is required'),
    hostUserName: z.string().min(1, 'Host user name is required'),
    maxParticipants: z.number().int().min(1).max(100).default(10),
    timeoutDuration: z.number().int().min(300000).default(3600000) // Min 5 minutes
});

const BookParticipantSchema = z.object({
    eventId: z.string().min(1, 'Event ID is required'),
    userId: z.string().min(1, 'User ID is required'),
    userName: z.string().min(1, 'User name is required'),
    userEmail: z.string().email('Valid email is required')
});

const CancelBookingSchema = z.object({
    eventId: z.string().min(1, 'Event ID is required'),
    userId: z.string().min(1, 'User ID is required')
});

const UpdateEventRoomSchema = z.object({
    eventId: z.string().min(1, 'Event ID is required'),
    eventTitle: z.string().optional(),
    eventDescription: z.string().optional(),
    scheduledStartTime: z.string().datetime().optional(),
    maxParticipants: z.number().int().min(1).max(100).optional(),
    timeoutDuration: z.number().int().min(300000).optional()
});

// ================================
// Types
// ================================

export interface CreateEventRoomRequest {
    eventId: string;
    eventTitle: string;
    eventDescription?: string;
    scheduledStartTime: string;
    hostUserId: string;
    hostUserName: string;
    maxParticipants?: number;
    timeoutDuration?: number;
}

export interface CreateEventRoomResponse {
    success: true;
    room: {
        id: string;
        eventId: string;
        eventTitle: string;
        scheduledStartTime: string;
        maxParticipants: number;
        createdAt: string;
        hostUserName: string;
    };
}

export interface BookParticipantRequest {
    eventId: string;
    userId: string;
    userName: string;
    userEmail: string;
}

export interface BookParticipantResponse {
    success: true;
    participant: {
        id: string;
        userName: string;
        userEmail: string;
        bookedAt: string;
        roomId: string;
    };
    room: {
        id: string;
        eventTitle: string;
        scheduledStartTime: string;
        currentBookings: number;
        maxParticipants: number;
    };
}

export interface GetEventRoomResponse {
    success: true;
    room: {
        id: string;
        eventId: string;
        eventTitle: string;
        eventDescription?: string;
        scheduledStartTime: string;
        maxParticipants: number;
        isActive: boolean;
        hostUserName: string;
        bookings: Array<{
            id: string;
            userName: string;
            bookedAt: string;
            isConnected?: boolean; // Only if room is active
        }>;
    };
}

export interface ErrorResponse {
    success: false;
    error: string;
    code?: string;
}

// ================================
// API Endpoints
// ================================

// Create a room for a scheduled event
router.post('/events/rooms', async (req, res) => {
    const start = Date.now();
    const metricsCollector = new MetricsCollector();

    try {
        const data = CreateEventRoomSchema.parse(req.body);

        // Check if room for this event already exists
        const existingRoom = await prisma.room.findUnique({
            where: { eventId: data.eventId }
        });

        if (existingRoom) {
            return res.status(409).json({
                success: false,
                error: 'Room for this event already exists',
                code: 'ROOM_EXISTS'
            } as ErrorResponse);
        }

        // Create room
        const room = await prisma.room.create({
            data: {
                eventId: data.eventId,
                eventTitle: data.eventTitle,
                eventDescription: data.eventDescription,
                scheduledStartTime: new Date(data.scheduledStartTime),
                hostUserId: data.hostUserId,
                hostUserName: data.hostUserName,
                maxParticipants: data.maxParticipants,
                timeoutDuration: data.timeoutDuration,
                isPreScheduled: true,
                isActive: false, // Will be activated when event starts
                creator: `external:${data.hostUserId}` // Mark as external creation
            }
        });

        // Create host participant record
        await prisma.participant.create({
            data: {
                roomId: room.id,
                userName: data.hostUserName,
                externalUserId: data.hostUserId,
                isCreator: true,
                isPreBooked: true,
                bookedAt: new Date()
            }
        });

        metricsCollector.recordRoomCreated('system');
        metricsCollector.recordDatabaseOperation('create', 'room', Date.now() - start);

        const response: CreateEventRoomResponse = {
            success: true,
            room: {
                id: room.id,
                eventId: room.eventId!,
                eventTitle: room.eventTitle!,
                scheduledStartTime: room.scheduledStartTime!.toISOString(),
                maxParticipants: room.maxParticipants,
                createdAt: room.createdAt.toISOString(),
                hostUserName: room.hostUserName!
            }
        };

        res.status(201).json(response);

    } catch (error) {
        metricsCollector.recordError('database', 'error');

        if (error instanceof z.ZodError) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                code: 'VALIDATION_ERROR'
            } as ErrorResponse);
        }

        console.error('Error creating event room:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            code: 'INTERNAL_ERROR'
        } as ErrorResponse);
    }
});

// Book a participant for an event
router.post('/events/rooms/book', async (req, res) => {
    const start = Date.now();
    const metricsCollector = new MetricsCollector();

    try {
        const data = BookParticipantSchema.parse(req.body);

        // Find room by event ID
        const room = await prisma.room.findUnique({
            where: { eventId: data.eventId },
            include: {
                participants: {
                    where: { isPreBooked: true }
                }
            }
        });

        if (!room) {
            return res.status(404).json({
                success: false,
                error: 'Event room not found',
                code: 'ROOM_NOT_FOUND'
            } as ErrorResponse);
        }

        // Check if user already booked
        const existingBooking = room.participants.find(p => p.externalUserId === data.userId);
        if (existingBooking) {
            return res.status(409).json({
                success: false,
                error: 'User already booked for this event',
                code: 'ALREADY_BOOKED'
            } as ErrorResponse);
        }

        // Check room capacity
        if (room.participants.length >= room.maxParticipants) {
            return res.status(409).json({
                success: false,
                error: 'Event is fully booked',
                code: 'ROOM_FULL'
            } as ErrorResponse);
        }

        // Create participant booking
        const participant = await prisma.participant.create({
            data: {
                roomId: room.id,
                userName: data.userName,
                userEmail: data.userEmail,
                externalUserId: data.userId,
                isPreBooked: true,
                bookedAt: new Date()
            }
        });

        metricsCollector.recordParticipantJoin('new');
        metricsCollector.recordDatabaseOperation('create', 'participant', Date.now() - start);

        const response: BookParticipantResponse = {
            success: true,
            participant: {
                id: participant.id,
                userName: participant.userName,
                userEmail: participant.userEmail!,
                bookedAt: participant.bookedAt!.toISOString(),
                roomId: room.id
            },
            room: {
                id: room.id,
                eventTitle: room.eventTitle!,
                scheduledStartTime: room.scheduledStartTime!.toISOString(),
                currentBookings: room.participants.length + 1,
                maxParticipants: room.maxParticipants
            }
        };

        res.status(201).json(response);

    } catch (error) {
        metricsCollector.recordError('database', 'error');

        if (error instanceof z.ZodError) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                code: 'VALIDATION_ERROR'
            } as ErrorResponse);
        }

        console.error('Error booking participant:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            code: 'INTERNAL_ERROR'
        } as ErrorResponse);
    }
});

// Cancel a booking
router.delete('/events/rooms/book', async (req, res) => {
    const start = Date.now();
    const metricsCollector = new MetricsCollector();

    try {
        const data = CancelBookingSchema.parse(req.body);

        // Find and delete the booking
        const deleted = await prisma.participant.deleteMany({
            where: {
                externalUserId: data.userId,
                room: {
                    eventId: data.eventId
                },
                isPreBooked: true,
                socketId: null // Only delete pre-booked, not connected participants
            }
        });

        if (deleted.count === 0) {
            return res.status(404).json({
                success: false,
                error: 'Booking not found',
                code: 'BOOKING_NOT_FOUND'
            } as ErrorResponse);
        }

        metricsCollector.recordParticipantLeave('manual', 0);
        metricsCollector.recordDatabaseOperation('delete', 'participant', Date.now() - start);

        res.json({ success: true });

    } catch (error) {
        metricsCollector.recordError('database', 'error');

        if (error instanceof z.ZodError) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                code: 'VALIDATION_ERROR'
            } as ErrorResponse);
        }

        console.error('Error canceling booking:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            code: 'INTERNAL_ERROR'
        } as ErrorResponse);
    }
});

// Get event room info
router.get('/events/rooms/:eventId', async (req, res) => {
    const start = Date.now();
    const metricsCollector = new MetricsCollector();

    try {
        const { eventId } = req.params;

        const room = await prisma.room.findUnique({
            where: { eventId },
            include: {
                participants: {
                    where: { isPreBooked: true },
                    orderBy: { bookedAt: 'asc' }
                }
            }
        });

        if (!room) {
            return res.status(404).json({
                success: false,
                error: 'Event room not found',
                code: 'ROOM_NOT_FOUND'
            } as ErrorResponse);
        }

        metricsCollector.recordDatabaseOperation('read', 'room', Date.now() - start);

        // TODO: Get live connection status from volatile state if room is active
        const response: GetEventRoomResponse = {
            success: true,
            room: {
                id: room.id,
                eventId: room.eventId!,
                eventTitle: room.eventTitle!,
                eventDescription: room.eventDescription,
                scheduledStartTime: room.scheduledStartTime!.toISOString(),
                maxParticipants: room.maxParticipants,
                isActive: room.isActive,
                hostUserName: room.hostUserName!,
                bookings: room.participants.map(p => ({
                    id: p.id,
                    userName: p.userName,
                    bookedAt: p.bookedAt!.toISOString()
                    // isConnected would be populated from volatile state for active rooms
                }))
            }
        };

        res.json(response);

    } catch (error) {
        metricsCollector.recordError('database', 'error');
        console.error('Error getting event room:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            code: 'INTERNAL_ERROR'
        } as ErrorResponse);
    }
});

// Update event room details
router.put('/events/rooms/:eventId', async (req, res) => {
    const start = Date.now();
    const metricsCollector = new MetricsCollector();

    try {
        const { eventId } = req.params;
        const data = UpdateEventRoomSchema.parse(req.body);

        const updateData: any = {};
        if (data.eventTitle) updateData.eventTitle = data.eventTitle;
        if (data.eventDescription !== undefined) updateData.eventDescription = data.eventDescription;
        if (data.scheduledStartTime) updateData.scheduledStartTime = new Date(data.scheduledStartTime);
        if (data.maxParticipants) updateData.maxParticipants = data.maxParticipants;
        if (data.timeoutDuration) updateData.timeoutDuration = data.timeoutDuration;

        const room = await prisma.room.update({
            where: { eventId },
            data: updateData
        });

        metricsCollector.recordDatabaseOperation('update', 'room', Date.now() - start);

        res.json({
            success: true,
            room: {
                id: room.id,
                eventId: room.eventId!,
                eventTitle: room.eventTitle!,
                scheduledStartTime: room.scheduledStartTime!.toISOString(),
                maxParticipants: room.maxParticipants
            }
        });

    } catch (error) {
        metricsCollector.recordError('database', 'error');

        if (error instanceof z.ZodError) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                code: 'VALIDATION_ERROR'
            } as ErrorResponse);
        }

        console.error('Error updating event room:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            code: 'INTERNAL_ERROR'
        } as ErrorResponse);
    }
});

// Activate room when event starts (usually called by a scheduler)
router.post('/events/rooms/:eventId/activate', async (req, res) => {
    const start = Date.now();
    const metricsCollector = new MetricsCollector();

    try {
        const { eventId } = req.params;

        const room = await prisma.room.update({
            where: { eventId },
            data: {
                isActive: true,
                lastActivity: new Date()
            }
        });

        metricsCollector.recordDatabaseOperation('update', 'room', Date.now() - start);

        res.json({
            success: true,
            room: {
                id: room.id,
                eventId: room.eventId!,
                isActive: room.isActive
            }
        });

    } catch (error) {
        metricsCollector.recordError('database', 'error');
        console.error('Error activating event room:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            code: 'INTERNAL_ERROR'
        } as ErrorResponse);
    }
});

// Delete event room
router.delete('/events/rooms/:eventId', async (req, res) => {
    const start = Date.now();
    const metricsCollector = new MetricsCollector();

    try {
        const { eventId } = req.params;

        await prisma.room.delete({
            where: { eventId }
        });

        metricsCollector.recordRoomDestroyed('manual', 0);
        metricsCollector.recordDatabaseOperation('delete', 'room', Date.now() - start);

        res.json({ success: true });

    } catch (error) {
        metricsCollector.recordError('database', 'error');
        console.error('Error deleting event room:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            code: 'INTERNAL_ERROR'
        } as ErrorResponse);
    }
});

export default router;

// ================================
// Integration Helper Functions
// ================================

// Function to handle when a pre-booked participant actually joins the room
export async function handlePreBookedParticipantJoin(
    socketId: string,
    roomId: string,
    externalUserId: string
): Promise<boolean> {
    try {
        // Update the participant record with socket ID
        const participant = await prisma.participant.updateMany({
            where: {
                roomId,
                externalUserId,
                isPreBooked: true,
                socketId: null
            },
            data: {
                socketId,
                lastSeen: new Date()
            }
        });

        return participant.count > 0;
    } catch (error) {
        console.error('Error updating pre-booked participant:', error);
        return false;
    }
}

// Function to get room by event ID for socket handlers
export async function getRoomByEventId(eventId: string) {
    return await prisma.room.findUnique({
        where: { eventId },
        include: {
            participants: true
        }
    });
}

// Function to check if user is pre-booked for an event
export async function isUserPreBooked(eventId: string, externalUserId: string): Promise<boolean> {
    const participant = await prisma.participant.findFirst({
        where: {
            room: { eventId },
            externalUserId,
            isPreBooked: true
        }
    });

    return !!participant;
}