import React, { useEffect, useRef } from 'react';
import { observer } from 'mobx-react-lite';
import roomStore from "@/stores/room.store.ts";
import webrtcStore from "@/stores/webrtc.store.ts";

interface VideoTileProps {
    stream: MediaStream | null;
    userName: string;
    isLocal?: boolean;
    isMuted?: boolean;
    hasVideo?: boolean;
    isScreenSharing?: boolean;
    connectionState?: RTCPeerConnectionState;
}

const VideoTile: React.FC<VideoTileProps> = ({
                                                 stream,
                                                 userName,
                                                 isLocal = false,
                                                 isMuted = false,
                                                 hasVideo = true,
                                                 connectionState
                                             }) => {
    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        if (videoRef.current && stream) {
            videoRef.current.srcObject = stream;
        }
    }, [stream]);

    const getConnectionStatusColor = () => {
        if (isLocal) return 'bg-green-500';

        switch (connectionState) {
            case 'connected':
                return 'bg-green-500';
            case 'connecting':
                return 'bg-yellow-500';
            case 'disconnected':
            case 'failed':
                return 'bg-red-500';
            default:
                return 'bg-gray-500';
        }
    };

    const getConnectionStatusText = () => {
        if (isLocal) return 'You';

        switch (connectionState) {
            case 'connected':
                return 'Connected';
            case 'connecting':
                return 'Connecting...';
            case 'disconnected':
                return 'Disconnected';
            case 'failed':
                return 'Connection Failed';
            default:
                return 'Unknown';
        }
    };

    return (
        <div className="relative bg-gray-900 rounded-lg overflow-hidden aspect-video">
            {/* Video Element */}
            {stream && hasVideo ? (
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
                        <p className="text-white text-sm">
                            {hasVideo ? 'No video' : 'Video disabled'}
                        </p>
                    </div>
                </div>
            )}

            {/* Overlay Information */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${getConnectionStatusColor()}`}></div>
                        <span className="text-white text-xs">
              {getConnectionStatusText()}
            </span>
                    </div>
                </div>
            </div>

            {/* Audio/Video Status Icons */}
            <div className="absolute top-2 right-2 flex gap-1">
                {!hasVideo && (
                    <div className="bg-red-500 p-1 rounded" title="Video disabled">
                        <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A2 2 0 0017 14V6a2 2 0 00-2-2H5.414l-1.707-1.707zM5.414 6L15 15.586V14a1 1 0 112 0v4a1 1 0 01-1 1H4a1 1 0 01-1-1V6h2.414z" clipRule="evenodd" />
                        </svg>
                    </div>
                )}
                {isMuted && (
                    <div className="bg-red-500 p-1 rounded" title="Audio muted">
                        <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM15.657 6.343a1 1 0 011.414 0L19 8.272l1.929-1.929a1 1 0 111.414 1.414L20.414 9.686l1.929 1.929a1 1 0 01-1.414 1.414L19 11.1l-1.929 1.929a1 1 0 01-1.414-1.414l1.929-1.929-1.929-1.929a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                    </div>
                )}
            </div>
        </div>
    );
};

const VideoGrid: React.FC = observer(() => {
    const localParticipant = roomStore.currentParticipant;
    const remotePeers = Array.from(webrtcStore.peerConnections.values());

    if (!roomStore.isInRoom) {
        return (
            <div className="bg-gray-100 rounded-lg p-8 text-center">
                <p className="text-gray-600">Join a room to start video chat</p>
            </div>
        );
    }

    const totalParticipants = 1 + remotePeers.length; // Local + remote

    // Determine grid layout based on participant count
    const getGridClass = () => {
        if (totalParticipants === 1) return 'grid-cols-1';
        if (totalParticipants === 2) return 'grid-cols-1 lg:grid-cols-2';
        if (totalParticipants <= 4) return 'grid-cols-1 lg:grid-cols-2';
        return 'grid-cols-1 lg:grid-cols-3';
    };

    return (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-800">
                    Video Chat ({totalParticipants} participant{totalParticipants !== 1 ? 's' : ''})
                </h3>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                    <div className="flex items-center gap-1">
                        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                        <span>{webrtcStore.connectedPeersCount} connected</span>
                    </div>
                </div>
            </div>

            <div className={`grid gap-4 ${getGridClass()}`}>
                {/* Local Video */}
                {localParticipant && (
                    <VideoTile
                        stream={webrtcStore.localStream}
                        userName={localParticipant.userName}
                        isLocal={true}
                        hasVideo={webrtcStore.hasVideo}
                        isScreenSharing={webrtcStore.isScreenSharing}
                    />
                )}

                {/* Remote Videos */}
                {remotePeers.map((peer) => (
                    <VideoTile
                        key={peer.participantId}
                        stream={peer.remoteStream || null}
                        userName={peer.userName}
                        hasVideo={true} // We'll assume remote has video if stream exists
                        connectionState={peer.connectionState}
                    />
                ))}

                {/* Placeholder for missing participants */}
                {roomStore.participants
                    .filter(p =>
                        p.isConnected &&
                        p.socketId !== localParticipant?.socketId &&
                        !webrtcStore.peerConnections.has(p.socketId)
                    )
                    .map((participant) => (
                        <div key={participant.socketId} className="relative bg-gray-200 rounded-lg overflow-hidden aspect-video">
                            <div className="w-full h-full flex items-center justify-center">
                                <div className="text-center">
                                    <div className="w-16 h-16 bg-gray-400 rounded-full flex items-center justify-center mx-auto mb-2">
                    <span className="text-white text-xl font-semibold">
                      {participant.userName.charAt(0).toUpperCase()}
                    </span>
                                    </div>
                                    <p className="text-gray-600 text-sm">{participant.userName}</p>
                                    <p className="text-gray-500 text-xs">Connecting...</p>
                                </div>
                            </div>
                        </div>
                    ))
                }
            </div>

            {/* No Media Message */}
            {!webrtcStore.isMediaActive && (
                <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <p className="text-sm text-yellow-700">
                        Click "Start Camera" to begin video chat with other participants.
                    </p>
                </div>
            )}
        </div>
    );
});

export default VideoGrid;