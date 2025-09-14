'use strict';

const state = {
  localStream: null,
  peers: new Map(),
  ws: null,
  screenSharing: false,
  optionsMenuOpen: false,
  reactionsOpen: false,
  wsReady: false,
  wsQueue: [],
  currentRoom: null,
  currentRoomType: null,
  handle: null,
  muted: false,
  videoEnabled: true,
  pendingJoin: null,
  mediaRequestInProgress: false,
  lastMediaRequestTime: 0,
  mediaRequestCooldown: 5000 // 5 seconds between requests
};

// --- DOM Elements ---
const $ = (id) => document.getElementById(id);
const elements = {
  lobby: $('lobby'),
  videoCall: $('video-call'),
  voiceCall: $('voice-call'),
  voiceRooms: $('voice-rooms'),
  videoRooms: $('video-rooms'),
  userHandle: $('user-handle'),
  userAvatar: $('user-avatar'),
  videoGrid: $('video-grid'),
  localVideo: $('local-video'),
  localVideoElement: $('local-video-element'),
  localPlaceholder: $('local-placeholder'),
  callRoomName: $('call-room-name'),
  voiceRoomName: $('voice-room-name'),
  voiceParticipants: $('voice-participants'),
  voiceParticipantsCount: $('voice-participants-count'),
  micBtn: $('mic-btn'),
  videoBtn: $('video-btn'),
  leaveBtn: $('leave-btn'),
  voiceMicBtn: $('voice-mic-btn'),
  voiceOptionsBtn: $('voice-options-btn'),
  voiceReactionsBtn: $('voice-reactions-btn'),
  voiceReactionsPanel: $('voice-reactions-panel'),
  voiceLeaveBtn: $('voice-leave-btn'),
  optionsMenu: $('options-menu'),
  optionsBtn: $('options-btn'),
  participantsList: $('participants-list'),
  screenShareBtn: $('screen-share-btn'),
  reactionsBtn: $('reactions-btn'),
  reactionsPanel: $('reactions-panel'),
  createModal: $('create-modal'),
  joinModal: $('join-modal'),
  modalTitle: $('modal-title'),
  roomNameInput: $('room-name-input'),
  roomPasswordInput: $('room-password-input'),
  roomTypeInput: $('room-type-input'),
  joinPasswordInput: $('join-password-input'),
  confirmCreateBtn: $('confirm-create-btn'),
  cancelCreateBtn: $('cancel-create-btn'),
  confirmJoinBtn: $('confirm-join-btn'),
  cancelJoinBtn: $('cancel-join-btn'),
  quickCreateVideo: document.getElementById('quick-create-video'),
  quickCreateVoice: document.getElementById('quick-create-voice'),
  deleteRoomBtn: document.getElementById('delete-room-btn'),
};

function showModal(modal) { 
  elements[modal + 'Modal'].classList.add('visible'); 
}

function hideModals() {
  elements.createModal.classList.remove('visible');
  elements.joinModal.classList.remove('visible');
}

function switchToCallView(roomType = 'video') {
  elements.lobby.style.display = 'none';
  
  if (roomType === 'video') {
    elements.videoCall.classList.add('active');
    elements.voiceCall.style.display = 'none';
  } else {
    elements.voiceCall.style.display = 'block';
    elements.videoCall.classList.remove('active');
  }
  
  state.inCall = true;
  state.currentRoomType = roomType;
}

function showLobby() {
  elements.lobby.style.display = 'flex';
  elements.videoCall.style.display = 'none';
  elements.voiceCall.style.display = 'none';
  
  // Hide delete button when returning to lobby
  elements.deleteRoomBtn.style.display = 'none';
  
  // Clear current room state
  state.currentRoom = null;
  state.currentRoomType = null;
}

function switchToLobby() {
  showLobby();
  
  // Clean up peer connections
  state.peers.forEach(pc => pc.close());
  state.peers.clear();
  
  // Stop local stream
  if (state.localStream) {
    state.localStream.getTracks().forEach(track => track.stop());
    state.localStream = null;
  }
  
  // Reset state
  state.currentRoom = null;
  state.currentRoomType = null;
  state.muted = false;
  state.videoEnabled = true;
  
  // Clear participants
  elements.videoGrid.innerHTML = '';
  elements.voiceParticipants.innerHTML = '';
  
  // Remove active room highlighting
  document.querySelectorAll('.room-item').forEach(r => r.classList.remove('active'));
  
  // Refresh room list
  fetchPublicRooms();
  
  updateVideoGrid();
  
  // Close any open menus
  closeOptionsMenu();
  closeReactionsPanel();
}

