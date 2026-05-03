import type { Tile } from '../types';

export const BOARD_SIZE = 40;
export const GO_POSITION = 0;
export const JAIL_POSITION = 10;
export const FREE_PARKING_POSITION = 20;
export const GO_TO_JAIL_POSITION = 30;
export const GO_SALARY = 200;
export const JAIL_FINE = 50;
export const MAX_JAIL_TURNS = 3;
export const INCOME_TAX = 200;
export const LUXURY_TAX = 100;
export const MORTGAGE_RATE = 0.5;
export const UNMORTGAGE_RATE = 0.6;
export const MAX_HOUSES = 4;
export const HOTEL_HOUSES = 5;

/**
 * Full definition of the 40-tile Monopoly board.
 * Positions 0-39 matching the classic US edition.
 */
export const BOARD: ReadonlyArray<Tile> = [
  // ── Side 1: Go → Jail ──────────────────────────────────
  { id: 'go',           position: 0,  name: 'GO',                    type: 'Go' },
  { id: 'mediterranean',position: 1,  name: 'Mediterranean Avenue',  type: 'Property', group: 'Brown',    price: 60,  rent: [2,10,30,90,160,250],   houseCost: 50  },
  { id: 'community1',   position: 2,  name: 'Community Chest',        type: 'CommunityChest' },
  { id: 'baltic',       position: 3,  name: 'Baltic Avenue',         type: 'Property', group: 'Brown',    price: 60,  rent: [4,20,60,180,320,450],  houseCost: 50  },
  { id: 'income_tax',   position: 4,  name: 'Income Tax',            type: 'IncomeTax', amount: INCOME_TAX },
  { id: 'reading_rr',   position: 5,  name: 'Reading Railroad',      type: 'Railroad',  price: 200, rent: [0, 25, 50, 100, 200] },
  { id: 'oriental',     position: 6,  name: 'Oriental Avenue',       type: 'Property', group: 'LightBlue',price: 100, rent: [6,30,90,270,400,550],  houseCost: 50  },
  { id: 'chance1',      position: 7,  name: 'Chance',                type: 'Chance' },
  { id: 'vermont',      position: 8,  name: 'Vermont Avenue',        type: 'Property', group: 'LightBlue',price: 100, rent: [6,30,90,270,400,550],  houseCost: 50  },
  { id: 'connecticut',  position: 9,  name: 'Connecticut Avenue',    type: 'Property', group: 'LightBlue',price: 120, rent: [8,40,100,300,450,600], houseCost: 50  },
  { id: 'jail',         position: 10, name: 'Jail / Just Visiting',  type: 'Jail' },

  // ── Side 2: Jail → Free Parking ────────────────────────
  { id: 'st_charles',   position: 11, name: 'St. Charles Place',     type: 'Property', group: 'Pink',     price: 140, rent: [10,50,150,450,625,750], houseCost: 100 },
  { id: 'electric',     position: 12, name: 'Electric Company',      type: 'Utility',   price: 150 },
  { id: 'states',       position: 13, name: 'States Avenue',         type: 'Property', group: 'Pink',     price: 140, rent: [10,50,150,450,625,750], houseCost: 100 },
  { id: 'virginia',     position: 14, name: 'Virginia Avenue',       type: 'Property', group: 'Pink',     price: 160, rent: [12,60,180,500,700,900], houseCost: 100 },
  { id: 'pennsylvania_rr',position:15,name: 'Pennsylvania Railroad', type: 'Railroad',  price: 200, rent: [0, 25, 50, 100, 200] },
  { id: 'st_james',     position: 16, name: 'St. James Place',       type: 'Property', group: 'Orange',   price: 180, rent: [14,70,200,550,750,950], houseCost: 100 },
  { id: 'community2',   position: 17, name: 'Community Chest',        type: 'CommunityChest' },
  { id: 'tennessee',    position: 18, name: 'Tennessee Avenue',      type: 'Property', group: 'Orange',   price: 180, rent: [14,70,200,550,750,950], houseCost: 100 },
  { id: 'new_york',     position: 19, name: 'New York Avenue',       type: 'Property', group: 'Orange',   price: 200, rent: [16,80,220,600,800,1000],houseCost: 100 },
  { id: 'free_parking', position: 20, name: 'Free Parking',          type: 'FreeParking' },

  // ── Side 3: Free Parking → Go To Jail ──────────────────
  { id: 'kentucky',     position: 21, name: 'Kentucky Avenue',       type: 'Property', group: 'Red',      price: 220, rent: [18,90,250,700,875,1050],houseCost: 150 },
  { id: 'chance2',      position: 22, name: 'Chance',                type: 'Chance' },
  { id: 'indiana',      position: 23, name: 'Indiana Avenue',        type: 'Property', group: 'Red',      price: 220, rent: [18,90,250,700,875,1050],houseCost: 150 },
  { id: 'illinois',     position: 24, name: 'Illinois Avenue',       type: 'Property', group: 'Red',      price: 240, rent: [20,100,300,750,925,1100],houseCost: 150},
  { id: 'bo_rr',        position: 25, name: 'B. & O. Railroad',      type: 'Railroad',  price: 200, rent: [0, 25, 50, 100, 200] },
  { id: 'atlantic',     position: 26, name: 'Atlantic Avenue',       type: 'Property', group: 'Yellow',   price: 260, rent: [22,110,330,800,975,1150],houseCost: 150 },
  { id: 'ventnor',      position: 27, name: 'Ventnor Avenue',        type: 'Property', group: 'Yellow',   price: 260, rent: [22,110,330,800,975,1150],houseCost: 150 },
  { id: 'water_works',  position: 28, name: 'Water Works',           type: 'Utility',   price: 150 },
  { id: 'marvin',       position: 29, name: 'Marvin Gardens',        type: 'Property', group: 'Yellow',   price: 280, rent: [24,120,360,850,1025,1200],houseCost:150 },
  { id: 'go_to_jail',   position: 30, name: 'Go To Jail',            type: 'GoToJail' },

  // ── Side 4: Go To Jail → Go ────────────────────────────
  { id: 'pacific',      position: 31, name: 'Pacific Avenue',        type: 'Property', group: 'Green',    price: 300, rent: [26,130,390,900,1100,1275],houseCost:200 },
  { id: 'north_carolina',position:32, name: 'North Carolina Avenue', type: 'Property', group: 'Green',    price: 300, rent: [26,130,390,900,1100,1275],houseCost:200 },
  { id: 'community3',   position: 33, name: 'Community Chest',        type: 'CommunityChest' },
  { id: 'pennsylvania_ave',position:34,name:'Pennsylvania Avenue',   type: 'Property', group: 'Green',    price: 320, rent: [28,150,450,1000,1200,1400],houseCost:200},
  { id: 'shortline_rr', position: 35, name: 'Short Line Railroad',   type: 'Railroad',  price: 200, rent: [0, 25, 50, 100, 200] },
  { id: 'chance3',      position: 36, name: 'Chance',                type: 'Chance' },
  { id: 'park_place',   position: 37, name: 'Park Place',            type: 'Property', group: 'DarkBlue', price: 350, rent: [35,175,500,1100,1300,1500],houseCost:200},
  { id: 'luxury_tax',   position: 38, name: 'Luxury Tax',            type: 'LuxuryTax', amount: LUXURY_TAX },
  { id: 'boardwalk',    position: 39, name: 'Boardwalk',             type: 'Property', group: 'DarkBlue', price: 400, rent: [50,200,600,1400,1700,2000],houseCost:200},
] as const;

/** Position → tile lookup map (built once) */
export const TILE_BY_POSITION: Readonly<Record<number, Tile>> = Object.fromEntries(
  BOARD.map((t) => [t.position, t])
);

/** Tile ID → tile lookup map (built once) */
export const TILE_BY_ID: Readonly<Record<string, Tile>> = Object.fromEntries(
  BOARD.map((t) => [t.id, t])
);
