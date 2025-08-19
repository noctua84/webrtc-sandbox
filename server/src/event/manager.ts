import crypto from 'crypto';
import {IEventRepository} from '../db/repository/event.repository';
import {IRoomManager} from '../room/manager';
import {Logger} from '../types/log.types';
import {
    BookingResult,
    BookParticipantRequest,
    CancelBookingRequest,
    CloseEventRequest,
    CloseResult,
    CreateEventRequest, EventAccessResult,
    EventDetails,
    EventResult,
    EventsResult, EventSummary,
    JoinEventRequest,
    JoinResult
} from '../types/event.types';
import {EventStatus} from "@prisma/client";

export interface IEventManager {
    createEvent(request: CreateEventRequest): Promise<EventResult>;
    bookParticipant(request: BookParticipantRequest): Promise<BookingResult>;
    cancelBooking(request: CancelBookingRequest): Promise<{ success: boolean; error?: string }>;
    validateAndJoinEvent(request: JoinEventRequest): Promise<JoinResult>;
    closeEvent(request: CloseEventRequest): Promise<CloseResult>;
    getEventDetails(eventId: string): Promise<EventDetails | null>;
    getEvents(filters: EventFilters): Promise<EventsResult>;
    isUserAuthorizedForEvent(eventId: string, userId: string): Promise<boolean>;
    startEvent(eventId: string, userId: string): Promise<EventResult>;
    checkAuthorizationForEvent(eventId: string, userId: string): Promise<EventAccessResult>;
}

export interface EventFilters {
    status?: string;
    hostUserId?: string;
    dateFrom?: Date;
    dateTo?: Date;
    limit?: number;
    offset?: number;
}

export class EventManager implements IEventManager {
    private repository: IEventRepository;
    private roomManager: IRoomManager;
    private logger: Logger;
    private config: any;

    constructor(
        repository: IEventRepository,
        roomManager: IRoomManager,
        logger: Logger,
        config: any
    ) {
        this.repository = repository;
        this.roomManager = roomManager;
        this.logger = logger;
        this.config = config;
    }

    async bookParticipant(request: BookParticipantRequest): Promise<BookingResult> {
        try {
            this.logger.info('Booking participant for event', {
                eventId: request.eventId,
                userId: request.userId
            });

            // Check if event exists
            const event = await this.repository.getEventById(request.eventId);
            if (!event) {
                return {
                    success: false,
                    error: 'Event not found'
                };
            }

            // Check if event is in correct status
            if (event.status !== 'SCHEDULED') {
                return {
                    success: false,
                    error: 'Event is not available for booking'
                };
            }

            // Check if user already has a booking
            const existingBooking = await this.repository.getBooking(request.eventId, request.userId);
            if (existingBooking) {
                return {
                    success: false,
                    error: 'User already has a booking for this event'
                };
            }

            // Check capacity
            const currentBookings = await this.repository.getBookingCount(request.eventId);
            if (currentBookings >= event.maxParticipants) {
                return {
                    success: false,
                    error: 'Event is full'
                };
            }

            // Create booking
            const booking = await this.repository.createBooking({
                eventId: request.eventId,
                userId: request.userId,
                userName: request.userName,
                userEmail: request.userEmail,
                bookedAt: new Date()
            });

            this.logger.info('Participant booked successfully', {
                eventId: request.eventId,
                userId: request.userId,
                bookingId: booking.id
            });

            return {
                success: true,
                booking: {
                    id: booking.id,
                    eventId: booking.eventId,
                    userId: booking.userId,
                    userName: booking.userName,
                    userEmail: booking.userEmail,
                    bookedAt: booking.bookedAt.toISOString()
                },
                event: {
                    eventId: event.eventId,
                    eventTitle: event.eventTitle,
                    scheduledStartTime: event.scheduledStartTime.toISOString(),
                    currentBookings: currentBookings + 1,
                    maxParticipants: event.maxParticipants
                }
            };

        } catch (error) {
            const err = error as Error;
            this.logger.error('Failed to book participant', {
                eventId: request.eventId,
                userId: request.userId,
                error: err.message
            });
            return {
                success: false,
                error: 'Internal error creating booking'
            };
        }
    }

