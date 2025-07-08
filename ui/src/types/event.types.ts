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
    AddReactionRequest, AddReactionResponse,
    ChatMessage, DeleteMessageRequest, DeleteMessageResponse,
    EditMessageRequest,
    EditMessageResponse, MessageReaction, RemoveReactionRequest, RemoveReactionResponse,
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
    isConnected?: boolean;
    isCreator?: boolean;
    socketId?: string;

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
export interface ChatServerToClientEvents {
    'chat-message': (data: ChatMessage) => void;
    'chat-message-edited': (data: ChatMessage) => void;
    'chat-message-deleted': (data: { roomId: string; messageId: string }) => void;
    'chat-typing': (data: { roomId: string; userId: string; userName: string; isTyping: boolean }) => void;
    'chat-history': (data: { roomId: string; messages: ChatMessage[] }) => void;
    'chat-reaction-added': (data: { roomId: string; messageId: string; reaction: MessageReaction }) => void;    // NEW
    'chat-reaction-removed': (data: { roomId: string; messageId: string; emoji: string; userId: string }) => void; // NEW
    'chat-system-message': (data: ChatMessage) => void;  // NEW
}

// Client → Server events for chat
export interface ChatClientToServerEvents {
    'send-message': (data: SendMessageRequest, callback: (response: ApiResponse<SendMessageResponse>) => void) => void;
    'edit-message': (data: EditMessageRequest, callback: (response: ApiResponse<EditMessageResponse>) => void) => void;
    'delete-message': (data: DeleteMessageRequest, callback: (response: ApiResponse<DeleteMessageResponse>) => void) => void;
    'typing-indicator': (data: TypingIndicatorRequest, callback: (response: ApiResponse<TypingIndicatorResponse>) => void) => void;
    'get-chat-history': (data: { roomId: string }, callback: (response: ApiResponse<{ messages: ChatMessage[] }>) => void) => void;
    'add-reaction': (data: AddReactionRequest, callback: (response: ApiResponse<AddReactionResponse>) => void) => void;        // NEW
    'remove-reaction': (data: RemoveReactionRequest, callback: (response: ApiResponse<RemoveReactionResponse>) => void) => void; // NEW
}

// Extended Socket.IO events (add to existing types)
export interface ExtendedServerToClientEvents extends ServerToClientEvents, ChatServerToClientEvents {}
export interface ExtendedClientToServerEvents extends ClientToServerEvents, ChatClientToServerEvents {}