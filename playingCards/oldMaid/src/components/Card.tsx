import React from 'react';

interface CardProps {
  cardId?: string;
  isFaceUp?: boolean;
  className?: string;
  onClick?: () => void;
  style?: React.CSSProperties;
}

const SUIT_SYMBOLS: Record<string, string> = {
  spades: '♠',
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
};

const Card: React.FC<CardProps> = ({ cardId, isFaceUp = false, className = '', onClick, style }) => {
  const isJoker = cardId === 'joker';
  const isRed = cardId ? cardId.includes('hearts') || cardId.includes('diamonds') : false;
  const rank = cardId && !isJoker ? cardId.split('-')[0] : '';
  const suit = cardId && !isJoker ? cardId.split('-')[1] : '';

  return (
    <div
      className={className}
      onClick={onClick}
      style={{
        width: '90px',
        height: '130px',
        borderRadius: '8px',
        position: 'relative',
        cursor: onClick ? 'pointer' : 'inherit',
        ...style,
      }}
    >
      {/* Back face */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '8px',
          background: '#1a1a1a',
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg width='20' height='20' viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M10 0L20 10L10 20L0 10Z' fill='%23c0392b' fill-opacity='0.12'/%3E%3C/svg%3E\")",
          backgroundSize: '20px 20px',
          border: '1px solid #2c2c2a',
          boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
          opacity: isFaceUp ? 0 : 1,
          transition: 'opacity 0.25s',
        }}
      />

      {/* Front face */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '8px',
          background: isJoker ? '#111' : '#f5f0eb',
          border: '1px solid #2c2c2a',
          boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
          display: 'flex',
          flexDirection: 'column',
          padding: '6px 8px',
          color: isJoker ? '#c0392b' : isRed ? '#c0392b' : '#1a1a1a',
          opacity: isFaceUp ? 1 : 0,
          transition: 'opacity 0.25s',
          userSelect: 'none',
        }}
      >
        {isJoker ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              fontSize: '1.1rem',
              fontWeight: 900,
              fontFamily: 'Courier New, monospace',
              letterSpacing: '0.05em',
              textShadow: '0 0 8px rgba(192,57,43,0.7)',
            }}
          >
            JOKER
          </div>
        ) : (
          <>
            <div style={{ fontSize: '1rem', fontWeight: 700, lineHeight: 1 }}>{rank}</div>
            <div style={{ fontSize: '0.85rem', lineHeight: 1 }}>{SUIT_SYMBOLS[suit] ?? ''}</div>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.6rem' }}>
              {SUIT_SYMBOLS[suit] ?? ''}
            </div>
            <div style={{ fontSize: '1rem', fontWeight: 700, lineHeight: 1, alignSelf: 'flex-end', transform: 'rotate(180deg)' }}>
              {rank}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Card;
