"use client";

import { useReducer, useState } from "react";
import { createInitialState } from "./constants/initialState";
import { applyAction } from "./engine/applyAction";
import type { Action, GameState, Tile } from "./types";
import { Board } from "./ui/Board";
import { Controls } from "./ui/Controls";
import { FloatingTexts, useBoardSize } from "./ui/FloatingTexts";
import { PropertyPanel } from "./ui/PropertyPanel";
import { useGamePhase } from "./ui/useGamePhase";

function monopolyReducer(state: GameState, action: Action): GameState {
  return applyAction(state, action);
}

const TOKENS = ["🎩", "🚂", "🐕", "🚗", "⛵", "🎸", "👟", "🐈"];

function Setup({ onStart }: { onStart: (names: string[]) => void }) {
  const [names, setNames] = useState<{ id: string; name: string }[]>([
    { id: "p1", name: "Player 1" },
    { id: "p2", name: "Player 2" },
  ]);
  const [showRules, setShowRules] = useState(false);

  const addPlayer = () => {
    if (names.length < 8) {
      setNames([
        ...names,
        {
          id: `p-${Date.now()}-${names.length}`,
          name: `Player ${names.length + 1}`,
        },
      ]);
    }
  };
  const removePlayer = (i: number) => {
    if (names.length > 2) setNames(names.filter((_, idx) => idx !== i));
  };

  return (
    <div
      className="app-canvas"
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'Inter', 'Segoe UI', sans-serif",
        padding: 24,
        position: "relative",
      }}
    >
      <div
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          background:
            "radial-gradient(ellipse 60% 50% at 50% 30%, var(--page-ambient) 0%, transparent 70%)",
        }}
      />

      <div
        style={{
          width: "100%",
          maxWidth: 420,
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: 20,
          padding: "40px 36px",
          backdropFilter: "blur(8px)",
          boxShadow: "0 10px 30px rgba(0,0,0,0.15)",
          position: "relative",
          zIndex: 1,
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>🎩</div>
          <h1
            style={{
              fontSize: 36,
              fontWeight: 900,
              margin: 0,
              background:
                "linear-gradient(135deg, var(--primary), var(--accent-warm))",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              letterSpacing: -1,
            }}
          >
            Monopoly
          </h1>
          <p
            style={{
              color: "var(--muted-foreground)",
              margin: "6px 0 0",
              fontSize: 14,
            }}
          >
            Add players to begin
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {names.map((item, i) => (
            <div
              key={item.id}
              style={{ display: "flex", gap: 8, alignItems: "center" }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 18,
                  flexShrink: 0,
                }}
              >
                {TOKENS[i % TOKENS.length]}
              </div>
              <input
                value={item.name}
                onChange={(e) => {
                  const updated = [...names];
                  updated[i] = { ...updated[i], name: e.target.value };
                  setNames(updated);
                }}
                style={{
                  flex: 1,
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  background: "var(--background)",
                  color: "var(--foreground)",
                  fontSize: 14,
                  outline: "none",
                  fontFamily: "inherit",
                }}
                placeholder={`Player ${i + 1}`}
              />
              {names.length > 2 && (
                <button
                  type="button"
                  onClick={() => removePlayer(i)}
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    background:
                      "color-mix(in srgb, var(--danger) 12%, transparent)",
                    color: "var(--danger)",
                    cursor: "pointer",
                    fontSize: 14,
                    flexShrink: 0,
                  }}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>

        {names.length < 8 && (
          <button
            type="button"
            onClick={addPlayer}
            style={{
              width: "100%",
              marginTop: 12,
              padding: "10px 0",
              borderRadius: 10,
              border: "1px dashed var(--border)",
              background: "transparent",
              color: "var(--muted-foreground)",
              fontSize: 13,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            + Add Player
          </button>
        )}

        <button
          type="button"
          onClick={() => onStart(names.map((n) => n.name).filter(Boolean))}
          disabled={names.map((n) => n.name).filter(Boolean).length < 2}
          style={{
            width: "100%",
            marginTop: 16,
            padding: "14px 0",
            borderRadius: 12,
            border: "none",
            background:
              names.map((n) => n.name).filter(Boolean).length < 2
                ? "var(--surface)"
                : "var(--primary)",
            color:
              names.map((n) => n.name).filter(Boolean).length < 2
                ? "var(--muted-foreground)"
                : "var(--primary-foreground)",
            fontWeight: 800,
            fontSize: 16,
            cursor:
              names.map((n) => n.name).filter(Boolean).length < 2
                ? "not-allowed"
                : "pointer",
            fontFamily: "inherit",
            boxShadow:
              names.map((n) => n.name).filter(Boolean).length >= 2
                ? "0 8px 24px var(--page-ambient)"
                : "none",
            transition: "all 0.2s",
          }}
        >
          Start Game →
        </button>

        <button
          type="button"
          onClick={() => setShowRules(true)}
          style={{
            width: "100%",
            marginTop: 12,
            padding: "10px 0",
            borderRadius: 10,
            border: "1px solid var(--border)",
            background: "var(--surface)",
            color: "var(--muted-foreground)",
            fontSize: 13,
            cursor: "pointer",
            fontFamily: "inherit",
            fontWeight: 600,
            transition: "all 0.2s",
          }}
        >
          📖 How to Play & Rules
        </button>
      </div>

      {showRules && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.65)",
            zIndex: 500,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backdropFilter: "blur(4px)",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 500,
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: 20,
              padding: "30px 36px",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.3)",
              position: "relative",
            }}
          >
            <h2
              style={{
                margin: "0 0 16px 0",
                fontSize: 24,
                fontWeight: 800,
                background:
                  "linear-gradient(135deg, var(--primary), var(--accent-warm))",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              📖 Monopoly Rules & How to Play
            </h2>
            <div
              style={{
                maxHeight: "60vh",
                overflowY: "auto",
                color: "var(--foreground)",
                fontSize: 14,
                lineHeight: 1.6,
                display: "flex",
                flexDirection: "column",
                gap: 14,
                paddingRight: 8,
              }}
            >
              <div>
                <strong style={{ color: "var(--primary)" }}>Goal</strong>
                <br />
                Bankrupt all other players to be the last one standing and win
                the game!
              </div>
              <div>
                <strong style={{ color: "var(--primary)" }}>
                  Turns & Movement
                </strong>
                <br />
                Roll the dice to move clockwise around the board. Rolling
                doubles gives you an extra turn, but rolling doubles 3 times in
                a row sends you to Jail.
              </div>
              <div>
                <strong style={{ color: "var(--primary)" }}>
                  Buying Properties
                </strong>
                <br />
                When you land on an unowned Property, Railroad, or Utility, you
                can buy it for the listed price. If you own the entire color
                group, you can build houses and hotels to increase rent.
              </div>
              <div>
                <strong style={{ color: "var(--primary)" }}>
                  Rent & Taxes
                </strong>
                <br />
                Pay rent when landing on another player's property. Rent is
                higher if they own the full color group, or have houses/hotels.
                Land on Tax spaces to pay flat fees.
              </div>
              <div>
                <strong style={{ color: "var(--primary)" }}>Jail</strong>
                <br />
                Sent to Jail by landing on Go To Jail, rolling 3 doubles, or
                drawing a card. Exit by rolling doubles, paying $50, or using a
                Get Out of Jail Free card.
              </div>
              <div>
                <strong style={{ color: "var(--primary)" }}>
                  Chance & Community Chest
                </strong>
                <br />
                Land on these spaces to draw cards. You must draw within 3
                seconds, and the card's effect will apply to the board after a
                2-second reveal.
              </div>
              <div>
                <strong style={{ color: "var(--primary)" }}>Time Limits</strong>
                <br />
                To keep the game moving, you have a 3-second limit to end your
                turn.
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowRules(false)}
              style={{
                width: "100%",
                marginTop: 24,
                padding: "12px 0",
                borderRadius: 10,
                border: "none",
                background: "var(--primary)",
                color: "var(--primary-foreground)",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Got it!
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MonopolyGame({ playerNames }: { playerNames: string[] }) {
  const [state, dispatch] = useReducer(monopolyReducer, undefined, () =>
    createInitialState(playerNames),
  );

  const { ref: boardRef, size: boardSize } = useBoardSize();

  const {
    uiPhase,
    diceAnimPhase,
    diceDisplay,
    animatedPositions,
    destinationCell,
    floatingTexts,
    onRoll,
    wrappedDispatch,
    cardDrawCountdown,
    endTurnCountdown,
    drawnCard,
    onDrawCard,
  } = useGamePhase(state, dispatch);

  const [selectedTile, setSelectedTile] = useState<Tile | null>(null);

  const currentPlayer = state.players[state.currentPlayerIndex];
  const mustDrawCard =
    state.turnPhase === "LANDED" &&
    currentPlayer &&
    (state.board[currentPlayer.position]?.type === "Chance" ||
      state.board[currentPlayer.position]?.type === "CommunityChest");

  const isMoving = uiPhase === "MOVING";
  const landingPos =
    uiPhase === "LANDING" ? (currentPlayer?.position ?? null) : null;

  return (
    <div
      style={{
        display: "flex",
        gap: 20,
        padding: "16px 20px",
        alignItems: "flex-start",
        minHeight: "calc(100vh - 56px)",
        overflow: "auto",
      }}
    >
      {}
      <div
        style={{
          flex: "1 1 auto",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "center",
          minWidth: 0,
          position: "relative",
        }}
      >
        <Board
          state={state}
          animatedPositions={animatedPositions}
          isMoving={isMoving}
          landingPosition={landingPos}
          destinationCell={destinationCell}
          mustDrawCard={!!mustDrawCard}
          onTileClick={(tile) => setSelectedTile(tile)}
          dispatch={wrappedDispatch}
          boardRef={boardRef}
          boardSize={boardSize}
        />
        <FloatingTexts texts={floatingTexts} boardSize={boardSize} />
      </div>

      {}
      <div style={{ flexShrink: 0 }}>
        <Controls
          state={state}
          dispatch={wrappedDispatch}
          onRoll={onRoll}
          uiPhase={uiPhase}
          diceAnimPhase={diceAnimPhase}
          diceDisplay={diceDisplay}
          cardDrawCountdown={cardDrawCountdown}
          endTurnCountdown={endTurnCountdown}
          drawnCard={drawnCard}
          onDrawCard={onDrawCard}
        />
      </div>

      {}
      {selectedTile && (
        <PropertyPanel
          tile={selectedTile}
          state={state}
          dispatch={wrappedDispatch}
          onClose={() => setSelectedTile(null)}
        />
      )}

      {}

      {}
      {state.winnerId && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.75)",
            zIndex: 400,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backdropFilter: "blur(6px)",
          }}
        >
          <div
            style={{
              padding: "48px 56px",
              borderRadius: 24,
              background: "linear-gradient(160deg, #1a1200 0%, #451a03 100%)",
              border: "2px solid #ca8a04",
              textAlign: "center",
              boxShadow: "0 0 80px rgba(202,138,4,0.4)",
            }}
          >
            <div style={{ fontSize: 64, marginBottom: 12 }}>🏆</div>
            <div
              style={{
                fontSize: 32,
                fontWeight: 900,
                background: "linear-gradient(135deg, #fbbf24, #f59e0b)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              {state.players.find((p) => p.id === state.winnerId)?.name} Wins!
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function MonopolyPage() {
  const [playerNames, setPlayerNames] = useState<string[] | null>(null);
  const [key, setKey] = useState(0);

  if (!playerNames) {
    return <Setup onStart={setPlayerNames} />;
  }

  return (
    <div
      className="app-canvas"
      style={{
        minHeight: "100vh",
        color: "var(--foreground)",
        fontFamily: "'Inter', 'Segoe UI', sans-serif",
      }}
    >
      <div
        style={{
          height: 52,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 20px",
          borderBottom: "1px solid var(--border)",
          background: "var(--surface-overlay)",
          backdropFilter: "blur(10px)",
          position: "sticky",
          top: 0,
          zIndex: 100,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 20 }}>🎩</span>
          <span
            style={{
              fontWeight: 800,
              fontSize: 16,
              background:
                "linear-gradient(135deg, var(--primary), var(--accent-warm))",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            Monopoly
          </span>
        </div>
        <button
          type="button"
          onClick={() => {
            setPlayerNames(null);
            setKey((k) => k + 1);
          }}
          style={{
            padding: "6px 14px",
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "var(--surface)",
            color: "var(--muted-foreground)",
            cursor: "pointer",
            fontSize: 12,
            fontFamily: "inherit",
          }}
        >
          ↩ New Game
        </button>
      </div>

      <MonopolyGame key={key} playerNames={playerNames} />
    </div>
  );
}
