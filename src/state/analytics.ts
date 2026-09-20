import type { Decision, Session } from "./types";
export const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length
    ? (sorted[Math.floor((sorted.length - 1) / 2)] +
        sorted[Math.floor(sorted.length / 2)]) /
        2
    : 0;
};
export function summarize(decisions: Decision[]) {
  const first = decisions.filter((d) => !d.replay);
  const stats = (ds: Decision[]) => ({
    count: ds.length,
    accuracy: ds.length ? ds.filter((d) => d.correct).length / ds.length : 0,
  });
  const groups: Record<string, { count: number; accuracy: number }> = {};
  for (const key of [
    "hard",
    "soft",
    "pairs",
    "hit",
    "stand",
    "double",
    "split",
    "surrender",
  ])
    groups[key] = stats(
      first.filter((d) => d.category === key || d.recommended === key),
    );
  return {
    ...stats(first),
    medianMs: median(first.map((d) => d.responseMs)),
    assisted: stats(first.filter((d) => d.assisted)),
    unassisted: stats(first.filter((d) => !d.assisted)),
    groups,
  };
}
export function weakTopics(sessions: Session[]) {
  const data = summarize(sessions.flatMap((s) => s.decisions));
  return ["hard", "soft", "pairs"]
    .filter((k) => data.groups[k].count > 0)
    .sort((a, b) => data.groups[a].accuracy - data.groups[b].accuracy);
}
export function comparisonKey(session: Session) {
  return `${session.kind}/${session.topic}/${session.rules.hitSoft17}/${session.rules.surrender}/${session.feedback}/${session.assisted}/${session.sampling || "balanced"}`;
}
export const percent = (n: number) => `${Math.round(n * 100)}%`;
