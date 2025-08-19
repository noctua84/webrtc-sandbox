// components/EventList.tsx
import React, { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { Link } from 'react-router-dom';
import { Calendar, Clock, Users, User, Plus, RefreshCw } from 'lucide-react';
import { sessionStore } from '../stores/SessionStore';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { Alert } from './ui/Alert';
import { Badge } from './ui/Badge';
import { formatDateTime, formatTimeFromNow, formatParticipantCount, getEventStatusColor } from '@/utils';
import type { EventEntity } from '@/types';

export const EventList: React.FC = observer(() => {
    const [events, setEvents] = useState<EventEntity[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const loadEvents = async () => {
        setIsLoading(true);
        setError(null);

        try {
            const response = await fetch('http://localhost:3001/api/events');

            if (!response.ok) {
                throw new Error(`Failed to load events: ${response.status}`);
            }

            const data = await response.json();

            if (data.success && data.events) {
                setEvents(data.events);
            } else {
                throw new Error(data.error || 'Failed to load events');
            }
        } catch (error) {
            setError((error as Error).message);
            console.error('Failed to load events:', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadEvents();
    }, []);

    if (isLoading) {
        return (
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <h1 className="text-2xl font-bold text-gray-900">Events</h1>
                </div>

                <div className="flex items-center justify-center py-12">
                    <div className="text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto mb-4"></div>
                        <p className="text-gray-600">Loading events...</p>
                    </div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <h1 className="text-2xl font-bold text-gray-900">Events</h1>
                    <Link to="/create">
                        <Button>
                            <Plus className="w-4 h-4 mr-2" />
                            Create Event
                        </Button>
                    </Link>
                </div>

                <Alert variant="error">
                    <div className="flex items-center justify-between">
                        <span>{error}</span>
                        <Button onClick={loadEvents} variant="secondary" size="sm">
                            <RefreshCw className="w-4 h-4 mr-1" />
                            Retry
                        </Button>
                    </div>
                </Alert>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Events</h1>
                    <p className="text-gray-600 mt-1">
                        {events.length === 0 ? 'No events found' : `${events.length} event${events.length === 1 ? '' : 's'} available`}
                    </p>
                </div>

                <div className="flex items-center space-x-3">
                    <Button onClick={loadEvents} variant="secondary" size="sm">
                        <RefreshCw className="w-4 h-4 mr-1" />
                        Refresh
                    </Button>
                    <Link to="/create">
                        <Button>
                            <Plus className="w-4 h-4 mr-2" />
                            Create Event
                        </Button>
                    </Link>
                </div>
            </div>

            {/* Events Grid */}
            {events.length === 0 ? (
                <Card className="text-center py-12">
                    <div className="max-w-md mx-auto">
                        <Calendar className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-gray-900 mb-2">No Events Yet</h3>
                        <p className="text-gray-600 mb-6">
                            Get started by creating your first event. Participants can then book and join your video conference.
                        </p>
                        <Link to="/create">
                            <Button>
                                <Plus className="w-4 h-4 mr-2" />
                                Create Your First Event
                            </Button>
                        </Link>
                    </div>
                </Card>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {events.map(event => (
                        <EventCard key={event.eventId} event={event} />
                    ))}
                </div>
            )}
        </div>
    );
});

// Individual Event Card Component
const EventCard: React.FC<{ event: EventEntity }> = observer(({ event }) => {
    const isUserHost = sessionStore.isHost(event.eventId);
    const hasUserBooking = sessionStore.hasBooking(event.eventId);
    const userBooking = sessionStore.getBooking(event.eventId);

    const isEventSoon = () => {
        const startTime = new Date(event.scheduledStartTime);
        const now = new Date();
        const diffMs = startTime.getTime() - now.getTime();
        const diffMins = diffMs / (1000 * 60);
        return diffMins <= 30 && diffMins > 0;
    };

    const isEventStarted = () => {
        const startTime = new Date(event.scheduledStartTime);
        const now = new Date();
        return now >= startTime;
    };

    return (
        <Link to={`/event/${event.eventId}`}>
            <Card className="h-full hover:shadow-lg transition-shadow cursor-pointer border border-gray-200 hover:border-primary-300">
                <div className="flex flex-col h-full">
                    {/* Header */}
                    <div className="flex items-start justify-between mb-3">
                        <h3 className="text-lg font-semibold text-gray-900 line-clamp-2 flex-1">
                            {event.eventTitle}
                        </h3>
                        <div className="flex flex-col items-end space-y-1 ml-3">
                            <Badge className={getEventStatusColor(event.status)}>
                                {event.status}
                            </Badge>
                            {isUserHost && (
                                <Badge variant="success" className="text-xs">
                                    Host
                                </Badge>
                            )}
                            {hasUserBooking && !isUserHost && (
                                <Badge variant="default" className="text-xs">
                                    Booked
                                </Badge>
                            )}
                        </div>
                    </div>

                    {/* Description */}
                    {event.eventDescription && (
                        <p className="text-gray-600 text-sm mb-4 line-clamp-3 flex-1">
                            {event.eventDescription}
                        </p>
                    )}

                    {/* Event Details */}
                    <div className="space-y-3 mt-auto">
                        <div className="flex items-center text-sm text-gray-600">
                            <Calendar className="w-4 h-4 mr-2 flex-shrink-0" />
                            <div className="flex-1">
                                <div>{formatDateTime(event.scheduledStartTime)}</div>
                                <div className={`text-xs ${isEventSoon() ? 'text-orange-600 font-medium' : ''}`}>
                                    {formatTimeFromNow(event.scheduledStartTime)}
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center justify-between text-sm">
                            <div className="flex items-center text-gray-600">
                                <Users className="w-4 h-4 mr-2" />
                                <span>{formatParticipantCount(event.currentBookings, event.maxParticipants)}</span>
                            </div>

                            <div className="flex items-center text-gray-600">
                                <User className="w-4 h-4 mr-2" />
                                <span className="truncate max-w-24">{event.hostUserName}</span>
                            </div>
                        </div>

                        {/* Quick Status Indicators */}
                        <div className="pt-2 border-t">
                            {isEventStarted() && event.status === 'ACTIVE' && (
                                <div className="flex items-center text-xs text-green-600">
                                    <div className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></div>
                                    Event is live
                                </div>
                            )}
                            {isEventSoon() && event.status === 'SCHEDULED' && (
                                <div className="flex items-center text-xs text-orange-600">
                                    <Clock className="w-3 h-3 mr-1" />
                                    Starting soon
                                </div>
                            )}
                            {event.currentBookings >= event.maxParticipants && (
                                <div className="flex items-center text-xs text-red-600">
                                    <Users className="w-3 h-3 mr-1" />
                                    Fully booked
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </Card>
        </Link>
    );
});