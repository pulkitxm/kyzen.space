"use client";

import {
  type BotDifficulty,
  type GameJson,
  type GamePlayerDto,
  LOBBY_MAX_BOTS,
  type LobbyBot,
  type LobbyConfig,
  type LobbySupport,
  type ServerErrorPayload,
  type TeamId,
} from "@kyzen/shared/types";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useId, useState } from "react";
import {
  FaArrowRightFromBracket,
  FaCrown,
  FaPlay,
  FaPlus,
  FaRobot,
  FaUser,
  FaUsers,
  FaUserXmark,
  FaXmark,
} from "react-icons/fa6";
import { Button, Character } from "@/components/ui";
import {
  addBot,
  assignTeam,
  BOT_DIFFICULTIES,
  botName,
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
import {
  emitAck,
  useSocket,
  useSocketEvent,
} from "@/lib/socket/socket-context";
import { cn } from "@/lib/utils";
import { InviteCode } from "./invite-code";

export type LobbySettings = LobbySupport & LobbyLimits;

const SELECT_CLASS =
  "rounded-lg border border-border bg-surface px-2 py-1 text-foreground text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring";

const ROW_CLASS =
  "flex items-center gap-2 rounded-xl border border-border bg-background px-2.5 py-1.5";

const ICON_BUTTON_CLASS =
  "flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground outline-none transition hover:bg-surface-overlay hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring";

const REMOVED_MESSAGE = "Removed from the room";
const REMOVED_REDIRECT_MS = 2500;

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

function focusOnMount(node: HTMLElement | null) {
  node?.focus();
}

function errorMessage(failure: unknown, fallback: string): string {
  return failure instanceof Error ? failure.message : fallback;
}

function capacityLabel(total: number, maxPlayers: number): string {
  return Number.isFinite(maxPlayers) ? `${total}/${maxPlayers}` : `${total}`;
}

function addBotBlocker(
  config: LobbyConfig,
  total: number,
  maxPlayers: number,
): string | null {
  if (config.bots.length >= LOBBY_MAX_BOTS)
    return `Bot limit reached: a room can have up to ${LOBBY_MAX_BOTS} bots.`;
  return total >= maxPlayers ? "The room is full." : null;
}

type SendLobbyEvent = (
  event: string,
  payload: Record<string, unknown>,
  fallback: string,
) => Promise<boolean>;

type LobbyView = {
  host: boolean;
  teamsMode: boolean;
  teams: Map<string, TeamId>;
  letters: TeamId[];
  config: LobbyConfig;
  humanIds: string[];
  edit: (next: LobbyConfig) => void;
};

function useRemovedFromRoom(gamesHref: string): boolean {
  const router = useRouter();
  const [removed, setRemoved] = useState(false);

  useSocketEvent<ServerErrorPayload>("game_error", (payload) => {
    if (payload.message === REMOVED_MESSAGE) setRemoved(true);
  });

  useEffect(() => {
    if (!removed) return;
    const timer = setTimeout(
      () => router.replace(gamesHref),
      REMOVED_REDIRECT_MS,
    );
    return () => clearTimeout(timer);
  }, [removed, router, gamesHref]);

  return removed;
}

function useLobbyRoom(gameId: string, game: GameJson, host: boolean) {
  const { socket } = useSocket();
  const [pending, setPending] = useState<LobbyConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  const send: SendLobbyEvent = async (event, payload, fallback) => {
    setError(null);
    try {
      await emitAck(socket, event, { ...payload, gameId });
      return true;
    } catch (failure) {
      setError(errorMessage(failure, fallback));
      return false;
    }
  };

  const configure = async (next: LobbyConfig) => {
    if (!host) return;
    let config: Record<string, unknown>;
    try {
      config = lobbyConfigPayload(
        game.config,
        next,
        game.players.map((player) => player.userId),
      );
    } catch {
      setError("That lobby setup is not valid");
      return;
    }
    setPending(next);
    await send("room:configure", { config }, "Could not update the lobby");
    setPending((current) => (current === next ? null : current));
  };

  return {
    config: pending ?? readLobbyConfig(game.config),
    pending: pending !== null,
    error,
    send,
    configure,
  };
}

export function LobbyPanel(props: {
  gameId: string;
  game: GameJson;
  userId: string;
  lobby: LobbySettings;
}) {
  const gamesHref = `/games/${props.game.gameType}`;
  const removed = useRemovedFromRoom(gamesHref);
  return removed ? (
    <RemovedNotice href={gamesHref} />
  ) : (
    <LobbyEditor {...props} gamesHref={gamesHref} />
  );
}

function RemovedNotice({ href }: { href: string }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 py-2">
      <h2 className="font-bold text-foreground text-xl">
        You were removed from the room
      </h2>
      <p className="text-muted-foreground text-sm">
        The host removed you from this lobby. Taking you back to the game page.
      </p>
      <Link
        href={href}
        replace
        className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 font-medium text-primary-foreground text-sm outline-none transition hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-ring"
      >
        Back to games
      </Link>
    </div>
  );
}