function updateVideoGrid() {
  const participantCount = elements.videoGrid.children.length;
  
  // Remove existing grid classes
  elements.videoGrid.classList.remove('single', 'two', 'three', 'four', 'many');
  
  if (participantCount <= 1) {
    elements.videoGrid.classList.add('single');
  } else if (participantCount === 2) {
    elements.videoGrid.classList.add('two');
  } else if (participantCount === 3) {
    elements.videoGrid.classList.add('three');
  } else if (participantCount === 4) {
    elements.videoGrid.classList.add('four');
  } else {
    elements.videoGrid.classList.add('many');
  }
}

async function getLocalMedia(forceVideo = false) {
  try {
    // Try to get media with current settings
    const constraints = {
      audio: true,
      video: forceVideo || state.videoEnabled
    };
    
    console.log('Requesting media access with constraints:', constraints);
    state.localStream = await navigator.mediaDevices.getUserMedia(constraints);
    console.log('Media access granted, stream:', state.localStream);
    
    updateLocalVideo();
    updateMicButton();
    updateVideoButton();
    
    return state.localStream;
  } catch (error) {
    console.error('Failed to get media:', error);
    
    // Try audio-only fallback only once
    if ((forceVideo || state.videoEnabled) && error.name === 'NotAllowedError') {
      console.log('Trying audio-only fallback...');
      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        state.localStream = audioStream;
        state.videoEnabled = false;
        console.log('Audio-only access granted');
        
        updateLocalVideo();
        updateMicButton();
        updateVideoButton();
        
        return audioStream;
      } catch (audioError) {
        console.error('Audio-only also failed:', audioError);
      }
    }
    
    // Show permission error only once per cooldown period
    if (error.name === 'NotAllowedError') {
      showPermissionError();
    }
    throw error;
  } finally {
    state.mediaRequestInProgress = false;
  }
}

function showMediaPermissionError() {
  const errorDiv = document.getElementById('permission-error') || document.createElement('div');
  errorDiv.id = 'permission-error';
  errorDiv.style.cssText = `
    position: fixed;
    top: 10px;
    left: 50%;
    transform: translateX(-50%);
    background: #ff4444;
    color: white;
    padding: 15px 25px;
    border-radius: 8px;
    z-index: 1000;
    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    max-width: 400px;
    text-align: center;
  `;
  errorDiv.innerHTML = `
    <h4 style="margin: 0 0 10px 0;">Camera/Microphone Access Required</h4>
    <p style="margin: 0 0 15px 0;">To use video chat, please:</p>
    <ol style="text-align: left; margin: 0 0 15px 0;">
      <li>Click the camera icon in your browser's address bar</li>
      <li>Select "Allow" for camera and microphone</li>
      <li>Refresh the page</li>
    </ol>
    <button onclick="getLocalMedia(true).then(() => this.parentElement.remove())" style="background: white; color: #ff4444; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-weight: bold;">Try Again</button>
    <button onclick="location.reload()" style="background: transparent; color: white; border: 1px solid white; padding: 8px 16px; border-radius: 4px; cursor: pointer; margin-left: 10px;">Refresh Page</button>
  `;
  
  if (!document.getElementById('permission-error')) {
    document.body.appendChild(errorDiv);
  }
}

function createParticipantTile(id, handle) {
  const tile = document.createElement('div');
  tile.className = 'video-tile';
  tile.id = `participant-${id}`;

  const video = document.createElement('video');
  video.autoplay = true;
  video.playsInline = true;
  video.muted = false; // Don't mute remote videos

  const nameLabel = document.createElement('div');
  nameLabel.className = 'name-label';
  nameLabel.textContent = handle;

  const placeholder = document.createElement('div');
  placeholder.className = 'placeholder';
  placeholder.textContent = handle.charAt(0).toUpperCase();
  placeholder.style.display = 'flex'; // Show placeholder initially

  tile.appendChild(video);
  tile.appendChild(nameLabel);
  tile.appendChild(placeholder);
  elements.videoGrid.appendChild(tile);

  updateVideoGrid();

  return { tile, video, nameLabel, placeholder };
}

