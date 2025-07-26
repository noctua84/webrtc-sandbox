import {
    ApiResponse,
    CreateRoomResponse,
    GetRoomInfoResponse,
    JoinRoomResponse,
    LeaveRoomResponse,
    MediaStatusUpdate,
    ReconnectRoomResponse,
    RoomUpdateEvent,
    WebRTCAnswer,
    WebRTCIceCandidate,
    WebRTCOffer
} from "./webrtc.types";
import {
    CreateRoomRequest,
    GetRoomInfoRequest,
    JoinRoomRequest,
    LeaveRoomRequest,
    ReconnectRoomRequest
} from "./room.types";
import {
    AddReactionRequest,
    AddReactionResponse,
    ChatMessage,
    DeleteMessageRequest,
    DeleteMessageResponse,
    EditMessageRequest,
    EditMessageResponse,
    RemoveReactionRequest,
    RemoveReactionResponse,
    SendMessageRequest,
    SendMessageResponse,
    TypingIndicatorRequest,
    TypingIndicatorResponse
} from "./chat.types";

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
    'chat-reaction-added': (data: AddReactionResponse) => void;
    'chat-reaction-removed': (data: RemoveReactionResponse) => void;
    'chat-system-message': (data: ChatMessage) => void; // For system messages

    // Server events
    'server-error': (error: any) => void;
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
    'add-reaction': (data: AddReactionRequest, callback: (response: ApiResponse<AddReactionResponse>) => void ) => void;
    'remove-reaction': (data: RemoveReactionRequest, callback: (response: ApiResponse<RemoveReactionResponse>) => void) => void;
}