function LobbyEditor({
  gameId,
  game,
  userId,
  lobby,
  gamesHref,
}: {
  gameId: string;
  game: GameJson;
  userId: string;
  lobby: LobbySettings;
  gamesHref: string;
}) {
  const host = Boolean(game.creatorUserId) && game.creatorUserId === userId;
  const room = useLobbyRoom(gameId, game, host);
  const { config } = room;
  const humanIds = game.players.map((player) => player.userId);
  const total = humanIds.length + config.bots.length;
  const teams = lobbyTeams(config, humanIds);
  const view: LobbyView = {
    host,
    teamsMode: lobby.teams && config.mode === "teams",
    teams,
    letters: [...new Set([...teamLetters(total), ...teams.values()])].sort(),
    config,
    humanIds,
    edit: (next) => void room.configure(next),
  };
  const kick = (player: GamePlayerDto) =>
    void room.send(
      "room:kick",
      { userId: player.userId },
      `Could not remove ${player.username} from the room`,
    );

  return (
    <div className="text-left">
      <h2 className="text-center font-bold text-foreground text-xl">
        Game lobby
      </h2>
      <p className="mt-1 text-center text-muted-foreground text-sm">
        Share this code so friends can join.
      </p>
      <InviteCode gameId={gameId} compact />

      {lobby.teams ? <ModePicker view={view} /> : null}

      <section aria-label="Players" className="mt-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">Players</h3>
          <span className="text-muted-foreground text-xs">
            {capacityLabel(total, lobby.maxPlayers)}
          </span>
        </div>
        <ul className="mt-2 max-h-64 space-y-1.5 overflow-y-auto">
          {game.players.map((player) => (
            <PlayerRow
              key={player.userId}
              player={player}
              view={view}
              viewerId={userId}
              hostId={game.creatorUserId}
              onKick={kick}
            />
          ))}
          {config.bots.map((bot, index) => (
            <BotRow key={bot.id} bot={bot} index={index} view={view} />
          ))}
        </ul>
      </section>

      {host && lobby.bots ? (
        <AddBotForm
          blocker={addBotBlocker(config, total, lobby.maxPlayers)}
          teamsMode={view.teamsMode}
          letters={teamLetters(total + 1)}
          suggested={suggestedTeam(config, humanIds)}
          onAdd={(difficulty, team) =>
            view.edit(addBot(config, difficulty, team))
          }
        />
      ) : null}

      {room.error ? (
        <p role="alert" className="mt-3 text-center text-danger text-sm">
          {room.error}
        </p>
      ) : null}

      {host ? (
        <StartControl
          blocker={startBlocker(config, humanIds, lobby)}
          pending={room.pending}
          send={room.send}
        />
      ) : (
        <GuestFooter
          seated={humanIds.includes(userId)}
          gamesHref={gamesHref}
          send={room.send}
        />
      )}
    </div>
  );
}

function ModePicker({ view }: { view: LobbyView }) {
  const hintId = useId();
  return (
    <fieldset
      className="mt-4"
      aria-describedby={view.teamsMode ? hintId : undefined}
    >
      <legend className="font-semibold text-sm">Mode</legend>
      <div className="mt-2 grid grid-cols-2 gap-1 rounded-xl border border-border bg-background p-1">
        {MODES.map((mode) => (
          <ModeButton
            key={mode.value}
            mode={mode}
            selected={view.config.mode === mode.value}
            disabled={!view.host}
            onSelect={() =>
              view.edit(withMode(view.config, mode.value, view.humanIds))
            }
          />
        ))}
      </div>
      {view.teamsMode ? (
        <p id={hintId} className="mt-2 text-muted-foreground text-xs">
          Teams mode needs players on at least two different teams to start.
        </p>
      ) : null}
    </fieldset>
  );
}

