import {
  createShoe,
  generateScenario,
  DEVIATION_RULES,
  type Scenario,
} from "../engine";
import type { AppData, Training } from "./types";
export function newTraining(
  data: AppData,
  options: {
    topic?: string;
    kind?: "strategy" | "simulator";
    target?: number;
    minutes?: number;
    sampling?: "balanced" | "realistic";
    scenario?: Scenario;
    reviewOnly?: boolean;
  } = {},
): Training {
  const seed = Date.now() % 2147483647;
  const topic =
    options.topic === "surrender" && !data.settings.rules.surrender
      ? "mixed"
      : options.topic || "mixed";
  const kind = options.kind || "strategy";
  const rules = topic === "deviations" ? DEVIATION_RULES : data.settings.rules;
  return {
    seed,
    target: options.target || (options.reviewOnly ? 1 : 20),
    timeLimitMs: (options.minutes || 0) * 60000,
    elapsedMs: 0,
    paused: false,
    sampling: options.sampling || "balanced",
    countMode: topic === "deviations",
    reviewOnly: !!options.reviewOnly,
    session: {
      id: `session-${seed}`,
      startedAt: Date.now(),
      kind,
      topic,
      sampling: options.sampling || "balanced",
      rules: { ...rules },
      feedback: data.settings.feedback,
      assisted: data.settings.assistance,
      decisions: [],
      durationMs: 0,
      rounds: 0,
      profit: 0,
      checkpoints: [],
    },
    scenario:
      kind === "strategy"
        ? options.scenario ||
          generateScenario(
            seed,
            topic,
            options.sampling || "balanced",
            [],
            rules,
          )
        : undefined,
    shoe: kind === "simulator" ? createShoe(seed, rules) : undefined,
  };
}
