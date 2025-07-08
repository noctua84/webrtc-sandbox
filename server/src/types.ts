// Types for the WebRTC signaling server
// Participant
export interface Participant {
    socketId: string;
    userName: string;
    isCreator: boolean;
    joinedAt: string;
    lastSeen: string;
    isConnected: boolean;
    reconnectionToken?: string;
    mediaStatus: {
        hasVideo: boolean;
        hasAudio: boolean;
        isScreenSharing: boolean;
    };
}

// Room types
export interface Room {
    id: string;
    creator: string;
    participants: Map<string, Participant>;
    createdAt: string;
    lastActivity: string;
    maxParticipants: number;
    timeoutDuration: number;
    isActive: boolean;
}

export interface CreateRoomRequest {
    roomId?: string;
    userName: string;
    reconnectionToken?: string;
}

export interface JoinRoomRequest {
    roomId: string;
    userName: string;
    reconnectionToken?: string;
}

export interface ReconnectRoomRequest {
    roomId: string;
    reconnectionToken: string;
}

export interface GetRoomInfoRequest {
    roomId: string;
}

export interface LeaveRoomRequest {
    roomId: string;
}

// WebRTC Signaling Types
export type RTCSdpType = 'offer' | 'answer' | 'pranswer' | 'rollback';

export interface RTCSessionDescriptionInit {
    type: RTCSdpType;
    sdp?: string;
}

export interface RTCIceCandidateInit {
    candidate?: string;
    sdpMLineIndex?: number | null;
    sdpMid?: string | null;
    usernameFragment?: string | null;
}

export interface WebRTCOffer {
    roomId: string;
    targetParticipantId: string;
    sdp: RTCSessionDescriptionInit;
}

export interface WebRTCAnswer {
    roomId: string;
    targetParticipantId: string;
    sdp: RTCSessionDescriptionInit;
}

export interface WebRTCIceCandidate {
    roomId: string;
    targetParticipantId: string;
    candidate: RTCIceCandidateInit;
}

export interface MediaStatusUpdate {
    roomId: string;
    hasVideo: boolean;
    hasAudio: boolean;
    isScreenSharing: boolean;
}

export interface RoomResponse {
    id: string;
    createdAt: string;
    lastActivity: string;
    participantCount: number;
    maxParticipants: number;
    isActive: boolean;
    timeoutDuration: number;
}

export interface CreateRoomResponse {
    success: boolean;
    room: RoomResponse;
    participant: Participant;
    reconnectionToken: string;
}

export interface JoinRoomResponse {
    success: boolean;
    room: RoomResponse;
    participant: Participant;
    participants: Participant[];
    reconnectionToken: string;
}

export interface ReconnectRoomResponse {
    success: boolean;
    room: RoomResponse;
    participant: Participant;
    participants: Participant[];
}

export interface GetRoomInfoResponse {
    success: boolean;
    room: RoomResponse;
    participants: Participant[];
}

export interface LeaveRoomResponse {
    success: boolean;
}

export interface ErrorResponse {
    success: boolean;
    error: string;
}

export type ApiResponse<T = any> = T | ErrorResponse;

export interface RoomUpdateEvent {
    roomId: string;
    participants: Participant[];
    event: 'participant-joined' | 'participant-left' | 'participant-reconnected' | 'participant-disconnected' | 'media-status-changed';
    participant?: Participant;
    leftParticipantId?: string;
}

export interface HealthStatus {
    status: 'healthy';
    timestamp: string;
    uptime: number;
    rooms: number;
    activeRooms: number;
    totalParticipants: number;
    connectedParticipants: number;
}

export interface RoomsInfo {
    rooms: RoomResponse[];
    activeRooms: RoomResponse[];
}

export interface AddParticipantResult {
    success: boolean;
    error?: string;
    room?: Room;
    participant?: Participant;
    isReconnection?: boolean;
}

export interface RemoveParticipantResult {
    roomId: string;
    room: Room | null;
    wasConnected: boolean;
}

export interface ReconnectionAttempt {
    socketId: string;
    roomId: string;
    reconnectionToken: string;
    userName: string;
    timestamp: string;
}

// Log levels for structured logging
export type LogLevel = 'info' | 'success' | 'warning' | 'error';

export interface LogData {
    [key: string]: any;
}

