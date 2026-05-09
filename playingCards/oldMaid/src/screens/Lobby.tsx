import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '../store/gameStore';
import { socket } from '../socket';

const Lobby: React.FC = () => {
  const { roomCode, players, playerId } = useGameStore();
  const isHost = players.length > 0 && players[0].id === playerId;
  const canStart = players.length >= 2;

  const copyCode = () => {
    if (roomCode) navigator.clipboard.writeText(roomCode).catch(() => {});
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="relative z-10 flex h-full flex-col items-center justify-center gap-8 px-4"
    >
      {/* Room Code */}
      <div className="text-center">
        <div className="mb-2.5 text-[0.75rem] uppercase tracking-[0.3em] text-white/45">
          Room Code
        </div>
        <div className="flex items-center gap-4">
          <span className="font-mono text-[2.8rem] font-black tracking-[0.6rem] text-[#c0392b] drop-shadow-[0_0_20px_rgba(192,57,43,0.5)]">{roomCode}</span>
          <button
            onClick={copyCode}
            className="rounded-md border border-white/15 bg-white/10 px-3 py-1.5 text-sm text-white/70 transition hover:bg-white/15"
          >
            Copy
          </button>
        </div>
        <div className="mt-2 text-[0.78rem] text-white/35">
          Share this code with your friends
        </div>
      </div>

      {/* Player slots */}
      <div className="grid w-full max-w-85 grid-cols-2 gap-4">
        <AnimatePresence>
          {players.map((player, idx) => (
            <motion.div
              key={player.id}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 22, delay: idx * 0.05 }}
              className={`flex flex-col items-center gap-2.5 rounded-[10px] border px-3 py-4 ${player.id === playerId ? 'border-[#c0392b]/30 bg-[#c0392b]/10' : 'border-white/10 bg-white/5'}`}
            >
              {/* Card back avatar */}
              <div style={{
                width: '44px', height: '62px', borderRadius: '5px',
                background: '#1a1a1a',
                backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='14' height='14' viewBox='0 0 14 14' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M7 0L14 7L7 14L0 7Z' fill='%23c0392b' fill-opacity='0.12'/%3E%3C/svg%3E\")",
                backgroundSize: '14px 14px',
                border: '1px solid #2c2c2a',
                boxShadow: '0 3px 8px rgba(0,0,0,0.4)',
              }} />
              <div className="text-center">
                <div className="text-[0.85rem] font-semibold text-white">{player.name}</div>
                {player.id === playerId && (
                  <div className="mt-0.5 text-[0.7rem] text-[#c0392b]">You</div>
                )}
                {idx === 0 && player.id !== playerId && (
                  <div className="mt-0.5 text-[0.7rem] text-white/40">Host</div>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Empty slots */}
        {Array.from({ length: 4 - players.length }).map((_, idx) => (
          <div
            key={`empty-${idx}`}
            className="flex min-h-27.5 flex-col items-center justify-center rounded-[10px] border border-dashed border-white/10 p-4"
          >
            <div className="text-2xl opacity-20">＋</div>
            <div className="mt-1 text-[0.75rem] text-white/25">Waiting…</div>
          </div>
        ))}
      </div>

      {/* Action */}
      {isHost ? (
        <div className="flex flex-col items-center gap-2">
          <motion.button
            className="rounded-lg bg-[#c0392b] px-12 py-[0.9rem] text-base font-bold tracking-[0.08em] text-white transition hover:bg-[#a93226] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
            onClick={() => socket.emit('start_game', { roomCode })}
            disabled={!canStart}
            animate={canStart ? { scale: [1, 1.03, 1] } : {}}
            transition={{ repeat: Infinity, duration: 2 }}
          >
            START GAME
          </motion.button>
          {!canStart && (
            <div className="text-[0.75rem] text-white/35">
              Need at least 2 players
            </div>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2 text-sm text-white/60">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#c0392b] animate-[bounce_1.2s_ease-in-out_infinite]" style={{ animationDelay: '0s' }} />
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#c0392b] animate-[bounce_1.2s_ease-in-out_infinite]" style={{ animationDelay: '0.2s' }} />
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#c0392b] animate-[bounce_1.2s_ease-in-out_infinite]" style={{ animationDelay: '0.4s' }} />
          <span className="ml-1">Waiting for host to start…</span>
        </div>
      )}
    </motion.div>
  );
};

export default Lobby;
