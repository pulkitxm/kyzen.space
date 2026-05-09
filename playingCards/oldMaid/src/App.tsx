"use client";
import React, { useEffect } from 'react';
import { useGameStore } from './store/gameStore';
import { socket } from './socket';
import Home from './screens/Home';
import Lobby from './screens/Lobby';
import GameBoard from './screens/GameBoard';
import GameOver from './screens/GameOver';
import { AnimatePresence } from 'framer-motion';

interface AppProps {
  roomCode?: string;
}

interface RoomJoinedPayload {
  roomCode: string;
  playerId: string;
  players: Array<{
    id: string;
    name: string;
    handSize: number;
    isEliminated: boolean;
    isConnected: boolean;
  }>;
}

interface PlayerJoinedPayload {
  players: Array<{
    id: string;
    name: string;
    handSize: number;
    isEliminated: boolean;
    isConnected: boolean;
  }>;
}

const App: React.FC<AppProps> = ({ roomCode }) => {
  const { 
    phase, setRoom, setPlayers, setPhase, 
    setMyHand, setCurrentTurn, updateHandSizes,
    eliminatePlayer, setGameOver, playerId,
    addDiscardedCards, setPickingState
  } = useGameStore();

  useEffect(() => {
    const onRoomCreated = ({ roomCode, playerId: newPlayerId }: RoomJoinedPayload) => {
      setRoom(roomCode, newPlayerId);
      if (typeof window !== 'undefined') {
        localStorage.setItem("oldMaid_room", JSON.stringify({ roomCode, playerId: newPlayerId }));
        window.history.pushState({}, '', `/oldmaid/${roomCode}`);
      }
      setPhase('lobby');
    };

    const onRoomJoined = ({ roomCode, playerId: newPlayerId, players }: RoomJoinedPayload) => {
      setRoom(roomCode, newPlayerId);
      setPlayers(players);
      if (typeof window !== 'undefined') {
        localStorage.setItem("oldMaid_room", JSON.stringify({ roomCode, playerId: newPlayerId }));
        window.history.pushState({}, '', `/oldmaid/${roomCode}`);
      }
      setPhase('lobby');
    };

    socket.on("room_created", onRoomCreated);
    socket.on("room_joined", onRoomJoined);
    socket.on("player_joined", ({ players }: PlayerJoinedPayload) => setPlayers(players));
    socket.on("player_left", ({ players }: PlayerJoinedPayload) => setPlayers(players));
    socket.on("game_started", ({ currentTurn }) => {
      setPhase('playing');
      setCurrentTurn(currentTurn);
    });
    socket.on("your_hand", ({ cardIds }) => setMyHand(cardIds));
    socket.on("turn_changed", ({ currentTurn, canPickFrom }) => setCurrentTurn(currentTurn, canPickFrom));
    socket.on("card_picked", ({ byPlayerId, fromPlayerId, cardIndex }) => {
      setPickingState({ from: fromPlayerId, to: byPlayerId, cardIdx: cardIndex });
      setTimeout(() => setPickingState(null), 1500);
    });
    socket.on("pair_discarded", ({ byPlayerId, cardIds, remainingHandSize }) => {
      updateHandSizes({ [byPlayerId]: remainingHandSize });
      if (byPlayerId === playerId) {
        addDiscardedCards(cardIds);
      }
    });
    socket.on("player_eliminated", ({ playerId: elimId }) => eliminatePlayer(elimId));
    socket.on("game_over", ({ loserId, loserHeldCard }) => setGameOver(loserId, loserHeldCard));
    socket.on("error", ({ message }) => alert(message));

    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem("oldMaid_room");
      if (saved) {
        try {
          const { roomCode, playerId: savedId } = JSON.parse(saved);
          socket.emit("reconnect", { roomCode, playerId: savedId });
        } catch (e) {
          console.error("Failed to parse saved room", e);
        }
      }
    }

    return () => {
      socket.off("room_created");
      socket.off("room_joined");
      socket.off("player_joined");
      socket.off("player_left");
      socket.off("game_started");
      socket.off("your_hand");
      socket.off("turn_changed");
      socket.off("card_picked");
      socket.off("pair_discarded");
      socket.off("player_eliminated");
      socket.off("game_over");
      socket.off("error");
    };
  }, [
    playerId, setRoom, setPlayers, setPhase, setMyHand, 
    setCurrentTurn, updateHandSizes, eliminatePlayer, 
    setGameOver, addDiscardedCards, setPickingState
  ]);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[radial-gradient(ellipse_at_center,_#224b38_0%,_#1b3a2d_60%,_#122a1f_100%)] text-white">
      <div className="pointer-events-none absolute inset-0 z-0 bg-[repeating-linear-gradient(0deg,transparent,transparent_3px,rgba(255,255,255,0.012)_3px,rgba(255,255,255,0.012)_4px)]" />
      <AnimatePresence mode="wait">
        {phase === 'home' && <Home key="home" prefilledCode={roomCode} />}
        {phase === 'lobby' && <Lobby key="lobby" />}
        {(phase === 'playing' || phase === 'gameover') && <GameBoard key="game" />}
      </AnimatePresence>
      
      <AnimatePresence>
        {phase === 'gameover' && <GameOver key="gameover" />}
      </AnimatePresence>
    </div>
  );
};

export default App;
