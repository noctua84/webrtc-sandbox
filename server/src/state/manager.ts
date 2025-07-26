import Redis from "ioredis";
import {ParticipantState, PeerConnectionState, RoomState, TypingState} from "../types/state.types";

export class StateManager {
    private readonly redis: Redis;
    private localCache: Map<string, any> = new Map();
    private readonly TTL_PARTICIPANT = 300; // 5 minutes
    private readonly TTL_TYPING = 10; // 10 seconds
    private readonly TTL_ROOM_STATE = 60; // 1 minute
    private readonly TTL_PEER_CONNECTION = 120; // 2 minutes

    constructor(redisUrl?: string, useLocalCache = false) {
        if (redisUrl && !useLocalCache) {
            this.redis = new Redis(redisUrl);
        } else {
            // Fallback to in-memory for development or when Redis unavailable
            console.warn('Using in-memory storage for states - not recommended for production');
            this.redis = null as any;
        }
    }

    // ================================
    // Participant State Management
    // ================================

    async setParticipantState(state: ParticipantState): Promise<void> {
        const key = `participant:${state.socketId}`;
        const data = {
            ...state,
            lastSeen: state.lastSeen.toISOString()
        };

        if (this.redis) {
            await this.redis.setex(key, this.TTL_PARTICIPANT, JSON.stringify(data));
            // Also index by room for efficient room queries
            await this.redis.sadd(`room:${state.roomId}:participants`, state.socketId);
            await this.redis.expire(`room:${state.roomId}:participants`, this.TTL_ROOM_STATE);
        } else {
            this.localCache.set(key, { ...data, _expires: Date.now() + (this.TTL_PARTICIPANT * 1000) });
        }
    }

    async getParticipantState(socketId: string): Promise<ParticipantState | null> {
        const key = `participant:${socketId}`;

        if (this.redis) {
            const data = await this.redis.get(key);
            if (!data) return null;

            const parsed = JSON.parse(data);
            return {
                ...parsed,
                lastSeen: new Date(parsed.lastSeen)
            };
        } else {
            const cached = this.localCache.get(key);
            if (!cached || cached._expires < Date.now()) {
                this.localCache.delete(key);
                return null;
            }

            const { _expires, ...data } = cached;
            return {
                ...data,
                lastSeen: new Date(data.lastSeen)
            };
        }
    }

    async getRoomParticipants(roomId: string): Promise<ParticipantState[]> {
        if (this.redis) {
            const socketIds = await this.redis.smembers(`room:${roomId}:participants`);
            const states = await Promise.all(
                socketIds.map(socketId => this.getParticipantState(socketId))
            );
            return states.filter(Boolean) as ParticipantState[];
        } else {
            // In-memory fallback - less efficient but works
            const participants: ParticipantState[] = [];
            for (const [key, value] of this.localCache.entries()) {
                if (key.startsWith('participant:') && value.roomId === roomId) {
                    if (value._expires > Date.now()) {
                        const { _expires, ...data } = value;
                        participants.push({
                            ...data,
                            lastSeen: new Date(data.lastSeen)
                        });
                    }
                }
            }
            return participants;
        }
    }

    async removeParticipantState(socketId: string): Promise<void> {
        // Get the participant state to know which room to clean up
        const state = await this.getParticipantState(socketId);

        if (this.redis) {
            await this.redis.del(`participant:${socketId}`);
            if (state) {
                await this.redis.srem(`room:${state.roomId}:participants`, socketId);
            }
        } else {
            this.localCache.delete(`participant:${socketId}`);
        }
    }

    // ================================
    // Room State Management
    // ================================

    async setRoomState(state: RoomState): Promise<void> {
        const key = `room:${state.id}:state`;
        const data = {
            ...state,
            lastActivity: state.lastActivity.toISOString()
        };

        if (this.redis) {
            await this.redis.setex(key, this.TTL_ROOM_STATE, JSON.stringify(data));
        } else {
            this.localCache.set(key, { ...data, _expires: Date.now() + (this.TTL_ROOM_STATE * 1000) });
        }
    }

    async getRoomState(roomId: string): Promise<RoomState | null> {
        const key = `room:${roomId}:state`;

        if (this.redis) {
            const data = await this.redis.get(key);
            if (!data) return null;

            const parsed = JSON.parse(data);
            return {
                ...parsed,
                lastActivity: new Date(parsed.lastActivity)
            };
        } else {
            const cached = this.localCache.get(key);
            if (!cached || cached._expires < Date.now()) {
                this.localCache.delete(key);
                return null;
            }

            const { _expires, ...data } = cached;
            return {
                ...data,
                lastActivity: new Date(data.lastActivity)
            };
        }
    }

    // ================================
    // Typing Indicators
    // ================================