function ModeButton({
  mode,
  selected,
  disabled,
  onSelect,
}: {
  mode: (typeof MODES)[number];
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={() => {
        if (!selected) onSelect();
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
}

function TeamControl({
  view,
  id,
  name,
}: {
  view: LobbyView;
  id: string;
  name: string;
}) {
  if (!view.teamsMode) return null;
  const team = view.teams.get(id) ?? "A";
  if (!view.host)
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
        view.edit(
          assignTeam(
            view.config,
            id,
            event.target.value as TeamId,
            view.humanIds,
          ),
        )
      }
      className={SELECT_CLASS}
    >
      {view.letters.map((letter) => (
        <option key={letter} value={letter}>
          Team {letter}
        </option>
      ))}
    </select>
  );
}

function PlayerRow({
  player,
  view,
  viewerId,
  hostId,
  onKick,
}: {
  player: GamePlayerDto;
  view: LobbyView;
  viewerId: string;
  hostId: string | null | undefined;
  onKick: (player: GamePlayerDto) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const label = `Remove ${player.username} from the room`;
  return (
    <li className={ROW_CLASS}>
      <Character
        config={player.avatar ?? null}
        fallbackSeed={player.username}
        size={28}
        className="shrink-0 rounded-full bg-surface-overlay"
      />
      <span className="min-w-0 flex-1 truncate text-sm">
        {player.username}
        {player.userId === viewerId ? (
          <span className="text-muted-foreground"> (you)</span>
        ) : null}
      </span>
      {player.userId === hostId ? (
        <FaCrown
          size={12}
          className="shrink-0 text-amber-500"
          role="img"
          aria-label="Host"
        />
      ) : null}
      {confirming ? (
        <fieldset
          aria-label={`${label}?`}
          className="flex shrink-0 items-center gap-1"
        >
          <Button
            ref={focusOnMount}
            size="sm"
            variant="danger"
            onClick={() => {
              setConfirming(false);
              onKick(player);
            }}
          >
            Remove
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setConfirming(false)}
          >
            Cancel
          </Button>
        </fieldset>
      ) : (
        <>
          <TeamControl view={view} id={player.userId} name={player.username} />
          {view.host && player.userId !== viewerId ? (
            <button
              type="button"
              aria-label={label}
              title={label}
              onClick={() => setConfirming(true)}
              className={ICON_BUTTON_CLASS}
            >
              <FaUserXmark size={12} aria-hidden="true" />
            </button>
          ) : null}
        </>
      )}
    </li>
  );
}

function BotRow({
  bot,
  index,
  view,
}: {
  bot: LobbyBot;
  index: number;
  view: LobbyView;
}) {
  const name = botName(index, bot.difficulty);
  return (
    <li className={ROW_CLASS}>
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-overlay text-muted-foreground">
        <FaRobot size={14} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1 truncate text-sm">{name}</span>
      {view.host ? (
        <select
          aria-label={`Difficulty for ${name}`}
          value={bot.difficulty}
          onChange={(event) =>
            view.edit(
              setBotDifficulty(
                view.config,
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
      ) : null}
      <TeamControl view={view} id={bot.id} name={name} />
      {view.host ? (
        <button
          type="button"
          aria-label={`Remove ${name}`}
          title={`Remove ${name}`}
          onClick={() => view.edit(removeBot(view.config, bot.id))}
          className={ICON_BUTTON_CLASS}
        >
          <FaXmark size={12} aria-hidden="true" />
        </button>
      ) : null}
    </li>
  );
}

function StartControl({
  blocker,
  pending,
  send,
}: {
  blocker: string | null;
  pending: boolean;
  send: SendLobbyEvent;
}) {
  const [starting, setStarting] = useState(false);
  const start = async () => {
    setStarting(true);
    await send("room:start", {}, "Could not start the game");
    setStarting(false);
  };
  return (
    <div className="mt-4">
      <Button
        className="w-full"
        onClick={() => void start()}
        loading={starting}
        disabled={blocker !== null || pending}
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
  );
}

function GuestFooter({
  seated,
  gamesHref,
  send,
}: {
  seated: boolean;
  gamesHref: string;
  send: SendLobbyEvent;
}) {
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);
  const leave = async () => {
    setLeaving(true);
    if (await send("room:leave", {}, "Could not leave the lobby"))
      router.push(gamesHref);
    else setLeaving(false);
  };
  return (
    <div className="mt-4 flex flex-col items-center gap-3">
      <p
        className="text-center text-muted-foreground text-sm"
        aria-live="polite"
      >
        Waiting for the host to start
      </p>
      {seated ? (
        <Button
          variant="secondary"
          className="w-full"
          onClick={() => void leave()}
          loading={leaving}
        >
          {leaving ? null : (
            <FaArrowRightFromBracket size={12} aria-hidden="true" />
          )}
          Leave lobby
        </Button>
      ) : null}
    </div>
  );
}

function AddBotForm({
  blocker,
  teamsMode,
  letters,
  suggested,
  onAdd,
}: {
  blocker: string | null;
  teamsMode: boolean;
  letters: TeamId[];
  suggested: TeamId;
  onAdd: (difficulty: BotDifficulty, team: TeamId) => void;
}) {
  const [difficulty, setDifficulty] = useState<BotDifficulty>("normal");
  const [team, setTeam] = useState<TeamId | null>(null);
  const hintId = useId();

  return (
    <form
      aria-label="Add a bot"
      aria-describedby={blocker ? hintId : undefined}
      onSubmit={(event) => {
        event.preventDefault();
        if (blocker) return;
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
      <Button
        type="submit"
        size="sm"
        variant="secondary"
        className="ml-auto"
        disabled={blocker !== null}
      >
        <FaPlus size={10} aria-hidden="true" />
        Add bot
      </Button>
      {blocker ? (
        <p id={hintId} className="w-full text-muted-foreground text-xs">
          {blocker}
        </p>
      ) : null}
    </form>
  );
}
