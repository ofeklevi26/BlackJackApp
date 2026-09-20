import type { Decision, Session } from "./types";
import type { CountAnswer } from "../counting";
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
    .filter((k) => data.groups[k].count > 0 && data.groups[k].accuracy < 1)
    .sort((a, b) => data.groups[a].accuracy - data.groups[b].accuracy);
}

export function summarizeCounts(answers: CountAnswer[]) {
  const stats = (items: CountAnswer[]) => ({
    count: items.length,
    accuracy: items.length
      ? items.filter((answer) => answer.submitted === answer.expected).length /
        items.length
      : 0,
  });
  return {
    ...stats(answers),
    meanAbsoluteError: answers.length
      ? answers.reduce(
          (sum, answer) => sum + Math.abs(answer.submitted - answer.expected),
          0,
        ) / answers.length
      : 0,
    medianMs: median(answers.map((answer) => answer.responseMs)),
    assisted: stats(answers.filter((answer) => answer.assisted)),
    unassisted: stats(answers.filter((answer) => !answer.assisted)),
  };
}

export function assistanceProfile(
  session: Session,
): "assisted" | "unassisted" | "mixed assistance" {
  const observations =
    session.kind === "counting"
      ? (session.countResult?.answers ?? [])
      : session.decisions.filter((decision) => !decision.replay);
  if (!observations.length) return session.assisted ? "assisted" : "unassisted";
  const assisted = observations.filter(
    (observation) => observation.assisted,
  ).length;
  return assisted === 0
    ? "unassisted"
    : assisted === observations.length
      ? "assisted"
      : "mixed assistance";
}

export function countingPaceKey(session: Session) {
  const count = session.countResult;
  if (count?.mode === "decks" || count?.mode === "true-count")
    return "untimed-prompt";
  if (count?.automatic === false) return "manual";
  return `${count?.automatic ? "automatic" : "unrecorded"}/${count?.speedMs ?? "unknown"}`;
}

export function comparisonKey(session: Session) {
  if (session.kind === "counting")
    return `counting/${session.countResult?.mode ?? session.topic}/${assistanceProfile(session)}/${countingPaceKey(session)}`;
  const sampling =
    session.kind === "simulator"
      ? "finite-shoe"
      : (session.sampling ?? "unrecorded");
  return `${session.kind}/${session.topic}/${session.rules.hitSoft17}/${session.rules.surrender}/${session.feedback}/${assistanceProfile(session)}/${sampling}`;
}
export const percent = (n: number) => `${Math.round(n * 100)}%`;