    async setTypingState(state: TypingState): Promise<void> {
        const key = `typing:${state.roomId}:${state.participantId}`;
        const data = {
            ...state,
            lastUpdate: state.lastUpdate.toISOString()
        };

        if (this.redis) {
            if (state.isTyping) {
                await this.redis.setex(key, this.TTL_TYPING, JSON.stringify(data));
                await this.redis.sadd(`room:${state.roomId}:typing`, state.participantId);
                await this.redis.expire(`room:${state.roomId}:typing`, this.TTL_TYPING);
            } else {
                await this.redis.del(key);
                await this.redis.srem(`room:${state.roomId}:typing`, state.participantId);
            }
        } else {
            if (state.isTyping) {
                this.localCache.set(key, { ...data, _expires: Date.now() + (this.TTL_TYPING * 1000) });
            } else {
                this.localCache.delete(key);
            }
        }
    }

    async getRoomTypingStates(roomId: string): Promise<TypingState[]> {
        if (this.redis) {
            const participantIds = await this.redis.smembers(`room:${roomId}:typing`);
            const states = await Promise.all(
                participantIds.map(async (participantId) => {
                    const key = `typing:${roomId}:${participantId}`;
                    const data = await this.redis.get(key);
                    if (data) {
                        const parsed = JSON.parse(data);
                        return {
                            ...parsed,
                            lastUpdate: new Date(parsed.lastUpdate)
                        };
                    }
                    return null;
                })
            );
            return states.filter(Boolean) as TypingState[];
        } else {
            const typingStates: TypingState[] = [];
            for (const [key, value] of this.localCache.entries()) {
                if (key.startsWith(`typing:${roomId}:`) && value._expires > Date.now()) {
                    const { _expires, ...data } = value;
                    typingStates.push({
                        ...data,
                        lastUpdate: new Date(data.lastUpdate)
                    });
                }
            }
            return typingStates;
        }
    }

    // ================================
    // Peer Connection States
    // ================================

    async setPeerConnectionState(state: PeerConnectionState): Promise<void> {
        const key = `peer:${state.roomId}:${state.initiatorId}:${state.targetId}`;
        const data = {
            ...state,
            lastActivity: state.lastActivity.toISOString()
        };

        if (this.redis) {
            await this.redis.setex(key, this.TTL_PEER_CONNECTION, JSON.stringify(data));
        } else {
            this.localCache.set(key, { ...data, _expires: Date.now() + (this.TTL_PEER_CONNECTION * 1000) });
        }
    }

    async getPeerConnectionState(
        roomId: string,
        initiatorId: string,
        targetId: string
    ): Promise<PeerConnectionState | null> {
        const key = `peer:${roomId}:${initiatorId}:${targetId}`;

        if (this.redis) {
            const data = await this.redis.get(key);
            if (!data) return null;

            const parsed = JSON.parse(data);
            return {
                ...parsed,
                lastActivity: new Date(parsed.lastActivity)
            };
        } else {
            const cached = this.localCache.get(key);
            if (!cached || cached._expires < Date.now()) {
                this.localCache.delete(key);
                return null;
            }

            const { _expires, ...data } = cached;
            return {
                ...data,
                lastActivity: new Date(data.lastActivity)
            };
        }
    }

    // ================================
    // Cleanup and Maintenance
    // ================================

    async cleanupExpiredStates(): Promise<void> {
        if (!this.redis) {
            // Clean up local cache
            const now = Date.now();
            for (const [key, value] of this.localCache.entries()) {
                if (value._expires && value._expires < now) {
                    this.localCache.delete(key);
                }
            }
        }
        // Redis handles expiration automatically
    }

    async getHealthStats(): Promise<{
        totalKeys: number;
        participantStates: number;
        roomStates: number;
        typingStates: number;
        peerStates: number;
    }> {
        if (this.redis) {
            const [participants, rooms, typing, peers] = await Promise.all([
                this.redis.keys('participant:*'),
                this.redis.keys('room:*:state'),
                this.redis.keys('typing:*'),
                this.redis.keys('peer:*')
            ]);

            return {
                totalKeys: participants.length + rooms.length + typing.length + peers.length,
                participantStates: participants.length,
                roomStates: rooms.length,
                typingStates: typing.length,
                peerStates: peers.length
            };
        } else {
            let participantStates = 0;
            let roomStates = 0;
            let typingStates = 0;
            let peerStates = 0;

            for (const key of this.localCache.keys()) {
                if (key.startsWith('participant:')) participantStates++;
                else if (key.includes(':state')) roomStates++;
                else if (key.startsWith('typing:')) typingStates++;
                else if (key.startsWith('peer:')) peerStates++;
            }

            return {
                totalKeys: this.localCache.size,
                participantStates,
                roomStates,
                typingStates,
                peerStates
            };
        }
    }

    async disconnect(): Promise<void> {
        if (this.redis) {
            this.redis.disconnect();
        }
        this.localCache.clear();
    }
}