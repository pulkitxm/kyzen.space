import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '../store/gameStore';
import { socket } from '../socket';
import Hand from '../components/Hand';
import OpponentHand from '../components/OpponentHand';
import DiscardAnimation from '../components/DiscardAnimation';
import PickingAnimation from '../components/PickingAnimation';

const TurnRing: React.FC = () => (
  <div
    className="pointer-events-none absolute -inset-2.5 rounded-xl border-2 border-[#c0392b] shadow-[0_0_0_2px_rgba(192,57,43,0.25),0_0_16px_rgba(192,57,43,0.4)] animate-pulse"
  />
);

const GameBoard: React.FC = () => {
  const { players, playerId, currentTurn, canPickFrom, roomCode, discardingCards, pickingState } =
    useGameStore();

  const me = players.find((p) => p.id === playerId);
  const opponents = players.filter((p) => p.id !== playerId);
  const isMyTurn = currentTurn === playerId;

  const getOpponentPosition = (idx: number): React.CSSProperties => {
    const base: React.CSSProperties = {
      position: 'absolute',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '0.75rem',
    };
    if (opponents.length === 1) return { ...base, top: '40px', left: '50%', transform: 'translateX(-50%)' };
    if (opponents.length === 2) {
      if (idx === 0) return { ...base, left: '80px', top: '50%', transform: 'translateY(-50%)' };
      return { ...base, right: '80px', top: '50%', transform: 'translateY(-50%)' };
    }
    if (opponents.length === 3) {
      if (idx === 0) return { ...base, left: '80px', top: '50%', transform: 'translateY(-50%)' };
      if (idx === 1) return { ...base, top: '40px', left: '50%', transform: 'translateX(-50%)' };
      return { ...base, right: '80px', top: '50%', transform: 'translateY(-50%)' };
    }
    return base;
  };

  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center">
      {/* Overlays */}
      <AnimatePresence>
        {discardingCards.length > 0 && <DiscardAnimation key="discard" cardIds={discardingCards} />}
        {pickingState && (
          <PickingAnimation key="pick" isMe={pickingState.to === playerId} />
        )}
      </AnimatePresence>

      {/* Opponents */}
      {opponents.map((opp, idx) => {
        const isActive = currentTurn === opp.id;
        const isPickable = isMyTurn && canPickFrom === opp.id;

        return (
          <div key={opp.id} style={getOpponentPosition(idx)}>
            <div style={{ position: 'relative' }}>
              {isActive && <TurnRing />}
              <OpponentHand player={opp} isPickable={isPickable} onPick={(cardIdx) => {
                socket.emit('pick_card', { roomCode, fromPlayerId: opp.id, cardIndex: cardIdx });
              }} />
            </div>
            <div style={{ textAlign: 'center', color: 'white' }}>
              <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>
                {opp.name} {opp.isEliminated ? '🏆' : ''}
              </div>
              <div style={{ fontSize: '0.75rem', opacity: 0.6 }}>
                {opp.handSize} card{opp.handSize !== 1 ? 's' : ''}
              </div>
              {isPickable && (
                <div style={{ fontSize: '0.75rem', color: '#c0392b', fontWeight: 700, marginTop: '2px' }}>
                  ← PICK A CARD
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Center discard pile hint */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-15">
        <div className="relative h-25 w-17.5">
          {[15, -8, 0].map((rot, i) => (
            <div
              key={i}
              className="absolute h-25 w-17.5 rounded-lg border border-[#444] bg-[#1a1a1a]"
              style={{ transform: `rotate(${rot}deg)` }}
            />
          ))}
        </div>
      </div>

      {/* My hand */}
      <div className="absolute bottom-7 flex w-full flex-col items-center gap-2.5">
        <div style={{ position: 'relative' }}>
          {isMyTurn && <TurnRing />}
          <Hand />
        </div>
        <div className="text-center text-white">
          <div className="font-bold">{me?.name ?? 'You'} {me?.isEliminated ? '🏆 SAFE' : ''}</div>
          {isMyTurn ? (
            <motion.div
              animate={{ opacity: [1, 0.4, 1] }}
              transition={{ repeat: Infinity, duration: 1.2 }}
              className="text-[0.85rem] font-bold text-[#c0392b]"
            >
              YOUR TURN — PICK A CARD FROM OPPONENT
            </motion.div>
          ) : (
            <div className="text-[0.8rem] opacity-50">Waiting for your turn…</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GameBoard;
