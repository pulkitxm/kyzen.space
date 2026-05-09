import { createServer } from "http";
import { Server } from "socket.io";
import { RoomManager } from "../playingCards/oldMaid/server/roomManager";

const port = 3001;
const httpServer = createServer();
const io = new Server(httpServer, {
  cors: {
    origin: ["http://localhost:5173", "http://localhost:3000"],
    methods: ["GET", "POST"]
  }
});

const roomManager = new RoomManager(io);

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  socket.on("create_room", ({ playerName }) => {
    roomManager.createRoom(playerName, socket);
  });

  socket.on("join_room", ({ roomCode, playerName }) => {
    roomManager.joinRoom(roomCode, playerName, socket);
  });

  socket.on("reconnect", ({ roomCode, playerId }) => {
    roomManager.handleReconnect(roomCode, playerId, socket);
  });

  socket.on("start_game", ({ roomCode }) => {
    roomManager.startGame(roomCode, socket);
  });

  socket.on("pick_card", ({ roomCode, fromPlayerId, cardIndex }) => {
    roomManager.pickCard(roomCode, fromPlayerId, cardIndex, socket);
  });

  socket.on("ready_for_turn", () => {
    // Client ack, can be used for syncing
  });

  socket.on("disconnect", () => {
    roomManager.handleDisconnect(socket);
  });
});

httpServer.listen(port, () => {
  console.log(`Socket server running on port ${port}`);
});