async function setupPeerConnection(peerId) {
  const pc = new RTCPeerConnection({
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun.services.mozilla.com' },
      { urls: 'stun:stun.xten.com' }
    ]
  });

  // Add local stream tracks
  if (state.localStream) {
    state.localStream.getTracks().forEach(track => {
      pc.addTrack(track, state.localStream);
    });
  }

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      console.log('Sending ICE candidate to', peerId);
      sendMessage({
        type: 'signal',
        to: peerId,
        data: { candidate: event.candidate }
      });
    }
  };

  pc.oniceconnectionstatechange = () => {
    console.log(`ICE connection state for ${peerId}: ${pc.iceConnectionState}`);
  };

  pc.onsignalingstatechange = () => {
    console.log(`Signaling state for ${peerId}: ${pc.signalingState}`);
  };

  pc.ontrack = (event) => {
    console.log('Received remote track from', peerId, event.track);
    const videoTile = document.getElementById(`participant-${peerId}`);
    const video = videoTile ? videoTile.querySelector('video') : null;
    const placeholder = videoTile ? videoTile.querySelector('.placeholder') : null;

    if (video && event.track.kind === 'video') {
      console.log('Setting video track for', peerId);
      if (!video.srcObject) {
        video.srcObject = new MediaStream();
      }
      video.srcObject.addTrack(event.track);
      video.onloadedmetadata = () => {
        if (placeholder) placeholder.style.display = 'none';
        video.play().catch(e => console.error('Video play failed:', e));
      };
    }

    if (event.track.kind === 'audio') {
      console.log('Setting audio track for', peerId);
      let audio = document.getElementById(`audio-${peerId}`);
      if (!audio) {
        audio = document.createElement('audio');
        audio.id = `audio-${peerId}`;
        audio.autoplay = true;
        document.body.appendChild(audio);
      }
      if (!audio.srcObject) {
        audio.srcObject = new MediaStream();
      }
      audio.srcObject.addTrack(event.track);
      audio.play().catch(e => console.error('Audio play failed:', e));
    }
  };

  state.peers.set(peerId, pc);
  return pc;
}

async function createOffer(peerId) {
  console.log('Creating offer for peer:', peerId);
  const pc = await setupPeerConnection(peerId);
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  
  console.log('Sending offer to', peerId);
  sendMessage({
    type: 'signal',
    to: peerId,
    data: { sdp: pc.localDescription }
  });
}

async function handleSignal(fromId, data) {
  console.log('Handling signal from', fromId, data);
  let pc = state.peers.get(fromId);
  if (!pc) {
    pc = await setupPeerConnection(fromId);
  }

  try {
    if (data.sdp) {
      console.log('Setting remote description:', data.sdp.type, 'Current state:', pc.signalingState);
      
      // Check if we can set the remote description
      if (data.sdp.type === 'offer' && pc.signalingState === 'stable') {
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        console.log('Creating answer for', fromId);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sendMessage({
          type: 'signal',
          to: fromId,
          data: { sdp: pc.localDescription }
        });
      } else if (data.sdp.type === 'answer' && pc.signalingState === 'have-local-offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        console.log('Answer set successfully for', fromId);
        
        // Process any queued ICE candidates
        if (pc.queuedCandidates) {
          for (const candidate of pc.queuedCandidates) {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          }
          pc.queuedCandidates = [];
        }
      } else {
        console.warn('Ignoring SDP in wrong state:', pc.signalingState, 'for type:', data.sdp.type);
      }
    } else if (data.candidate) {
      console.log('Adding ICE candidate from', fromId);
      if (pc.remoteDescription) {
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
      } else {
        console.log('Queuing ICE candidate until remote description is set');
        // Queue the candidate for later
        if (!pc.queuedCandidates) pc.queuedCandidates = [];
        pc.queuedCandidates.push(data.candidate);
      }
    }
  } catch (error) {
    console.error('Error handling signal:', error);
  }
}

function updateMicButton() {
  elements.micBtn.textContent = state.muted ? '🔇' : '🎤';
  if (state.muted) {
    elements.micBtn.classList.add('muted');
  } else {
    elements.micBtn.classList.remove('muted');
  }
}

function updateVideoButton() {
  elements.videoBtn.textContent = state.videoEnabled ? '📹' : '📷';
  if (state.videoEnabled) {
    elements.videoBtn.classList.remove('off');
  } else {
    elements.videoBtn.classList.add('off');
  }
}

