// Sastra Nest - Discord-style Platform with Persistent Rooms

const http = require('http');
const { WebSocketServer } = require('ws');
const { randomUUID } = require('crypto');
const { RoomDB } = require('./database');

const PORT = process.env.PORT || 8082;

// In-memory active connections and real-time state
const clients = new Map(); // clientId -> { ws, handle, room, micEnabled, videoEnabled }
const activeRooms = new Map(); // roomName -> Set of clientIds currently connected

// Rate limiting
const rateLimits = new Map();
const RATE_WINDOW = 10000; // 10 seconds
const RATE_MAX = 50;

function checkRateLimit(ip) {
  const now = Date.now();
  const limit = rateLimits.get(ip) || { count: 0, reset: now + RATE_WINDOW };
  
  if (now > limit.reset) {
    limit.count = 0;
    limit.reset = now + RATE_WINDOW;
  }
  
  limit.count++;
  rateLimits.set(ip, limit);
  return limit.count <= RATE_MAX;
}

function broadcast(roomName, message, excludeClientId = null) {
  const room = activeRooms.get(roomName);
  if (!room) return;
  
  for (const clientId of room) {
    if (clientId !== excludeClientId) {
      const client = clients.get(clientId);
      if (client && client.ws.readyState === client.ws.OPEN) {
        client.ws.send(JSON.stringify(message));
      }
    }
  }
}

// Broadcast to all connected clients
function broadcastToAll(message, excludeClientId = null) {
  for (const [clientId, client] of clients) {
    if (clientId !== excludeClientId && client.ws.readyState === client.ws.OPEN) {
      client.ws.send(JSON.stringify(message));
    }
  }
}

// Handle leaving room with proper cleanup
function handleLeaveRoom(clientId, roomName) {
  const activeRoom = activeRooms.get(roomName);
  if (activeRoom) {
    activeRoom.delete(clientId);
    
    // Notify other participants
    broadcast(roomName, { type: 'participant-left', clientId }, clientId);
    
    // Update database
    RoomDB.leaveRoom(roomName, clientId);
    
    // Update room list for all clients if room still has participants
    const roomWithParticipants = getRoomWithParticipants(roomName);
    if (roomWithParticipants) {
      broadcastToAll({ 
        type: 'room-list-updated',
        action: 'updated',
        room: roomWithParticipants
      });
    }
    
    // Clean up empty room
    if (activeRoom.size === 0) {
      activeRooms.delete(roomName);
    }
  }
}

function getRoomWithParticipants(roomName) {
  const room = RoomDB.getRoomByName(roomName);
  if (!room) return null;
  
  const activeParticipants = activeRooms.get(roomName) || new Set();
  const participantList = Array.from(activeParticipants).map(clientId => {
    const client = clients.get(clientId);
    return client ? {
      id: clientId,
      handle: client.handle,
      micEnabled: client.micEnabled,
      videoEnabled: client.videoEnabled
    } : null;
  }).filter(Boolean);

  return {
    ...room,
    activeParticipants: participantList,
    participantCount: participantList.length
  };
}

// HTTP Server for API
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  if (req.method === 'GET' && req.url === '/rooms') {
    try {
      const publicRooms = RoomDB.getPublicRooms().map(room => {
        const activeParticipants = activeRooms.get(room.name) || new Set();
        return {
          ...room,
          participantCount: activeParticipants.size
        };
      });
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ rooms: publicRooms }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to fetch rooms' }));
    }
  } else if (req.method === 'GET' && req.url.startsWith('/room/')) {
    const roomName = decodeURIComponent(req.url.split('/room/')[1]);
    try {
      const room = getRoomWithParticipants(roomName);
      if (!room) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Room not found' }));
        return;
      }
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ room }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to fetch room' }));
    }
  } else {
    res.writeHead(404);
    res.end();
  }
});

// WebSocket Server
const wss = new WebSocketServer({ server, path: '/ws' });

console.log('WebSocket server initialized on path /ws');

