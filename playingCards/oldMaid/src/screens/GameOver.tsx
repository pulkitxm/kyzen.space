import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { useGameStore } from '../store/gameStore';
import { socket } from '../socket';
import Card from '../components/Card';
import confetti from 'canvas-confetti';

const GameOver: React.FC = () => {
  const { loserId, loserHeldCard, players, roomCode, playerId, resetGame } = useGameStore();
  const loser = players.find(p => p.id === loserId);
  const winners = players.filter(p => p.id !== loserId);
  const isHost = players.length > 0 && players[0].id === playerId;

  useEffect(() => {
    if (playerId !== loserId) {
      confetti({
        particleCount: 150,
        spread: 70,
        origin: { y: 0.6 }
      });
    }
  }, [loserId, playerId]);

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/80 backdrop-blur-md"
      style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(12px)' }}
    >
      <motion.div 
        initial={{ scale: 0.5, y: 100 }}
        animate={{ scale: 1, y: 0 }}
        className="flex flex-col items-center gap-8"
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2rem' }}
      >
        <h1 className="text-6xl font-black text-red-600 animate-pulse" style={{ fontSize: '4rem', fontWeight: 900, color: '#c0392b' }}>OLD MAID!</h1>
        
        <div className="relative group" style={{ position: 'relative' }}>
          <Card cardId={loserHeldCard || 'joker'} isFaceUp={true} className="w-64 h-96" style={{ width: '200px', height: '300px' }} />
          <motion.div 
            animate={{ x: [0, -10, 10, -10, 10, 0] }}
            transition={{ repeat: Infinity, duration: 0.5 }}
            className="absolute -top-12 -right-12 bg-black border-2 border-red-600 px-4 py-2 rounded-full text-white font-bold rotate-12"
            style={{ position: 'absolute', top: '-1rem', right: '-1rem', background: 'black', border: '2px solid #c0392b', padding: '0.5rem 1rem', borderRadius: '9999px', color: 'white', fontWeight: 'bold', transform: 'rotate(12deg)' }}
          >
            LOSER: {loser?.name}
          </motion.div>
        </div>

        <div className="flex flex-col items-center gap-4" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
          <h2 className="text-white text-2xl font-bold">Safe Players:</h2>
          <div className="flex gap-4" style={{ display: 'flex', gap: '1rem' }}>
            {winners.map(w => (
              <motion.div 
                key={w.id}
                animate={{ y: [0, -10, 0] }}
                transition={{ repeat: Infinity, duration: 2, delay: 0.2 * winners.indexOf(w) }}
                className="bg-white/10 px-4 py-2 rounded-lg text-white"
                style={{ background: 'rgba(255,255,255,0.1)', padding: '0.5rem 1rem', borderRadius: '0.5rem', color: 'white' }}
              >
                {w.name} 🏆
              </motion.div>
            ))}
          </div>
        </div>

        <div className="flex gap-4" style={{ display: 'flex', gap: '1rem' }}>
          {isHost ? (
            <button 
              onClick={() => socket.emit("start_game", { roomCode })}
              className="px-8 py-3 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 transition-all"
              style={{ padding: '0.75rem 2rem', background: '#c0392b', color: 'white', fontWeight: 'bold', borderRadius: '0.5rem', border: 'none', cursor: 'pointer' }}
            >
              Play Again
            </button>
          ) : (
            <div className="text-white opacity-60">Waiting for host to restart...</div>
          )}
          <button 
            onClick={resetGame}
            className="px-8 py-3 bg-white/10 text-white font-bold rounded-lg hover:bg-white/20 transition-all"
            style={{ padding: '0.75rem 2rem', background: 'rgba(255,255,255,0.1)', color: 'white', fontWeight: 'bold', borderRadius: '0.5rem', border: 'none', cursor: 'pointer' }}
          >
            Leave Game
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default GameOver;
