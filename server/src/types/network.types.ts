export type TurnServerCredentials = {
    username: string;
    password: string;
    ttl?: number; // Time to live in seconds
    urls: string[]; // List of TURN and STUN server URLs
}