import type { Rank } from "../engine/types";

export type ChartGroup = "hard" | "soft" | "pairs";
type ChartRow = { label: string; ranks: Rank[] };
export const CHART_DEALERS: Rank[] = [
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "A",
];
export const CHART_ROWS: Record<ChartGroup, ChartRow[]> = {
  hard: Array.from({ length: 16 }, (_, index) => {
    const total = index + 5;
    const first = total <= 11 ? Math.floor((total - 1) / 2) : 10;
    return {
      label: String(total),
      ranks: [String(first) as Rank, String(total - first) as Rank],
    };
  }),
  soft: Array.from({ length: 8 }, (_, index) => ({
    label: `A,${index + 2}`,
    ranks: ["A", String(index + 2) as Rank],
  })),
  pairs: CHART_DEALERS.map((rank) => ({
    label: `${rank},${rank}`,
    ranks: [rank, rank],
  })),
};
