// components/EventCreator.tsx
import React, { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { Calendar, Users, Copy, Check } from 'lucide-react';
import { eventStore } from '../stores/EventStore';
import { socketStore } from '../stores/SocketStore';
import { Card } from './ui/Card';
import { Input } from './ui/Input';
import { Button } from './ui/Button';
import { Alert } from './ui/Alert';
import { generateId, validateEmail, validateEventId, copyToClipboard, formatDateTime } from '@/utils';
import type { CreateEventRequest } from '@/types';

export const EventCreator: React.FC = observer(() => {
    const [formData, setFormData] = useState({
        eventId: '',
        eventTitle: '',
        eventDescription: '',
        scheduledStartTime: '',
        hostUserId: '',
        hostUserName: '',
        hostEmail: '',
        maxParticipants: 10
    });

    const [linkCopied, setLinkCopied] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});

    const { currentEvent, isCreatingEvent, error: eventError } = eventStore;

    const validateForm = (): boolean => {
        const newErrors: Record<string, string> = {};

        if (!formData.eventId) {
            newErrors.eventId = 'Event ID is required';
        } else if (!validateEventId(formData.eventId)) {
            newErrors.eventId = 'Event ID must be 3-100 characters, alphanumeric, hyphens, and underscores only';
        }

        if (!formData.eventTitle.trim()) {
            newErrors.eventTitle = 'Event title is required';
        } else if (formData.eventTitle.length > 200) {
            newErrors.eventTitle = 'Event title must not exceed 200 characters';
        }

        if (formData.eventDescription && formData.eventDescription.length > 1000) {
            newErrors.eventDescription = 'Event description must not exceed 1000 characters';
        }

        if (!formData.scheduledStartTime) {
            newErrors.scheduledStartTime = 'Scheduled start time is required';
        } else {
            const startTime = new Date(formData.scheduledStartTime);
            if (startTime <= new Date()) {
                newErrors.scheduledStartTime = 'Scheduled start time must be in the future';
            }
        }

        if (!formData.hostUserId.trim()) {
            newErrors.hostUserId = 'Host user ID is required';
        }

        if (!formData.hostUserName.trim()) {
            newErrors.hostUserName = 'Host user name is required';
        }

        if (!formData.hostEmail.trim()) {
            newErrors.hostEmail = 'Host email is required';
        } else if (!validateEmail(formData.hostEmail)) {
            newErrors.hostEmail = 'Please enter a valid email address';
        }

        if (formData.maxParticipants < 2 || formData.maxParticipants > 50) {
            newErrors.maxParticipants = 'Max participants must be between 2 and 50';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async () => {
        if (!validateForm()) {
            return;
        }

        const eventRequest: CreateEventRequest = {
            ...formData,
            eventTitle: formData.eventTitle.trim(),
            eventDescription: formData.eventDescription.trim() || "",
            hostUserId: formData.hostUserId.trim(),
            hostUserName: formData.hostUserName.trim(),
            hostEmail: formData.hostEmail.trim(),
        };

        const success = await eventStore.createEvent(eventRequest);

        if (success) {
            // Set user info for the host
            //eventStore.setUserInfo(
            //    formData.hostUserId.trim(),
            //    formData.hostUserName.trim(),
            //    formData.hostEmail.trim()
            //);

            // Connect to socket for room functionality
            if (!socketStore.isConnected) {
                try {
                    await socketStore.connect();
                } catch (error) {
                    socketStore.log('error', 'Failed to connect to server after event creation');
                }
            }
        }
    };

    const generateEventId = () => {
        const id = `event-${generateId().split('-')[0]}`;
        setFormData(prev => ({ ...prev, eventId: id }));
        setErrors(prev => ({ ...prev, eventId: '' }));
    };

    const handleCopyLink = async () => {
        if (currentEvent && eventStore.eventLink) {
            const success = await copyToClipboard(eventStore.eventLink);
            if (success) {
                setLinkCopied(true);
                setTimeout(() => setLinkCopied(false), 2000);
            }
        }
    };

    // Auto-fill current date + 1 hour as default start time
    const getDefaultStartTime = () => {
        const now = new Date();
        now.setHours(now.getHours() + 1);
        return now.toISOString().slice(0, 16);
    };

    if (currentEvent) {
        return (
            <Card title="Event Created Successfully!" className="max-w-2xl mx-auto">
                <div className="space-y-6">
                    <Alert variant="success">
                        Your event has been created successfully! Share the link below with participants.
                    </Alert>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Event ID</label>
                            <p className="text-lg font-mono bg-gray-50 p-2 rounded">{currentEvent.eventId}</p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Room ID</label>
                            <p className="text-lg font-mono bg-gray-50 p-2 rounded">{currentEvent.roomId}</p>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Event Title</label>
                        <p className="text-lg">{currentEvent.eventTitle}</p>
                    </div>

                    {currentEvent.eventDescription && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                            <p className="text-gray-600">{currentEvent.eventDescription}</p>
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Scheduled Start</label>
                            <p className="flex items-center text-gray-600">
                                <Calendar className="w-4 h-4 mr-2" />
                                {formatDateTime(currentEvent.scheduledStartTime)}
                            </p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Max Participants</label>
                            <p className="flex items-center text-gray-600">
                                <Users className="w-4 h-4 mr-2" />
                                {currentEvent.maxParticipants}
                            </p>
                        </div>
                    </div>

                    <div className="border-t pt-6">
                        <label className="block text-sm font-medium text-gray-700 mb-2">Event Link (Owner Only)</label>
                        <div className="flex items-center space-x-2">
                            <input
                                type="text"
                                value={eventStore.eventLink || ''}
                                readOnly
                                className="flex-1 px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-sm"
                            />
                            <Button
                                onClick={handleCopyLink}
                                variant="secondary"
                                size="sm"
                                className="whitespace-nowrap"
                            >
                                {linkCopied ? (
                                    <>
                                        <Check className="w-4 h-4 mr-1" />
                                        Copied!
                                    </>
                                ) : (
                                    <>
                                        <Copy className="w-4 h-4 mr-1" />
                                        Copy Link
                                    </>
                                )}
                            </Button>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                            Share this link with participants so they can book and join your event
                        </p>
                    </div>
                </div>
            </Card>
        );
    }

    return (
        <Card title="Create New Event" className="max-w-2xl mx-auto">
            <div className="space-y-6">
                {eventError && (
                    <Alert variant="error">{eventError}</Alert>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <Input
                            label="Event ID"
                            value={formData.eventId}
                            onChange={(value) => setFormData(prev => ({ ...prev, eventId: value }))}
                            placeholder="event-abc123"
                            required
                            error={errors.eventId || ''}
                        />
                        <Button
                            onClick={generateEventId}
                            variant="secondary"
                            size="sm"
                            className="mt-2"
                        >
                            Generate ID
                        </Button>
                    </div>
                    <Input
                        label="Max Participants"
                        type="number"
                        value={formData.maxParticipants.toString()}
                        onChange={(value) => setFormData(prev => ({ ...prev, maxParticipants: parseInt(value) || 10 }))}
                        required
                        error={errors.maxParticipants || ''}
                        className="md:pt-0"
                    />
                </div>

                <Input
                    label="Event Title"
                    value={formData.eventTitle}
                    onChange={(value) => setFormData(prev => ({ ...prev, eventTitle: value }))}
                    placeholder="My Video Conference"
                    required
                    error={errors.eventTitle || ''}
                />

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        Event Description <span className="text-gray-500">(optional)</span>
                    </label>
                    <textarea
                        value={formData.eventDescription}
                        onChange={(e) => setFormData(prev => ({ ...prev, eventDescription: e.target.value }))}
                        placeholder="Brief description of your event"
                        rows={3}
                        className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                    />
                    {errors.eventDescription && (
                        <p className="mt-1 text-sm text-error-600">{errors.eventDescription}</p>
                    )}
                </div>

                <Input
                    label="Scheduled Start Time"
                    type="datetime-local"
                    value={formData.scheduledStartTime || getDefaultStartTime()}
                    onChange={(value) => setFormData(prev => ({ ...prev, scheduledStartTime: value }))}
                    required
                    error={errors.scheduledStartTime || ''}
                />

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Input
                        label="Host User ID"
                        value={formData.hostUserId}
                        onChange={(value) => setFormData(prev => ({ ...prev, hostUserId: value }))}
                        placeholder="host123"
                        required
                        error={errors.hostUserId || ''}
                    />
                    <Input
                        label="Host Name"
                        value={formData.hostUserName}
                        onChange={(value) => setFormData(prev => ({ ...prev, hostUserName: value }))}
                        placeholder="John Doe"
                        required
                        error={errors.hostUserName || ''}
                    />
                    <Input
                        label="Host Email"
                        type="email"
                        value={formData.hostEmail}
                        onChange={(value) => setFormData(prev => ({ ...prev, hostEmail: value }))}
                        placeholder="host@example.com"
                        required
                        error={errors.hostEmail || ''}
                    />
                </div>

                <div className="pt-6 border-t" style={{ position: 'relative', zIndex: 10 }}>
                    <Button
                        onClick={handleSubmit}
                        loading={isCreatingEvent}
                        className="w-full md:w-auto"
                    >
                        Create Event
                    </Button>
                </div>
            </div>
        </Card>
    );
});