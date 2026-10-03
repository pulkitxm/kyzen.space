# Public matchmaking

Every supported game exposes Play now through shared routes. PostgreSQL is the only required database for matchmaking and temporary chat. Redis remains optional on a single persistent realtime server and supports shared Socket.IO broadcasts and presence.

## Assignment

`game:queue_join` validates a registered two-player turn-based engine and its config schema. `games.joinMatchmaking` takes a PostgreSQL transaction advisory lock, checks for an existing active public game, and renews one ticket per account. Queue joins are limited to 30 per minute per socket. Tickets expire after 45 seconds; the client refreshes every 10 seconds and on reconnect. Compatible renewals preserve queue age. A new tab replaces ticket ownership, so cleanup from an older tab cannot cancel it.

The oldest unexpired opponent with the same game type and canonical JSONB config is selected. Self-matches are excluded. Seat order is chosen with `crypto.randomInt`, avoiding a first-player advantage tied to queue order. This is an unranked random-opponent pool with FIFO waiting fairness, not rating-based matching.

Both players, initial state, and the active game are inserted in the same transaction that removes their tickets. Failure rolls everything back. Duplicate concurrent joins recover the same active game. The acknowledgement returns the assigned code; `match_found` also reaches both user rooms. A lost event is recovered by another join. Cancellation uses the same lock and returns an assigned game if matching already won the race.

The global assignment lock favors a small, clear correctness boundary. It serializes queue mutations across server processes. High-volume queues should partition the lock and preserve the one-active-game invariant before scaling further. Leases limit stale queued players but cannot promise a peer remains online after assignment.

## Identity and authorization

Public games have no permanent conversation and both seats are assigned before clients enter. HTTP snapshots, room joins, chat reads, and chat sends require participant membership. Outsiders receive no match details. Players, moves, winners, and the viewer ID use `<room-code>:<role>` aliases. Names are Player 1 and Player 2; avatars and creator/challenge identities are hidden. Public matches are excluded from profile game history and series endpoints. Registered engines must store roles and rules only, never profile data.

## Chat and friendship

Temporary text uses `match:message` and a dedicated `match_message` table. Bodies are trimmed, limited to 1,000 characters, and validated by strict shared schemas. A client UUID deduplicates retries. Sending is limited to one message per second per participant and 500 messages per match. Reads return the latest 100 visible messages. Only active games can send or read chat.

The UI closes chat when the game ends. Records remain privately stored for safety for seven days from sending, then an hourly startup-and-runtime cleanup deletes expired rows. Expired messages are filtered from reads even before cleanup. Account IDs remain available only to authorized backend operations; this is anonymous between players, not anonymous to the service operator. Database backups need their own retention policy.

Each player independently selects Add friend. Neither choice reveals identity until both consent. Choices can be made during the match or within 15 minutes after it ends. Mutual consent creates an accepted friendship, applies guest friend limits, opens a fresh permanent DM, and updates both social sidebars. Temporary messages are never copied. Profiles and permanent messaging follow the existing friend APIs thereafter.

## Execution and recovery

All supported games use the shared turn-based runner. Each move locks the active row and compares the expected state before committing state, ordered move history, outcome, and stats. Repeated or racing reductions cannot overwrite a newer turn. Timeout aborts use the same expected-state guard.

Turn clocks allow 30 seconds initially and 30 seconds minus five seconds per consecutive timeout later, with a ten-second floor. A real move clears strikes. The third consecutive timeout aborts; an attentive opponent wins by forfeit. Public assignment starts the clock even before browser room joins. Reconnect resumes persisted state and move history.

Run one persistent realtime instance. Timers and strikes are process-local, and a process restart grants a fresh deadline when an active game is recovered by queue join or room join. PostgreSQL transactions make assignment and move persistence safe across processes, but they do not provide durable timer ownership. Horizontally scaling gameplay requires durable deadlines and a single clock owner per game.

## Verification

`matchmaking-flow.test.ts` exercises concurrent duplicate joins, queue ownership, config pools, leases, and cancellation. `public-chat.test.ts` exercises identity redaction, participant checks, send retries, rate limits, completion visibility, expiry deletion, mutual consent, stale timeouts, and exactly-once stats. The local synthetic smoke script plays both private and public tic-tac-toe over authenticated WebSockets, reconnects, chats, befriends, and sends a permanent message. No external database URL is needed for those tests.
