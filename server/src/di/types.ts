import {Server, Socket} from "socket.io";
import {getConfig} from "../config";
import {PrismaClient} from "@prisma/client";
import {ServerLogger} from "../logger";
import {MetricsCollector} from "../metrics/collector";
import {MessageRepository} from "../db/repository/chat.repository";
import joi from "joi";
import {RoomManager} from "../room/manager";

/**
 * ServiceRegistry interface defines the structure for the service registry
 * to provide type safety for services used in the application, specifically in tha app-container.ts file.
 */
export interface ServiceRegistry {
    // socket io:
    socket?: () => Socket
    io?: () => Server

    // core services:
    config: () => ReturnType<typeof getConfig>;
    logger: () => ServerLogger
    metrics: () => MetricsCollector

    // validation:
    schemas: () => {
        // Define your validation schemas here
        // For example:
        // userSchema: any
        // messageSchema: any
        sendMessage: joi.Schema,
        editMessage: joi.Schema,
        deleteMessage: joi.Schema,
        typingIndicator: joi.Schema,
        addReaction: joi.Schema,
        removeReaction: joi.Schema,
    }

    // database:
    prisma: () => PrismaClient

    // Add other services here as needed to provide type safety.
    // The actual services will be registered in the app-container.ts file.
    // For example:
    // chatService?: () => ChatService
    messageRepository: () => MessageRepository
    roomManager: RoomManager

}