function updateLocalVideo() {
  if (state.localStream && state.videoEnabled) {
    elements.localVideoElement.srcObject = state.localStream;
    elements.localPlaceholder.style.display = 'none';
  } else {
    elements.localVideoElement.srcObject = null;
    elements.localPlaceholder.style.display = 'block';
  }
}

async function connectWS() {
  console.log('Connecting to WebSocket...');
  const ws = new WebSocket(`wss://sastra-nest.onrender.com/ws`);
  state.ws = ws;
  state.wsReady = false;

  ws.onopen = () => {
    console.log('WebSocket connected');
    state.wsReady = true;
    // Flush queued messages
    if (state.wsQueue.length) {
      for (const msg of state.wsQueue) {
        try { ws.send(JSON.stringify(msg)); } catch (e) { console.error('WS send failed for queued msg', e); }
      }
      state.wsQueue = [];
    }
  };

  async function handleSignal(fromId, data) {
  console.log('Handling signal from', fromId, data);
  let pc = state.peers.get(fromId);
  if (!pc) {
    pc = await setupPeerConnection(fromId);
  }

  try {
    if (data.sdp) {
      console.log('Setting remote description:', data.sdp.type, 'Current state:', pc.signalingState);
      
      const offerCollision = (data.sdp.type === 'offer') && (pc.signalingState !== 'stable');

      if (offerCollision) {
        console.warn('Offer collision detected, ignoring offer');
        return;
      }

      await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));

      if (data.sdp.type === 'offer') {
        console.log('Creating answer for', fromId);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sendMessage({
          type: 'signal',
          to: fromId,
          data: { sdp: pc.localDescription }
        });
      }
    } else if (data.candidate) {
      console.log('Adding ICE candidate from', fromId);
      if (pc.remoteDescription) {
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
      } else {
        console.log('Queuing ICE candidate until remote description is set');
        if (!pc.queuedCandidates) pc.queuedCandidates = [];
        pc.queuedCandidates.push(data.candidate);
      }
    }
  } catch (error) {
    console.error('Error handling signal:', error);
  }
}

ws.onmessage = async (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
      console.log('RECV:', msg);
    } catch (e) {
      console.error('Failed to parse WebSocket message:', e, 'Raw data:', event.data);
      return;
    }

    switch (msg.type) {
      case 'hello':
        state.handle = msg.handle;
        elements.userHandle.textContent = msg.handle;
        break;
        
      case 'room-list-updated':
        // Refresh room list when rooms are created/updated/deleted
        console.log('Room list update received:', msg);
        fetchPublicRooms();
        break;
        
      case 'room-deleted':
        // Handle room deletion
        if (state.currentRoom === msg.roomName) {
          // If we're in the deleted room, go back to lobby
          showLobby();
          state.currentRoom = null;
          state.currentRoomType = null;
        }
        // Refresh room list
        fetchPublicRooms();
        break;
        
      case 'room-created':
        hideModals();
        state.currentRoom = msg.room.name;
        state.currentRoomType = msg.room.type;
        
        // Show delete button if user is the creator
        if (msg.room.creator === state.handle) {
          elements.deleteRoomBtn.style.display = 'block';
        }
        
        // Refresh room list to show updated participant counts (for creator)
        fetchPublicRooms();
        
        // Switch to appropriate call view
        switchToCallView(msg.room.type);
        break;
        
      case 'room-joined':
        hideModals();
        state.currentRoom = msg.room.name;
        state.currentRoomType = msg.room.type;
        
        // Show delete button if user is the creator
        if (msg.room.creator === state.handle) {
          elements.deleteRoomBtn.style.display = 'block';
        }
        
        // Refresh room list to show updated participant counts
        fetchPublicRooms();
        
        // Switch to appropriate call view
        switchToCallView(msg.room.type);
          
          if (msg.room.type === 'video') {
            elements.callRoomName.textContent = `#${msg.room.name}`;
            updateLocalVideo();
            
            // Create video tiles for existing participants
            msg.room.activeParticipants.forEach(p => {
              createParticipantTile(p.id, p.handle);
              // Perfect negotiation: only the client with the smaller handle creates the offer
              if (state.handle < p.handle) {
                createOffer(p.id);
              }
            });
          } else {
            elements.voiceRoomName.textContent = `#${msg.room.name}`;
            elements.voiceParticipantsCount.textContent = `${msg.room.activeParticipants.length} participants`;
            
            // Create voice participants
            msg.room.activeParticipants.forEach(p => {
              createVoiceParticipant(p.id, p.handle, p.micEnabled);
              // Perfect negotiation: only the client with the smaller handle creates the offer
              if (state.handle < p.handle) {
                createOffer(p.id);
              }
            });
          }
          break;
        
      case 'participant-joined':
        const participant = msg.participant;
        if (state.currentRoomType === 'video') {
          createParticipantTile(participant.id, participant.handle);
        } else {
          createVoiceParticipant(participant.id, participant.handle, participant.micEnabled);
          updateVoiceParticipantCount();
        }
        // Perfect negotiation: only the client with the smaller handle creates the offer
        if (state.handle < participant.handle) {
          createOffer(participant.id);
        }
        break;
        
      case 'participant-left':
        if (state.currentRoomType === 'video') {
          const tile = document.getElementById(`participant-${msg.clientId}`);
          if (tile) {
            tile.remove();
            updateVideoGrid();
          }
        } else {
          const voiceParticipant = document.getElementById(`voice-participant-${msg.clientId}`);
          if (voiceParticipant) {
            voiceParticipant.remove();
            updateVoiceParticipantCount();
          }
        }
        
        const pc = state.peers.get(msg.clientId);
        if (pc) {
          pc.close();
          state.peers.delete(msg.clientId);
        }
        break;
        
      case 'signal':
        console.log('Received signal message:', msg);
        handleSignal(msg.from, msg.data);
        break;
        
      case 'error':
        if (msg.message === 'Invalid password') {
          showModal('join');
        } else {
          alert(`Error: ${msg.message}`);
        }
        break;
    }
  };

  ws.onclose = () => {
    console.log('WebSocket connection closed');
    // Clean up
    state.peers.forEach(pc => pc.close());
    state.peers.clear();
    
    if (state.inCall) {
      switchToLobby();
    }
    
    elements.userHandle.textContent = 'Disconnected';
    state.wsReady = false;
  };
}

