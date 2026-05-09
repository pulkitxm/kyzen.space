import { Server, Socket } from "socket.io";
import { GameEngine } from "./gameEngine";
import { nanoid } from "nanoid";

export interface Player {
  id: string;
  name: string;
  hand: string[];
  handSize: number;
  isEliminated: boolean;
  isConnected: boolean;
}

export interface Room {
  code: string;
  players: Player[];
  hostId: string;
  phase: 'lobby' | 'playing' | 'gameover';
  turnOrder: string[];
  currentTurnIdx: number;
  engine: GameEngine;
  loserId?: string;
  loserHeldCard?: string;
}

export class RoomManager {
  private rooms: Map<string, Room> = new Map();
  private io: Server;

  constructor(io: Server) {
    this.io = io;
  }

  createRoom(playerName: string, socket: Socket) {
    const roomCode = nanoid(6).toUpperCase();
    
    const engine = new GameEngine();
    const room: Room = {
      code: roomCode,
      players: [{
        id: socket.id,
        name: playerName,
        hand: [],
        handSize: 0,
        isEliminated: false,
        isConnected: true
      }],
      hostId: socket.id,
      phase: 'lobby',
      turnOrder: [],
      currentTurnIdx: 0,
      engine
    };

    this.rooms.set(roomCode, room);
    socket.join(roomCode);
    
    socket.emit("room_created", { roomCode, playerId: socket.id });
  }

  joinRoom(roomCode: string, playerName: string, socket: Socket) {
    const room = this.rooms.get(roomCode);
    if (!room) {
      socket.emit("error", { message: "Room not found" });
      return;
    }

    if (room.players.length >= 4) {
      socket.emit("error", { message: "Room is full" });
      return;
    }

    if (room.phase !== 'lobby') {
      socket.emit("error", { message: "Game already started" });
      return;
    }

    const player: Player = {
      id: socket.id,
      name: playerName,
      hand: [],
      handSize: 0,
      isEliminated: false,
      isConnected: true
    };

    room.players.push(player);
    socket.join(roomCode);

    socket.emit("room_joined", { 
      roomCode, 
      playerId: socket.id, 
      players: room.players.map(p => ({ id: p.id, name: p.name, handSize: p.handSize, isEliminated: p.isEliminated, isConnected: p.isConnected }))
    });

    this.io.to(roomCode).emit("player_joined", { 
      players: room.players.map(p => ({ id: p.id, name: p.name, handSize: p.handSize, isEliminated: p.isEliminated, isConnected: p.isConnected }))
    });
  }

  startGame(roomCode: string, socket: Socket) {
    const room = this.rooms.get(roomCode);
    if (!room || room.hostId !== socket.id) return;
    if (room.players.length < 2) return;

    room.phase = 'playing';
    
    // Deal cards
    const hands = room.engine.setupGame(room.players.map(p => p.id));
    
    room.players.forEach(p => {
      p.hand = hands[p.id];
      p.handSize = p.hand.length;
    });

    // Initial discard
    room.players.forEach(p => {
      const { newHand, discardedPairs } = room.engine.discardPairs(p.hand);
      p.hand = newHand;
      p.handSize = p.hand.length;
      
      if (discardedPairs.length > 0) {
        this.io.to(roomCode).emit("pair_discarded", {
          byPlayerId: p.id,
          cardIds: discardedPairs,
          remainingHandSize: p.handSize
        });
      }
    });

    room.turnOrder = room.players.map(p => p.id);
    room.currentTurnIdx = 0;

    // Send private hands
    room.players.forEach(p => {
      this.io.to(p.id).emit("your_hand", { cardIds: p.hand });
    });

    this.io.to(roomCode).emit("game_started", {
      hands: room.players.reduce((acc, p) => ({ ...acc, [p.id]: p.hand.length }), {}),
      turnOrder: room.turnOrder,
      currentTurn: room.turnOrder[room.currentTurnIdx]
    });

    this.emitTurnUpdate(room);
  }

