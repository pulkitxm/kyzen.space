import React from 'react';
import { motion } from 'framer-motion';

// Subtle card-fly indicator when a pick happens.
// Just a small card-back that travels from opponent zone to player zone.
// We don't pass from/to coordinates here — just animate vertically
// since true DOM position tracking would require refs.

interface PickingAnimationProps {
  isMe: boolean; // true = card coming TO me (I picked), false = card going to opponent (they picked from me)
}

const PickingAnimation: React.FC<PickingAnimationProps> = ({ isMe }) => {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1500,
        pointerEvents: 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <motion.div
        initial={{ y: isMe ? -200 : 200, opacity: 0, rotateY: 0, scale: 0.8 }}
        animate={{
          y: 0,
          opacity: [0, 1, 1, 0],
          rotateY: isMe ? [0, 0, 180] : 0,
          scale: [0.8, 1.1, 1, 0.8],
        }}
        transition={{ duration: 0.9, ease: 'easeInOut' }}
        style={{ perspective: '800px' }}
      >
        {/* Card back visual */}
        <div
          style={{
            width: '70px', height: '100px', borderRadius: '8px',
            background: '#1a1a1a',
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg width='20' height='20' viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M10 0L20 10L10 20L0 10Z' fill='%23c0392b' fill-opacity='0.15'/%3E%3C/svg%3E\")",
            backgroundSize: '20px 20px',
            border: '1px solid #2c2c2a',
            boxShadow: '0 0 20px rgba(192,57,43,0.4), 0 6px 20px rgba(0,0,0,0.5)',
          }}
        />
      </motion.div>
    </div>
  );
};

export default PickingAnimation;
