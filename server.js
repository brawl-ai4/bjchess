const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static('public'));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Store rooms and waiting players
const rooms = new Map();
const waitingQueue = [];

// Generate 6-character room code
function generateRoomId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

wss.on('connection', (ws) => {
  console.log('Player connected');
  let currentRoom = null;
  let playerColor = null;

  ws.on('message', (message) => {
    try {
      const msg = JSON.parse(message);

      if (msg.type === 'create_room') {
        const roomId = generateRoomId();
        const room = {
          id: roomId,
          players: { white: ws, black: null },
          gameState: null,
          whiteTime: 600,
          blackTime: 600
        };
        rooms.set(roomId, room);
        currentRoom = roomId;
        playerColor = 'white';

        ws.send(JSON.stringify({
          type: 'room_created',
          roomId: roomId,
          color: 'white'
        }));
        console.log(`Room created: ${roomId}`);
      }

      else if (msg.type === 'join_room') {
        const room = rooms.get(msg.roomId);
        if (!room) {
          ws.send(JSON.stringify({ type: 'error', message: 'Room not found' }));
          return;
        }
        if (room.players.black !== null) {
          ws.send(JSON.stringify({ type: 'error', message: 'Room is full' }));
          return;
        }

        room.players.black = ws;
        currentRoom = msg.roomId;
        playerColor = 'black';

        // Notify both players
        ws.send(JSON.stringify({
          type: 'room_joined',
          roomId: msg.roomId,
          color: 'black'
        }));

        room.players.white.send(JSON.stringify({
          type: 'opponent_joined'
        }));

        // Start game
        const startMsg = { type: 'game_start', whiteTime: 600, blackTime: 600 };
        room.players.white.send(JSON.stringify(startMsg));
        room.players.black.send(JSON.stringify(startMsg));

        console.log(`Player joined room: ${msg.roomId}`);
      }

      else if (msg.type === 'move' && currentRoom) {
        const room = rooms.get(currentRoom);
        if (room) {
          const opponent = playerColor === 'white' ? room.players.black : room.players.white;
          if (opponent && opponent.readyState === WebSocket.OPEN) {
            opponent.send(JSON.stringify({
              type: 'move',
              move: msg.move,
              fen: msg.fen
            }));
          }

          if (msg.gameOver) {
            room.players.white.send(JSON.stringify({
              type: 'game_over',
              reason: msg.reason,
              winner: msg.winner
            }));
            room.players.black.send(JSON.stringify({
              type: 'game_over',
              reason: msg.reason,
              winner: msg.winner
            }));
          }
        }
      }

      else if (msg.type === 'chat' && currentRoom) {
        const room = rooms.get(currentRoom);
        if (room) {
          const opponent = playerColor === 'white' ? room.players.black : room.players.white;
          if (opponent && opponent.readyState === WebSocket.OPEN) {
            opponent.send(JSON.stringify({
              type: 'chat',
              color: playerColor,
              text: msg.text
            }));
          }
        }
      }

      else if (msg.type === 'draw_offer' && currentRoom) {
        const room = rooms.get(currentRoom);
        if (room) {
          const opponent = playerColor === 'white' ? room.players.black : room.players.white;
          if (opponent && opponent.readyState === WebSocket.OPEN) {
            opponent.send(JSON.stringify({
              type: 'draw_offer',
              from: playerColor
            }));
          }
        }
      }

      else if (msg.type === 'resign' && currentRoom) {
        const room = rooms.get(currentRoom);
        if (room) {
          const opponent = playerColor === 'white' ? room.players.black : room.players.white;
          const winner = playerColor === 'white' ? 'black' : 'white';
          room.players.white.send(JSON.stringify({
            type: 'game_over',
            reason: 'resign',
            winner: winner
          }));
          room.players.black.send(JSON.stringify({
            type: 'game_over',
            reason: 'resign',
            winner: winner
          }));
        }
      }
    } catch (err) {
      console.error('Message error:', err);
    }
  });

  ws.on('close', () => {
    if (currentRoom) {
      const room = rooms.get(currentRoom);
      if (room) {
        const opponent = playerColor === 'white' ? room.players.black : room.players.white;
        if (opponent && opponent.readyState === WebSocket.OPEN) {
          opponent.send(JSON.stringify({
            type: 'opponent_disconnected'
          }));
        }
        rooms.delete(currentRoom);
      }
    }
    console.log('Player disconnected');
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`CBJ Chess server running on http://localhost:${PORT}`);
});
