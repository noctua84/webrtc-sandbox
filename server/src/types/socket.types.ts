import {Server, Socket} from "socket.io";

export type SocketConnectionContext = {
    socket: Socket
    io: Server
    connectionTime: Date
    connectionId: string
}