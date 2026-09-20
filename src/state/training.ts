import {
  createShoe,
  generateScenario,
  DEVIATION_RULES,
  getActiveScenario,
  type Scenario,
} from "../engine";
import type { AppData, Session, Training } from "./types";
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
    checkpointEvery?: number;
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
    target:
      topic === "custom" ? 1 : options.target || (options.reviewOnly ? 1 : 20),
    timeLimitMs: topic === "custom" ? 0 : (options.minutes || 0) * 60000,
    elapsedMs: 0,
    paused: false,
    sampling: options.sampling || "balanced",
    countMode: topic === "deviations",
    reviewOnly: !!options.reviewOnly,
    checkpointEvery:
      kind === "simulator" ? (options.checkpointEvery ?? 1) : undefined,
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
      checkpointEvery:
        kind === "simulator" ? (options.checkpointEvery ?? 1) : undefined,
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

/** Start a fresh exercise without silently changing the reviewed conditions. */
export function trainingFromSession(
  data: AppData,
  session: Session,
  options: {
    topic?: string;
    scenario?: Scenario;
    reviewOnly?: boolean;
    kind?: "strategy" | "simulator";
  } = {},
): Training {
  const topic = options.topic ?? session.topic;
  return newTraining(
    {
      ...data,
      settings: {
        ...data.settings,
        rules: session.rules,
        feedback: session.feedback,
        assistance: session.assisted,
      },
    },
    {
      ...options,
      topic,
      sampling: session.sampling,
      checkpointEvery: session.checkpointEvery,
      kind:
        options.kind ??
        (options.scenario
          ? "strategy"
          : topic === "simulator" ||
              (topic === session.topic && session.kind === "simulator")
            ? "simulator"
            : "strategy"),
    },
  );
}

/** Wager selection, insurance, round review and checkpoints are not hand decisions. */
export function decisionClockRunning(training: Training): boolean {
  return (
    !training.paused &&
    !training.feedback &&
    !!(training.shoe ? getActiveScenario(training.shoe) : training.scenario)
  );
}

export function advanceTrainingTime(
  training: Training,
  deltaMs: number,
): Training {
  if (training.paused || training.feedback || deltaMs <= 0) return training;
  return {
    ...training,
    elapsedMs: training.elapsedMs + deltaMs,
    thinkingMs:
      (training.thinkingMs || 0) +
      (decisionClockRunning(training) ? deltaMs : 0),
  };
}

export function completedSession(
  training: Training,
  now = Date.now(),
): Session {
  return {
    ...training.session,
    endedAt: now,
    durationMs: training.elapsedMs,
    rounds: training.shoe?.rounds ?? training.session.decisions.length,
    profit: training.shoe ? training.shoe.bankroll - 100 : 0,
  };
}
