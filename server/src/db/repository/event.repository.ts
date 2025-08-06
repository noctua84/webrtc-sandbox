import {
    PrismaClient,
    Event as PrismaEvent,
    EventBooking as PrismaEventBooking,
    EventStatus,
    Participant
} from "@prisma/client";
import { Logger } from "../../types/log.types";
import {
    CreateEventContext,
    CreateBookingContext,
    EventEntity,
    BookingEntity,
    EventStatistics
} from "../../types/event.types";

export interface IEventRepository {
    // Event management
    createEvent(context: CreateEventContext): Promise<EventEntity>;
    getEventById(eventId: string): Promise<EventEntity | null>;
    getEventWithBookings(eventId: string): Promise<(EventEntity & { bookings: BookingEntity[] }) | null>;
    updateEventStatus(eventId: string, status: EventStatus): Promise<boolean>;
    deleteEvent(eventId: string): Promise<boolean>;

    // Booking management
    createBooking(context: CreateBookingContext): Promise<BookingEntity>;
    getBooking(eventId: string, userId: string): Promise<BookingEntity | null>;
    getBookingCount(eventId: string): Promise<number>;
    removeBooking(eventId: string, userId: string): Promise<boolean>;
    updateBookingJoinTime(eventId: string, userId: string, joinedAt: Date): Promise<boolean>;
    updateBookingLeaveTime(eventId: string, userId: string, leftAt: Date): Promise<boolean>;

    // Query and filtering
    getEventsWithFilters(filters: {
        status?: string;
        hostUserId?: string;
        dateFrom?: Date;
        dateTo?: Date;
        limit?: number;
        offset?: number;
    }): Promise<Array<EventEntity & { bookings?: BookingEntity[] }>>;

    // Statistics and analytics
    getEventStatistics(filters: {
        dateFrom?: Date;
        dateTo?: Date;
        hostUserId?: string;
    }): Promise<EventStatistics>;

    // Activity logging
    logEventActivity(eventId: string, activityType: string, data: {
        userId?: string;
        userName?: string;
        participantId?: string;
        metadata?: Record<string, any>;
    }): Promise<void>;

    // Cleanup and maintenance
    cleanupOldEvents(cutoffDate: Date): Promise<number>;
    getExpiredEvents(): Promise<EventEntity[]>;
}

export class EventRepository implements IEventRepository {
    private prisma: PrismaClient;
    private logger: Logger;

    constructor(prisma: PrismaClient, logger: Logger) {
        this.prisma = prisma;
        this.logger = logger;
    }

    // ================================
    // Event Management
    // ================================

    async createEvent(context: CreateEventContext): Promise<EventEntity> {
        try {
            let host: Participant;

            this.logger.info('Creating event in database', {
                eventId: context.eventId,
                hostUserId: context.hostUserId
            });

            // Create the event first
            const event = await this.prisma.event.create({
                data: {
                    eventId: context.eventId,
                    eventTitle: context.eventTitle,
                    eventDescription: context.eventDescription,
                    scheduledStartTime: context.scheduledStartTime,
                    hostUserId: context.hostUserId,
                    hostUserName: context.hostUserName,
                    maxParticipants: context.maxParticipants,
                    timeoutDuration: context.timeoutDuration,
                    status: context.status
                }
            });

            // Check if host participant already exists
            const existing = await this.prisma.participant.findUnique({
                where: { extUserId: context.hostUserId }
            });

            if (existing) {
                host = existing;
            } else {
                // Create participant if not exists
                this.logger.info('Creating host participant', {
                    userId: context.hostUserId,
                    userName: context.hostUserName
                });
                host = await this.prisma.participant.create({
                    data: {
                        extUserId: context.hostUserId,
                        userName: context.hostUserName,
                        userEmail: context.hostEmail || ""
                    }
                });
            }

            // Create the room for the event using eventId string (not internal id)
            const room = await this.prisma.room.create({
                data: {
                    eventId: event.id,
                    maxParticipants: context.maxParticipants,
                    timeoutDuration: context.timeoutDuration,
                    creatorId: host.id
                }
            });

            // Initialize event metrics
            await this.prisma.eventMetrics.create({
                data: {
                    eventId: event.eventId
                }
            });

            this.logger.info('Event created successfully', {
                eventId: event.eventId,
                roomId: room.id
            });

            return {
                ...this.mapPrismaEventToEntity(event),
                roomId: room.id
            };

        } catch (error) {
            const err = error as Error;
            this.logger.error('Failed to create event', {
                eventId: context.eventId,
                error: err.message
            });
            throw new Error(`Event creation failed: ${err.message}`);
        }
    }

