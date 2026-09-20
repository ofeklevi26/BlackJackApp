import { handValue } from "../engine";
import { comparisonKey } from "../state/analytics";
import type { AppData, Decision, Session } from "../state/types";

export function progressCohortKey(session: Session) {
  return comparisonKey(session);
}

type Bookmark = AppData["bookmarks"][number];
export function bookmarkKey(bookmark: Bookmark) {
  return JSON.stringify([
    bookmark.scenario.id,
    bookmark.rules.hitSoft17,
    bookmark.rules.surrender,
    bookmark.countMode,
  ]);
}

export function setBookmark(
  bookmarks: Bookmark[],
  bookmark: Bookmark,
  saved: boolean,
): Bookmark[] {
  const key = bookmarkKey(bookmark);
  const remaining = bookmarks.filter((item) => bookmarkKey(item) !== key);
  return saved ? [...remaining, bookmark] : remaining;
}

export type HeatmapCell = { count: number; correct: number; example: Decision };
export type HeatmapRow = {
  label: string;
  category: string;
  total: number;
  cells: Record<string, HeatmapCell>;
};
export function buildHeatmap(decisions: Decision[]): HeatmapRow[] {
  const rows = new Map<string, HeatmapRow>();
  for (const decision of decisions) {
    if (decision.replay) continue;
    const hand = handValue(decision.scenario.cards);
    const rank = decision.scenario.cards[0]?.rank ?? "";
    const pairRank = ["J", "Q", "K"].includes(rank) ? "10" : rank;
    const label =
      decision.category === "pairs"
        ? `${pairRank},${pairRank}`
        : `${hand.soft ? "S" : "H"} ${hand.total}`;
    const dealer = ["J", "Q", "K"].includes(decision.scenario.dealer.rank)
      ? "10"
      : decision.scenario.dealer.rank;
    const row = rows.get(label) ?? {
      label,
      category: decision.category,
      total: hand.total,
      cells: {},
    };
    const cell = row.cells[dealer];
    row.cells[dealer] = {
      count: (cell?.count ?? 0) + 1,
      correct: (cell?.correct ?? 0) + Number(decision.correct),
      example: cell?.example ?? decision,
    };
    rows.set(label, row);
  }
  const categoryOrder = ["hard", "soft", "pairs"];
  return [...rows.values()].sort(
    (a, b) =>
      categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category) ||
      a.total - b.total,
  );
}
