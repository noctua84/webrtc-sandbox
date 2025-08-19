// components/VideoRoom.tsx
import React, { useEffect, useState, useRef } from 'react';
import { observer } from 'mobx-react-lite';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Video,
    VideoOff,
    Mic,
    MicOff,
    Monitor,
    MonitorOff,
    Phone,
    Users,
    ArrowLeft,
    Settings,
    Copy,
    Check,
    AlertTriangle,
    Maximize2,
    Minimize2
} from 'lucide-react';
import { eventStore } from '../stores/EventStore';
import { roomStore } from '../stores/RoomStore';
import { socketStore } from '../stores/SocketStore';
import { authStore } from '../stores/AuthStore';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { Alert } from './ui/Alert';
import { Badge } from './ui/Badge';
import { formatDateTime, copyToClipboard } from '@/utils';

export const VideoRoom: React.FC = observer(() => {
    const { eventId } = useParams<{ eventId: string }>();
    const navigate = useNavigate();

    // Media state
    const [mediaDevices, setMediaDevices] = useState({
        hasVideo: false,
        hasAudio: false,
        isScreenSharing: false
    });
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [mediaError, setMediaError] = useState<string | null>(null);

    // UI state
    const [showParticipants, setShowParticipants] = useState(true);
    const [showSettings, setShowSettings] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [roomLinkCopied, setRoomLinkCopied] = useState(false);

    // Authorization state
    const [hasAccess, setHasAccess] = useState<boolean | null>(null);
    const [accessChecking, setAccessChecking] = useState(true);

    // Refs
    const localVideoRef = useRef<HTMLVideoElement>(null);
    const roomContainerRef = useRef<HTMLDivElement>(null);

    const { currentEvent } = eventStore;
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

    // Check server-side authorization
    const checkRoomAccess = async (): Promise<boolean> => {
        if (!eventId) return false;

        setAccessChecking(true);
        try {
            const access = await authStore.checkEventAccess(eventId);
            const canAccess = access?.canJoin || false;
            setHasAccess(canAccess);
            return canAccess;
        } catch (error) {
            console.error('Access check failed:', error);
            setHasAccess(false);
            return false;
        } finally {
            setAccessChecking(false);
        }
    };

    // Initialize room connection
    useEffect(() => {
        const initializeRoom = async () => {
            if (!eventId) return;

            // Load event if not already loaded
            if (!currentEvent) {
                await eventStore.loadEvent(eventId);
            }

            // Check authorization
            const canAccess = await checkRoomAccess();
            if (!canAccess) return;

            // Connect socket and join room if not already in
            if (!isInRoom && !isJoiningRoom) {
                try {
                    if (!socketStore.isConnected) {
                        await socketStore.connect();
                    }

                    const success = await roomStore.joinRoom();
                    if (success) {
                        socketStore.log('success', 'Successfully joined video room');
                        await initializeMedia();
                    }
                } catch (error) {
                    console.error('Failed to join room:', error);
                }
            }
        };

        initializeRoom();

        return () => {
            // Cleanup media on unmount
            cleanupMedia();
        };
    }, [eventId, currentEvent, isInRoom, isJoiningRoom]);

    // Media management
    const initializeMedia = async () => {
        try {
            setMediaError(null);

            const stream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
            });

            setLocalStream(stream);
            setMediaDevices(prev => ({ ...prev, hasVideo: true, hasAudio: true }));

            if (localVideoRef.current) {
                localVideoRef.current.srcObject = stream;
            }

            socketStore.log('success', 'Media devices initialized');
        } catch (error) {
            const errorMessage = (error as Error).message;
            setMediaError(`Failed to access camera/microphone: ${errorMessage}`);
            socketStore.log('error', 'Failed to initialize media', { error: errorMessage });
        }
    };

    const cleanupMedia = () => {
        if (localStream) {
            localStream.getTracks().forEach(track => {
                track.stop();
                socketStore.log('info', `Stopped ${track.kind} track`);
            });
            setLocalStream(null);
            setMediaDevices({ hasVideo: false, hasAudio: false, isScreenSharing: false });
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
                cleanupMedia();
                await initializeMedia();
                setMediaDevices(prev => ({ ...prev, isScreenSharing: false }));
                socketStore.log('info', 'Screen sharing stopped');
            } else {
                // Start screen sharing
                const screenStream = await navigator.mediaDevices.getDisplayMedia({
                    video: true,
                    audio: true
                });

                cleanupMedia();
                setLocalStream(screenStream);
                setMediaDevices(prev => ({ ...prev, isScreenSharing: true }));

                if (localVideoRef.current) {
                    localVideoRef.current.srcObject = screenStream;
                }

                // Listen for screen share end
                screenStream?.getVideoTracks()[0]?.addEventListener('ended', () => {
                    setMediaDevices(prev => ({ ...prev, isScreenSharing: false }));
                    initializeMedia();
                });

                socketStore.log('info', 'Screen sharing started');
            }
        } catch (error) {
            socketStore.log('error', 'Screen sharing error', { error: (error as Error).message });
        }
    };

    const leaveRoom = async () => {
        try {
            cleanupMedia();
            await roomStore.leaveRoom();
            socketStore.log('success', 'Left video room');
            navigate(eventId ? `/event/${eventId}` : '/');
        } catch (error) {
            socketStore.log('error', 'Failed to leave room', { error: (error as Error).message });
            // Navigate anyway
            navigate(eventId ? `/event/${eventId}` : '/');
        }
    };

    const toggleFullscreen = () => {
        if (!isFullscreen && roomContainerRef.current) {
            roomContainerRef.current.requestFullscreen();
            setIsFullscreen(true);
        } else if (document.fullscreenElement) {
            document.exitFullscreen();
            setIsFullscreen(false);
        }
    };

    const copyRoomLink = async () => {
        if (currentEvent) {
            const link = `${window.location.origin}/event/${currentEvent.eventId}`;
            const success = await copyToClipboard(link);
            if (success) {
                setRoomLinkCopied(true);
                setTimeout(() => setRoomLinkCopied(false), 2000);
            }
        }
    };

    // Loading states
    if (!currentEvent && eventStore.isLoadingEvent) {
        return (
            <Card className="max-w-4xl mx-auto">
                <div className="flex items-center justify-center py-12">
                    <div className="text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto mb-4"></div>
                        <p className="text-gray-600">Loading event...</p>
                    </div>
                </div>
            </Card>
        );
    }

    // Access checking
    if (accessChecking) {
        return (
            <Card className="max-w-4xl mx-auto">
                <div className="flex items-center justify-center py-12">
                    <div className="text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto mb-4"></div>
                        <p className="text-gray-600">Verifying access permissions...</p>
                    </div>
                </div>
            </Card>
        );
    }

    // Authorization failed
    if (hasAccess === false) {
        return (
            <Card className="max-w-4xl mx-auto">
                <div className="space-y-4">
                    <Alert variant="warning">
                        <AlertTriangle className="w-4 h-4 mr-2" />
                        You are not authorized to access this video room. Please ensure you have booked the event or are the host.
                    </Alert>
                    <div className="flex space-x-3">
                        <Button
                            onClick={() => navigate(eventId ? `/event/${eventId}` : '/')}
                            variant="secondary"
                        >
                            <ArrowLeft className="w-4 h-4 mr-2" />
                            Back to Event
                        </Button>
                    </div>
                </div>
            </Card>
        );
    }

    // Joining room
    if (isJoiningRoom) {
        return (
            <Card className="max-w-4xl mx-auto">
                <div className="flex items-center justify-center py-12">
                    <div className="text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto mb-4"></div>
                        <p className="text-gray-600">Joining video room...</p>
                        <p className="text-sm text-gray-500 mt-2">Connecting to server and setting up media...</p>
                    </div>
                </div>
            </Card>
        );
    }

    // Not in room yet - show join interface
    if (!isInRoom) {
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
                                    <Badge variant="default">Checking...</Badge>
                                </div>
                            </div>
                        </div>
                    )}

                    {roomError && (
                        <Alert variant="error">{roomError}</Alert>
                    )}

                    {mediaError && (
                        <Alert variant="warning">
                            <AlertTriangle className="w-4 h-4 mr-2" />
                            {mediaError}
                        </Alert>
                    )}

                    <div className="flex space-x-3">
                        <Button
                            onClick={() => navigate(eventId ? `/event/${eventId}` : '/')}
                            variant="secondary"
                        >
                            <ArrowLeft className="w-4 h-4 mr-2" />
                            Back to Event
                        </Button>
                        <Button
                            onClick={initializeMedia}
                            variant="secondary"
                            className="flex-1"
                        >
                            Test Camera & Mic
                        </Button>
                    </div>
                </div>
            </Card>
        );
    }

    // Main video room interface
    return (
        <div ref={roomContainerRef} className="h-screen bg-gray-900 flex flex-col">
            {/* Room Header */}
            <div className="bg-white border-b px-6 py-4 flex items-center justify-between">
                <div className="flex items-center space-x-4">
                    <h2 className="text-xl font-semibold text-gray-900">
                        {currentRoom?.eventTitle || currentEvent?.eventTitle || 'Video Room'}
                    </h2>
                    <Badge variant="success">Live</Badge>
                    <div className="flex items-center text-gray-600">
                        <Users className="w-4 h-4 mr-1" />
                        <span>{participantCount} participant{participantCount === 1 ? '' : 's'}</span>
                    </div>
                </div>

                <div className="flex items-center space-x-2">
                    <Button
                        onClick={copyRoomLink}
                        variant="secondary"
                        size="sm"
                    >
                        {roomLinkCopied ? (
                            <>
                                <Check className="w-4 h-4 mr-1" />
                                Copied!
                            </>
                        ) : (
                            <>
                                <Copy className="w-4 h-4 mr-1" />
                                Share Link
                            </>
                        )}
                    </Button>

                    <Button
                        onClick={() => setShowParticipants(!showParticipants)}
                        variant="secondary"
                        size="sm"
                    >
                        <Users className="w-4 h-4 mr-1" />
                        Participants
                    </Button>

                    <Button
                        onClick={toggleFullscreen}
                        variant="secondary"
                        size="sm"
                    >
                        {isFullscreen ? (
                            <Minimize2 className="w-4 h-4" />
                        ) : (
                            <Maximize2 className="w-4 h-4" />
                        )}
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

            {/* Main Content */}
            <div className="flex-1 flex">
                {/* Video Area */}
                <div className={`flex-1 p-4 ${showParticipants ? 'pr-2' : ''}`}>
                    <div className="h-full grid gap-4" style={{
                        gridTemplateColumns: participants.length <= 2 ? '1fr' :
                            participants.length <= 4 ? 'repeat(2, 1fr)' :
                                'repeat(3, 1fr)',
                        gridTemplateRows: participants.length <= 2 ? '1fr' :
                            participants.length <= 4 ? 'repeat(2, 1fr)' :
                                'repeat(auto-fit, minmax(200px, 1fr))'
                    }}>
                        {/* Local Video */}
                        <div className="relative bg-gray-800 rounded-lg overflow-hidden">
                            <video
                                ref={localVideoRef}
                                autoPlay
                                muted
                                playsInline
                                className="w-full h-full object-cover"
                            />

                            {!mediaDevices.hasVideo && (
                                <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
                                    <div className="text-center text-white">
                                        <VideoOff className="w-16 h-16 mx-auto mb-2 text-gray-400" />
                                        <p className="text-sm">Camera Off</p>
                                    </div>
                                </div>
                            )}

                            {/* Local Video Label */}
                            <div className="absolute top-3 left-3 bg-black bg-opacity-50 text-white text-sm px-2 py-1 rounded">
                                You {isHost && '(Host)'}
                            </div>

                            {/* Media Status Indicators */}
                            <div className="absolute top-3 right-3 flex space-x-1">
                                {!mediaDevices.hasAudio && (
                                    <div className="bg-red-500 text-white p-1 rounded">
                                        <MicOff className="w-3 h-3" />
                                    </div>
                                )}
                                {mediaDevices.isScreenSharing && (
                                    <div className="bg-blue-500 text-white p-1 rounded">
                                        <Monitor className="w-3 h-3" />
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Remote Participants */}
                        {participants
                            .filter(p => p.socketId !== currentParticipant?.socketId)
                            .map(participant => (
                                <div key={participant.socketId} className="relative bg-gray-800 rounded-lg overflow-hidden">
                                    <div className="w-full h-full flex items-center justify-center">
                                        <div className="text-center text-white">
                                            <div className="w-16 h-16 bg-gray-600 rounded-full flex items-center justify-center mx-auto mb-2">
                                                <Users className="w-8 h-8 text-gray-300" />
                                            </div>
                                            <p className="text-sm font-medium">{participant.userName}</p>
                                            <p className="text-xs text-gray-400">
                                                {participant.isCreator ? 'Host' : 'Participant'}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="absolute top-3 left-3 bg-black bg-opacity-50 text-white text-sm px-2 py-1 rounded">
                                        {participant.userName}
                                        {participant.isCreator && ' (Host)'}
                                    </div>
                                </div>
                            ))}
                    </div>
                </div>

                {/* Sidebar */}
                {showParticipants && (
                    <div className="w-80 bg-white border-l p-4 space-y-4">
                        <div className="space-y-2">
                            <h3 className="font-medium text-gray-900">Participants ({participantCount})</h3>
                            <div className="space-y-2 max-h-60 overflow-y-auto">
                                {participants.map(participant => (
                                    <div key={participant.socketId} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                                        <div className="flex items-center space-x-2">
                                            <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center">
                                                <Users className="w-4 h-4 text-gray-600" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium">{participant.userName}</p>
                                                <p className="text-xs text-gray-500">{participant.userEmail}</p>
                                            </div>
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
                        </div>

                        {/* Room Info */}
                        <div className="space-y-2">
                            <h3 className="font-medium text-gray-900">Room Info</h3>
                            <div className="bg-gray-50 rounded p-3 space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-gray-600">Room ID:</span>
                                    <span className="font-mono text-xs">{currentRoom?.id}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-600">Status:</span>
                                    <Badge variant="success">Active</Badge>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-600">Started:</span>
                                    <span>{new Date().toLocaleTimeString()}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Bottom Controls */}
            <div className="bg-white border-t px-6 py-4">
                <div className="flex items-center justify-center space-x-4">
                    <Button
                        onClick={toggleVideo}
                        variant={mediaDevices.hasVideo ? 'success' : 'error'}
                        size="lg"
                        className="w-12 h-12 rounded-full p-0"
                    >
                        {mediaDevices.hasVideo ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
                    </Button>

                    <Button
                        onClick={toggleAudio}
                        variant={mediaDevices.hasAudio ? 'success' : 'error'}
                        size="lg"
                        className="w-12 h-12 rounded-full p-0"
                    >
                        {mediaDevices.hasAudio ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
                    </Button>

                    <Button
                        onClick={toggleScreenShare}
                        variant={mediaDevices.isScreenSharing ? 'warning' : 'secondary'}
                        size="lg"
                        className="w-12 h-12 rounded-full p-0"
                    >
                        {mediaDevices.isScreenSharing ? <MonitorOff className="w-5 h-5" /> : <Monitor className="w-5 h-5" />}
                    </Button>

                    <div className="w-px h-8 bg-gray-300 mx-2" />

                    <Button
                        onClick={() => setShowSettings(!showSettings)}
                        variant="secondary"
                        size="lg"
                        className="w-12 h-12 rounded-full p-0"
                    >
                        <Settings className="w-5 h-5" />
                    </Button>

                    <Button
                        onClick={leaveRoom}
                        variant="error"
                        size="lg"
                        className="w-12 h-12 rounded-full p-0"
                    >
                        <Phone className="w-5 h-5" />
                    </Button>
                </div>

                {mediaError && (
                    <div className="mt-3">
                        <Alert variant="warning">
                            <AlertTriangle className="w-4 h-4 mr-2" />
                            {mediaError}
                        </Alert>
                    </div>
                )}
            </div>
        </div>
    );
});