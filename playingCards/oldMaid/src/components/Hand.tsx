import React from 'react';
import { motion } from 'framer-motion';
import { useGameStore } from '../store/gameStore';
import Card from './Card';

const Hand: React.FC = () => {
  const { myHand } = useGameStore();
  const total = myHand.length;

  return (
    <div
      style={{
        position: 'relative',
        height: '200px',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        minWidth: `${Math.max(200, total * 28 + 100)}px`,
      }}
    >
      {myHand.map((cardId, idx) => {
        const center = (total - 1) / 2;
        const offset = idx - center;
        const rotateZ = offset * (total > 8 ? 4 : 6);
        const translateY = Math.abs(offset) * 4;
        const translateX = offset * (total > 8 ? 22 : 30);

        return (
          <motion.div
            key={cardId}
            initial={{ y: -200, opacity: 0 }}
            animate={{
              y: translateY,
              x: translateX,
              rotateZ,
              opacity: 1,
            }}
            exit={{ y: -300, opacity: 0, rotateZ: rotateZ * 3, transition: { duration: 0.4 } }}
            transition={{
              // Only spring on first mount (initial), then instant for x/y repositioning
              type: 'spring',
              stiffness: 200,
              damping: 25,
              delay: 0, // No stagger - prevents re-staggering on hand change
            }}
            whileHover={{
              y: translateY - 30,
              transition: { type: 'spring', stiffness: 400, damping: 20 },
            }}
            style={{
              position: 'absolute',
              zIndex: idx,
              cursor: 'default',
              transformOrigin: 'bottom center',
            }}
          >
            <Card cardId={cardId} isFaceUp={true} />
          </motion.div>
        );
      })}
    </div>
  );
};

export default Hand;