    async getEventById(eventId: string): Promise<EventEntity | null> {
        try {
            const event = await this.prisma.event.findUnique({
                where: { eventId },
                include: {
                    room: true
                }
            });

            if (!event) return null;

            return {
                ...this.mapPrismaEventToEntity(event),
                roomId: event.room?.id || ''
            };

        } catch (error) {
            const err = error as Error;
            this.logger.error('Failed to get event by ID', {
                eventId,
                error: err.message
            });
            return null;
        }
    }

    async getEventWithBookings(eventId: string): Promise<(EventEntity & { bookings: BookingEntity[] }) | null> {
        try {
            const event = await this.prisma.event.findUnique({
                where: { eventId },
                include: {
                    room: true,
                    bookings: {
                        where: { isActive: true },
                        orderBy: { bookedAt: 'asc' }
                    }
                }
            });

            if (!event) return null;

            return {
                ...this.mapPrismaEventToEntity(event),
                roomId: event.room?.id || '',
                bookings: event.bookings.map(this.mapPrismaBookingToEntity)
            };

        } catch (error) {
            const err = error as Error;
            this.logger.error('Failed to get event with bookings', {
                eventId,
                error: err.message
            });
            return null;
        }
    }

    async updateEventStatus(eventId: string, status: EventStatus): Promise<boolean> {
        try {
            const updateData: any = {
                status,
                updatedAt: new Date()
            };

            if (status === 'ACTIVE') {
                updateData.activatedAt = new Date();
            } else if (status === 'CLOSED') {
                updateData.closedAt = new Date();
            }

            await this.prisma.event.update({
                where: { eventId },
                data: updateData
            });

            this.logger.info('Event status updated', {
                eventId,
                status
            });

            return true;

        } catch (error) {
            const err = error as Error;
            this.logger.error('Failed to update event status', {
                eventId,
                status,
                error: err.message
            });
            return false;
        }
    }

    async deleteEvent(eventId: string): Promise<boolean> {
        try {
            // This will cascade delete bookings due to onDelete: Cascade
            await this.prisma.event.delete({
                where: { eventId }
            });

            this.logger.info('Event deleted', { eventId });
            return true;

        } catch (error) {
            const err = error as Error;
            this.logger.error('Failed to delete event', {
                eventId,
                error: err.message
            });
            return false;
        }
    }

    // ================================
    // Booking Management
    // ================================

    async createBooking(context: CreateBookingContext): Promise<BookingEntity> {
        try {
            let newParticipant: any;
            const existingParticipant = await this.prisma.participant.findUnique({
                where: { extUserId: context.userId }
            });

            if (!existingParticipant) {
                // Create participant if not exists
                newParticipant = await this.prisma.participant.create({
                    data: {
                        extUserId: context.userId,
                        userName: context.userName,
                        userEmail: context.userEmail || ""
                    }
                });
            }

            const booking = await this.prisma.eventBooking.create({
                data: {
                    eventId: context.eventId,
                    userId: existingParticipant ? existingParticipant.extUserId : newParticipant.extUserId,
                    userName: context.userName,
                    userEmail: context.userEmail,
                    bookedAt: context.bookedAt
                }
            });

            // Log the booking activity
            await this.logEventActivity(context.eventId, 'booking_created', {
                userId: context.userId,
                userName: context.userName
            });

            // Update event metrics
            await this.prisma.eventMetrics.update({
                where: { eventId: context.eventId },
                data: {
                    totalBookings: { increment: 1 }
                }
            });

            this.logger.info('Booking created', {
                eventId: context.eventId,
                userId: context.userId
            });

            return this.mapPrismaBookingToEntity(booking);

        } catch (error) {
            const err = error as Error;
            this.logger.error('Failed to create booking', {
                eventId: context.eventId,
                userId: context.userId,
                error: err.message
            });
            throw new Error(`Booking creation failed: ${err.message}`);
        }
    }

    async getBooking(eventId: string, userId: string): Promise<BookingEntity | null> {
        try {
            const booking = await this.prisma.eventBooking.findUnique({
                where: {
                    eventId_userId: {
                        eventId,
                        userId
                    }
                }
            });

            return booking && booking.isActive ? this.mapPrismaBookingToEntity(booking) : null;

        } catch (error) {
            const err = error as Error;
            this.logger.error('Failed to get booking', {
                eventId,
                userId,
                error: err.message
            });
            return null;
        }
    }