    async cancelBooking(request: CancelBookingRequest): Promise<{ success: boolean; error?: string }> {
        try {
            this.logger.info('Cancelling booking', {
                eventId: request.eventId,
                userId: request.userId
            });

            // Check if booking exists
            const booking = await this.repository.getBooking(request.eventId, request.userId);
            if (!booking) {
                return {
                    success: false,
                    error: 'Booking not found'
                };
            }

            // Remove booking
            const success = await this.repository.removeBooking(request.eventId, request.userId);
            if (!success) {
                return {
                    success: false,
                    error: 'Failed to cancel booking'
                };
            }

            this.logger.info('Booking cancelled successfully', {
                eventId: request.eventId,
                userId: request.userId
            });

            return { success: true };

        } catch (error) {
            const err = error as Error;
            this.logger.error('Failed to cancel booking', {
                eventId: request.eventId,
                userId: request.userId,
                error: err.message
            });
            return {
                success: false,
                error: 'Internal error cancelling booking'
            };
        }
    }

    async validateAndJoinEvent(request: JoinEventRequest): Promise<JoinResult> {
        try {
            this.logger.info('Validating and joining event', {
                eventId: request.eventId,
                userId: request.userId
            });

            // Check if user is authorized for this event
            const isAuthorized = await this.isUserAuthorizedForEvent(request.eventId, request.userId);
            if (!isAuthorized) {
                return {
                    success: false,
                    error: 'User not authorized for this event'
                };
            }

            // Get event details
            const event = await this.repository.getEventById(request.eventId);
            if (!event) {
                return {
                    success: false,
                    error: 'Event not found'
                };
            }

            // Check if event is active
            if (event.status !== 'ACTIVE') {
                return {
                    success: false,
                    error: 'Event is not currently active'
                };
            }

            // Generate join token
            const joinToken = this.roomManager.generateJoinToken(request.eventId, request.userId);

            // Update booking join time
            await this.repository.updateBookingJoinTime(request.eventId, request.userId, new Date());

            return {
                success: true,
                roomId: event.roomId,
                joinToken,
                isHost: event.hostUserId === request.userId,
                event: {
                    eventId: event.eventId,
                    eventTitle: event.eventTitle,
                    scheduledStartTime: event.scheduledStartTime.toISOString(),
                    hostUserName: event.hostUserName
                }
            };

        } catch (error) {
            const err = error as Error;
            this.logger.error('Failed to validate and join event', {
                eventId: request.eventId,
                userId: request.userId,
                error: err.message
            });
            return {
                success: false,
                error: 'Internal error joining event'
            };
        }
    }

    async closeEvent(request: CloseEventRequest): Promise<CloseResult> {
        try {
            this.logger.info('Closing event', {
                eventId: request.eventId,
                hostUserId: request.hostUserId
            });

            // Get event and verify host
            const event = await this.repository.getEventById(request.eventId);
            if (!event) {
                return {
                    success: false,
                    error: 'Event not found'
                };
            }

            if (event.hostUserId !== request.hostUserId) {
                return {
                    success: false,
                    error: 'Only the host can close the event'
                };
            }

            if (event.status === 'CLOSED') {
                return {
                    success: false,
                    error: 'Event is already closed'
                };
            }

            // Update event status
            const success = await this.repository.updateEventStatus(request.eventId, 'CLOSED');
            if (!success) {
                return {
                    success: false,
                    error: 'Failed to close event'
                };
            }

            // Disconnect all participants from the room
            if (event.roomId) {
                await this.roomManager.disconnectAllParticipants(event.roomId);
            }

            this.logger.info('Event closed successfully', {
                eventId: request.eventId,
                closedBy: request.hostUserId
            });

            return {
                success: true,
                event: {
                    eventId: request.eventId,
                    status: 'CLOSED',
                    closedAt: new Date().toISOString(),
                    closedBy: request.hostUserId
                }
            };

        } catch (error) {
            const err = error as Error;
            this.logger.error('Failed to close event', {
                eventId: request.eventId,
                hostUserId: request.hostUserId,
                error: err.message
            });
            return {
                success: false,
                error: 'Internal error closing event'
            };
        }
    }

    async getEventDetails(eventId: string): Promise<EventDetails | null> {
        this.logger.info('Fetching event details', { eventId });

        const eventWithBookings = await this.repository.getEventWithBookings(eventId);

        if (!eventWithBookings) {
            this.logger.error('Event not found', { eventId });
            return null;
        }

        this.logger.info('Event details fetched successfully', { eventId });

        return {
            eventId: eventWithBookings.eventId,
            eventTitle: eventWithBookings.eventTitle,
            eventDescription: eventWithBookings.eventDescription || '',
            scheduledStartTime: eventWithBookings.scheduledStartTime.toISOString(),
            hostUserId: eventWithBookings.hostUserId,
            hostUserName: eventWithBookings.hostUserName,
            maxParticipants: eventWithBookings.maxParticipants,
            currentBookings: eventWithBookings.bookings?.length || 0,
            roomId: eventWithBookings.roomId,
            status: eventWithBookings.status,
            createdAt: eventWithBookings.createdAt.toISOString(),
            bookings: eventWithBookings.bookings?.map(booking => ({
                id: booking.id,
                userId: booking.userId,
                userName: booking.userName,
                userEmail: booking.userEmail,
                bookedAt: booking.bookedAt.toISOString()
            })) || []
        };

    }

