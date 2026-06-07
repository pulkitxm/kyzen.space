import type { Card } from "../types";

export const CHANCE_CARDS: ReadonlyArray<Card> = [
  {
    id: "chance_advance_go",
    text: "Advance to GO. Collect $200.",
    effect: { kind: "MOVE_TO", position: 0, collectGo: true },
  },
  {
    id: "chance_advance_indiana",
    text: "Advance to Indiana Avenue. If you pass Go, collect $200.",
    effect: { kind: "MOVE_TO", position: 19, collectGo: true },
  },
  {
    id: "chance_advance_st_charles",
    text: "Advance to St. Charles Place. If you pass Go, collect $200.",
    effect: { kind: "MOVE_TO", position: 9, collectGo: true },
  },
  {
    id: "chance_advance_railroad",
    text: "Advance to the nearest Railroad. If unowned, you may buy it; if owned, pay twice the normal rent.",
    effect: { kind: "MOVE_NEAREST", tileType: "Railroad" },
  },
  {
    id: "chance_advance_railroad_2",
    text: "Advance to the nearest Railroad. If unowned, you may buy it; if owned, pay twice the normal rent.",
    effect: { kind: "MOVE_NEAREST", tileType: "Railroad" },
  },
  {
    id: "chance_advance_utility",
    text: "Advance to the nearest Utility. If unowned, you may buy it; if owned, pay ten times the dice.",
    effect: { kind: "MOVE_NEAREST", tileType: "Utility" },
  },
  {
    id: "chance_bank_dividend",
    text: "Bank pays you dividend of $50.",
    effect: { kind: "COLLECT", amount: 50 },
  },
  {
    id: "chance_get_out_of_jail",
    text: "Get out of Jail Free.",
    effect: { kind: "GET_OUT_OF_JAIL" },
  },
  {
    id: "chance_go_back_3",
    text: "Go Back 3 Spaces.",
    effect: { kind: "MOVE_STEPS", steps: -3 },
  },
  {
    id: "chance_go_to_jail",
    text: "Go to Jail. Go directly to Jail, do not pass Go, do not collect $200.",
    effect: { kind: "GO_TO_JAIL" },
  },
  {
    id: "chance_repairs",
    text: "Make general repairs on all your property. For each house pay $25. For each hotel pay $100.",
    effect: { kind: "REPAIRS", perHouse: 25, perHotel: 100 },
  },
  {
    id: "chance_poor_tax",
    text: "Pay poor tax of $15.",
    effect: { kind: "PAY", amount: 15 },
  },
  {
    id: "chance_advance_reading",
    text: "Take a trip to Reading Railroad. If you pass Go, collect $200.",
    effect: { kind: "MOVE_TO", position: 5, collectGo: true },
  },
  {
    id: "chance_advance_boardwalk",
    text: "Take a walk on the Boardwalk. Advance token to Boardwalk.",
    effect: { kind: "MOVE_TO", position: 31, collectGo: false },
  },
  {
    id: "chance_elected_chairman",
    text: "You have been elected Chairman of the Board. Pay each player $50.",
    effect: { kind: "PAY_EACH", amount: 50 },
  },
  {
    id: "chance_building_loan",
    text: "Your building loan matures. Collect $150.",
    effect: { kind: "COLLECT", amount: 150 },
  },
];

export const COMMUNITY_CHEST_CARDS: ReadonlyArray<Card> = [
  {
    id: "cc_advance_go",
    text: "Advance to Go. Collect $200.",
    effect: { kind: "MOVE_TO", position: 0, collectGo: true },
  },
  {
    id: "cc_bank_error",
    text: "Bank error in your favor. Collect $200.",
    effect: { kind: "COLLECT", amount: 200 },
  },
  {
    id: "cc_doctor_fee",
    text: "Doctor's fees. Pay $50.",
    effect: { kind: "PAY", amount: 50 },
  },
  {
    id: "cc_stock_sale",
    text: "From sale of stock you get $50.",
    effect: { kind: "COLLECT", amount: 50 },
  },
  {
    id: "cc_get_out_of_jail",
    text: "Get out of Jail Free.",
    effect: { kind: "GET_OUT_OF_JAIL" },
  },
  {
    id: "cc_go_to_jail",
    text: "Go to Jail. Go directly to jail.",
    effect: { kind: "GO_TO_JAIL" },
  },
  {
    id: "cc_grand_opera",
    text: "Grand Opera Night. Collect $50 from every player for opening night seats.",
    effect: { kind: "COLLECT_FROM_EACH", amount: 50 },
  },
  {
    id: "cc_holiday_fund",
    text: "Holiday Fund matures. Collect $100.",
    effect: { kind: "COLLECT", amount: 100 },
  },
  {
    id: "cc_income_tax_refund",
    text: "Income tax refund. Collect $20.",
    effect: { kind: "COLLECT", amount: 20 },
  },
  {
    id: "cc_birthday",
    text: "It is your Birthday. Collect $10 from every player.",
    effect: { kind: "COLLECT_FROM_EACH", amount: 10 },
  },
  {
    id: "cc_life_insurance",
    text: "Life insurance matures. Collect $100.",
    effect: { kind: "COLLECT", amount: 100 },
  },
  {
    id: "cc_pay_hospital",
    text: "Pay hospital fees of $100.",
    effect: { kind: "PAY", amount: 100 },
  },
  {
    id: "cc_pay_school",
    text: "School fees. Pay $150.",
    effect: { kind: "PAY", amount: 150 },
  },
  {
    id: "cc_consultancy_fee",
    text: "Receive $25 consultancy fee.",
    effect: { kind: "COLLECT", amount: 25 },
  },
  {
    id: "cc_street_repairs",
    text: "You are assessed for street repairs. $40 per house. $115 per hotel.",
    effect: { kind: "REPAIRS", perHouse: 40, perHotel: 115 },
  },
  {
    id: "cc_beauty_contest",
    text: "You have won second prize in a beauty contest. Collect $10.",
    effect: { kind: "COLLECT", amount: 10 },
  },
  {
    id: "cc_inheritance",
    text: "You inherit $100.",
    effect: { kind: "COLLECT", amount: 100 },
  },
];