    async getBookingCount(eventId: string): Promise<number> {
        try {
            return await this.prisma.eventBooking.count({
                where: {
                    eventId,
                    isActive: true
                }
            });

        } catch (error) {
            const err = error as Error;
            this.logger.error('Failed to get booking count', {
                eventId,
                error: err.message
            });
            return 0;
        }
    }

    async removeBooking(eventId: string, userId: string): Promise<boolean> {
        try {
            // Soft delete - mark as inactive
            await this.prisma.eventBooking.delete({
                where: {
                    eventId_userId: {
                        eventId,
                        userId
                    }
                }
            });

            // Log the cancellation activity
            await this.logEventActivity(eventId, 'booking_cancelled', {
                userId
            });

            // Update event metrics
            await this.prisma.eventMetrics.update({
                where: { eventId },
                data: {
                    cancelledBookings: { increment: 1 }
                }
            });

            this.logger.info('Booking removed', {
                eventId,
                userId
            });

            return true;

        } catch (error) {
            const err = error as Error;
            this.logger.error('Failed to remove booking', {
                eventId,
                userId,
                error: err.message
            });
            return false;
        }
    }

    async updateBookingJoinTime(eventId: string, userId: string, joinedAt: Date): Promise<boolean> {
        try {
            await this.prisma.eventBooking.update({
                where: {
                    eventId_userId: {
                        eventId,
                        userId
                    }
                },
                data: { joinedAt }
            });

            // Update event metrics
            await this.prisma.eventMetrics.update({
                where: { eventId },
                data: {
                    actualJoins: { increment: 1 }
                }
            });

            return true;

        } catch (error) {
            const err = error as Error;
            this.logger.error('Failed to update booking join time', {
                eventId,
                userId,
                error: err.message
            });
            return false;
        }
    }

    async updateBookingLeaveTime(eventId: string, userId: string, leftAt: Date): Promise<boolean> {
        try {
            await this.prisma.eventBooking.update({
                where: {
                    eventId_userId: {
                        eventId,
                        userId
                    }
                },
                data: { leftAt }
            });

            return true;

        } catch (error) {
            const err = error as Error;
            this.logger.error('Failed to update booking leave time', {
                eventId,
                userId,
                error: err.message
            });
            return false;
        }
    }

    // ================================
    // Query and Filtering
    // ================================

    async getEventsWithFilters(filters: {
        status?: string;
        hostUserId?: string;
        dateFrom?: Date;
        dateTo?: Date;
        limit?: number;
        offset?: number;
    }): Promise<Array<EventEntity & { bookings?: BookingEntity[] }>> {
        try {
            const whereClause: any = {};

            if (filters.status) {
                whereClause.status = filters.status;
            }

            if (filters.hostUserId) {
                whereClause.hostUserId = filters.hostUserId;
            }

            if (filters.dateFrom || filters.dateTo) {
                whereClause.scheduledStartTime = {};
                if (filters.dateFrom) {
                    whereClause.scheduledStartTime.gte = filters.dateFrom;
                }
                if (filters.dateTo) {
                    whereClause.scheduledStartTime.lte = filters.dateTo;
                }
            }

            const events = await this.prisma.event.findMany({
                where: whereClause,
                include: {
                    room: true,
                    bookings: {
                        where: { isActive: true }
                    }
                },
                orderBy: {
                    scheduledStartTime: 'desc'
                },
                take: filters.limit || 50,
                skip: filters.offset || 0
            });

            return events.map(event => ({
                ...this.mapPrismaEventToEntity(event),
                roomId: event.room?.id || '',
                bookings: event.bookings.map(this.mapPrismaBookingToEntity)
            }));

        } catch (error) {
            const err = error as Error;
            this.logger.error('Failed to get events with filters', {
                filters,
                error: err.message
            });
            throw new Error(`Query failed: ${err.message}`);
        }
    }

    // ================================
    // Statistics and Analytics
    // ================================