    async getEvents(filters: EventFilters): Promise<EventsResult> {
        try {
            this.logger.info('Fetching events with filters', {
                filters
            });

            // Fetch events from repository with provided filters
            const events = await this.repository.getEventsWithFilters(filters);

            if (!events || events.length === 0) {
                this.logger.info('No events found with provided filters', {
                    filters
                });

                return {
                    pagination: {hasMore: false, limit: 0, offset: 0, total: 0},
                    statistics: {
                        totalEvents: 0,
                        totalBookings: 0,
                        scheduledEvents: 0,
                        activeEvents: 0,
                        closedEvents: 0,
                        averageBookingsPerEvent: 0,
                        eventsCreatedToday: 0,
                        activeParticipants: 0
                    },
                    events: []
                }
            }
            this.logger.info('Events fetched successfully', {
                count: events.length
            });

            // Map events to EventResult format
            const mappedEvents: EventSummary[] = events.map(event => ({
                eventId: event.eventId,
                eventTitle: event.eventTitle,
                scheduledStartTime: event.scheduledStartTime.toISOString(),
                hostUserName: event.hostUserName,
                maxParticipants: event.maxParticipants,
                currentBookings: event.bookings?.length || 0,
                status: event.status,
                createdAt: event.createdAt.toISOString()
            }));

            return {
                events: mappedEvents,
                pagination: {
                    total: events.length,
                    limit: filters.limit || 10,
                    offset: filters.offset || 0,
                    hasMore: events.length > (filters.limit || 10) + (filters.offset || 0)
                },
                statistics: {
                    totalEvents: events.length,
                    totalBookings: events.reduce((sum, e) => sum + (e.bookings?.length || 0), 0),
                    scheduledEvents: events.filter(e => e.status === EventStatus.SCHEDULED).length,
                    activeEvents: events.filter(e => e.status === EventStatus.ACTIVE).length,
                    closedEvents: events.filter(e => e.status === EventStatus.CLOSED).length,
                    averageBookingsPerEvent: events.reduce((sum, e) => sum + (e.bookings?.length || 0), 0) / Math.max(events.length, 1),
                    eventsCreatedToday: events.filter(e => new Date(e.createdAt).toDateString() === new Date().toDateString()).length,
                    activeParticipants: events.reduce((sum, e) => sum + (e.bookings?.length || 0), 0)
                }
            }
        } catch (error) {
            const err = error as Error;
            this.logger.error('Failed to get events', {
                error: err.message
            });
            throw error;
        }
    }

    /**
     * Creates a new event with dedicated room
     * Platform creates event with available seats
     */
    async createEvent(request: CreateEventRequest): Promise<EventResult> {
        try {
            this.logger.info('Creating event', {
                eventId: request.eventId,
                hostUserId: request.hostUserId,
                maxParticipants: request.maxParticipants
            });

            // Check if event already exists
            const existingEvent = await this.repository.getEventById(request.eventId);
            if (existingEvent) {
                return {
                    success: false,
                    error: 'Event ID already exists'
                };
            }

            // Create the event with its dedicated room
            const event = await this.repository.createEvent({
                eventId: request.eventId,
                eventTitle: request.eventTitle,
                eventDescription: request.eventDescription,
                scheduledStartTime: new Date(request.scheduledStartTime),
                hostUserId: request.hostUserId,
                hostUserName: request.hostUserName,
                maxParticipants: request.maxParticipants || 10,
                timeoutDuration: request.timeoutDuration || this.config.room.timeoutDuration,
                status: 'SCHEDULED'
            });

            this.logger.info('Event created successfully', {
                eventId: event.eventId,
                roomId: event.roomId,
                scheduledStartTime: event.scheduledStartTime
            });

            return {
                success: true,
                event: {
                    eventId: event.eventId,
                    eventTitle: event.eventTitle,
                    eventDescription: event.eventDescription,
                    scheduledStartTime: event.scheduledStartTime.toISOString(),
                    hostUserId: event.hostUserId,
                    hostUserName: event.hostUserName,
                    maxParticipants: event.maxParticipants,
                    currentBookings: 0,
                    roomId: event.roomId,
                    status: event.status,
                    createdAt: event.createdAt.toISOString()
                }
            };
        } catch (error) {
            const err = error as Error;
            this.logger.error('Failed to create event', {
                eventId: request.eventId,
                error: err.message
            });
            return {
                success: false,
                error: 'Internal error creating event'
            };
        }
    }

