import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useGameStore } from '../store/gameStore';
import { socket } from '../socket';

interface HomeProps {
  prefilledCode?: string;
}

const Home: React.FC<HomeProps> = ({ prefilledCode }) => {
  const [name, setName] = useState('');
  const [code, setCode] = useState(prefilledCode || '');
  const { setPlayerName } = useGameStore();

  const handleCreate = () => {
    if (!name.trim()) return;
    setPlayerName(name.trim());
    socket.emit('create_room', { playerName: name.trim() });
  };

  const handleJoin = () => {
    if (!name.trim() || code.length < 6) return;
    setPlayerName(name.trim());
    socket.emit('join_room', { roomCode: code.toUpperCase(), playerName: name.trim() });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.4 }}
      className="relative z-10 flex h-full flex-col items-center justify-center gap-10 px-4 text-center"
    >
      {/* Title */}
      <div>
        <div className="mb-2 text-[0.85rem] uppercase tracking-[0.4em] text-white/50">
          Card Game
        </div>
        <h1 className="text-[4rem] font-black leading-none tracking-[0.12em] text-white">
          OLD MAID
        </h1>
        <div className="mt-2 text-[0.9rem] tracking-[0.2em] text-[#c0392b]">
          ♠ Don&apos;t hold the Joker ♠
        </div>
      </div>

      {/* Card decoration */}
      <div className="relative h-20 w-45">
        {['rotate(-20deg) translateX(-50px)', 'rotate(-8deg) translateX(-15px)', 'rotate(4deg) translateX(20px)', 'rotate(16deg) translateX(55px)'].map((t, i) => (
          <div key={i} style={{
            position: 'absolute', left: '50%', top: 0,
            width: '52px', height: '75px', borderRadius: '6px',
            background: '#1a1a1a',
            backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='16' height='16' viewBox='0 0 16 16' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M8 0L16 8L8 16L0 8Z' fill='%23c0392b' fill-opacity='0.12'/%3E%3C/svg%3E\")",
            backgroundSize: '16px 16px',
            border: '1px solid #333',
            transform: t,
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
          }} />
        ))}
      </div>

      {/* Form */}
      <div className="flex w-full max-w-[320px] flex-col gap-3">
        <input
          className="w-full rounded-lg border border-white/15 bg-black/35 px-4 py-3 text-base text-white outline-none transition placeholder:text-white/35 focus:border-[#c0392b]"
          type="text"
          placeholder="Your name"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && (code ? handleJoin() : handleCreate())}
          maxLength={20}
          autoFocus
        />
        <input
          className="w-full rounded-lg border border-white/15 bg-black/35 px-4 py-3 text-base uppercase tracking-[0.15em] text-white outline-none transition placeholder:text-white/35 focus:border-[#c0392b]"
          type="text"
          placeholder="Room code (to join)"
          value={code}
          onChange={e => setCode(e.target.value.toUpperCase())}
          onKeyDown={e => e.key === 'Enter' && handleJoin()}
          maxLength={6}
        />
        <div className="mt-1 flex gap-3">
          <button className="flex-1 rounded-lg border-0 bg-[#c0392b] px-6 py-3 text-base font-bold text-white transition hover:bg-[#a93226] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40" onClick={handleCreate} disabled={!name.trim()}>
            Create Game
          </button>
          <button className="flex-1 rounded-lg border border-white/15 bg-white/10 px-6 py-3 text-base font-semibold text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40" onClick={handleJoin} disabled={!name.trim() || code.length < 6}>
            Join Game
          </button>
        </div>
      </div>

      <div className="text-center text-[0.75rem] text-white/30">
        2–4 players · Share the room code with friends
      </div>
    </motion.div>
  );
};

export default Home;
