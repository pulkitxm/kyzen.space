export const TIC_TAC_TOE = "tic-tac-toe";
export const SEA_BATTLE = "sea-battle";

export const GAME_TYPES = [TIC_TAC_TOE, SEA_BATTLE] as const;

export const SEA_BATTLE_BOARD_SIZE = 10;

export const SEA_BATTLE_FLEET = [
  { name: "carrier", length: 5 },
  { name: "battleship", length: 4 },
  { name: "cruiser", length: 3 },
  { name: "submarine", length: 3 },
  { name: "destroyer", length: 2 },
] as const;