    /**
     * Checks if user is authorized for an event (booked or host)
     */
    async isUserAuthorizedForEvent(eventId: string, userId: string): Promise<boolean> {
        try {
            const event = await this.repository.getEventById(eventId);
            if (!event) {
                return false;
            }

            // Check if user is the host
            if (event.hostUserId === userId) {
                return true;
            }

            // Check if user has a booking
            const booking = await this.repository.getBooking(eventId, userId);
            return !!booking;

        } catch (error) {
            const err = error as Error;
            this.logger.error('Failed to check user authorization', {
                eventId,
                userId,
                error: err.message
            });
            return false;
        }
    }

    async startEvent(eventId: string, userId: string): Promise<EventResult> {
        try {
            this.logger.info('Starting event', { eventId });

            // Get event details
            const event = await this.repository.getEventById(eventId);
            if (!event) {
                return {
                    success: false,
                    error: 'Event not found'
                };
            }

            // Check if user is the host
            if (event.hostUserId !== userId) {
                return {
                    success: false,
                    error: 'Only the host can start the event'
                };
            }

            // Check if event is closed
            /**
            if (event.status === 'CLOSED') {
                return {
                    success: false,
                    error: 'Event is closed and cannot be started'
                };
            }
            */

            // Check if event is already active
            if (event.status === 'ACTIVE') {
                return {
                    success: false,
                    error: 'Event is already active'
                };
            }



            // Update event status to ACTIVE
            const updatedEvent = await this.repository.updateEventStatus(eventId, 'ACTIVE');
            if (!updatedEvent) {
                return {
                    success: false,
                    error: 'Failed to start event'
                };
            }

            this.logger.info('Event started successfully', { eventId });

            return {
                success: true,
            };
        } catch (error) {
            const err = error as Error;
            this.logger.error('Failed to start event', { eventId, error: err.message });
            return {
                success: false,
                error: 'Internal error starting event'
            };
        }
    }

    async checkAuthorizationForEvent(eventId: string, userId: string): Promise<EventAccessResult> {
        try {
            this.logger.info('Checking authorization for event', { eventId, userId });

            // Get event details
            const event = await this.repository.getEventById(eventId);
            if (!event) {
                return {
                    success: false,
                    error: 'Event not found'
                };
            }

            // Check if user is the host
            if (event.hostUserId === userId) {
                return {
                    success: true,
                    access: {
                        canView: true,
                        canJoin: true,
                        canStart: true,
                        canBook: false, // Hosts cannot book themselves
                        userRole: 'host',
                        isBooked: false,
                        event: {
                            eventId: event.eventId,
                            status: event.status,
                            currentBookings: event.bookings?.length || 0,
                            maxParticipants: event.maxParticipants
                        }
                    }
                };
            }

            // Check if user has a booking
            const booking = await this.repository.getBooking(eventId, userId);
            if (booking) {
                return {
                    success: true,
                    access: {
                        canView: true,
                        canJoin: true,
                        canStart: false, // Only hosts can start
                        canBook: false, // Already booked
                        userRole: 'participant',
                        isBooked: true,
                        booking: {
                            id: booking.id,
                            userName: booking.userName,
                            userEmail: booking.userEmail,
                            bookedAt: booking.bookedAt.toISOString()
                        },
                        event: {
                            eventId: event.eventId,
                            status: event.status,
                            currentBookings: event.bookings?.length || 0,
                            maxParticipants: event.maxParticipants
                        }
                    }
                };
            }

            // User is a guest
            return {
                success: true,
                access: {
                    canView: true,
                    canJoin: false, // Guests cannot join without booking
                    canStart: false, // Only hosts can start
                    canBook: true, // Guests can book if not full/already booked
                    userRole: 'guest',
                    isBooked: false,
                    event: {
                        eventId: event.eventId,
                        status: event.status,
                        currentBookings: event.bookings?.length || 0,
                        maxParticipants: event.maxParticipants
                    }
                }
            };
        } catch (error) {
            const err = error as Error;
            this.logger.error('Failed to check authorization for event', {
                eventId,
                userId,
                error: err.message
            });

            return {
                success: false,
                error: 'Internal error checking authorization'
            };
        }
    }
}