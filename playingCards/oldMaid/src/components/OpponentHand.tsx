import React from 'react';
import { motion } from 'framer-motion';
import { Player } from '../store/gameStore';

interface OpponentHandProps {
  player: Player;
  isPickable: boolean;
  onPick: (idx: number) => void;
}

const OpponentHand: React.FC<OpponentHandProps> = ({ player, isPickable, onPick }) => {
  const total = player.handSize;

  return (
    <div
      style={{
        position: 'relative',
        height: '130px',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        minWidth: `${Math.max(150, total * 22 + 80)}px`,
      }}
    >
      {Array.from({ length: total }).map((_, idx) => {
        const center = (total - 1) / 2;
        const offset = idx - center;
        const rotateZ = offset * (total > 8 ? 4 : 5);
        const translateX = offset * (total > 8 ? 18 : 24);
        const translateY = Math.abs(offset) * 3;

        return (
          <motion.div
            key={idx}
            initial={{ y: -120, opacity: 0 }}
            animate={{ y: translateY, x: translateX, rotateZ, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 25, delay: idx * 0.03 }}
            whileHover={
              isPickable
                ? {
                    y: translateY + 25,
                    scale: 1.08,
                    zIndex: 200,
                    transition: { type: 'spring', stiffness: 400, damping: 20 },
                  }
                : {}
            }
            onClick={() => isPickable && onPick(idx)}
            style={{
              position: 'absolute',
              zIndex: idx,
              cursor: isPickable ? 'pointer' : 'default',
              transformOrigin: 'top center',
            }}
          >
            {/* Card back */}
            <div
              style={{
                width: '80px',
                height: '115px',
                borderRadius: '8px',
                background: '#1a1a1a',
                backgroundImage:
                  "url(\"data:image/svg+xml,%3Csvg width='20' height='20' viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M10 0L20 10L10 20L0 10Z' fill='%23c0392b' fill-opacity='0.12'/%3E%3C/svg%3E\")",
                backgroundSize: '20px 20px',
                border: '1px solid #2c2c2a',
                boxShadow: isPickable
                  ? '0 0 12px rgba(192,57,43,0.55), 0 4px 10px rgba(0,0,0,0.4)'
                  : '0 4px 10px rgba(0,0,0,0.4)',
                transition: 'box-shadow 0.2s',
              }}
            />
          </motion.div>
        );
      })}
    </div>
  );
};

export default OpponentHand;
