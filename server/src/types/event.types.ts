// server/src/types/event.types.ts
// Event-centric type definitions

import {EventStatus} from "@prisma/client";

export interface CreateEventRequest {
    eventId: string;
    eventTitle: string;
    eventDescription?: string;
    scheduledStartTime: string; // ISO date string
    hostUserId: string;
    hostUserName: string;
    maxParticipants?: number;
    timeoutDuration?: number;
}

export interface BookParticipantRequest {
    eventId: string;
    userId: string;
    userName: string;
    userEmail: string;
}

export interface CancelBookingRequest {
    eventId: string;
    userId: string;
}

export interface JoinEventRequest {
    eventId: string;
    userId: string;
}

export interface CloseEventRequest {
    eventId: string;
    hostUserId: string;
}

// Response types
export interface EventResult {
    success: boolean;
    event?: {
        eventId: string;
        eventTitle: string;
        eventDescription?: string | null | undefined;
        scheduledStartTime: string;
        hostUserId: string;
        hostUserName: string;
        maxParticipants: number;
        currentBookings: number;
        roomId: string;
        status: EventStatus;
        createdAt: string;
    };
    error?: string;
}

export interface BookingResult {
    success: boolean;
    booking?: {
        id: string;
        eventId: string;
        userId: string;
        userName: string;
        userEmail: string;
        bookedAt: string;
    };
    event?: {
        eventId: string;
        eventTitle: string;
        scheduledStartTime: string;
        currentBookings: number;
        maxParticipants: number;
    };
    error?: string;
}

export interface JoinResult {
    success: boolean;
    roomId?: string;
    joinToken?: string;
    isHost?: boolean;
    event?: {
        eventId: string;
        eventTitle: string;
        scheduledStartTime: string;
        hostUserName: string;
    };
    error?: string;
}

export interface CloseResult {
    success: boolean;
    event?: {
        eventId: string;
        status: EventStatus;
        closedAt: string;
        closedBy: string;
    };
    error?: string;
}

export interface EventDetails {
    eventId: string;
    eventTitle: string;
    eventDescription?: string;
    scheduledStartTime: string;
    hostUserId: string;
    hostUserName: string;
    maxParticipants: number;
    roomId: string;
    status: EventStatus;
    createdAt: string;
    currentBookings: number;
    bookings: EventBooking[];
}

export interface EventBooking {
    id: string;
    userId: string;
    userName: string;
    userEmail: string;
    bookedAt: string;
    isConnected?: boolean; // Only available when event is active
}

export interface EventsResult {
    events: EventSummary[];
    statistics: EventStatistics;
    pagination: {
        total: number;
        limit: number;
        offset: number;
        hasMore: boolean;
    };
}

export interface EventSummary {
    eventId: string;
    eventTitle: string;
    scheduledStartTime: string;
    hostUserName: string;
    maxParticipants: number;
    currentBookings: number;
    status: EventStatus;
    createdAt: string;
}

export interface EventStatistics {
    totalEvents: number;
    scheduledEvents: number;
    activeEvents: number;
    closedEvents: number;
    totalBookings: number;
    averageBookingsPerEvent: number;
    eventsCreatedToday: number;
    activeParticipants: number;
}

// Database entity types (for repository layer)
export interface EventEntity {
    id: string;
    eventId: string;
    eventTitle: string;
    eventDescription?: string | null | undefined;
    scheduledStartTime: Date;
    hostUserId: string;
    hostUserName: string;
    maxParticipants: number;
    timeoutDuration: number;
    roomId: string; // Added missing roomId field
    status: EventStatus;
    createdAt: Date;
    updatedAt: Date;
    bookings?: BookingEntity[];
}

export interface BookingEntity {
    id: string;
    eventId: string;
    userId: string;
    userName: string;
    userEmail: string;
    bookedAt: Date;
    joinedAt?: Date; // Add missing field
    leftAt?: Date; // Add missing field
    event?: EventEntity;
}

// Repository context types
export interface CreateEventContext {
    eventId: string;
    eventTitle: string;
    eventDescription?: string;
    scheduledStartTime: Date;
    hostUserId: string;
    hostUserName: string;
    hostEmail?: string;
    maxParticipants: number;
    timeoutDuration: number;
    status: EventStatus;
}

export interface CreateBookingContext {
    eventId: string;
    userId: string;
    userName: string;
    userEmail: string;
    bookedAt: Date;
}

// Socket integration types
export interface EventJoinContext {
    eventId: string;
    roomId: string;
    userId: string;
    userName: string;
    isHost: boolean;
    joinToken: string;
}

export interface EventParticipantStatus {
    eventId: string;
    userId: string;
    isConnected: boolean;
    joinedAt?: Date;
    leftAt?: Date;
}

// Analytics and monitoring types
export interface EventMetrics {
    eventId: string;
    participantCount: number;
    peakParticipants: number;
    duration: number; // in milliseconds
    messagesExchanged: number;
    connectionIssues: number;
    averageLatency: number;
}

export interface EventAnalytics {
    timeframe: {
        from: string;
        to: string;
    };
    metrics: {
        totalEvents: number;
        completedEvents: number;
        cancelledEvents: number;
        totalParticipants: number;
        averageEventDuration: number;
        averageParticipantsPerEvent: number;
        peakConcurrentEvents: number;
        bookingConversionRate: number; // bookings to actual joins
    };
    trends: {
        eventsOverTime: Array<{
            date: string;
            count: number;
        }>;
        participantsOverTime: Array<{
            date: string;
            count: number;
        }>;
    };
}

// Error types
export interface EventError {
    code: string;
    message: string;
    eventId?: string;
    userId?: string;
    details?: Record<string, any>;
}

// Platform integration types
export interface PlatformEventData {
    platformEventId: string;
    title: string;
    description?: string;
    startTime: string;
    endTime: string;
    organizerUserId: string;
    organizerName: string;
    attendeeEmails: string[];
    maxAttendees?: number;
    isPrivate?: boolean;
    tags?: string[];
}

export interface EventIntegrationResult {
    success: boolean;
    eventId?: string;
    roomId?: string;
    joinUrl?: string;
    error?: string;
}