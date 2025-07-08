import {ErrorResponse} from "@/types/connection.types";
import {MediaStatusUpdate, WebRTCAnswer, WebRTCIceCandidate, WebRTCOffer} from "@/types/webrtc.types";
import {
    CreateRoomRequest,
    CreateRoomResponse, GetRoomInfoRequest, GetRoomInfoResponse,
    JoinRoomRequest,
    JoinRoomResponse,
    ReconnectRoomRequest, ReconnectRoomResponse
} from "@/types/room.types";
import {
    ChatMessage, DeleteMessageRequest, DeleteMessageResponse,
    EditMessageRequest,
    EditMessageResponse,
    SendMessageRequest,
    SendMessageResponse, TypingIndicatorRequest, TypingIndicatorResponse
} from "@/types/chat.types";
import {Participant} from "@/types/participant.types";

export type ApiResponse<T = any> = T | ErrorResponse;

export type RoomUpdateEvent = {
    roomId: string;
    participants: Participant[];
    event: 'participant-joined' | 'participant-left' | 'participant-reconnected' | 'participant-disconnected' | 'media-status-changed';
    participant?: Participant;
    leftParticipantId?: string;
}

export type ReconnectionAvailableEvent = {
    roomId: string;
    timeLeft: number;
}

// Socket.IO event types for client
interface ServerToClientEvents {
    'room-updated': (data: RoomUpdateEvent) => void;
    'reconnection-available': (data: ReconnectionAvailableEvent) => void;
    'webrtc-offer': (data: WebRTCOffer) => void;
    'webrtc-answer': (data: WebRTCAnswer) => void;// Shared types for the WebRTC UI client
    'webrtc-ice-candidate': (data: WebRTCIceCandidate) => void;
    'peer-disconnected': (data: { roomId: string; participantId: string }) => void;
}

interface ClientToServerEvents {
    'create-room': (data: CreateRoomRequest, callback: (response: ApiResponse<CreateRoomResponse>) => void) => void;
    'join-room': (data: JoinRoomRequest, callback: (response: ApiResponse<JoinRoomResponse>) => void) => void;
    'reconnect-room': (data: ReconnectRoomRequest, callback: (response: ApiResponse<ReconnectRoomResponse>) => void) => void;
    'get-room-info': (data: GetRoomInfoRequest, callback: (response: ApiResponse<GetRoomInfoResponse>) => void) => void;
    'leave-room': (data: { roomId: string }, callback: (response: ApiResponse<{ success: true }>) => void) => void;
    'webrtc-offer': (data: WebRTCOffer, callback: (response: ApiResponse<{ success: true }>) => void) => void;
    'webrtc-answer': (data: WebRTCAnswer, callback: (response: ApiResponse<{ success: true }>) => void) => void;
    'webrtc-ice-candidate': (data: WebRTCIceCandidate, callback: (response: ApiResponse<{ success: true }>) => void) => void;
    'update-media-status': (data: MediaStatusUpdate, callback: (response: ApiResponse<{ success: true }>) => void) => void;
}

// Server → Client events for chat
interface ChatServerToClientEvents {
    'chat-message': (data: ChatMessage) => void;
    'chat-message-edited': (data: ChatMessage) => void;
    'chat-message-deleted': (data: { roomId: string; messageId: string }) => void;
    'chat-typing': (data: { roomId: string; userId: string; userName: string; isTyping: boolean }) => void;
    'chat-history': (data: { roomId: string; messages: ChatMessage[] }) => void;
}

// Client → Server events for chat
interface ChatClientToServerEvents {
    'send-message': (data: SendMessageRequest, callback: (response: ApiResponse<SendMessageResponse>) => void) => void;
    'edit-message': (data: EditMessageRequest, callback: (response: ApiResponse<EditMessageResponse>) => void) => void;
    'delete-message': (data: DeleteMessageRequest, callback: (response: ApiResponse<DeleteMessageResponse>) => void) => void;
    'typing-indicator': (data: TypingIndicatorRequest, callback: (response: ApiResponse<TypingIndicatorResponse>) => void) => void;
    'get-chat-history': (data: { roomId: string }, callback: (response: ApiResponse<{ messages: ChatMessage[] }>) => void) => void;
}

// Extended Socket.IO events (add to existing types)
export interface ExtendedServerToClientEvents extends ServerToClientEvents, ChatServerToClientEvents {}
export interface ExtendedClientToServerEvents extends ClientToServerEvents, ChatClientToServerEvents {}