// Socket.IO event types
export interface ServerToClientEvents {
    'room-updated': (data: RoomUpdateEvent) => void;
    'reconnection-available': (data: { roomId: string; timeLeft: number }) => void;
    'webrtc-offer': (data: WebRTCOffer) => void;
    'webrtc-answer': (data: WebRTCAnswer) => void;
    'webrtc-ice-candidate': (data: WebRTCIceCandidate) => void;
    'peer-disconnected': (data: { roomId: string; participantId: string }) => void;

    // Chat events
    'chat-message': (data: ChatMessage) => void;
    'chat-message-edited': (data: ChatMessage) => void;
    'chat-message-deleted': (data: { roomId: string; messageId: string }) => void;
    'chat-typing': (data: { roomId: string; userId: string; userName: string; isTyping: boolean }) => void;
    'chat-history': (data: { roomId: string; messages: ChatMessage[] }) => void;
}

export interface ClientToServerEvents {
    'create-room': (data: CreateRoomRequest, callback: (response: ApiResponse<CreateRoomResponse>) => void) => void;
    'join-room': (data: JoinRoomRequest, callback: (response: ApiResponse<JoinRoomResponse>) => void) => void;
    'reconnect-room': (data: ReconnectRoomRequest, callback: (response: ApiResponse<ReconnectRoomResponse>) => void) => void;
    'get-room-info': (data: GetRoomInfoRequest, callback: (response: ApiResponse<GetRoomInfoResponse>) => void) => void;
    'leave-room': (data: LeaveRoomRequest, callback: (response: ApiResponse<LeaveRoomResponse>) => void) => void;
    'webrtc-offer': (data: WebRTCOffer, callback: (response: ApiResponse<{ success: boolean }>) => void) => void;
    'webrtc-answer': (data: WebRTCAnswer, callback: (response: ApiResponse<{ success: boolean }>) => void) => void;
    'webrtc-ice-candidate': (data: WebRTCIceCandidate, callback: (response: ApiResponse<{ success: boolean }>) => void) => void;
    'update-media-status': (data: MediaStatusUpdate, callback: (response: ApiResponse<{ success: boolean }>) => void) => void;

    // Chat events
    'send-message': (data: SendMessageRequest, callback: (response: ApiResponse<SendMessageResponse>) => void) => void;
    'edit-message': (data: EditMessageRequest, callback: (response: ApiResponse<EditMessageResponse>) => void) => void;
    'delete-message': (data: DeleteMessageRequest, callback: (response: ApiResponse<DeleteMessageResponse>) => void) => void;
    'typing-indicator': (data: TypingIndicatorRequest, callback: (response: ApiResponse<TypingIndicatorResponse>) => void) => void;
    'get-chat-history': (data: { roomId: string }, callback: (response: ApiResponse<{ messages: ChatMessage[] }>) => void) => void;

}

export interface InterServerEvents {
    // No inter-server events for this implementation
}

export interface SocketData {
    // No additional socket data for this implementation
}

// Handler Types for Socket.IO
export interface SocketHandler {
    setupHandlers(socket: Socket): void;
}

export interface Socket {
    id: string;
    join(room: string): void;
    leave(room: string): void;
    to(room: string): any;
    emit(event: string, ...args: any[]): void;
    on(event: string, handler: (...args: any[]) => void): void;
    disconnect(): void;
}

// Chat message types
export interface ChatMessage {
    id: string;
    roomId: string;
    senderId: string;
    senderName: string;
    content: string;
    timestamp: string;
    type: 'text' | 'system' | 'emoji' | 'file';
    edited?: boolean | undefined;
    editedAt?: string | undefined;
    replyTo?: string | undefined;
}

export interface SendMessageRequest {
    roomId: string;
    content: string;
    type?: 'text' | 'emoji';
    replyTo?: string;
}

export interface SendMessageResponse {
    success: true;
    message: ChatMessage;
}

export interface EditMessageRequest {
    roomId: string;
    messageId: string;
    newContent: string;
}

export interface EditMessageResponse {
    success: true;
    message: ChatMessage;
}

export interface DeleteMessageRequest {
    roomId: string;
    messageId: string;
}

export interface DeleteMessageResponse {
    success: true;
    messageId: string;
}

export interface TypingIndicatorRequest {
    roomId: string;
    isTyping: boolean;
}

export interface TypingIndicatorResponse {
    success: true;
}