wss.on('connection', (ws, req) => {
  const ip = req.socket.remoteAddress;
  console.log(`New WebSocket connection from ${ip}`);
  
  if (!checkRateLimit(ip)) {
    console.log(`Rate limited connection from ${ip}`);
    ws.close(1013, 'Rate limited');
    return;
  }

  const clientId = randomUUID();
  
  // Generate random usernames
  const adjectives = ['Swift', 'Bright', 'Cool', 'Smart', 'Quick', 'Bold', 'Calm', 'Wild', 'Free', 'Pure', 'Wise', 'Kind', 'Brave', 'Sharp', 'Clear'];
  const nouns = ['Fox', 'Wolf', 'Eagle', 'Lion', 'Tiger', 'Bear', 'Hawk', 'Owl', 'Deer', 'Shark', 'Raven', 'Phoenix', 'Dragon', 'Falcon', 'Panther'];
  
  const randomAdjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const randomNoun = nouns[Math.floor(Math.random() * nouns.length)];
  const randomNumber = Math.floor(Math.random() * 999) + 1;
  
  const handle = `${randomAdjective}${randomNoun}${randomNumber}`;
  
  clients.set(clientId, { 
    ws, 
    handle, 
    room: null, 
    micEnabled: true, 
    videoEnabled: false 
  });
  ws.send(JSON.stringify({ type: 'hello', clientId, handle }));

  ws.on('message', (buffer) => {
    let msg;
    try {
      msg = JSON.parse(buffer.toString());
      console.log(`Received message from ${clientId}:`, msg);
    } catch (e) {
      console.error('Failed to parse message:', e, 'Raw:', buffer.toString());
      return;
    }
    
    const client = clients.get(clientId);
    if (!client) {
      console.error(`No client found for ID: ${clientId}`);
      return;
    }

    switch (msg.type) {
      case 'create-room': {
        const { name, password, roomType = 'video' } = msg;
        
        // Validate input
        if (!name || name.trim().length === 0) {
          ws.send(JSON.stringify({ type: 'error', message: 'Room name is required' }));
          break;
        }
        
        if (name.length > 50) {
          ws.send(JSON.stringify({ type: 'error', message: 'Room name too long (max 50 characters)' }));
          break;
        }
        
        console.log(`Creating room: ${name} (${roomType}) requested by ${clientId}`);
        
        try {
          // Check if room already exists
          const existingRoom = RoomDB.getRoomByName(name);
          if (existingRoom) {
            ws.send(JSON.stringify({ type: 'error', message: 'Room name already exists' }));
            break;
          }
          
          const room = RoomDB.createRoom({
            name: name.trim(),
            password,
            type: roomType,
            creator: clientId
          });
          console.log(`Room created:`, room);

          // Leave current room if in one
          if (client.room) {
            handleLeaveRoom(clientId, client.room);
          }

          // Initialize and join new room
          if (!activeRooms.has(name)) {
            activeRooms.set(name, new Set());
          }
          
          activeRooms.get(name).add(clientId);
          client.room = name;
          
          const roomWithParticipants = getRoomWithParticipants(name);
          
          // Send success to creator
          ws.send(JSON.stringify({ 
            type: 'room-created', 
            room: roomWithParticipants
          }));
          
          // Broadcast to all clients for room list update (excluding creator)
          console.log('Broadcasting room creation to all clients except creator');
          broadcastToAll({ 
            type: 'room-list-updated',
            action: 'created',
            room: roomWithParticipants
          }, clientId);
          
        } catch (error) {
          console.error('Room creation error:', error);
          ws.send(JSON.stringify({ type: 'error', message: error.message }));
        }
        break;
      }

      case 'join-room': {
        const { name, password } = msg;
        
        if (!name) {
          ws.send(JSON.stringify({ type: 'error', message: 'Room name is required' }));
          break;
        }
        
        console.log(`Join room request: ${name} by ${clientId}`);
        
        try {
          // Check if room exists
          const existingRoom = RoomDB.getRoomByName(name);
          if (!existingRoom) {
            ws.send(JSON.stringify({ type: 'error', message: 'Room not found' }));
            break;
          }
          
          // Check room capacity (max 4 participants)
          const currentParticipants = activeRooms.get(name) || new Set();
          if (currentParticipants.size >= 4 && !currentParticipants.has(clientId)) {
            ws.send(JSON.stringify({ type: 'error', message: 'Room is full (max 4 participants)' }));
            break;
          }
          
          const room = RoomDB.joinRoom(name, clientId, password);
          console.log(`Room joined:`, room);
          
          // Leave current room if in one
          if (client.room && client.room !== name) {
            handleLeaveRoom(clientId, client.room);
          }

          // Join new room
          if (!activeRooms.has(name)) {
            activeRooms.set(name, new Set());
          }
          activeRooms.get(name).add(clientId);
          client.room = name;

          const roomWithParticipants = getRoomWithParticipants(name);
          
          // Send success to joiner
          ws.send(JSON.stringify({ type: 'room-joined', room: roomWithParticipants }));
          
          // Notify other participants
          broadcast(name, { 
            type: 'participant-joined', 
            participant: { 
              id: clientId, 
              handle: client.handle,
              micEnabled: client.micEnabled,
              videoEnabled: client.videoEnabled
            } 
          }, clientId);
          
          // Update room list for all clients
          broadcastToAll({ 
            type: 'room-list-updated',
            action: 'updated',
            room: roomWithParticipants
          });
          
        } catch (error) {
          console.error('Room join error:', error);
          ws.send(JSON.stringify({ type: 'error', message: error.message }));
        }
        break;
      }

      case 'signal': {
        
        const { to, data } = msg;
        console.log(`Relaying signal from ${clientId} to ${to}:`, data.sdp ? data.sdp.type : 'ICE candidate');
        const targetClient = clients.get(to);
        if (targetClient && targetClient.ws.readyState === targetClient.ws.OPEN) {
          targetClient.ws.send(JSON.stringify({ type: 'signal', from: clientId, data }));
          console.log(`Signal relayed successfully`);
        } else {
          console.error(`Target client ${to} not found or not connected`);
        }
        break;
      }

      case 'update-media-status': {
        const { micEnabled, videoEnabled } = msg;
        client.micEnabled = micEnabled !== undefined ? micEnabled : client.micEnabled;
        client.videoEnabled = videoEnabled !== undefined ? videoEnabled : client.videoEnabled;
        
        if (client.room) {
          RoomDB.updateParticipantStatus(client.room, clientId, {
            micEnabled: client.micEnabled,
            videoEnabled: client.videoEnabled
          });
          
          broadcast(client.room, {
            type: 'participant-media-updated',
            clientId,
            micEnabled: client.micEnabled,
            videoEnabled: client.videoEnabled
          }, clientId);
        }
        break;
      }

      case 'screen-share': {
        const { enabled } = msg;
        if (client.room) {
          broadcast(client.room, {
            type: 'screen-share-update',
            clientId,
            enabled
          }, clientId);
        }
        break;
      }

      case 'reaction': {
        const { emoji } = msg;
        if (client.room) {
          broadcast(client.room, {
            type: 'reaction',
            clientId,
            emoji,
            timestamp: Date.now()
          }, clientId);
        }
        break;
      }

      case 'delete-room': {
        const { roomName } = msg;
        
        if (!roomName) {
          ws.send(JSON.stringify({ type: 'error', message: 'Room name is required' }));
          break;
        }
        
        try {
          const room = RoomDB.getRoomByName(roomName);
          if (!room) {
            ws.send(JSON.stringify({ type: 'error', message: 'Room not found' }));
            break;
          }
          
          // Only room creator can delete
          if (room.creator !== clientId) {
            ws.send(JSON.stringify({ type: 'error', message: 'Only room creator can delete the room' }));
            break;
          }
          
          RoomDB.deleteRoom(room.id, clientId);
          
          // Notify all participants and kick them out
          const activeParticipants = activeRooms.get(roomName);
          if (activeParticipants) {
            for (const participantId of activeParticipants) {
              const participant = clients.get(participantId);
              if (participant) {
                participant.room = null;
                participant.ws.send(JSON.stringify({ 
                  type: 'room-deleted', 
                  roomName 
                }));
              }
            }
            activeRooms.delete(roomName);
          }
          
          // Broadcast room deletion to all clients
          broadcastToAll({ 
            type: 'room-list-updated',
            action: 'deleted',
            roomName
          });
          
          ws.send(JSON.stringify({ type: 'room-deleted', roomName }));
        } catch (error) {
          console.error('Room deletion error:', error);
          ws.send(JSON.stringify({ type: 'error', message: error.message }));
        }
        break;
      }

      case 'leave-room': {
        if (client.room) {
          handleLeaveRoom(clientId, client.room);
          client.room = null;
        }
        ws.send(JSON.stringify({ type: 'left-room' }));
        break;
      }
    }
  });

  ws.on('close', () => {
    const client = clients.get(clientId);
    if (client && client.room) {
      handleLeaveRoom(clientId, client.room);
    }
    clients.delete(clientId);
    console.log(`Client ${clientId} disconnected`);
  });
});

server.listen(PORT, () => {
  console.log(`Sastra Nest server listening on port ${PORT}`);
  console.log('Discord-style persistent rooms enabled!');
  console.log('Supported room types: voice, video');
});
