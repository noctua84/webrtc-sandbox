# Event Lifecycle React Application

A comprehensive React application that emulates the complete lifecycle of the server's event system, built with React, TypeScript, MobX, and Socket.IO.

## Features

### Complete Event Lifecycle
- ✅ **Event Creation**: Create events via REST API with full validation
- ✅ **Event Discovery**: Load and display event information
- ✅ **Booking System**: Book events with user authentication
- ✅ **Room Management**: WebSocket-based room joining and management
- ✅ **Video Conference**: Full video room implementation with media controls
- ✅ **Real-time Updates**: Live participant tracking and room updates

### Technical Implementation
- **React 18** with TypeScript for type safety
- **MobX** for reactive state management
- **Socket.IO Client** for real-time WebSocket communication
- **Tailwind CSS** for modern, responsive design
- **Vite** for fast development and building
- **React Router** for client-side routing

## Project Structure

```
src/
├── components/          # React components
│   ├── ui/             # Reusable UI components
│   ├── ConnectionStatus.tsx
│   ├── EventCreator.tsx
│   ├── EventBooking.tsx
│   ├── VideoRoom.tsx
│   └── LogViewer.tsx
├── stores/             # MobX stores
│   ├── SocketStore.ts
│   ├── EventStore.ts
│   └── RoomStore.ts
├── types/              # TypeScript definitions
├── utils/              # Utility functions
├── App.tsx             # Main application component
└── main.tsx           # Entry point
```

## Setup and Installation

### Prerequisites
- Node.js 18+
- npm 9+
- Server application running on http://localhost:3001

### Installation

1. **Install dependencies:**
```bash
npm install
```

2. **Start development server:**
```bash
npm run dev
```

3. **Open browser:**
- Application: http://localhost:5174
- Server API: http://localhost:3001

## Usage Guide

### 1. Create an Event (Host)

1. **Fill Event Details:**
    - Event ID (auto-generated or custom)
    - Event title and description
    - Scheduled start time
    - Host information
    - Maximum participants

2. **Create Event:**
    - Validates input and creates event via API
    - Generates room automatically
    - Displays shareable event link

### 2. Book an Event (Participant)

1. **Navigate to Event:**
    - Use shared event link `/event/{eventId}`
    - View event details and status

2. **Book Participation:**
    - Enter user information
    - Submit booking request
    - Receive confirmation

### 3. Join Video Room

1. **Automatic Authorization:**
    - Verifies booking or host status
    - Connects to WebSocket server

2. **Video Features:**
    - Camera and microphone controls
    - Screen sharing capability
    - Participant list and management
    - Real-time room updates

## API Integration

### REST Endpoints
```typescript
POST /api/events              // Create event
POST /api/events/:id/book     // Book event
GET  /api/events/:id          // Get event details
```

### WebSocket Events
```typescript
// Client to Server
'join-room'                   // Join video room
'leave-room'                  // Leave video room
'get-room-info'              // Get room status

// Server to Client  
'room-updated'               // Participant changes
'participant-joined'         // New participant
'participant-left'           // Participant left
```

## State Management

### Store Architecture
- **SocketStore**: WebSocket connection and communication
- **EventStore**: Event creation, booking, and management
- **RoomStore**: Video room state and participant tracking

### Reactive Updates
- MobX provides automatic UI updates
- Real-time synchronization with server state
- Efficient re-rendering and performance

## Development Features

### Comprehensive Logging
- **Real-time Log Viewer**: `/logs` page with detailed application logs
- **Structured Logging**: JSON-formatted logs with timestamps
- **Log Levels**: Info, success, warning, error
- **Export Capability**: Download logs for debugging

### Error Handling
- **Network Resilience**: Automatic reconnection and retry logic
- **Input Validation**: Client-side form validation
- **User Feedback**: Clear error messages and status indicators
- **Graceful Degradation**: Fallback behavior for failed operations

### Observability
- **Connection Status**: Real-time WebSocket connection monitoring
- **Room Status**: Live participant count and room state
- **Performance Metrics**: Request timing and error tracking
- **Debug Information**: Detailed event and state logging

## Configuration

### Environment Variables
```bash
VITE_SERVER_URL=http://localhost:3001  # Server URL
VITE_WS_URL=http://localhost:3001      # WebSocket URL
```

### Build Configuration
- **Development**: Hot reload with Vite
- **Production**: Optimized bundle with code splitting
- **TypeScript**: Strict type checking enabled

## Testing Strategy

### Manual Testing Scenarios
1. **Event Creation Flow**: Create event → Get link → Share
2. **Booking Flow**: Access link → Book event → Get confirmation
3. **Room Flow**: Join room → Enable media → Interact with participants
4. **Error Scenarios**: Network failures, invalid data, authorization errors

### Integration Testing
- API endpoint compatibility
- WebSocket event handling
- State synchronization
- Cross-browser compatibility

## Deployment

### Build for Production
```bash
npm run build
```

### Preview Production Build
```bash
npm run preview
```

### Static Hosting
- Compatible with Vercel, Netlify, GitHub Pages
- Requires API server configuration for CORS
- Environment variables for production URLs

## Architecture Decisions

### Technology Choices
- **React**: Component-based UI development
- **TypeScript**: Type safety and developer experience
- **MobX**: Simple reactive state management
- **Tailwind**: Utility-first CSS framework
- **Socket.IO**: Reliable WebSocket communication

### Design Patterns
- **Store Pattern**: Centralized state management
- **Observer Pattern**: Reactive UI updates
- **Component Composition**: Reusable UI building blocks
- **Functional Approach**: Pure functions and immutable updates

## Contributing

### Code Style
- TypeScript strict mode enabled
- ESLint configuration for code quality
- Prettier for consistent formatting
- Functional components with hooks

### Development Workflow
1. Feature development in isolation
2. Type safety verification
3. Manual testing across flows
4. Integration with server API
5. Documentation updates

## Browser Support

- **Modern Browsers**: Chrome 90+, Firefox 88+, Safari 14+
- **WebRTC Support**: Required for video functionality
- **ES2020 Features**: Used throughout application
- **Mobile Responsive**: Touch-friendly interface

---

This application demonstrates a complete event management system with real-time video capabilities, showcasing modern React development practices and WebSocket integration.