    async getEventStatistics(filters: {
        dateFrom?: Date;
        dateTo?: Date;
        hostUserId?: string;
    }): Promise<EventStatistics> {
        try {
            const whereClause: any = {};

            if (filters.hostUserId) {
                whereClause.hostUserId = filters.hostUserId;
            }

            if (filters.dateFrom || filters.dateTo) {
                whereClause.scheduledStartTime = {};
                if (filters.dateFrom) {
                    whereClause.scheduledStartTime.gte = filters.dateFrom;
                }
                if (filters.dateTo) {
                    whereClause.scheduledStartTime.lte = filters.dateTo;
                }
            }

            const [
                totalEvents,
                scheduledEvents,
                activeEvents,
                closedEvents,
                totalBookings,
                eventsCreatedToday
            ] = await Promise.all([
                this.prisma.event.count({ where: whereClause }),
                this.prisma.event.count({ where: { ...whereClause, status: 'SCHEDULED' } }),
                this.prisma.event.count({ where: { ...whereClause, status: 'ACTIVE' } }),
                this.prisma.event.count({ where: { ...whereClause, status: 'CLOSED' } }),
                this.prisma.eventBooking.count({
                    where: {
                        event: whereClause,
                        isActive: true
                    }
                }),
                this.prisma.event.count({
                    where: {
                        ...whereClause,
                        createdAt: {
                            gte: new Date(new Date().setHours(0, 0, 0, 0))
                        }
                    }
                })
            ]);

            // Count active participants - fix the query to match schema
            const activeParticipants = await this.prisma.participant.count({
                where: {
                    isConnected: true,
                    OR: [
                        {
                            createdRooms: {
                                some: {
                                    event: {
                                        status: 'ACTIVE'
                                    }
                                }
                            }
                        },
                        {
                            participantRooms: {
                                some: {
                                    event: {
                                        status: 'ACTIVE'
                                    }
                                }
                            }
                        }
                    ]
                }
            });

            const averageBookingsPerEvent = totalEvents > 0 ?
                Math.round((totalBookings / totalEvents) * 100) / 100 : 0;

            return {
                totalEvents,
                scheduledEvents,
                activeEvents,
                closedEvents,
                totalBookings,
                averageBookingsPerEvent,
                eventsCreatedToday,
                activeParticipants
            };

        } catch (error) {
            const err = error as Error;
            this.logger.error('Failed to get event statistics', {
                filters,
                error: err.message
            });
            throw new Error(`Statistics query failed: ${err.message}`);
        }
    }

    // ================================
    // Activity Logging
    // ================================

    async logEventActivity(eventId: string, activityType: string, data: {
        userId?: string;
        userName?: string;
        participantId?: string;
        metadata?: Record<string, any>;
    }): Promise<void> {
        try {
            await this.prisma.eventActivity.create({
                data: {
                    eventId,
                    activityType,
                    userId: data.userId,
                    userName: data.userName,
                    participantId: data.participantId,
                    metadata: data.metadata
                }
            });

        } catch (error) {
            // Don't throw for activity logging failures - just log the error
            const err = error as Error;
            this.logger.error('Failed to log event activity', {
                eventId,
                activityType,
                error: err.message
            });
        }
    }

    // ================================
    // Cleanup and Maintenance
    // ================================

    async cleanupOldEvents(cutoffDate: Date): Promise<number> {
        try {
            const result = await this.prisma.event.deleteMany({
                where: {
                    status: 'CLOSED',
                    closedAt: {
                        lt: cutoffDate
                    }
                }
            });

            this.logger.info('Cleaned up old events', {
                deletedCount: result.count,
                cutoffDate
            });

            return result.count;

        } catch (error) {
            const err = error as Error;
            this.logger.error('Failed to cleanup old events', {
                cutoffDate,
                error: err.message
            });
            throw new Error(`Cleanup failed: ${err.message}`);
        }
    }

    async getExpiredEvents(): Promise<EventEntity[]> {
        try {
            const expiredDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago

            const events = await this.prisma.event.findMany({
                where: {
                    status: 'ACTIVE',
                    scheduledStartTime: {
                        lt: expiredDate
                    }
                }
            });

            return events.map(this.mapPrismaEventToEntity);

        } catch (error) {
            const err = error as Error;
            this.logger.error('Failed to get expired events', {
                error: err.message
            });
            return [];
        }
    }

    // ================================
    // Helper Methods
    // ================================

    private mapPrismaEventToEntity(event: any): EventEntity {
        return {
            id: event.id,
            eventId: event.eventId,
            eventTitle: event.eventTitle,
            eventDescription: event.eventDescription,
            scheduledStartTime: event.scheduledStartTime,
            hostUserId: event.hostUserId,
            hostUserName: event.hostUserName,
            maxParticipants: event.maxParticipants,
            timeoutDuration: event.timeoutDuration,
            status: event.status,
            createdAt: event.createdAt,
            updatedAt: event.updatedAt,
            roomId: event.room?.id || ''
        };
    }

    private mapPrismaBookingToEntity(booking: PrismaEventBooking): BookingEntity {
        return {
            id: booking.id,
            eventId: booking.eventId,
            userId: booking.userId,
            userName: booking.userName,
            userEmail: booking.userEmail,
            bookedAt: booking.bookedAt
        };
    }
}