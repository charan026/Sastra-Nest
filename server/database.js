// Database schema and operations for persistent rooms

const fs = require('fs');
const path = require('path');

// Simple JSON-based database for MVP (can be replaced with PostgreSQL/MongoDB later)
const DB_PATH = path.join(__dirname, 'data', 'rooms.json');
const USERS_PATH = path.join(__dirname, 'data', 'users.json');

// Ensure data directory exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

function initializeDB() {
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify([]));
  }
  if (!fs.existsSync(USERS_PATH)) {
    fs.writeFileSync(USERS_PATH, JSON.stringify([]));
  }

  // Clear all rooms and keep only General room
  try {
    const current = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    const systemRooms = current.filter(room => room.creator === 'system' && room.name === 'General');
    
    // If no General room exists, create it
    if (systemRooms.length === 0) {
      const seeded = [
        {
          id: require('crypto').randomUUID(),
          name: 'General',
          type: 'video',
          isPrivate: false,
          password: null,
          creator: 'system',
          createdAt: new Date().toISOString(),
          participants: [],
          settings: { maxParticipants: 50, allowScreenShare: true, allowReactions: true }
        }
      ];
      fs.writeFileSync(DB_PATH, JSON.stringify(seeded, null, 2));
      console.log('Database reset - only General room created');
    } else {
      // Keep only the General room, remove all user-created rooms
      fs.writeFileSync(DB_PATH, JSON.stringify(systemRooms, null, 2));
      console.log('Database cleaned - removed all user-created rooms, kept General room');
    }
  } catch (e) {
    console.error('Failed to clean database:', e);
  }
  
  // Legacy seed code (now unused)
  try {
    const current = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    if (false) { // Disabled - we always reset above
      const seeded = [
        {
          id: require('crypto').randomUUID(),
          name: 'General',
          type: 'video',
          isPrivate: false,
          password: null,
          creator: 'system',
          createdAt: new Date().toISOString(),
          participants: [],
          settings: { maxParticipants: 50, allowScreenShare: true, allowReactions: true }
        }
      ];
      fs.writeFileSync(DB_PATH, JSON.stringify(seeded, null, 2));
    }
  } catch (e) {
    console.error('Failed to seed default rooms:', e);
  }
}

// Room operations
class RoomDB {
  static getAllRooms() {
    try {
      const data = fs.readFileSync(DB_PATH, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Error reading rooms:', error);
      return [];
    }
  }

  static saveRooms(rooms) {
    try {
      fs.writeFileSync(DB_PATH, JSON.stringify(rooms, null, 2));
      return true;
    } catch (error) {
      console.error('Error saving rooms:', error);
      return false;
    }
  }

  static createRoom(roomData) {
    const rooms = this.getAllRooms();
    
    // Check if room name already exists
    if (rooms.find(r => r.name === roomData.name)) {
      throw new Error('Room name already exists');
    }

    const newRoom = {
      id: require('crypto').randomUUID(),
      name: roomData.name,
      type: roomData.type || 'video', // 'voice' or 'video'
      isPrivate: !!roomData.password,
      password: roomData.password || null,
      creator: roomData.creator,
      createdAt: new Date().toISOString(),
      participants: [],
      settings: {
        maxParticipants: roomData.maxParticipants || 50,
        allowScreenShare: true,
        allowReactions: true
      }
    };

    rooms.push(newRoom);
    this.saveRooms(rooms);
    return newRoom;
  }

  static getRoomByName(name) {
    const rooms = this.getAllRooms();
    return rooms.find(r => r.name === name);
  }

  static getRoomById(id) {
    const rooms = this.getAllRooms();
    return rooms.find(r => r.id === id);
  }

  static updateRoom(roomId, updates) {
    const rooms = this.getAllRooms();
    const roomIndex = rooms.findIndex(r => r.id === roomId);
    
    if (roomIndex === -1) {
      throw new Error('Room not found');
    }

    rooms[roomIndex] = { ...rooms[roomIndex], ...updates };
    this.saveRooms(rooms);
    return rooms[roomIndex];
  }

  static deleteRoom(roomId, userId) {
    const rooms = this.getAllRooms();
    const roomIndex = rooms.findIndex(r => r.id === roomId);
    
    if (roomIndex === -1) {
      throw new Error('Room not found');
    }

    const room = rooms[roomIndex];
    
    if (room.creator !== userId) {
      throw new Error('Only room creator can delete room');
    }

    rooms.splice(roomIndex, 1);
    this.saveRooms(rooms);
    return true;
  }

  static getPublicRooms() {
    const rooms = this.getAllRooms();
    return rooms.map(r => ({
      id: r.id,
      name: r.name,
      type: r.type,
      participantCount: r.participants.length,
      creator: r.creator,
      createdAt: r.createdAt,
      isPrivate: r.isPrivate
    }));
  }

  static joinRoom(roomName, userId, password = null) {
    const rooms = this.getAllRooms();
    const room = rooms.find(r => r.name === roomName);
    
    if (!room) {
      throw new Error('Room not found');
    }

    if (room.isPrivate && room.password !== password) {
      throw new Error('Invalid password');
    }

    if (!room.participants.find(p => p.id === userId)) {
      room.participants.push({
        id: userId,
        joinedAt: new Date().toISOString(),
        micEnabled: true,
        videoEnabled: false
      });
      this.saveRooms(rooms);
    }

    return room;
  }

  static leaveRoom(roomName, userId) {
    const rooms = this.getAllRooms();
    const room = rooms.find(r => r.name === roomName);
    
    if (!room) {
      return false;
    }

    room.participants = room.participants.filter(p => p.id !== userId);
    this.saveRooms(rooms);
    return true;
  }

  static updateParticipantStatus(roomName, userId, status) {
    const rooms = this.getAllRooms();
    const room = rooms.find(r => r.name === roomName);
    
    if (!room) {
      return false;
    }

    const participant = room.participants.find(p => p.id === userId);
    if (participant) {
      Object.assign(participant, status);
      this.saveRooms(rooms);
    }

    return true;
  }
}

// Initialize database on module load
initializeDB();

module.exports = { RoomDB };