// Safe WebSocket sender that queues messages until the socket is open
function sendMessage(obj) {
  console.log('SEND:', obj);
  if (state.ws) {
    if (state.ws.readyState === 1) { // WebSocket.OPEN
      try { 
        const msg = JSON.stringify(obj);
        console.log('Sending message:', msg);
        state.ws.send(msg);
      } catch (e) { 
        console.error('WS send failed', e);
        state.wsQueue.push(obj); // Retry later
      }
    } else {
      console.log('WebSocket not ready, queueing message. State:', state.ws.readyState);
      state.wsQueue.push(obj);
    }
  } else {
    console.error('WebSocket not initialized');
    state.wsQueue.push(obj);
  }
}

function closeOptionsMenu() {
  elements.optionsMenu.style.display = 'none';
  state.optionsMenuOpen = false;
}

function closeReactionsPanel() {
  elements.reactionsPanel.style.display = 'none';
  state.reactionsOpen = false;
}

function closeVoiceReactionsPanel() {
  elements.voiceReactionsPanel.style.display = 'none';
  state.voiceReactionsOpen = false;
}

function createVoiceParticipant(id, handle, micEnabled = true) {
  const participant = document.createElement('div');
  participant.className = `voice-participant ${micEnabled ? '' : 'muted'}`;
  participant.id = `voice-participant-${id}`;
  
  const avatar = document.createElement('div');
  avatar.className = 'participant-avatar';
  avatar.textContent = handle.charAt(0).toUpperCase();
  
  const info = document.createElement('div');
  info.className = 'participant-info';
  
  const name = document.createElement('div');
  name.className = 'participant-name';
  name.textContent = handle;
  
  const status = document.createElement('div');
  status.className = 'participant-status';
  
  const indicator = document.createElement('div');
  indicator.className = `status-indicator ${micEnabled ? '' : 'muted'}`;
  
  const statusText = document.createElement('span');
  statusText.textContent = micEnabled ? 'Connected' : 'Muted';
  
  status.appendChild(indicator);
  status.appendChild(statusText);
  
  info.appendChild(name);
  info.appendChild(status);
  
  const controls = document.createElement('div');
  controls.className = 'participant-controls';
  
  const micControl = document.createElement('button');
  micControl.className = `participant-control ${micEnabled ? '' : 'muted'}`;
  micControl.innerHTML = micEnabled ? '🎤' : '🔇';
  micControl.title = micEnabled ? 'Mute' : 'Unmute';
  
  const moreControl = document.createElement('button');
  moreControl.className = 'participant-control';
  moreControl.innerHTML = '⋯';
  moreControl.title = 'More options';
  
  controls.appendChild(micControl);
  controls.appendChild(moreControl);
  
  participant.appendChild(avatar);
  participant.appendChild(info);
  participant.appendChild(controls);
  
  elements.voiceParticipants.appendChild(participant);
  updateVoiceParticipantCount();
}

