// components/EventBooking.tsx
import React, { useState, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { Calendar, Users, User, CheckCircle } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { eventStore } from '../stores/EventStore';
import { socketStore } from '../stores/SocketStore';
import { Card } from './ui/Card';
import { Alert } from './ui/Alert';
import { Input } from './ui/Input';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import { validateEmail, formatDateTime, formatTimeFromNow, formatParticipantCount, getEventStatusColor } from '../utils';

export const EventBooking: React.FC = observer(() => {
    const { eventId } = useParams<{ eventId: string }>();
    const [formData, setFormData] = useState({
        userId: '',
        userName: '',
        userEmail: ''
    });
    const [errors, setErrors] = useState<Record<string, string>>({});

    const {
        currentEvent,
        currentBooking,
        userRole,
        isBookingEvent,
        isLoadingEvent,
        error: eventError
    } = eventStore;

    useEffect(() => {
        if (eventId && !currentEvent) {
            eventStore.loadEvent(eventId);
        }
    }, [eventId, currentEvent]);

    const validateForm = (): boolean => {
        const newErrors: Record<string, string> = {};

        if (!formData.userId.trim()) {
            newErrors.userId = 'User ID is required';
        }

        if (!formData.userName.trim()) {
            newErrors.userName = 'Name is required';
        }

        if (!formData.userEmail.trim()) {
            newErrors.userEmail = 'Email is required';
        } else if (!validateEmail(formData.userEmail)) {
            newErrors.userEmail = 'Please enter a valid email address';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleBooking = async () => {
        if (!validateForm() || !eventId) {
            return;
        }

        // Set user info first
        eventStore.setUserInfo(
            formData.userId.trim(),
            formData.userName.trim(),
            formData.userEmail.trim()
        );

        const success = await eventStore.bookEvent(eventId);

        if (success) {
            // Connect to socket for room functionality
            if (!socketStore.isConnected) {
                try {
                    await socketStore.connect();
                } catch (error) {
                    socketStore.log('error', 'Failed to connect to server after booking');
                }
            }
        }
    };

    if (isLoadingEvent) {
        return (
            <Card className="max-w-2xl mx-auto">
                <div className="flex items-center justify-center py-12">
                    <div className="text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto mb-4"></div>
                        <p className="text-gray-600">Loading event details...</p>
                    </div>
                </div>
            </Card>
        );
    }

    if (eventError) {
        return (
            <Card className="max-w-2xl mx-auto">
                <Alert variant="error">
                    {eventError}
                </Alert>
            </Card>
        );
    }

    if (!currentEvent) {
        return (
            <Card className="max-w-2xl mx-auto">
                <Alert variant="error">
                    Event not found or failed to load.
                </Alert>
            </Card>
        );
    }

    // Show booking confirmation if already booked
    if (currentBooking && userRole === 'participant') {
        return (
            <Card title="Booking Confirmed!" className="max-w-2xl mx-auto">
                <div className="space-y-6">
                    <Alert variant="success">
                        <div className="flex items-center">
                            <CheckCircle className="w-5 h-5 mr-2" />
                            You have successfully booked this event!
                        </div>
                    </Alert>

                    <div className="bg-gray-50 rounded-lg p-4">
                        <h4 className="font-medium text-gray-900 mb-3">Booking Details</h4>
                        <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                                <span className="text-gray-600">Booking ID:</span>
                                <span className="font-mono">{currentBooking.id}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-600">Booked At:</span>
                                <span>{formatDateTime(currentBooking.bookedAt)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-600">Name:</span>
                                <span>{currentBooking.userName}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-600">Email:</span>
                                <span>{currentBooking.userEmail}</span>
                            </div>
                        </div>
                    </div>

                    <div className="bg-blue-50 rounded-lg p-4">
                        <h4 className="font-medium text-blue-900 mb-3">Event Information</h4>
                        <div className="space-y-2 text-sm text-blue-800">
                            <div className="flex items-center">
                                <Calendar className="w-4 h-4 mr-2" />
                                <span>{formatDateTime(currentEvent.scheduledStartTime)}</span>
                                <span className="ml-2 text-blue-600">({formatTimeFromNow(currentEvent.scheduledStartTime)})</span>
                            </div>
                            <div className="flex items-center">
                                <Users className="w-4 h-4 mr-2" />
                                <span>{formatParticipantCount(currentEvent.currentBookings, currentEvent.maxParticipants)}</span>
                            </div>
                        </div>
                    </div>

                    <Alert variant="info">
                        <strong>Next Step:</strong> You can join the video room once the event starts. A join button will appear below when it's time.
                    </Alert>
                </div>
            </Card>
        );
    }

    // Show host view if this is the host
    if (userRole === 'host') {
        return (
            <Card title="Event Management" className="max-w-2xl mx-auto">
                <div className="space-y-6">
                    <Alert variant="info">
                        You are the host of this event. Participants can use this link to book their spot.
                    </Alert>

                    <div className="bg-gray-50 rounded-lg p-4">
                        <h4 className="font-medium text-gray-900 mb-3">Event Overview</h4>
                        <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                                <span className="text-gray-600">Current Bookings:</span>
                                <span className="font-medium">{formatParticipantCount(currentEvent.currentBookings, currentEvent.maxParticipants)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-600">Status:</span>
                                <Badge variant={currentEvent.status === 'ACTIVE' ? 'success' : 'default'}>
                                    {currentEvent.status}
                                </Badge>
                            </div>
                        </div>
                    </div>
                </div>
            </Card>
        );
    }

    // Show booking form
    return (
        <Card title="Book Your Spot" className="max-w-2xl mx-auto">
            <div className="space-y-6">
                {/* Event Information */}
                <div className="bg-gray-50 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-lg font-medium text-gray-900">{currentEvent.eventTitle}</h3>
                        <Badge className={getEventStatusColor(currentEvent.status)}>
                            {currentEvent.status}
                        </Badge>
                    </div>

                    {currentEvent.eventDescription && (
                        <p className="text-gray-600 mb-4">{currentEvent.eventDescription}</p>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                        <div className="flex items-center text-gray-600">
                            <Calendar className="w-4 h-4 mr-2" />
                            <div>
                                <div>{formatDateTime(currentEvent.scheduledStartTime)}</div>
                                <div className="text-xs text-blue-600">{formatTimeFromNow(currentEvent.scheduledStartTime)}</div>
                            </div>
                        </div>
                        <div className="flex items-center text-gray-600">
                            <Users className="w-4 h-4 mr-2" />
                            <span>{formatParticipantCount(currentEvent.currentBookings, currentEvent.maxParticipants)}</span>
                        </div>
                        <div className="flex items-center text-gray-600">
                            <User className="w-4 h-4 mr-2" />
                            <span>Hosted by {currentEvent.hostUserName}</span>
                        </div>
                    </div>
                </div>

                {/* Booking Form */}
                {eventError && (
                    <Alert variant="error">{eventError}</Alert>
                )}

                <div className="space-y-4">
                    <h4 className="font-medium text-gray-900">Your Information</h4>

                    <Input
                        label="User ID"
                        value={formData.userId}
                        onChange={(value) => setFormData(prev => ({ ...prev, userId: value }))}
                        placeholder="your-unique-id"
                        required
                        error={errors.userId || ''}
                    />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Input
                            label="Your Name"
                            value={formData.userName}
                            onChange={(value) => setFormData(prev => ({ ...prev, userName: value }))}
                            placeholder="John Doe"
                            required
                            error={errors.userName || ''}
                        />
                        <Input
                            label="Email Address"
                            type="email"
                            value={formData.userEmail}
                            onChange={(value) => setFormData(prev => ({ ...prev, userEmail: value }))}
                            placeholder="john@example.com"
                            required
                            error={errors.userEmail || ''}
                        />
                    </div>
                </div>

                {/* Booking Action */}
                <div className="pt-6 border-t">
                    {currentEvent.currentBookings >= currentEvent.maxParticipants ? (
                        <Alert variant="warning">
                            This event is fully booked. No more spots available.
                        </Alert>
                    ) : (
                        <Button
                            onClick={handleBooking}
                            loading={isBookingEvent}
                            disabled={isBookingEvent}
                            className="w-full md:w-auto"
                        >
                            Book My Spot
                        </Button>
                    )}
                </div>
            </div>
        </Card>
    );
});