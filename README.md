# Sastra Nest - Discord-Style Voice & Video Platform

A professional Discord-style platform with persistent voice and video rooms, real-time communication, and advanced features.

## 🚀 Features

### Core Platform
- **Persistent Rooms**: 24/7 voice and video channels that never disappear
- **Room Types**: Dedicated voice-only and video channels
- **Real-time Communication**: WebRTC peer-to-peer connections
- **Anonymous Users**: Auto-generated handles for instant access

### Discord-Style UI
- **Categorized Sidebar**: Organized voice and video channel lists
- **Live Participant Counts**: Real-time room occupancy display
- **Professional Design**: Discord-inspired dark theme and layout
- **Responsive Interface**: Smooth transitions and animations

### Advanced Features
- **Professional In-Call Menu**: Comprehensive options panel
- **Screen Sharing**: Share your screen with participants
- **Emoji Reactions**: Express yourself with real-time reactions
- **Audio Device Selection**: Choose microphone and speaker devices
- **Keyboard Shortcuts**: Spacebar push-to-talk functionality
- **Room Management**: Create, join, and delete rooms with passwords

## 🛠️ Technical Stack

### Backend
- **Node.js** with WebSocket signaling server
- **JSON Database** for persistent room storage
- **WebRTC** for peer-to-peer media connections
- **Real-time Messaging** for reactions and status updates

### Frontend
- **Vanilla JavaScript** with modern ES6+ features
- **CSS Grid & Flexbox** for responsive layouts
- **WebRTC APIs** for media handling
- **Professional UI Components** with Discord styling

## 📦 Installation & Setup

### Prerequisites
- Node.js (v14 or higher)
- Python (for serving web files)
- Modern web browser with WebRTC support

### Quick Start

1. **Start the Backend Server**
```bash
cd server
npm install
npm start
```
Server runs on `http://localhost:8082`

2. **Start the Web Client**
```bash
cd web
python -m http.server 5500
```
Web client available at `http://localhost:5500`

3. **Access the Platform**
Open your browser and navigate to the web client URL

## 🎮 Usage Guide

### Creating Rooms
- Click the **"+"** button next to Voice or Video Channels
- Use quick action buttons on the welcome screen
- Set optional passwords for private rooms

### Joining Rooms
- Click any room in the sidebar to join instantly
- Enter password if required for private rooms
- Automatic media permissions setup

### In-Call Features
- **Mute/Unmute**: Click mic button or press Spacebar
- **Video Toggle**: Enable/disable camera in video rooms
- **Options Menu**: Access advanced features via "⋯" button
- **Reactions**: Send emoji reactions to participants
- **Screen Share**: Share your screen (coming soon)

### Room Management
- **Room Persistence**: Rooms stay active 24/7
- **Creator Controls**: Delete rooms you created
- **Live Updates**: Real-time participant counts and status

## 🔧 Configuration

### Environment Variables
```bash
PORT=8082  # Backend server port (default: 8082)
```

### Server Configuration
- **Room Database**: `server/data/rooms.json`
- **Rate Limiting**: Built-in protection against spam
- **CORS**: Configured for local development

## 🏗️ Architecture

### Database Schema
```json
{
  "rooms": {
    "roomId": {
      "name": "Room Name",
      "type": "voice|video", 
      "password": "optional",
      "createdBy": "userId",
      "createdAt": "timestamp",
      "participants": []
    }
  }
}
```

### WebSocket Messages
- `create-room`: Create new persistent room
- `join-room`: Join existing room
- `leave-room`: Leave current room
- `media-status`: Update mic/video status
- `screen-share`: Toggle screen sharing
- `reaction`: Send emoji reactions

### WebRTC Signaling
- **Offer/Answer**: Peer connection establishment
- **ICE Candidates**: Network connectivity
- **Media Tracks**: Audio/video stream management

## 🚀 Deployment

### Production Setup
1. **Database Migration**: Replace JSON with PostgreSQL/MongoDB
2. **Environment Variables**: Configure production settings
3. **HTTPS**: Enable SSL for WebRTC requirements
4. **Scaling**: Implement SFU for larger groups

### Docker Deployment
```bash
# Build and run with Docker Compose
docker-compose up -d
```

### Cloud Deployment
- **Heroku**: Ready for Heroku deployment
- **AWS/GCP**: Compatible with cloud platforms
- **CDN**: Serve static assets via CDN

## 🔐 Security Features

- **Rate Limiting**: Prevents spam and abuse
- **Room Passwords**: Private room protection
- **Anonymous Users**: No personal data collection
- **WebRTC Security**: Encrypted peer-to-peer connections

## 🎯 Roadmap

### Immediate Enhancements
- [ ] Complete screen sharing implementation
- [ ] Mobile responsive design
- [ ] User authentication system
- [ ] Room moderation tools

### Future Features
- [ ] File sharing capabilities
- [ ] Recording functionality
- [ ] AI-powered moderation
- [ ] Mobile applications
- [ ] Advanced analytics

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For support and questions:
- Create an issue on GitHub
- Check the documentation
- Review the troubleshooting guide

---

**Built with ❤️ for seamless communication**

