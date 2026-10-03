# Turbo Pitch

Turbo Pitch is an original four-player car football game. Two blue cars play against two orange cars in a walled arena. The team with more goals after three minutes wins. A tie enters sudden-death overtime, where the next goal wins.

## Controls

Drive forward and backward, steer, jump, boost, and use the handbrake. Driving and jumping move the car through the field. Boost consumes a regenerating meter and gives a stronger acceleration, including in the air.

A second press of Jump in the air performs one additional jump; hold a direction to dodge with a burst of speed. Landing restores both jumps. Six gold boost pads refill the meter and recharge eight seconds after pickup.

Desktop controls are W/S for throttle, A/D for steering, Space to jump, Shift to boost, and Ctrl for the handbrake, and C to switch between car and ball camera. Touch controls show steering, throttle, jump, boost, and handbrake buttons on narrow screens. The arena uses original procedural models, cover art, and synthesized music and effects.

## Arena and scoring

The field is 80 units long and 50 units wide. The ball starts at the center. Each team defends one end. A goal counts when the ball crosses the goal line inside the opening and below the crossbar. After a goal, the cars and ball return to kickoff positions. The score and remaining time stay intact.

## Teams and seats

The four roles are `blue-1`, `orange-1`, `blue-2`, and `orange-2`. Room seats are assigned in that order. The engine stores roles and teams, never user identities. The shared game shell supplies room codes, chat, profiles, and result surfaces.

If both members of a team stop sending controls for 45 seconds, that team forfeits. A lone disconnected teammate has time to rejoin while the other teammate keeps playing. If all players leave, the match closes as a draw. Reconnecting restores the latest authoritative state.

## State and input

The engine state holds the phase, match clock, score, last scorer, ball position and velocity, and the position, velocity, heading, boost, and jump state of each car. Each player sends bounded throttle and steer values plus jump, boost, and handbrake flags. The server applies all latest controls in a fixed-tick loop. Game clients receive authoritative snapshots.

The game runs through the platform realtime runner described in [the architecture guide](../architecture/realtime.md). A private room admits four players by code and includes participant-only room chat. Players can open roster profiles to use the existing friend request controls. A group conversation can also launch an open Turbo Pitch game, keeping the group's chat alongside the arena. Play now waits for four compatible players and assigns two teams. Public match chat keeps names anonymous until players mutually choose Connect.