function updateVoiceParticipantCount() {
  const count = elements.voiceParticipants.children.length;
  elements.voiceParticipantsCount.textContent = `${count} participant${count !== 1 ? 's' : ''}`;
}

async function fetchPublicRooms() {
  try {
    const res = await fetch('https://sastra-nest.onrender.com/rooms');
    const { rooms } = await res.json();
    console.log('Fetched rooms:', rooms);
    
    // Clear existing rooms
    elements.voiceRooms.innerHTML = '';
    elements.videoRooms.innerHTML = '';
    
    rooms.forEach(room => {
      createRoomListItem(room);
    });
    
    console.log('Room list updated in UI');
  } catch (err) { 
    console.error('Failed to fetch rooms', err);
  }
}

function createRoomListItem(room) {
  const item = document.createElement('li');
  item.className = 'room-item';
  item.dataset.roomName = room.name;
  item.dataset.roomType = room.type;
  
  const icon = document.createElement('div');
  icon.className = 'room-icon';
  icon.textContent = room.type === 'voice' ? '🎤' : '📹';
  
  const info = document.createElement('div');
  info.className = 'room-info';
  
  const name = document.createElement('div');
  name.className = 'room-name';
  name.textContent = room.name + (room.isPrivate ? ' 🔒' : '');
  
  const participants = document.createElement('div');
  participants.className = 'room-participants';
  participants.textContent = `${room.participantCount || 0} participants`;
  
  info.appendChild(name);
  info.appendChild(participants);
  
  item.appendChild(icon);
  item.appendChild(info);
  
  item.onclick = () => {
    // Remove active class from all rooms
    document.querySelectorAll('.room-item').forEach(r => r.classList.remove('active'));
    item.classList.add('active');
    
    if (room.hasPassword) {
      state.pendingJoin = room.name;
      showModal('join');
    } else {
      joinRoom(room.name);
    }
  };
  
  // Add to appropriate category
  if (room.type === 'voice') {
    elements.voiceRooms.appendChild(item);
  } else {
    elements.videoRooms.appendChild(item);
  }
}

