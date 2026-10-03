"use client";

import type {
  BotDifficulty,
  GameJson,
  LobbyConfig,
  LobbySupport,
  TeamId,
} from "@kyzen/shared/types";
import { type ReactNode, useState } from "react";
import {
  FaCrown,
  FaPlay,
  FaPlus,
  FaRobot,
  FaUser,
  FaUsers,
  FaXmark,
} from "react-icons/fa6";
import { Button, Character } from "@/components/ui";
import {
  addBot,
  assignTeam,
  BOT_DIFFICULTIES,
  difficultyLabel,
  type LobbyLimits,
  lobbyConfigPayload,
  lobbyTeams,
  readLobbyConfig,
  removeBot,
  setBotDifficulty,
  startBlocker,
  suggestedTeam,
  teamLetters,
  withMode,
} from "@/lib/games/lobby-config";
import { emitAck, useSocket } from "@/lib/socket/socket-context";
import { cn } from "@/lib/utils";
import { InviteCode } from "./invite-code";

export type LobbySettings = LobbySupport & LobbyLimits;

const SELECT_CLASS =
  "rounded-lg border border-border bg-surface px-2 py-1 text-foreground text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring";

const MODES: { value: LobbyConfig["mode"]; label: string; icon: ReactNode }[] =
  [
    {
      value: "ffa",
      label: "Free for all",
      icon: <FaUser size={12} aria-hidden="true" />,
    },
    {
      value: "teams",
      label: "Teams",
      icon: <FaUsers size={14} aria-hidden="true" />,
    },
  ];

function errorMessage(failure: unknown, fallback: string): string {
  return failure instanceof Error ? failure.message : fallback;
}