  pickCard(roomCode: string, fromPlayerId: string, cardIndex: number, socket: Socket) {
    const room = this.rooms.get(roomCode);
    if (!room || room.phase !== 'playing') return;

    const currentPlayerId = room.turnOrder[room.currentTurnIdx];
    if (socket.id !== currentPlayerId) return;

    const picker = room.players.find(p => p.id === currentPlayerId);
    const victim = room.players.find(p => p.id === fromPlayerId);

    if (!picker || !victim || victim.hand.length === 0) return;

    // Actual pick
    const pickedCard = victim.hand.splice(cardIndex, 1)[0];
    victim.handSize = victim.hand.length;
    
    picker.hand.push(pickedCard);
    picker.handSize = picker.hand.length;

    this.io.to(roomCode).emit("card_picked", {
      byPlayerId: picker.id,
      fromPlayerId: victim.id,
      cardIndex
    });

    // Check for pair
    const { newHand, discardedPairs } = room.engine.discardPairs(picker.hand);
    picker.hand = newHand;
    picker.handSize = picker.hand.length;

    if (discardedPairs.length > 0) {
      this.io.to(roomCode).emit("pair_discarded", {
        byPlayerId: picker.id,
        cardIds: discardedPairs,
        remainingHandSize: picker.handSize
      });
    }

    // Update hands privately
    this.io.to(picker.id).emit("your_hand", { cardIds: picker.hand });
    this.io.to(victim.id).emit("your_hand", { cardIds: victim.hand });

    // Check elimination
    if (picker.handSize === 0) {
      picker.isEliminated = true;
      this.io.to(roomCode).emit("player_eliminated", { playerId: picker.id, reason: 'empty_hand' });
    }
    if (victim.handSize === 0) {
      victim.isEliminated = true;
      this.io.to(roomCode).emit("player_eliminated", { playerId: victim.id, reason: 'empty_hand' });
    }

    // Check Game Over
    const remainingPlayers = room.players.filter(p => !p.isEliminated);
    if (remainingPlayers.length === 1) {
      room.phase = 'gameover';
      room.loserId = remainingPlayers[0].id;
      room.loserHeldCard = remainingPlayers[0].hand[0];
      this.io.to(roomCode).emit("game_over", {
        loserId: room.loserId,
        loserHeldCard: room.loserHeldCard
      });
      return;
    }

    // Advance turn
    this.advanceTurn(room);
  }

  private advanceTurn(room: Room) {
    let nextIdx = (room.currentTurnIdx + 1) % room.turnOrder.length;
    while (room.players.find(p => p.id === room.turnOrder[nextIdx])?.isEliminated) {
      nextIdx = (nextIdx + 1) % room.turnOrder.length;
    }
    room.currentTurnIdx = nextIdx;
    this.emitTurnUpdate(room);
  }

  private emitTurnUpdate(room: Room) {
    const currentTurn = room.turnOrder[room.currentTurnIdx];
    // Pick from previous player (anti-clockwise)
    let prevIdx = (room.currentTurnIdx - 1 + room.turnOrder.length) % room.turnOrder.length;
    while (room.players.find(p => p.id === room.turnOrder[prevIdx])?.isEliminated) {
      prevIdx = (prevIdx - 1 + room.turnOrder.length) % room.turnOrder.length;
    }
    const canPickFrom = room.turnOrder[prevIdx];

    // Server randomizes the order of the opponent's face-down fan before sending card count?
    // Actually the prompt says: "Server randomizes the order of the opponent's face-down fan before sending card count so the Old Maid position changes each turn"
    // We'll shuffle the hand array of the 'canPickFrom' player internally before sending anything if needed, 
    // but the client only gets cardIndex. So we shuffle the hand here.
    const victim = room.players.find(p => p.id === canPickFrom);
    if (victim) {
      room.engine.shuffle(victim.hand);
      // Notify victim their hand order changed? 
      // "picker's updated hand is sent only to them via your_hand"
      // We should probably send the shuffled hand to the victim so they see the new order.
      this.io.to(victim.id).emit("your_hand", { cardIds: victim.hand });
    }

    this.io.to(room.code).emit("turn_changed", {
      currentTurn,
      canPickFrom
    });
  }

  handleDisconnect(socket: Socket) {
    // Find room
    for (const [code, room] of this.rooms.entries()) {
      const player = room.players.find(p => p.id === socket.id);
      if (player) {
        player.isConnected = false;
        this.io.to(code).emit("player_left", { 
          playerId: socket.id,
          players: room.players.map(p => ({ id: p.id, name: p.name, handSize: p.handSize, isEliminated: p.isEliminated, isConnected: p.isConnected }))
        });
        
        // If all players gone, delete room after some time
        // For now just leave it
        break;
      }
    }
  }

  handleReconnect(roomCode: string, playerId: string, socket: Socket) {
    const room = this.rooms.get(roomCode);
    if (!room) return;

    const player = room.players.find(p => p.id === playerId);
    if (player) {
      // Update socket ID? Socket.io re-join
      player.isConnected = true;
      socket.join(roomCode);
      
      // Send current state
      socket.emit("room_joined", { 
        roomCode, 
        playerId: socket.id, 
        players: room.players.map(p => ({ id: p.id, name: p.name, handSize: p.handSize, isEliminated: p.isEliminated, isConnected: p.isConnected }))
      });

      if (room.phase === 'playing') {
        socket.emit("your_hand", { cardIds: player.hand });
        socket.emit("game_started", {
          hands: room.players.reduce((acc, p) => ({ ...acc, [p.id]: p.hand.length }), {}),
          turnOrder: room.turnOrder,
          currentTurn: room.turnOrder[room.currentTurnIdx]
        });
      }
    }
  }
}