async function joinRoom(roomName, password = '') {
  try {
    await getLocalMedia(false);
  } catch (error) {
    console.log('Media access failed, joining without media:', error.message);
  }
  
  sendMessage({ type: 'join-room', name: roomName, password });
}

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
  // Initialize WebSocket and UI first
  connectWS();
  fetchPublicRooms();
  
  // Try to get media access, but don't block initialization if it fails
  getLocalMedia().catch(e => {
    console.log('Media access not granted, user can still join as audio-only');
  });
  
  // Set up user avatar observer
  function updateUserAvatar() {
    // Update user avatar when handle changes
    const handle = elements.userHandle.textContent;
    if (handle && handle !== 'Disconnected') {
      // Could add avatar logic here if needed
    }
  }
  const observer = new MutationObserver(updateUserAvatar);
  observer.observe(elements.userHandle, { childList: true, subtree: true });

  // Room creation buttons
  console.log('Setting up room creation buttons...');
  const addRoomBtns = document.querySelectorAll('.add-room-btn');
  console.log('Found add-room-btn elements:', addRoomBtns.length);
  
  addRoomBtns.forEach((btn, index) => {
    console.log(`Setting up button ${index}:`, btn);
    btn.onclick = (e) => {
      e.preventDefault();
      console.log('Room creation button clicked!', btn.dataset.type);
      const roomType = btn.dataset.type;
      elements.roomTypeInput.value = roomType;
      elements.modalTitle.textContent = `Create ${roomType === 'voice' ? 'Voice' : 'Video'} Room`;
      showModal('create');
    };
  });

  elements.quickCreateVideo.onclick = () => {
    console.log('Quick create video button clicked');
    elements.roomTypeInput.value = 'video';
    elements.modalTitle.textContent = 'Create Video Room';
    showModal('create');
  };

  elements.quickCreateVoice.onclick = () => {
    console.log('Quick create voice button clicked');
    elements.roomTypeInput.value = 'voice';
    elements.modalTitle.textContent = 'Create Voice Room';
    showModal('create');
  };

  // Delete room button
  elements.deleteRoomBtn.onclick = () => {
    if (state.currentRoom && confirm(`Are you sure you want to delete room "${state.currentRoom}"? This action cannot be undone.`)) {
      sendMessage({
        type: 'delete-room',
        roomName: state.currentRoom
      });
    }
  };

  elements.cancelCreateBtn.onclick = hideModals;
  elements.cancelJoinBtn.onclick = hideModals;

  elements.confirmCreateBtn.onclick = async () => {
    const name = elements.roomNameInput.value.trim();
    const password = elements.roomPasswordInput.value.trim();
    const roomType = elements.roomTypeInput.value;
    
    if (name) {
      console.log('Creating room:', name, 'type:', roomType);
      
      // Always try to get audio, video is optional for video rooms
      try {
        if (roomType === 'video') {
          // For video rooms, try video first, fallback to audio-only
          try {
            await getLocalMedia(true);
          } catch (error) {
            console.log('Video failed, trying audio-only for video room');
            await getLocalMedia(false);
          }
        } else {
          // For voice rooms, only need audio
          await getLocalMedia(false);
        }
      } catch (error) {
        console.log('All media access failed, joining without media:', error.message);
      }
      
      const message = { type: 'create-room', name, password, roomType };
      console.log('Sending create room message:', message);
      sendMessage(message);
      elements.roomNameInput.value = '';
      elements.roomPasswordInput.value = '';
    }
  };

  elements.confirmJoinBtn.onclick = async () => {
    const password = elements.joinPasswordInput.value;
    if (state.pendingJoin) {
      console.log('Attempting to join room:', state.pendingJoin, 'with password:', password);
      await joinRoom(state.pendingJoin, password);
      elements.joinPasswordInput.value = '';
      state.pendingJoin = null;
      hideModals();
    }
  };

  // Video call controls
  elements.micBtn.onclick = async () => {
    if (!state.localStream) {
      await getLocalMedia();
      return;
    }
    
    state.muted = !state.muted;
    if (state.localStream) {
      state.localStream.getAudioTracks().forEach(track => {
        track.enabled = !state.muted;
      });
    }
    elements.micBtn.classList.toggle('muted', state.muted);
    
    // Send mic status to other participants
    sendMessage({ 
      type: 'media-status', 
      micEnabled: !state.muted, 
      videoEnabled: state.videoEnabled 
    });
    
    updateMicButton();
  };

  elements.videoBtn.onclick = async () => {
    if (!state.localStream) {
      await getLocalMedia(true); // Force video request
      return;
    }
    
    state.videoEnabled = !state.videoEnabled;
    
    // If enabling video but no video tracks, request new stream
    if (state.videoEnabled && state.localStream.getVideoTracks().length === 0) {
      await getLocalMedia(true);
    } else if (state.localStream) {
      state.localStream.getVideoTracks().forEach(track => {
        track.enabled = state.videoEnabled;
      });
    }
    
    elements.videoBtn.classList.toggle('off', !state.videoEnabled);
    
    // Send video status to other participants
    sendMessage({ 
      type: 'media-status', 
      micEnabled: !state.muted, 
      videoEnabled: state.videoEnabled 
    });
    
    updateLocalVideo();
    updateVideoButton();
  };

  elements.leaveBtn.onclick = () => {
    if (state.currentRoom) {
      sendMessage({ type: 'leave-room' });
    }
    switchToLobby();
  };

  // Voice call controls
  elements.voiceMicBtn.onclick = async () => {
    if (!state.localStream) {
      await getLocalMedia(false);
      return;
    }
    
    state.muted = !state.muted;
    if (state.localStream) {
      state.localStream.getAudioTracks().forEach(track => {
        track.enabled = !state.muted;
      });
    }
    elements.voiceMicBtn.classList.toggle('muted', state.muted);
    
    // Send mic status to other participants
    sendMessage({ 
      type: 'media-status', 
      micEnabled: !state.muted, 
      videoEnabled: state.videoEnabled 
    });
    
    updateMicButton();
  };

  elements.voiceReactionsBtn.onclick = (e) => {
    e.stopPropagation();
    state.voiceReactionsOpen = !state.voiceReactionsOpen;
    if (elements.voiceReactionsPanel) {
      elements.voiceReactionsPanel.style.display = state.voiceReactionsOpen ? 'block' : 'none';
    }
    
    if (state.voiceReactionsOpen) {
      closeOptionsMenu();
    }
  };

  elements.voiceLeaveBtn.onclick = () => {
    if (state.currentRoom) {
      sendMessage({ type: 'leave-room' });
    }
    switchToLobby();
  };

  // Options menu handlers
  elements.screenShareBtn.onclick = () => {
    state.screenSharing = !state.screenSharing;
    if (state.currentRoom) {
      sendMessage({
        type: 'screen-share',
        enabled: state.screenSharing
      });
    }
    elements.screenShareBtn.textContent = state.screenSharing ? '🛑 Stop Sharing' : '📺 Share Screen';
  };

  elements.reactionsBtn.onclick = (e) => {
    e.stopPropagation();
    state.reactionsOpen = !state.reactionsOpen;
    if (elements.reactionsPanel) {
      elements.reactionsPanel.style.display = state.reactionsOpen ? 'block' : 'none';
    }
    
    if (state.reactionsOpen) {
      closeOptionsMenu();
    }
  };

  // Reaction buttons (for both video and voice)
  document.querySelectorAll('.reaction-btn').forEach(btn => {
    btn.onclick = () => {
      const reaction = btn.dataset.reaction;
      sendMessage({ 
        type: 'reaction', 
        reaction,
        room: state.currentRoom 
      });
      closeReactionsPanel();
      closeVoiceReactionsPanel();
    };
  });

  // Options menu button
  elements.optionsBtn.onclick = (e) => {
    e.stopPropagation();
    state.optionsMenuOpen = !state.optionsMenuOpen;
    if (elements.optionsMenu) {
      elements.optionsMenu.style.display = state.optionsMenuOpen ? 'block' : 'none';
    }
    
    if (state.optionsMenuOpen) {
      closeReactionsPanel();
    }
  };

  elements.voiceOptionsBtn.onclick = (e) => {
    e.stopPropagation();
    state.optionsMenuOpen = !state.optionsMenuOpen;
    if (elements.optionsMenu) {
      elements.optionsMenu.style.display = state.optionsMenuOpen ? 'block' : 'none';
    }
    
    if (state.optionsMenuOpen) {
      closeVoiceReactionsPanel();
    }
  };

  // Close menus when clicking outside
  document.addEventListener('click', (e) => {
    if (!elements.optionsMenu.contains(e.target) && !elements.optionsBtn.contains(e.target) && !elements.voiceOptionsBtn.contains(e.target)) {
      closeOptionsMenu();
    }
    if (!elements.reactionsPanel.contains(e.target) && !elements.reactionsBtn.contains(e.target)) {
      closeReactionsPanel();
    }
    if (!elements.voiceReactionsPanel.contains(e.target) && !elements.voiceReactionsBtn.contains(e.target)) {
      closeVoiceReactionsPanel();
    }
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && state.currentRoom) {
      e.preventDefault();
      // Toggle mute with spacebar
      if (state.currentRoomType === 'video') {
        elements.micBtn.click();
      } else {
        elements.voiceMicBtn.click();
      }
    }
  });
});

// Add missing utility functions
function updateMicButton() {
  if (elements.micBtn) {
    elements.micBtn.classList.toggle('muted', state.muted);
  }
  if (elements.voiceMicBtn) {
    elements.voiceMicBtn.classList.toggle('muted', state.muted);
  }
}

function updateVideoButton() {
  if (elements.videoBtn) {
    elements.videoBtn.classList.toggle('off', !state.videoEnabled);
  }
}

function updateLocalVideo() {
  if (elements.localVideoElement && state.localStream) {
    elements.localVideoElement.srcObject = state.localStream;
    
    // Show/hide placeholder based on video availability
    const hasVideo = state.localStream.getVideoTracks().length > 0 && state.videoEnabled;
    if (elements.localPlaceholder) {
      elements.localPlaceholder.style.display = hasVideo ? 'none' : 'flex';
    }
  }
}