export function LobbyPanel({
  gameId,
  game,
  userId,
  lobby,
}: {
  gameId: string;
  game: GameJson;
  userId: string;
  lobby: LobbySettings;
}) {
  const { socket } = useSocket();
  const [pending, setPending] = useState<LobbyConfig | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const host = Boolean(game.creatorUserId) && game.creatorUserId === userId;
  const humanIds = game.players.map((player) => player.userId);
  const config = pending ?? readLobbyConfig(game.config);
  const teamsMode = lobby.teams && config.mode === "teams";
  const teams = lobbyTeams(config, humanIds);
  const total = humanIds.length + config.bots.length;
  const letters = [
    ...new Set([...teamLetters(total), ...teams.values()]),
  ].sort();
  const blocker = startBlocker(config, humanIds, lobby);
  const canAddBot = host && lobby.bots && total < lobby.maxPlayers;
  const capacity = Number.isFinite(lobby.maxPlayers)
    ? `${total}/${lobby.maxPlayers}`
    : `${total}`;

  const configure = async (next: LobbyConfig) => {
    if (!host) return;
    let payload: Record<string, unknown>;
    try {
      payload = lobbyConfigPayload(game.config, next);
    } catch {
      setError("That lobby setup is not valid");
      return;
    }
    setPending(next);
    setError(null);
    try {
      await emitAck(socket, "room:configure", { gameId, config: payload });
    } catch (failure) {
      setError(errorMessage(failure, "Could not update the lobby"));
    } finally {
      setPending((current) => (current === next ? null : current));
    }
  };

  const start = async () => {
    setStarting(true);
    setError(null);
    try {
      await emitAck(socket, "room:start", { gameId });
    } catch (failure) {
      setError(errorMessage(failure, "Could not start the game"));
    } finally {
      setStarting(false);
    }
  };

  const teamControl = (id: string, name: string) => {
    const team = teams.get(id) ?? "A";
    if (!teamsMode) return null;
    if (!host)
      return (
        <span className="shrink-0 rounded-md bg-surface-overlay px-2 py-0.5 font-medium text-xs">
          Team {team}
        </span>
      );
    return (
      <select
        aria-label={`Team for ${name}`}
        value={team}
        onChange={(event) =>
          void configure(
            assignTeam(config, id, event.target.value as TeamId, humanIds),
          )
        }
        className={SELECT_CLASS}
      >
        {letters.map((letter) => (
          <option key={letter} value={letter}>
            Team {letter}
          </option>
        ))}
      </select>
    );
  };

  return (
    <div className="text-left">
      <h2 className="text-center font-bold text-foreground text-xl">
        Game lobby
      </h2>
      <p className="mt-1 text-center text-muted-foreground text-sm">
        Share this code so friends can join.
      </p>
      <InviteCode gameId={gameId} compact />

      {lobby.teams ? (
        <fieldset className="mt-4">
          <legend className="font-semibold text-sm">Mode</legend>
          <div className="mt-2 grid grid-cols-2 gap-1 rounded-xl border border-border bg-background p-1">
            {MODES.map((mode) => {
              const selected = config.mode === mode.value;
              return (
                <button
                  key={mode.value}
                  type="button"
                  aria-pressed={selected}
                  disabled={!host}
                  onClick={() => {
                    if (!selected)
                      void configure(withMode(config, mode.value, humanIds));
                  }}
                  className={cn(
                    "flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 font-medium text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default",
                    selected
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground enabled:hover:bg-surface-overlay",
                  )}
                >
                  {mode.icon}
                  {mode.label}
                </button>
              );
            })}
          </div>
        </fieldset>
      ) : null}

      <section aria-label="Players" className="mt-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">Players</h3>
          <span className="text-muted-foreground text-xs">{capacity}</span>
        </div>
        <ul className="mt-2 max-h-64 space-y-1.5 overflow-y-auto">
          {game.players.map((player) => (
            <li
              key={player.userId}
              className="flex items-center gap-2 rounded-xl border border-border bg-background px-2.5 py-1.5"
            >
              <Character
                config={player.avatar ?? null}
                fallbackSeed={player.username}
                size={28}
                className="shrink-0 rounded-full bg-surface-overlay"
              />
              <span className="min-w-0 flex-1 truncate text-sm">
                {player.username}
                {player.userId === userId ? (
                  <span className="text-muted-foreground"> (you)</span>
                ) : null}
              </span>
              {player.userId === game.creatorUserId ? (
                <FaCrown
                  size={12}
                  className="shrink-0 text-amber-500"
                  role="img"
                  aria-label="Host"
                />
              ) : null}
              {teamControl(player.userId, player.username)}
            </li>
          ))}
          {config.bots.map((bot, index) => {
            const name = `Bot ${index + 1}`;
            return (
              <li
                key={bot.id}
                className="flex items-center gap-2 rounded-xl border border-border bg-background px-2.5 py-1.5"
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-overlay text-muted-foreground">
                  <FaRobot size={14} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">{name}</span>
                {host ? (
                  <select
                    aria-label={`Difficulty for ${name}`}
                    value={bot.difficulty}
                    onChange={(event) =>
                      void configure(
                        setBotDifficulty(
                          config,
                          bot.id,
                          event.target.value as BotDifficulty,
                        ),
                      )
                    }
                    className={SELECT_CLASS}
                  >
                    {BOT_DIFFICULTIES.map((difficulty) => (
                      <option key={difficulty} value={difficulty}>
                        {difficultyLabel(difficulty)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="shrink-0 text-muted-foreground text-xs">
                    {difficultyLabel(bot.difficulty)}
                  </span>
                )}
                {teamControl(bot.id, name)}
                {host ? (
                  <button
                    type="button"
                    aria-label={`Remove ${name}`}
                    title={`Remove ${name}`}
                    onClick={() => void configure(removeBot(config, bot.id))}
                    className="flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground outline-none transition hover:bg-surface-overlay hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <FaXmark size={12} aria-hidden="true" />
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>

      {canAddBot ? (
        <AddBotForm
          teamsMode={teamsMode}
          letters={teamLetters(total + 1)}
          suggested={suggestedTeam(config, humanIds)}
          onAdd={(difficulty, team) =>
            void configure(addBot(config, difficulty, team))
          }
        />
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 text-center text-danger text-sm">
          {error}
        </p>
      ) : null}

      {host ? (
        <div className="mt-4">
          <Button
            className="w-full"
            onClick={() => void start()}
            loading={starting}
            disabled={blocker !== null || pending !== null}
          >
            {starting ? null : <FaPlay size={12} aria-hidden="true" />}
            Start game
          </Button>
          {blocker ? (
            <p className="mt-2 text-center text-muted-foreground text-xs">
              {blocker}
            </p>
          ) : null}
        </div>
      ) : (
        <p
          className="mt-4 text-center text-muted-foreground text-sm"
          aria-live="polite"
        >
          Waiting for the host to start
        </p>
      )}
    </div>
  );
}

function AddBotForm({
  teamsMode,
  letters,
  suggested,
  onAdd,
}: {
  teamsMode: boolean;
  letters: TeamId[];
  suggested: TeamId;
  onAdd: (difficulty: BotDifficulty, team: TeamId) => void;
}) {
  const [difficulty, setDifficulty] = useState<BotDifficulty>("normal");
  const [team, setTeam] = useState<TeamId | null>(null);

  return (
    <form
      aria-label="Add a bot"
      onSubmit={(event) => {
        event.preventDefault();
        onAdd(difficulty, team ?? suggested);
        setTeam(null);
      }}
      className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-border border-dashed px-2.5 py-2"
    >
      <FaRobot
        size={14}
        className="shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
      <select
        aria-label="New bot difficulty"
        value={difficulty}
        onChange={(event) => setDifficulty(event.target.value as BotDifficulty)}
        className={SELECT_CLASS}
      >
        {BOT_DIFFICULTIES.map((option) => (
          <option key={option} value={option}>
            {difficultyLabel(option)}
          </option>
        ))}
      </select>
      {teamsMode ? (
        <select
          aria-label="New bot team"
          value={team ?? suggested}
          onChange={(event) => setTeam(event.target.value as TeamId)}
          className={SELECT_CLASS}
        >
          {letters.map((letter) => (
            <option key={letter} value={letter}>
              Team {letter}
            </option>
          ))}
        </select>
      ) : null}
      <Button type="submit" size="sm" variant="secondary" className="ml-auto">
        <FaPlus size={10} aria-hidden="true" />
        Add bot
      </Button>
    </form>
  );
}
