import type { Card } from "../engine";
import type { CasinoState } from "../state/casino";

export const DEAL_MS = 280;
export const FLIP_MS = 340;
export type CardMotion = { dealAt?: number; revealAt?: number };
export type TableMotion = {
  token: string;
  cards: Map<string, CardMotion>;
  duration: number;
};
/** Schedule only physical cards introduced by this transition, never a preview. */
export function cardMotionPlan(
  previous: CasinoState | null,
  table: CasinoState | null,
  reducedMotion: boolean,
): TableMotion {
  const plan: TableMotion = {
    token: `${table?.id}:${table?.revision}`,
    cards: new Map(),
    duration: 0,
  };
  const round = table?.shoe.round;
  // Restored sessions are already dealt; mounting a screen must not replay them.
  if (!previous || !table || !round || reducedMotion) return plan;
  const priorRound = previous.shoe.round;
  const sameRound =
    previous.id === table.id &&
    previous.shoe.shuffleNumber === table.shoe.shuffleNumber &&
    priorRound?.id === round.id;
  const oldIds = new Set(
    sameRound
      ? [
          ...priorRound.dealer,
          ...priorRound.hands.flatMap((hand) => hand.cards),
        ].map((card) => card.id)
      : [],
  );
  const players = round.hands.flatMap((hand) => hand.cards);
  const initial = new Set(
    [...players, ...(!sameRound ? round.dealer.slice(0, 2) : [])]
      .filter((card) => !oldIds.has(card.id))
      .map((card) => card.id),
  );
  let cursor = 0;
  const deal = (cards: Card[]) => {
    cards.forEach((card, index) => {
      plan.cards.set(card.id, { dealAt: cursor + index * 115 });
    });
    if (cards.length) cursor += (cards.length - 1) * 115 + DEAL_MS;
  };
  // The finite shoe is the source of actual deal order, including split draws.
  deal(table.shoe.cards.filter((card) => initial.has(card.id)));
  if (round.dealerRevealed && (!sameRound || !priorRound.dealerRevealed)) {
    const hole = round.dealer[1];
    if (hole) {
      plan.cards.set(hole.id, { ...plan.cards.get(hole.id), revealAt: cursor });
      cursor += FLIP_MS;
    }
  }
  deal(round.dealer.slice(2).filter((card) => !oldIds.has(card.id)));
  plan.duration = cursor;
  return plan;
}
