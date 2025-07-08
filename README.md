# WebRTC Video Streaming System

A WebRTC-based video streaming system built as a monorepo with React frontend and Node.js signaling server. This is a sandbox-focused implementation with extensive logging and error handling to understand WebRTC concepts and implement different aspects with extensive tooling.

## Project Structure

```
webrtc-streaming-monorepo/
├── ui/                     # React frontend with Vite
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── stores/         # MobX stores
│   │   └── main.jsx       # Entry point
│   ├── package.json
│   └── vite.config.js
├── server/                 # Node.js signaling server
│   ├── src/
│   │   └── server.js      # Socket.IO server
│   └── package.json
├── package.json           # Root package.json with workspaces
└── README.md
```

## Features

### Current Implementation (Phase 1)
- ✅ **Monorepo Setup**: Workspaces-based project structure
- ✅ **Signaling Server**: Socket.IO-based server for room management
- ✅ **Room Management**: Create and join rooms with participant tracking
- ✅ **Real-time Communication**: Socket.IO for signaling between clients
- ✅ **Detailed Logging**: Comprehensive logging on both client and server
- ✅ **Error Handling**: Robust error detection and user feedback
- ✅ **React UI**: Modern React app with Tailwind CSS styling
- ✅ **State Management**: MobX for reactive state management
- ✅ **WebRTC Peer Connections**: Direct peer-to-peer connections
- ✅ **Video Streaming**: Actual video capture and streaming
- ✅ **Audio Support**: Voice communication
- ✅ **Screen Sharing**: Desktop/application sharing
- ✅ **Chat**: Text messaging during video calls

### Planned Features (Future Phases)

- 🔄 **Recording**: Session recording capabilities

## Quick Start

### Prerequisites
- Node.js 18+
- npm 9+

### Installation and Setup

1. **Clone and install dependencies:**
```bash
# Install root dependencies and set up workspaces
npm run install:all
```

2. **Start development servers:**
```bash
# Start both UI and server concurrently
npm run dev

# Or start individually:
npm run dev:server  # Server only (port 3001)
npm run dev:ui      # UI only (port 5173)
```

3. **Open your browser:**
   - Frontend: http://localhost:5173
   - Server health: http://localhost:3001/health
   - Rooms info: http://localhost:3001/rooms

## How It Works

### Architecture Overview

1. **Signaling Server** (`server/`):
   - Manages WebRTC signaling using Socket.IO
   - Handles room creation, joining, and participant management
   - Tracks active rooms and participants
   - Provides health check and room info endpoints

2. **React Frontend** (`ui/`):
   - Modern React app with Vite for fast development
   - MobX for reactive state management
   - Tailwind CSS for styling
   - Real-time UI updates via Socket.IO

### Current Flow

1. **Connection**: UI connects to signaling server via Socket.IO
2. **Room Creation**: User creates a room with a username
3. **Room Joining**: Other users join using the room ID
4. **Participant Management**: Server tracks and broadcasts participant changes
5. **Real-time Updates**: All participants see live updates of room state

### Key Components

#### Server (`server/src/server.js`)
- **Room Management**: Create, join, leave rooms
- **Participant Tracking**: Monitor connections and disconnections
- **Event Broadcasting**: Notify participants of room changes
- **Error Handling**: Comprehensive error catching and logging

#### Frontend Stores
- **SocketStore**: Manages WebSocket connection and low-level communication
- **RoomStore**: Handles room state, participants, and room operations

#### React Components
- **RoomForm**: Create or join rooms
- **RoomInfo**: Display current room details and participants
- **LogViewer**: Real-time log display for debugging
- **StatusIndicator**: Connection and room status indicators

## Development Notes

### Logging Strategy
Both client and server implement detailed logging:
- **Levels**: info, success, warning, error
- **Structured Data**: JSON objects with relevant context
- **Timestamps**: Precise timing for debugging
- **Auto-scrolling**: Latest logs always visible

### Error Handling
- **Network Errors**: Connection failures, timeouts
- **Validation Errors**: Invalid inputs, missing data
- **Room Errors**: Full rooms, non-existent rooms
- **User Feedback**: Clear error messages in UI

### State Management
Using MobX for reactive state:
- **Observable State**: Automatic UI updates
- **Actions**: State modifications
- **Computed Values**: Derived state
- **Reactions**: Side effects

## API Reference

### Socket.IO Events

#### Client → Server
- `create-room`: Create a new room
- `join-room`: Join an existing room
- `get-room-info`: Get room details

#### Server → Client
- `room-updated`: Participant joined/left
- `connect/disconnect`: Connection events

### HTTP Endpoints
- `GET /health`: Server health check
- `GET /rooms`: List active rooms

## Troubleshooting

### Common Issues

1. **Connection Failed**:
   - Check if server is running on port 3001
   - Verify CORS configuration
   - Check browser console for errors

2. **Room Creation Failed**:
   - Ensure username is provided
   - Check for duplicate room IDs
   - Review server logs for errors

3. **UI Not Updating**:
   - Verify Socket.IO connection
   - Check MobX store states
   - Review React component observers

### Debug Information
The UI provides comprehensive debug information:
- Real-time connection status
- Socket and room store states
- Detailed event logs
- JSON state inspection

## Next Steps

This implementation provides the foundation for WebRTC video streaming. Future development will focus on:

1. **WebRTC Integration**: Implement actual peer connections
2. **Media Handling**: Add video/audio capture and streaming
3. **UI Enhancements**: Video grid, controls, settings
4. **Performance**: Optimize for multiple participants
5. **Features**: Screen sharing, recording, chat

## Contributing

This is a sandbox project focused on understanding WebRTC concepts. The code is heavily commented and logged to facilitate learning and debugging.
Feel free to experiment, report issues, or suggest improvements. Contributions are welcome!

But please note that this is not a production-ready system and is intended for exploring webrtc, video streaming and chat systems.

## License

MIT License - Feel free to use this for learning and experimentation.