// components/BookingModal.tsx
import React, { useState } from 'react';
import { X, UserPlus } from 'lucide-react';
import { sessionStore } from '../stores/SessionStore';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { validateEmail } from '@/utils';
import type { EventEntity, EventBooking } from '@/types';

interface BookingModalProps {
    event: EventEntity;
    onSuccess: (booking: EventBooking) => void;
    onClose: () => void;
}


export const BookingModal: React.FC<BookingModalProps> = ({
                                                              event,
                                                              onSuccess,
                                                              onClose
                                                          }) => {
    const [formData, setFormData] = useState({
        userName: sessionStore.userInfo.userName || '',
        userEmail: sessionStore.userInfo.userEmail || ''
    });
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [isBooking, setIsBooking] = useState(false);
    const [bookingError, setBookingError] = useState<string | null>(null);

    const validateForm = (): boolean => {
        const newErrors: Record<string, string> = {};

        if (!formData.userName.trim()) {
            newErrors.userName = 'Name is required';
        } else if (formData.userName.trim().length < 2) {
            newErrors.userName = 'Name must be at least 2 characters';
        }

        if (!formData.userEmail.trim()) {
            newErrors.userEmail = 'Email is required';
        } else if (!validateEmail(formData.userEmail)) {
            newErrors.userEmail = 'Please enter a valid email address';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async () => {
        setBookingError(null);

        if (!validateForm()) {
            return;
        }

        setIsBooking(true);

        try {
            const response = await fetch(`http://localhost:3001/api/events/${event.eventId}/book`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    eventId: event.eventId,
                    userId: sessionStore.userInfo.userId || `user-${Date.now()}`, // Generate ID if not set
                    userName: formData.userName.trim(),
                    userEmail: formData.userEmail.trim()
                }),
            });

            const data = await response.json();

            if (data.success && data.booking) {
                // Update session store with user info if not already set
                if (!sessionStore.userInfo.userId) {
                    sessionStore.setUserInfo(
                        data.booking.userId,
                        formData.userName.trim(),
                        formData.userEmail.trim()
                    );
                }

                onSuccess(data.booking);
            } else {
                setBookingError(data.error || 'Failed to book event');
            }
        } catch (error) {
            setBookingError((error as Error).message);
            console.error('Booking error:', error);
        } finally {
            setIsBooking(false);
        }
    };

    const handleBackdropClick = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    return (
        <div
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
            onClick={handleBackdropClick}>
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b">
                    <h3 className="text-lg font-semibold text-gray-900">Book Event</h3>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-6">
                    {/* Event Info */}
                    <div className="bg-gray-50 rounded-lg p-4">
                        <h4 className="font-medium text-gray-900 mb-2">{event.eventTitle}</h4>
                        <div className="text-sm text-gray-600 space-y-1">
                            <div>📅 {new Date(event.scheduledStartTime).toLocaleString()}</div>
                            <div>👥 {event.currentBookings}/{event.maxParticipants} participants</div>
                            <div>🎯 Hosted by {event.hostUserName}</div>
                        </div>
                    </div>

                    {/* Form */}
                    <div className="space-y-4">
                        <Input
                            label="Your Name"
                            value={formData.userName}
                            onChange={(value) => setFormData(prev => ({ ...prev, userName: value }))}
                            placeholder="Enter your full name"
                            required
                            error={errors.userName || ''}
                        />

                        <Input
                            label="Email Address"
                            type="email"
                            value={formData.userEmail}
                            onChange={(value) => setFormData(prev => ({ ...prev, userEmail: value }))}
                            placeholder="your.email@example.com"
                            required
                            error={errors.userEmail || ''}
                        />

                        <div className="text-xs text-gray-500">
                            Your email will be used to identify your booking and send you event updates.
                        </div>
                    </div>

                    {/* Error Display */}
                    {bookingError && (
                        <Alert variant="error">
                            {bookingError}
                        </Alert>
                    )}

                    {/* Actions */}
                    <div className="flex space-x-3 pt-4 border-t">
                        <Button
                            onClick={onClose}
                            variant="secondary"
                            className="flex-1"
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleSubmit}
                            loading={isBooking}
                            className="flex-1"
                        >
                            <UserPlus className="w-4 h-4 mr-2" />
                            Book Event
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
};