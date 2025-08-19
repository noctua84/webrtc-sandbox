// components/EventOverview.tsx
import React, {useEffect, useState} from 'react';
import {observer} from 'mobx-react-lite';
import {useNavigate, useParams} from 'react-router-dom';
import {AlertCircle, ArrowLeft, Calendar, CheckCircle, Clock, Play, User, UserPlus, Users} from 'lucide-react';
import {sessionStore} from '../stores/SessionStore';
import {Button} from './ui/Button';
import {Card} from './ui/Card';
import {Alert} from './ui/Alert';
import {Badge} from './ui/Badge';
import {BookingModal} from './BookingModal';
import {formatDateTime, formatParticipantCount, formatTimeFromNow, getEventStatusColor} from '@/utils';
import {type EventBooking, type EventEntity, EventStatus} from '@/types';

export const EventOverview: React.FC = observer(() => {
    const { eventId } = useParams<{ eventId: string }>();
    const navigate = useNavigate();

    const [event, setEvent] = useState<EventEntity | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showBookingModal, setShowBookingModal] = useState(false);
    const [isStartingEvent, setIsStartingEvent] = useState(false);

    const isUserHost = event ? sessionStore.isHost(event.eventId) : false;
    const hasUserBooking = event ? sessionStore.hasBooking(event.eventId) : false;
    const userBooking = event ? sessionStore.getBooking(event.eventId) : null;

    const loadEvent = async () => {
        if (!eventId) return;

        setIsLoading(true);
        setError(null);

        try {
            const response = await fetch(`http://localhost:3001/api/events/${eventId}`);

            if (!response.ok) {
                if (response.status === 404) {
                    throw new Error('Event not found');
                }
                throw new Error(`Failed to load event: ${response.status}`);
            }

            const data = await response.json();

            if (data.success && data.event) {
                setEvent(data.event);
            } else {
                throw new Error(data.error || 'Failed to load event details');
            }
        } catch (error) {
            setError((error as Error).message);
            console.error('Failed to load event:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleBookingSuccess = (booking: EventBooking) => {
        if (event) {
            // Update session store
            sessionStore.addBooking(event.eventId, booking);

            // Update local event state to reflect new booking count
            setEvent(prev => prev ? {
                ...prev,
                currentBookings: prev.currentBookings + 1
            } : null);
        }
        setShowBookingModal(false);
    };

    const handleStartEvent = async () => {
        if (!event || !isUserHost) return;

        setIsStartingEvent(true);

        try {
            // TODO: This should be moved to the state store.
            const response = await fetch(`http://localhost:3001/api/events/${event.eventId}/start`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    userId: sessionStore.userInfo.userId,
                    eventId: event.eventId,
                }),
            });

            const data = await response.json();

            if (data.success) {
                // Update event status locally
                setEvent(prev => prev ? { ...prev, status: EventStatus.ACTIVE } : null);

                // Navigate to video room
                navigate(`/event/${event.eventId}/room`);
            } else {
                setError(data.error || 'Failed to start event');
            }
        } catch (error) {
            setError((error as Error).message);
            console.error('Failed to start event:', error);
        } finally {
            setIsStartingEvent(false);
        }
    };

    const handleJoinRoom = () => {
        if (event) {
            navigate(`/event/${event.eventId}/room`);
        }
    };

    const canJoinRoom = () => {
        if (!event) return false;
        if (isUserHost) return true;
        if (!hasUserBooking) return false;
        return event.status === 'ACTIVE';
    };

    const isEventStarted = () => {
        if (!event) return false;
        const startTime = new Date(event.scheduledStartTime);
        const now = new Date();
        return now >= startTime;
    };

    const isEventFull = () => {
        if (!event) return false;
        return event.currentBookings >= event.maxParticipants;
    };

    useEffect(() => {
        loadEvent();
    }, [eventId]);

    if (isLoading) {
        return (
            <div className="max-w-4xl mx-auto">
                <div className="flex items-center justify-center py-12">
                    <div className="text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto mb-4"></div>
                        <p className="text-gray-600">Loading event details...</p>
                    </div>
                </div>
            </div>
        );
    }

    if (error || !event) {
        return (
            <div className="max-w-4xl mx-auto">
                <div className="mb-6">
                    <Button
                        onClick={() => navigate('/')}
                        variant="secondary"
                        size="sm"
                    >
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Back to Events
                    </Button>
                </div>

                <Alert variant="error">
                    {error || 'Event not found'}
                </Alert>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            {/* Navigation */}
            <div className="flex items-center justify-between">
                <Button
                    onClick={() => navigate('/')}
                    variant="secondary"
                    size="sm"
                >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to Events
                </Button>

                <Badge className={getEventStatusColor(event.status)}>
                    {event.status}
                </Badge>
            </div>

            {/* Main Event Information */}
            <Card title={event.eventTitle}>
                <div className="space-y-6">
                    {/* Event Description */}
                    {event.eventDescription && (
                        <div>
                            <h4 className="font-medium text-gray-900 mb-2">Description</h4>
                            <p className="text-gray-600">{event.eventDescription}</p>
                        </div>
                    )}

                    {/* Event Details Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-4">
                            <div className="flex items-center text-gray-600">
                                <Calendar className="w-5 h-5 mr-3" />
                                <div>
                                    <div className="font-medium text-gray-900">Scheduled Start</div>
                                    <div>{formatDateTime(event.scheduledStartTime)}</div>
                                    <div className="text-sm text-blue-600">{formatTimeFromNow(event.scheduledStartTime)}</div>
                                </div>
                            </div>

                            <div className="flex items-center text-gray-600">
                                <Users className="w-5 h-5 mr-3" />
                                <div>
                                    <div className="font-medium text-gray-900">Participants</div>
                                    <div>{formatParticipantCount(event.currentBookings, event.maxParticipants)}</div>
                                    {isEventFull() && (
                                        <div className="text-sm text-red-600">Event is fully booked</div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="flex items-center text-gray-600">
                                <User className="w-5 h-5 mr-3" />
                                <div>
                                    <div className="font-medium text-gray-900">Host</div>
                                    <div>{event.hostUserName}</div>
                                    {isUserHost && (
                                        <div className="text-sm text-green-600">You are the host</div>
                                    )}
                                </div>
                            </div>

                            <div className="flex items-center text-gray-600">
                                <Clock className="w-5 h-5 mr-3" />
                                <div>
                                    <div className="font-medium text-gray-900">Event ID</div>
                                    <div className="font-mono text-sm">{event.eventId}</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* User Status */}
                    {(isUserHost || hasUserBooking) && (
                        <div className="bg-blue-50 rounded-lg p-4">
                            <div className="flex items-center">
                                <CheckCircle className="w-5 h-5 text-blue-600 mr-3" />
                                <div>
                                    <div className="font-medium text-blue-900">
                                        {isUserHost ? 'You are hosting this event' : 'You have booked this event'}
                                    </div>
                                    {hasUserBooking && userBooking && (
                                        <div className="text-sm text-blue-700">
                                            Booked as {userBooking.userName} ({userBooking.userEmail})
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="pt-6 border-t">
                        <div className="flex flex-col sm:flex-row gap-3">
                            {isUserHost ? (
                                // Host Actions
                                <>
                                    {event.status === 'SCHEDULED' && (
                                        <Button
                                            onClick={handleStartEvent}
                                            loading={isStartingEvent}
                                            className="flex-1 sm:flex-none"
                                        >
                                            <Play className="w-4 h-4 mr-2" />
                                            Start Event
                                        </Button>
                                    )}

                                    {event.status === 'ACTIVE' && (
                                        <Button
                                            onClick={handleJoinRoom}
                                            className="flex-1 sm:flex-none"
                                        >
                                            <Users className="w-4 h-4 mr-2" />
                                            Join Room
                                        </Button>
                                    )}
                                </>
                            ) : (
                                // Participant Actions
                                <>
                                    {!hasUserBooking && !isEventFull() && (
                                        <Button
                                            onClick={() => setShowBookingModal(true)}
                                            className="flex-1 sm:flex-none"
                                        >
                                            <UserPlus className="w-4 h-4 mr-2" />
                                            Book Event
                                        </Button>
                                    )}

                                    {hasUserBooking && (
                                        <Button
                                            onClick={handleJoinRoom}
                                            className="flex-1 sm:flex-none"
                                        >
                                            <Users className="w-4 h-4 mr-2" />
                                            {event.status === 'ACTIVE' ? 'Join Room' : 'Waiting for Host'}
                                        </Button>
                                    )}

                                    {!hasUserBooking && isEventFull() && (
                                        <Button className="flex-1 sm:flex-none">
                                            <AlertCircle className="w-4 h-4 mr-2" />
                                            Event Full
                                        </Button>
                                    )}
                                </>
                            )}
                        </div>

                        {/* Help Text */}
                        <div className="mt-4 text-sm text-gray-600">
                            {isUserHost && event.status === 'SCHEDULED' && (
                                <p>Click "Start Event" to begin the video conference and allow participants to join.</p>
                            )}
                            {!isUserHost && !hasUserBooking && !isEventFull() && (
                                <p>Book this event to receive access to the video room when it starts.</p>
                            )}
                            {!isUserHost && hasUserBooking && event.status === 'SCHEDULED' && (
                                <p>You're booked! The join button will be enabled when the host starts the event.</p>
                            )}
                            {!isUserHost && hasUserBooking && event.status === 'ACTIVE' && (
                                <p>The event is live! Click "Join Room" to enter the video conference.</p>
                            )}
                        </div>
                    </div>
                </div>
            </Card>

            {/* Error Display */}
            {error && (
                <Alert variant="error">
                    {error}
                </Alert>
            )}

            {/* Booking Modal */}
            {showBookingModal && (
                <BookingModal
                    event={event}
                    onSuccess={handleBookingSuccess}
                    onClose={() => setShowBookingModal(false)}
                />
            )}
        </div>
    );
});