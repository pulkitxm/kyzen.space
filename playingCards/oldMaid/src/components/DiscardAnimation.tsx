import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';

interface DiscardAnimationProps {
  cardIds: string[];
}

const SUIT_SYMBOLS: Record<string, string> = {
  spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣',
};

const MiniCard: React.FC<{ cardId: string }> = ({ cardId }) => {
  const isJoker = cardId === 'joker';
  const isRed = cardId.includes('hearts') || cardId.includes('diamonds');
  const rank = !isJoker ? cardId.split('-')[0] : '';
  const suit = !isJoker ? cardId.split('-')[1] : '';

  return (
    <div
      style={{
        width: '70px', height: '100px', borderRadius: '7px',
        background: isJoker ? '#111' : '#f5f0eb',
        border: '1px solid #2c2c2a',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        color: isJoker ? '#c0392b' : isRed ? '#c0392b' : '#1a1a1a',
        fontSize: '1.4rem', fontWeight: 700,
        boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
      }}
    >
      {isJoker ? 'J' : (
        <>
          <div style={{ fontSize: '0.85rem' }}>{rank}</div>
          <div>{SUIT_SYMBOLS[suit] ?? ''}</div>
        </>
      )}
    </div>
  );
};

const DiscardAnimation: React.FC<DiscardAnimationProps> = ({ cardIds }) => {
  const pair = cardIds.slice(0, 2);

  useEffect(() => {
    const t = setTimeout(() => {
      confetti({ particleCount: 35, spread: 45, origin: { y: 0.5 }, colors: ['#c0392b', '#f5f0eb'] });
    }, 400);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        pointerEvents: 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '2rem',
      }}
    >
      {pair.map((cardId, i) => (
        <motion.div
          key={i}
          initial={{ x: i === 0 ? -180 : 180, opacity: 0, scale: 0.7 }}
          animate={{ x: 0, opacity: 1, scale: 1.1 }}
          exit={{ scale: 0, opacity: 0, y: -30 }}
          transition={{ type: 'spring', stiffness: 300, damping: 22 }}
        >
          <MiniCard cardId={cardId} />
        </motion.div>
      ))}
    </div>
  );
};

export default DiscardAnimation;
