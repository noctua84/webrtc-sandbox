import React, { useEffect, useRef } from 'react';
import { observer } from 'mobx-react-lite';
import roomStore from "@/stores/room.store";
import webrtcStore from "@/stores/webrtc.store";
import type { Participant } from "@/types";

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

interface VideoTileProps {
    stream: MediaStream | null;
    userName: string;
    isLocal?: boolean;
    isMuted?: boolean;
    hasVideo?: boolean;
    isScreenSharing?: boolean;
    connectionState?: RTCPeerConnectionState | 'no-connection' | 'no-media';
}

interface ParticipantConnectionInfo {
    connectionState: RTCPeerConnectionState | 'no-connection' | 'no-media';
    hasConnection: boolean;
    stream: MediaStream | null;
    isConnecting: boolean;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

const getConnectionStatusColor = (
    connectionState: RTCPeerConnectionState | 'no-connection' | 'no-media',
    isLocal: boolean = false
): string => {
    if (isLocal) return 'bg-blue-500';

    switch (connectionState) {
        case 'connected': return 'bg-green-500';
        case 'connecting': return 'bg-yellow-500';
        case 'new': return 'bg-blue-500';
        case 'no-connection': return 'bg-orange-500';
        case 'no-media': return 'bg-gray-500';
        case 'disconnected':
        case 'failed': return 'bg-red-500';
        default: return 'bg-gray-400';
    }
};

const getConnectionStatusText = (
    connectionState: RTCPeerConnectionState | 'no-connection' | 'no-media',
    isLocal: boolean = false,
    hasMedia: boolean = true
): string => {
    if (isLocal) return 'You';
    if (!hasMedia) return 'No media';

    switch (connectionState) {
        case 'connected': return 'Connected';
        case 'connecting': return 'Connecting...';
        case 'new': return 'Establishing...';
        case 'no-connection': return 'Waiting...';
        case 'no-media': return 'No media';
        case 'disconnected': return 'Disconnected';
        case 'failed': return 'Failed';
        default: return 'Unknown';
    }
};

const getParticipantConnectionInfo = (participant: Participant): ParticipantConnectionInfo => {
    const peerConnection = webrtcStore.peerConnections.get(participant.socketId);

    if (peerConnection) {
        return {
            connectionState: peerConnection.connectionState,
            hasConnection: true,
            stream: peerConnection.remoteStream || null,
            isConnecting: ['connecting', 'new'].includes(peerConnection.connectionState)
        };
    }

    // Determine why there's no peer connection
    if (!webrtcStore.isMediaActive) {
        return {
            connectionState: 'no-media',
            hasConnection: false,
            stream: null,
            isConnecting: false
        };
    }

    // Media is active but no connection exists yet
    return {
        connectionState: 'no-connection',
        hasConnection: false,
        stream: null,
        isConnecting: true
    };
};

// ============================================================================
// VIDEO TILE COMPONENT
// ============================================================================

const VideoTile: React.FC<VideoTileProps> = ({
                                                 stream,
                                                 userName,
                                                 isLocal = false,
                                                 isMuted = false,
                                                 hasVideo = true,
                                                 isScreenSharing = false,
                                                 connectionState = 'no-connection'
                                             }) => {
    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        if (videoRef.current && stream) {
            videoRef.current.srcObject = stream;
        } else if (videoRef.current && !stream) {
            videoRef.current.srcObject = null;
        }
    }, [stream]);

    const showVideo = stream && hasVideo;
    const statusColor = getConnectionStatusColor(connectionState, isLocal);
    const statusText = getConnectionStatusText(connectionState, isLocal, webrtcStore.isMediaActive);

    return (
        <div className="relative bg-gray-900 rounded-lg overflow-hidden aspect-video">
            {/* Video Element or Placeholder */}
            {showVideo ? (
                <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted={isLocal || isMuted}
                    className="w-full h-full object-cover"
                />
            ) : (
                <div className="w-full h-full flex items-center justify-center bg-gray-800">
                    <div className="text-center">
                        <div className="w-16 h-16 bg-gray-600 rounded-full flex items-center justify-center mx-auto mb-2">
                            <span className="text-white text-xl font-semibold">
                                {userName.charAt(0).toUpperCase()}
                            </span>
                        </div>
                        <p className="text-white text-sm">{userName}</p>
                        <p className="text-gray-300 text-xs mt-1">
                            {hasVideo ? 'Camera off' : 'No video'}
                        </p>
                    </div>
                </div>
            )}

            {/* Connection Status Overlay */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${statusColor} ${
                            connectionState === 'connecting' || connectionState === 'no-connection'
                                ? 'animate-pulse' : ''
                        }`}></div>
                        <span className="text-white text-xs font-medium">
                            {userName}
                        </span>
                    </div>
                    <span className="text-white text-xs opacity-75">
                        {statusText}
                    </span>
                </div>
            </div>

            {/* Media Status Icons */}
            <div className="absolute top-2 right-2 flex gap-1">
                {!hasVideo && (
                    <div className="bg-red-500 bg-opacity-90 p-1 rounded" title="Video disabled">
                        <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A2 2 0 0017 14V6a2 2 0 00-2-2H5.414l-1.707-1.707zM5.414 6L15 15.586V14a1 1 0 112 0v4a1 1 0 01-1 1H4a1 1 0 01-1-1V6h2.414z" clipRule="evenodd" />
                        </svg>
                    </div>
                )}
                {isMuted && (
                    <div className="bg-red-500 bg-opacity-90 p-1 rounded" title="Audio muted">
                        <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM15.657 6.343a1 1 0 011.414 0L19 8.272l1.929-1.929a1 1 0 111.414 1.414L20.414 9.686l1.929 1.929a1 1 0 01-1.414 1.414L19 11.1l-1.929 1.929a1 1 0 01-1.414-1.414l1.929-1.929-1.929-1.929a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                    </div>
                )}
                {isScreenSharing && (
                    <div className="bg-blue-500 bg-opacity-90 p-1 rounded" title="Screen sharing">
                        <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 011 1v8a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm2 1v6h10V5H5z" clipRule="evenodd" />
                            <path d="M8 15v1h4v-1H8z" />
                            <path d="M6 16h8v1H6v-1z" />
                        </svg>
                    </div>
                )}
            </div>

            {/* Loading Indicator for Connecting States */}
            {(connectionState === 'connecting' || connectionState === 'no-connection') && (
                <div className="absolute top-2 left-2">
                    <div className="bg-yellow-500 bg-opacity-90 p-1 rounded">
                        <svg className="w-4 h-4 text-white animate-spin" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H8a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H12a1 1 0 110-2h4a1 1 0 011 1v4a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                        </svg>
                    </div>
                </div>
            )}
        </div>
    );
};

// ============================================================================
// MAIN VIDEO GRID COMPONENT
// ============================================================================

const VideoGrid: React.FC = observer(() => {
    const localParticipant = roomStore.currentParticipant;
    const connectedParticipants = roomStore.connectedParticipants.filter(
        p => p.socketId !== localParticipant?.socketId
    );

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-800">Video Conference</h3>
                <div className="text-sm text-gray-600">
                    {roomStore.participantCount} participant{roomStore.participantCount !== 1 ? 's' : ''}
                </div>
            </div>

            {/* Video Grid */}
            <div className={`grid gap-4 ${
                connectedParticipants.length === 0 ? 'grid-cols-1' :
                    connectedParticipants.length === 1 ? 'grid-cols-1 md:grid-cols-2' :
                        connectedParticipants.length <= 4 ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-2' :
                            'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
            }`}>
                {/* Local Video */}
                {webrtcStore.localStream && (
                    <VideoTile
                        stream={webrtcStore.localStream}
                        userName={localParticipant?.userName || 'You'}
                        isLocal={true}
                        hasVideo={webrtcStore.hasVideo}
                        isMuted={!webrtcStore.hasAudio}
                        isScreenSharing={webrtcStore.isScreenSharing}
                    />
                )}

                {/* Remote Videos */}
                {connectedParticipants.map((participant) => {
                    const connectionInfo = getParticipantConnectionInfo(participant);

                    return (
                        <VideoTile
                            key={participant.socketId}
                            stream={connectionInfo.stream}
                            userName={participant.userName}
                            hasVideo={participant.mediaStatus.hasVideo}
                            connectionState={connectionInfo.connectionState}
                        />
                    );
                })}
            </div>

            {/* Status Information */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Connection Status Panel */}
                {webrtcStore.isMediaActive && connectedParticipants.length > 0 && (
                    <div className="p-4 bg-gray-50 rounded-lg">
                        <h4 className="text-sm font-medium text-gray-800 mb-3">Connection Status</h4>

                        {/* Overall Statistics */}
                        <div className="grid grid-cols-2 gap-4 mb-3 text-sm">
                            <div className="text-center p-2 bg-white rounded">
                                <div className="text-lg font-bold text-blue-600">
                                    {webrtcStore.peerConnections.size}
                                </div>
                                <div className="text-gray-600">Total Connections</div>
                            </div>
                            <div className="text-center p-2 bg-white rounded">
                                <div className="text-lg font-bold text-green-600">
                                    {webrtcStore.connectedPeersCount}
                                </div>
                                <div className="text-gray-600">Connected</div>
                            </div>
                        </div>

                        {/* Individual Connection Status */}
                        <div className="space-y-2">
                            {connectedParticipants.map((participant) => {
                                const connectionInfo = getParticipantConnectionInfo(participant);
                                const statusColor = getConnectionStatusColor(connectionInfo.connectionState);
                                const statusText = getConnectionStatusText(
                                    connectionInfo.connectionState,
                                    false,
                                    webrtcStore.isMediaActive
                                );

                                return (
                                    <div key={participant.socketId} className="flex items-center justify-between text-xs bg-white p-2 rounded">
                                        <div className="flex items-center gap-2">
                                            <div className={`w-2 h-2 rounded-full ${statusColor} ${
                                                connectionInfo.isConnecting ? 'animate-pulse' : ''
                                            }`}></div>
                                            <span className="text-gray-800 truncate max-w-[120px]">
                                                {participant.userName}
                                            </span>
                                        </div>
                                        <span className={`font-medium ${
                                            connectionInfo.connectionState === 'connected' ? 'text-green-600' :
                                                connectionInfo.isConnecting ? 'text-yellow-600' :
                                                    connectionInfo.connectionState === 'no-media' ? 'text-gray-500' :
                                                        'text-red-600'
                                        }`}>
                                            {statusText}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Retry Information */}
                        {webrtcStore.activeRetryCount > 0 && (
                            <div className="mt-3 pt-3 border-t border-gray-200">
                                <div className="flex items-center gap-2 text-xs text-yellow-600">
                                    <svg className="w-3 h-3 animate-spin" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H8a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H12a1 1 0 110-2h4a1 1 0 011 1v4a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                                    </svg>
                                    <span>Retrying {webrtcStore.activeRetryCount} connection(s)...</span>
                                </div>
                            </div>
                        )}

                        {/* ICE Candidates Information */}
                        {webrtcStore.pendingCandidatesCount > 0 && (
                            <div className="mt-2 text-xs text-blue-600">
                                <span>Buffering {webrtcStore.pendingCandidatesCount} ICE candidate(s)...</span>
                            </div>
                        )}
                    </div>
                )}

                {/* Diagnostics Panel */}
                {webrtcStore.isMediaActive && (
                    <div className="p-4 bg-blue-50 rounded-lg">
                        <h4 className="text-sm font-medium text-blue-800 mb-3">Media Information</h4>

                        <div className="space-y-2 text-xs">
                            <div className="flex justify-between">
                                <span className="text-blue-700">Local Media:</span>
                                <span className="font-medium text-blue-800">
                                    {webrtcStore.isScreenSharing ? 'Screen Share' : 'Camera'}
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-blue-700">Video:</span>
                                <span className={`font-medium ${webrtcStore.hasVideo ? 'text-green-600' : 'text-red-600'}`}>
                                    {webrtcStore.hasVideo ? 'On' : 'Off'}
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-blue-700">Audio:</span>
                                <span className={`font-medium ${webrtcStore.hasAudio ? 'text-green-600' : 'text-red-600'}`}>
                                    {webrtcStore.hasAudio ? 'On' : 'Off'}
                                </span>
                            </div>

                            {/* Stream Information */}
                            {webrtcStore.localStream && (
                                <div className="pt-2 border-t border-blue-200">
                                    <div className="flex justify-between">
                                        <span className="text-blue-700">Video Tracks:</span>
                                        <span className="font-medium text-blue-800">
                                            {webrtcStore.localStream.getVideoTracks().length}
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-blue-700">Audio Tracks:</span>
                                        <span className="font-medium text-blue-800">
                                            {webrtcStore.localStream.getAudioTracks().length}
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Empty State Messages */}
            {!webrtcStore.isMediaActive && (
                <div className="mt-4 p-6 bg-yellow-50 border border-yellow-200 rounded-lg text-center">
                    <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg className="w-8 h-8 text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
                        </svg>
                    </div>
                    <h4 className="text-lg font-medium text-yellow-800 mb-2">Ready to Start Video Chat</h4>
                    <p className="text-sm text-yellow-700">
                        Click "Start Camera" in the media controls to begin video chat with other participants.
                    </p>
                </div>
            )}

            {connectedParticipants.length === 0 && webrtcStore.isMediaActive && (
                <div className="mt-4 p-6 bg-blue-50 border border-blue-200 rounded-lg text-center">
                    <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg className="w-8 h-8 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM5 8a2 2 0 012-2h6a2 2 0 012 2v6a2 2 0 01-2 2H7a2 2 0 01-2-2V8z" />
                        </svg>
                    </div>
                    <h4 className="text-lg font-medium text-blue-800 mb-2">Waiting for Participants</h4>
                    <p className="text-sm text-blue-700">
                        You're ready to video chat! Share the room ID with others so they can join.
                    </p>
                    {roomStore.currentRoom && (
                        <div className="mt-3 p-2 bg-white rounded border">
                            <p className="text-xs text-gray-600">Room ID:</p>
                            <p className="font-mono font-bold text-blue-800">{roomStore.currentRoom.id}</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
});

export default VideoGrid;