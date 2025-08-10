// components/VideoRoom.tsx
import React, { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import {
    Video,
    VideoOff,
    Mic,
    MicOff,
    Monitor,
    MonitorOff,
    Phone,
    Users,
    User
} from 'lucide-react';
import { eventStore } from '../stores/EventStore';
import { roomStore } from '../stores/RoomStore';
import { socketStore } from '../stores/SocketStore';
import { Card } from './ui/Card';
import { Alert } from './ui/Alert';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import { formatDateTime } from '@/utils';

export const VideoRoom: React.FC = observer(() => {
    const [mediaDevices, setMediaDevices] = useState({
        hasVideo: false,
        hasAudio: false,
        isScreenSharing: false
    });
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [showParticipants, setShowParticipants] = useState(true);

    const { currentEvent, userRole } = eventStore;
    const {
        currentRoom,
        currentParticipant,
        participants,
        isInRoom,
        isJoiningRoom,
        participantCount,
        isHost,
        error: roomError
    } = roomStore;

    useEffect(() => {
        // Auto-join room if authorized
        if (eventStore.canJoinEvent && !isInRoom && !isJoiningRoom) {
            joinRoom();
        }

        return () => {
            // Cleanup: stop all media tracks when component unmounts
            if (localStream) {
                localStream.getTracks().forEach(track => track.stop());
            }
        };
    }, [eventStore.canJoinEvent, isInRoom, isJoiningRoom]);

    const joinRoom = async () => {
        try {
            const success = await roomStore.joinRoom();
            if (success) {
                socketStore.log('success', 'Successfully joined video room');
                // Initialize media after joining
                await initializeMedia();
            }
        } catch (error) {
            socketStore.log('error', 'Failed to join room', { error: (error as Error).message });
        }
    };

    const leaveRoom = async () => {
        try {
            // Stop local media first
            if (localStream) {
                localStream.getTracks().forEach(track => track.stop());
                setLocalStream(null);
                setMediaDevices({ hasVideo: false, hasAudio: false, isScreenSharing: false });
            }

            await roomStore.leaveRoom();
            socketStore.log('success', 'Left video room');
        } catch (error) {
            socketStore.log('error', 'Failed to leave room', { error: (error as Error).message });
        }
    };

    const initializeMedia = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
            });

            setLocalStream(stream);
            setMediaDevices(prev => ({ ...prev, hasVideo: true, hasAudio: true }));

            // Display local video
            const videoElement = document.getElementById('localVideo') as HTMLVideoElement;
            if (videoElement) {
                videoElement.srcObject = stream;
            }

            socketStore.log('success', 'Media devices initialized');
        } catch (error) {
            socketStore.log('error', 'Failed to initialize media', { error: (error as Error).message });
        }
    };

    const toggleVideo = () => {
        if (localStream) {
            const videoTrack = localStream.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = !videoTrack.enabled;
                setMediaDevices(prev => ({ ...prev, hasVideo: videoTrack.enabled }));
                socketStore.log('info', `Video ${videoTrack.enabled ? 'enabled' : 'disabled'}`);
            }
        }
    };

    const toggleAudio = () => {
        if (localStream) {
            const audioTrack = localStream.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                setMediaDevices(prev => ({ ...prev, hasAudio: audioTrack.enabled }));
                socketStore.log('info', `Audio ${audioTrack.enabled ? 'enabled' : 'disabled'}`);
            }
        }
    };

    const toggleScreenShare = async () => {
        try {
            if (mediaDevices.isScreenSharing) {
                // Stop screen sharing, return to camera
                if (localStream) {
                    localStream.getTracks().forEach(track => track.stop());
                }
                await initializeMedia();
                setMediaDevices(prev => ({ ...prev, isScreenSharing: false }));
                socketStore.log('info', 'Screen sharing stopped');
            } else {
                // Start screen sharing
                const screenStream = await navigator.mediaDevices.getDisplayMedia({
                    video: true,
                    audio: true
                });

                if (localStream) {
                    localStream.getTracks().forEach(track => track.stop());
                }

                setLocalStream(screenStream);
                setMediaDevices(prev => ({ ...prev, isScreenSharing: true }));

                const videoElement = document.getElementById('localVideo') as HTMLVideoElement;
                if (videoElement) {
                    videoElement.srcObject = screenStream;
                }

                // Listen for screen share end
                screenStream.getVideoTracks()[0]?.addEventListener('ended', () => {
                    setMediaDevices(prev => ({ ...prev, isScreenSharing: false }));
                    initializeMedia();
                });

                socketStore.log('info', 'Screen sharing started');
            }
        } catch (error) {
            socketStore.log('error', 'Screen sharing error', { error: (error as Error).message });
        }
    };

    if (!eventStore.canJoinEvent) {
        return (
            <Card className="max-w-4xl mx-auto">
                <Alert variant="warning">
                    You need to book this event first before joining the video room.
                </Alert>
            </Card>
        );
    }

    if (!isInRoom && !isJoiningRoom) {
        return (
            <Card title="Join Video Room" className="max-w-2xl mx-auto">
                <div className="space-y-6">
                    <Alert variant="info">
                        Ready to join the video room for <strong>{currentEvent?.eventTitle}</strong>
                    </Alert>

                    {currentEvent && (
                        <div className="bg-gray-50 rounded-lg p-4">
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-gray-600">Event:</span>
                                    <span className="font-medium">{currentEvent.eventTitle}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-600">Scheduled:</span>
                                    <span>{formatDateTime(currentEvent.scheduledStartTime)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-600">Your Role:</span>
                                    <Badge variant={userRole === 'host' ? 'success' : 'default'}>
                                        {userRole}
                                    </Badge>
                                </div>
                            </div>
                        </div>
                    )}

                    {roomError && (
                        <Alert variant="error">{roomError}</Alert>
                    )}

                    <Button
                        onClick={joinRoom}
                        loading={isJoiningRoom}
                        disabled={isJoiningRoom}
                        className="w-full"
                    >
                        Join Video Room
                    </Button>
                </div>
            </Card>
        );
    }

    if (isJoiningRoom) {
        return (
            <Card className="max-w-4xl mx-auto">
                <div className="flex items-center justify-center py-12">
                    <div className="text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto mb-4"></div>
                        <p className="text-gray-600">Joining video room...</p>
                    </div>
                </div>
            </Card>
        );
    }

    return (
        <div className="max-w-6xl mx-auto space-y-4">
            {/* Room Header */}
            <Card className="p-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                        <h2 className="text-xl font-semibold">{currentRoom?.eventTitle || 'Video Room'}</h2>
                        <Badge variant="success">Live</Badge>
                        <div className="flex items-center text-gray-600">
                            <Users className="w-4 h-4 mr-1" />
                            <span>{participantCount} participants</span>
                        </div>
                    </div>

                    <div className="flex items-center space-x-2">
                        <Button
                            onClick={() => setShowParticipants(!showParticipants)}
                            variant="secondary"
                            size="sm"
                        >
                            <Users className="w-4 h-4 mr-1" />
                            Participants
                        </Button>
                        <Button
                            onClick={leaveRoom}
                            variant="error"
                            size="sm"
                        >
                            <Phone className="w-4 h-4 mr-1" />
                            Leave
                        </Button>
                    </div>
                </div>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
                {/* Main Video Area */}
                <div className="lg:col-span-3 space-y-4">
                    {/* Local Video */}
                    <Card title="You" className="relative">
                        <div className="aspect-video bg-gray-900 rounded-lg overflow-hidden">
                            <video
                                id="localVideo"
                                autoPlay
                                muted
                                playsInline
                                className="w-full h-full object-cover"
                            />
                            {!mediaDevices.hasVideo && (
                                <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
                                    <VideoOff className="w-12 h-12 text-gray-400" />
                                </div>
                            )}
                        </div>

                        {/* Local Controls */}
                        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex space-x-2">
                            <Button
                                onClick={toggleVideo}
                                variant={mediaDevices.hasVideo ? 'success' : 'error'}
                                size="sm"
                            >
                                {mediaDevices.hasVideo ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
                            </Button>
                            <Button
                                onClick={toggleAudio}
                                variant={mediaDevices.hasAudio ? 'success' : 'error'}
                                size="sm"
                            >
                                {mediaDevices.hasAudio ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                            </Button>
                            <Button
                                onClick={toggleScreenShare}
                                variant={mediaDevices.isScreenSharing ? 'warning' : 'secondary'}
                                size="sm"
                            >
                                {mediaDevices.isScreenSharing ? <MonitorOff className="w-4 h-4" /> : <Monitor className="w-4 h-4" />}
                            </Button>
                        </div>
                    </Card>

                    {/* Remote Participants Grid */}
                    {participants.filter(p => p.socketId !== currentParticipant?.socketId).length > 0 && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {participants
                                .filter(p => p.socketId !== currentParticipant?.socketId)
                                .map(participant => (
                                    <Card key={participant.socketId} title={participant.userName}>
                                        <div className="aspect-video bg-gray-900 rounded-lg flex items-center justify-center">
                                            <div className="text-center text-white">
                                                <User className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                                                <p className="text-sm">{participant.userName}</p>
                                                <p className="text-xs text-gray-400">
                                                    {participant.isCreator ? 'Host' : 'Participant'}
                                                </p>
                                            </div>
                                        </div>
                                    </Card>
                                ))}
                        </div>
                    )}
                </div>

                {/* Sidebar */}
                {showParticipants && (
                    <div className="space-y-4">
                        {/* Participants List */}
                        <Card title={`Participants (${participantCount})`}>
                            <div className="space-y-2 max-h-60 overflow-y-auto">
                                {participants.map(participant => (
                                    <div key={participant.socketId} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                                        <div className="flex items-center space-x-2">
                                            <User className="w-4 h-4 text-gray-400" />
                                            <span className="text-sm font-medium">{participant.userName}</span>
                                        </div>
                                        <div className="flex items-center space-x-1">
                                            {participant.isCreator && (
                                                <Badge variant="success" className="text-xs">Host</Badge>
                                            )}
                                            {participant.socketId === currentParticipant?.socketId && (
                                                <Badge variant="default" className="text-xs">You</Badge>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </Card>

                        {/* Room Info */}
                        <Card title="Room Info">
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-gray-600">Room ID:</span>
                                    <span className="font-mono text-xs">{currentRoom?.id}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-600">Status:</span>
                                    <Badge variant="success">Active</Badge>
                                </div>
                                {currentRoom && (
                                    <div className="flex justify-between">
                                        <span className="text-gray-600">Duration:</span>
                                        <span>{Math.round(currentRoom.timeoutDuration / 1000 / 60)} min</span>
                                    </div>
                                )}
                            </div>
                        </Card>
                    </div>
                )}
            </div>
        </div>
    );
});