import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  Switch,
  StyleSheet,
  Animated,
  Keyboard,
  useWindowDimensions,
} from "react-native";
import { useLocalSearchParams, usePathname, router } from "expo-router";
import { useAudioPlayer } from "expo-audio";
import { useStore } from "../src/state/store";
import {
  newTraining,
  trainingFromSession,
  completedSession,
  advanceTrainingTime,
} from "../src/state/training";
import { weakTopics } from "../src/state/analytics";
import type { Training, Decision, Session } from "../src/state/types";
import {
  makeScenario,
  generateScenario,
  recommend,
  legalActions,
  handValue,
  category,
  actionRestriction,
  RANKS,
  validateScenario,
  startRound,
  playAction,
  answerInsurance,
  getActiveScenario,
  decksRemaining,
  visibleCards,
  trueCount,
  hiLo,
  insuranceRecommendation,
  type Rank,
  type Action,
  type Scenario,
} from "../src/engine";
import {
  Page,
  DetailSheet,
  Panel,
  Title,
  Heading,
  Body,
  Eyebrow,
  Button,
  Chip,
  PlayingCard,
  colors,
  shared,
} from "../src/ui";
import { tapFeedback } from "../src/ui/feedback";
import CountingTrainer from "../src/screens/CountingTrainer";
import { createCountingSetup } from "../src/counting";
import { setBookmark } from "../src/content/progress";
import SessionReview from "../src/screens/SessionReview";
import StrategyTable from "../src/screens/StrategyTable";
import CasinoScreen from "../src/screens/CasinoScreen";
import DecisionExplanation from "../src/screens/DecisionExplanation";

const label = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
const signed = (n: number) => `${n > 0 ? "+" : ""}${Number(n.toFixed(2))}`;
export default function Practice() {
  const { data, update } = useStore();
  const { height, width, fontScale } = useWindowDimensions();
  const shortTable = height < 740 && fontScale < 1.3;
  const checkpointRow = width >= 350 && fontScale < 1.3;
  const params = useLocalSearchParams<{ topic?: string }>();
  const path = usePathname();
  const [topic, setTopic] = useState(params.topic || "mixed");
  const [casinoOpen, setCasinoOpen] = useState(params.topic === "casino");
  const [target, setTarget] = useState(20);
  const [minutes, setMinutes] = useState(0);
  const [sampling, setSampling] = useState<"balanced" | "realistic">(
    "balanced",
  );
  const [checkpointEvery, setCheckpointEvery] = useState(1);
  const [ranks, setRanks] = useState<Rank[]>(["10", "6"]);
  const [dealer, setDealer] = useState<Rank>("10");
  const [fromSplit, setFromSplit] = useState(false);
  const [customError, setCustomError] = useState("");
  const [summary, setSummary] = useState<Session | null>(null);
  const [more, setMore] = useState(false);
  const [bet, setBet] = useState(1);
  const [runningInput, setRunningInput] = useState("");
  const [deckInput, setDeckInput] = useState("");
  const [trueInput, setTrueInput] = useState("");
  const [checkError, setCheckError] = useState("");
  const [notice, setNotice] = useState("");
  const lastTick = useRef(Date.now());
  const locked = useRef(false);
  const active = data.active;
  const sound = useAudioPlayer(require("../assets/card.wav"));
  const fade = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (path !== "/practice") return;
    if (params.topic) {
      setTopic(params.topic);
      setSummary(null);
      if (params.topic === "casino") openCasino();
      else setCasinoOpen(false);
      if (
        ["count", "true-count"].includes(params.topic) &&
        !data.active &&
        !data.counting
      )
        update((d) => ({
          ...d,
          counting: {
            ...createCountingSetup(d.settings.assistance),
            mode: params.topic === "true-count" ? "true-count" : "recognition",
          },
        }));
    }
  }, [params.topic, path]);
  const current = active?.shoe
    ? getActiveScenario(active.shoe)
    : active?.scenario;
  const scenarioKey = current?.id;
  useEffect(() => {
    locked.current = false;
    setMore(false);
    lastTick.current = Date.now();
    if (!data.settings.reducedMotion) {
      fade.setValue(0.5);
      Animated.timing(fade, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }).start();
    }
  }, [scenarioKey, active?.feedback?.id, active?.paused]);
  useEffect(() => {
    if (
      !active ||
      active.paused ||
      active.feedback ||
      casinoOpen ||
      path !== "/practice"
    )
      return;
    lastTick.current = Date.now();
    const id = active.session.id;
    const timer = setInterval(() => {
      const now = Date.now();
      const delta = Math.min(now - lastTick.current, 1500);
      lastTick.current = now;
      update((d) =>
        d.active?.session.id === id
          ? {
              ...d,
              active: advanceTrainingTime(d.active, delta),
            }
          : d,
      );
    }, 1000);
    return () => clearInterval(timer);
  }, [
    active?.session.id,
    active?.paused,
    active?.feedback?.id,
    path,
    casinoOpen,
  ]);
  useEffect(() => {
    if (path !== "/practice" && active && !active.paused)
      update((d) =>
        d.active ? { ...d, active: { ...d.active, paused: true } } : d,
      );
  }, [path]);
  const change = (fn: (a: Training) => Training) => {
    const now = Date.now();
    const delta = Math.max(0, now - lastTick.current);
    lastTick.current = now;
    update((d) =>
      d.active ? { ...d, active: fn(advanceTrainingTime(d.active, delta)) } : d,
    );
  };
  function finish() {
    if (!active) return;
    if (active.shoe?.round && active.shoe.round.phase !== "complete") {
      change((a) => ({ ...a, finishAfterRound: true }));
      setNotice(
        "This is your final round. Finish playing it to settle all virtual wagers.",
      );
      return;
    }
    const result = completedSession(
      advanceTrainingTime(active, Math.max(0, Date.now() - lastTick.current)),
    );
    setSummary(result);
    update((d) => ({
      ...d,
      active: null,
      sessions: active.reviewOnly
        ? d.sessions
        : [...d.sessions.filter((s) => s.id !== result.id), result],
    }));
  }
  function openCasino() {
    setCasinoOpen(true);
    setSummary(null);
    if (params.topic !== "casino") router.setParams({ topic: "casino" });
    update((d) => ({
      ...d,
      active: d.active ? { ...d.active, paused: true } : null,
      counting: d.counting ? { ...d.counting, paused: true } : null,
    }));
  }
  function practiceSimilar() {
    if (!active?.feedback) return;
    const result = completedSession(active);
    const newTopic = active.feedback.category;
    setNotice("");
    update((d) =>
      d.active?.session.id !== active.session.id
        ? d
        : {
            ...d,
            sessions: active.reviewOnly
              ? d.sessions
              : [...d.sessions.filter((s) => s.id !== result.id), result],
            active: trainingFromSession(d, active.session, { topic: newTopic }),
          },
    );
  }
  const due =
    !!active &&
    (!!active.finishAfterRound ||
      (active.timeLimitMs > 0
        ? active.elapsedMs >= active.timeLimitMs
        : (active.shoe
            ? active.shoe.rounds
            : active.session.decisions.length) >= active.target));
  function start(custom?: Scenario) {
    if (topic === "surrender" && !data.settings.rules.surrender) {
      setCustomError("Enable late surrender in table settings first.");
      return;
    }
    setSummary(null);
    setNotice("");
    update((d) => ({
      ...d,
      counting: null,
      active: {
        ...newTraining(d, {
          topic,
          kind: topic === "simulator" ? "simulator" : "strategy",
          target,
          minutes,
          sampling,
          scenario: custom,
          checkpointEvery,
        }),
        checkpointEvery,
      },
    }));
  }
  function save(scenario: Scenario) {
    if (!active) return;
    update((d) => ({
      ...d,
      bookmarks: setBookmark(
        d.bookmarks,
        {
          scenario,
          rules: active.session.rules,
          countMode: active.countMode,
        },
        true,
      ),
    }));
    setNotice("Saved to your review collection.");
  }
  function choose(action: Action) {
    if (
      !active ||
      !current ||
      active.paused ||
      active.feedback ||
      locked.current
    )
      return;
    locked.current = true;
    const expectedId = current.id;
    const rec = recommend(current, active.session.rules, active.countMode);
    const decision: Decision = {
      id: `${active.session.id}-${active.session.decisions.length}`,
      scenario: current,
      chosen: action,
      recommended: rec.action,
      explanation: rec.explanation,
      correct: action === rec.action,
      responseMs:
        (active.thinkingMs || 0) + Math.max(0, Date.now() - lastTick.current),
      assisted: active.session.assisted,
      replay: active.reviewOnly,
      category: category(current),
    };
    if (active.session.feedback === "coach")
      tapFeedback(data.settings.haptics, decision.correct);
    if (data.settings.sound) {
      void sound.seekTo(0);
      sound.play();
    }
    change((a) => {
      const sc = a.shoe ? getActiveScenario(a.shoe) : a.scenario;
      if (sc?.id !== expectedId || a.feedback) return a;
      const shoe = a.shoe ? playAction(a.shoe, action, expectedId) : undefined;
      return {
        ...a,
        shoe,
        session: {
          ...a.session,
          decisions: [...a.session.decisions, decision],
        },
        feedback: decision,
        thinkingMs: 0,
      };
    });
  }
  function next() {
    if (!active?.feedback) return;
    const feedbackId = active.feedback.id;
    setNotice("");
    if (due && !active.shoe) {
      finish();
      return;
    }
    change((a) =>
      a.feedback?.id !== feedbackId
        ? a
        : {
            ...a,
            feedback: undefined,
            thinkingMs: 0,
            seed: a.seed + 7919,
            scenario: a.shoe
              ? undefined
              : generateScenario(
                  a.seed + 7919,
                  a.session.topic,
                  a.sampling,
                  weakTopics(data.sessions).slice(0, 1),
                  a.session.rules,
                ),
          },
    );
  }
  function checkpoint() {
    if (!active?.shoe) return;
    const inputs = [runningInput, deckInput, trueInput];
    if (
      inputs.some((x) => x.trim() === "" || !Number.isFinite(Number(x))) ||
      Number(deckInput) <= 0 ||
      Number(deckInput) > 6 ||
      !Number.isInteger(Number(deckInput) * 2) ||
      !Number.isInteger(Number(runningInput)) ||
      !Number.isInteger(Number(trueInput))
    ) {
      setCheckError(
        "Enter a whole running count, decks remaining in half decks between 0.5 and 6, and a whole true count.",
      );
      return;
    }
    const shoe = active.shoe;
    const decks = Math.max(0.5, Math.round(decksRemaining(shoe) * 2) / 2);
    change((a) =>
      a.checkpointRound === shoe.rounds || a.shoe?.round?.phase !== "complete"
        ? a
        : {
            ...a,
            checkpointRound: shoe.rounds,
            session: {
              ...a.session,
              checkpoints: [
                ...(a.session.checkpoints || []),
                {
                  runningExpected: shoe.runningCount,
                  runningSubmitted: Number(runningInput),
                  decksExpected: decks,
                  decksSubmitted: Number(deckInput),
                  trueExpected: trueCount(shoe.runningCount, decks),
                  trueSubmitted: Number(trueInput),
                },
              ],
            },
          },
    );
    setCheckError("");
  }
  function insure(take: boolean) {
    if (!active?.shoe?.round || active.shoe.round.phase !== "insurance") return;
    const roundId = active.shoe.round.id;
    change((a) =>
      a.shoe?.round?.phase !== "insurance" || a.shoe.round.id !== roundId
        ? a
        : {
            ...a,
            shoe: answerInsurance(a.shoe, take, roundId),
            thinkingMs: 0,
            session: {
              ...a.session,
              insurance: [
                ...(a.session.insurance || []),
                {
                  round: a.shoe.rounds + 1,
                  taken: take,
                  recommended: false,
                  correct: !take,
                },
              ],
            },
          },
    );
    setNotice(
      active.session.feedback === "coach"
        ? `${take ? "Insurance taken." : "Insurance declined."} Basic strategy declines this separate side bet.`
        : "Insurance choice recorded for session review.",
    );
  }
  if (path !== "/practice")
    return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  if (casinoOpen)
    return (
      <CasinoScreen
        onExit={() => {
          setCasinoOpen(false);
          setTopic("mixed");
          router.setParams({ topic: "mixed" });
        }}
      />
    );
  if (summary && !active && !data.counting)
    return (
      <SessionReview
        session={summary}
        onClose={() => {
          setSummary(null);
          router.push("/progress");
        }}
        onReplay={(decision) => {
          setSummary(null);
          setNotice("");
          update((d) => ({
            ...d,
            active: trainingFromSession(d, summary, {
              scenario: decision.scenario,
              topic: summary.topic,
              reviewOnly: true,
            }),
          }));
        }}
        onPractice={(newTopic) => {
          setSummary(null);
          setNotice("");
          setTopic(newTopic);
          if (summary.kind === "counting" && summary.countResult) {
            update((d) => ({
              ...d,
              counting: {
                ...createCountingSetup(summary.countResult!.assisted),
                mode: summary.countResult!.mode,
                automatic: summary.countResult!.automatic ?? false,
                speedMs: summary.countResult!.speedMs,
              },
              active: null,
            }));
            return;
          }
          update((d) => ({
            ...d,
            active: trainingFromSession(d, summary, { topic: newTopic }),
          }));
        }}
      />
    );
  if (data.counting)
    return (
      <CountingTrainer
        initialState={data.counting}
        settings={data.settings}
        onSave={(state) => update((d) => ({ ...d, counting: state }))}
        onExit={() => {
          update((d) => ({
            ...d,
            counting: d.counting?.phase === "setup" ? null : d.counting,
          }));
          router.push("/");
        }}
        onComplete={(result) => {
          const session: Session = {
            id: result.id,
            startedAt: result.startedAt,
            endedAt: result.endedAt,
            kind: "counting",
            topic: result.mode,
            rules: { ...data.settings.rules },
            feedback: "coach",
            assisted: result.assisted,
            decisions: [],
            durationMs: result.durationMs,
            rounds: 0,
            profit: 0,
            countResult: result,
          };
          update((d) => ({
            ...d,
            counting: null,
            sessions: [
              ...d.sessions.filter((s) => s.id !== result.id),
              session,
            ],
          }));
          setSummary(session);
        }}
      />
    );
  if (!active)
    return (
      <Page key="practice-setup">
        <View style={{ gap: 8 }}>
          <Eyebrow>YOUR PRACTICE ROOM</Eyebrow>
          <Title>Make your next move.</Title>
          <Body>
            Choose a skill. Set your pace. Every hand has something to teach.
          </Body>
        </View>
        <View style={[shared.row, { alignItems: "stretch" }]}>
          <Panel
            style={{
              flex: 1,
              minWidth: 250,
              borderColor: "#7B6B44",
              backgroundColor: "#192C2B",
            }}
          >
            <Eyebrow>JUST PLAY</Eyebrow>
            <Heading>Casino table</Heading>
            <Body>
              Place your bet and play full blackjack rounds with a saved virtual
              bankroll. No quizzes or count checkpoints.
            </Body>
            <Button
              label={data.casino ? "Return to casino" : "Play casino blackjack"}
              onPress={openCasino}
            />
          </Panel>
          {[
            [
              "mixed",
              "Strategy drills",
              "A fresh situation with a clear explanation.",
            ],
            ["count", "Card counting", "Build speed and accuracy with Hi-Lo."],
            [
              "simulator",
              "Full-shoe table",
              "Play complete rounds and keep the count.",
            ],
          ].map(([key, title, description]) => (
            <Panel
              key={key}
              style={{
                flex: 1,
                minWidth: 250,
                borderColor:
                  key === topic ||
                  (key === "mixed" && !["count", "simulator"].includes(topic))
                    ? colors.green
                    : colors.border,
              }}
            >
              <Heading>{title}</Heading>
              <Body>{description}</Body>
              <Button
                label={
                  key === "count"
                    ? "Open counting drills"
                    : key === "simulator"
                      ? "Choose the table"
                      : "Choose strategy"
                }
                variant="secondary"
                onPress={() => {
                  setTopic(key);
                  if (key === "count")
                    update((d) => ({
                      ...d,
                      counting: createCountingSetup(d.settings.assistance),
                    }));
                }}
              />
            </Panel>
          ))}
        </View>
        <Panel>
          <Eyebrow>
            {topic === "simulator"
              ? "YOUR TABLE SESSION"
              : "DESIGN YOUR SESSION"}
          </Eyebrow>
          <Heading>
            {topic === "simulator"
              ? "A real shoe. A thoughtful pace."
              : "What would you like to practice?"}
          </Heading>
          {topic !== "simulator" && (
            <View style={shared.row}>
              {[
                ["mixed", "Mixed hands"],
                ["hard", "Hard hands"],
                ["soft", "Soft hands"],
                ["pairs", "Pairs"],
                ["double", "Doubling"],
                ["surrender", "Surrender"],
                ["adaptive", "My weak spots"],
                ["deviations", "Count deviations"],
                ["custom", "Build a situation"],
              ].map(([key, text]) => (
                <Chip
                  key={key}
                  label={text}
                  selected={topic === key}
                  onPress={() => {
                    if (key === "surrender" && !data.settings.rules.surrender) {
                      setNotice(
                        "Enable late surrender in settings to practice surrender situations.",
                      );
                      return;
                    }
                    setNotice("");
                    setTopic(key);
                  }}
                />
              ))}
            </View>
          )}
          {topic === "deviations" && (
            <Body>
              Six introductory Hi-Lo deviations. Uses a dedicated 6-deck S17
              table without surrender. Each puzzle supplies its count; this is
              separate from a continuous shoe.
            </Body>
          )}
          <View style={shared.row}>
            <Chip
              label={`${data.settings.rules.hitSoft17 ? "H17" : "S17"} · 6 decks · 3:2`}
            />
            <Chip
              label={
                data.settings.rules.surrender
                  ? "Late surrender"
                  : "No surrender"
              }
            />
            <Chip
              label={
                data.settings.feedback === "coach"
                  ? "Coach feedback"
                  : "Challenge feedback"
              }
            />
            <Chip
              label={data.settings.assistance ? "Hints on" : "Unassisted"}
            />
          </View>
          {topic === "custom" ? (
            <Body>
              Your custom hand is a one-decision session. Afterward, practice
              similar hands to start a fresh drill.
            </Body>
          ) : (
            <>
              <Body>Session length</Body>
              <View style={shared.row}>
                {[10, 20, 50].map((n) => (
                  <Chip
                    key={n}
                    label={`${n} ${topic === "simulator" ? "rounds" : "decisions"}`}
                    selected={!minutes && target === n}
                    onPress={() => {
                      setTarget(n);
                      setMinutes(0);
                    }}
                  />
                ))}
                {[3, 5, 10].map((n) => (
                  <Chip
                    key={`m${n}`}
                    label={`${n} minutes`}
                    selected={minutes === n}
                    onPress={() => setMinutes(n)}
                  />
                ))}
              </View>
            </>
          )}
          {topic !== "simulator" && topic !== "custom" && (
            <>
              <Body>Situation selection</Body>
              <View style={shared.row}>
                <Chip
                  label="Balanced coverage"
                  selected={sampling === "balanced"}
                  onPress={() => setSampling("balanced")}
                />
                <Chip
                  label="Realistic initial deals"
                  selected={sampling === "realistic"}
                  onPress={() => setSampling("realistic")}
                />
              </View>
            </>
          )}
          {topic === "simulator" && (
            <>
              <Body>Count checkpoints · after completed rounds</Body>
              <View style={shared.row}>
                {[
                  [1, "Every round"],
                  [3, "Every 3 rounds"],
                  [0, "Off"],
                ].map(([n, text]) => (
                  <Chip
                    key={n}
                    label={String(text)}
                    selected={checkpointEvery === n}
                    onPress={() => setCheckpointEvery(Number(n))}
                  />
                ))}
              </View>
              <Body>
                Shuffles at 75% penetration after the round finishes.
                Basic-strategy decisions, virtual units, and a count you keep
                yourself.
              </Body>
            </>
          )}
          {topic === "custom" && (
            <>
              <Heading>Build a valid hand</Heading>
              {ranks.map((rank, i) => (
                <View key={i} style={{ gap: 8 }}>
                  <Body>Player card {i + 1}</Body>
                  <View style={shared.row}>
                    {RANKS.map((r) => (
                      <Chip
                        key={r}
                        label={r}
                        selected={r === rank}
                        onPress={() =>
                          setRanks((p) => p.map((x, k) => (k === i ? r : x)))
                        }
                      />
                    ))}
                  </View>
                </View>
              ))}
              <View style={shared.row}>
                <Button
                  label="Add a card"
                  variant="secondary"
                  disabled={ranks.length >= 6}
                  onPress={() => setRanks((p) => [...p, "2"])}
                />
                <Button
                  label="Remove last card"
                  variant="ghost"
                  disabled={ranks.length <= 2}
                  onPress={() => setRanks((p) => p.slice(0, -1))}
                />
              </View>
              <Body>Dealer upcard</Body>
              <View style={shared.row}>
                {RANKS.map((r) => (
                  <Chip
                    key={r}
                    label={r}
                    selected={r === dealer}
                    onPress={() => setDealer(r)}
                  />
                ))}
              </View>
              <View style={shared.between}>
                <Body>This hand is after a split</Body>
                <Switch
                  accessibilityLabel="Hand is after a split"
                  value={fromSplit}
                  onValueChange={setFromSplit}
                />
              </View>
              <Body>
                Dealer blackjack has already been ruled out by the peek.
              </Body>
              {!!customError && (
                <Body style={{ color: colors.red }}>{customError}</Body>
              )}
            </>
          )}
          {!!notice && <Body style={{ color: colors.gold }}>{notice}</Body>}
          <Button
            label={
              topic === "simulator" ? "Take a seat  →" : "Start practice  →"
            }
            disabled={topic === "surrender" && !data.settings.rules.surrender}
            onPress={() => {
              if (topic === "custom") {
                const sc = makeScenario(ranks, dealer, {
                  fromSplit,
                  handsCount: fromSplit ? 2 : 1,
                });
                const errors = validateScenario(sc);
                if (errors.length || handValue(sc.cards).total >= 21) {
                  setCustomError(
                    errors.join(" ") ||
                      "Choose a hand below 21 with a decision to make.",
                  );
                  return;
                }
                start(sc);
              } else start();
            }}
          />
        </Panel>
        <Panel>
          <Heading>Your review collection</Heading>
          <Body>
            {data.bookmarks.length
              ? `${data.bookmarks.length} saved situations. Revisit them from Progress without changing first-attempt accuracy.`
              : "Save a situation after answering to build your own review collection."}
          </Body>
        </Panel>
      </Page>
    );
  const shoe = active.shoe,
    round = shoe?.round,
    feedback = active.feedback;
  const shown = feedback?.scenario || current;
  const displayRules = active.session.rules;
  const checkpointNeeded =
    !!shoe &&
    round?.phase === "complete" &&
    !!active.checkpointEvery &&
    shoe.rounds % (active.checkpointEvery || 1) === 0 &&
    active.checkpointRound !== shoe.rounds;
  if (!shoe)
    return (
      <StrategyTable
        training={active}
        scenario={current ?? undefined}
        due={due}
        notice={notice}
        reducedMotion={data.settings.reducedMotion}
        onChoose={choose}
        onNext={next}
        onPause={() => change((a) => ({ ...a, paused: true }))}
        onResume={() => change((a) => ({ ...a, paused: false }))}
        onFinish={finish}
        onSave={() => feedback && save(feedback.scenario)}
        onSimilar={practiceSimilar}
        onCasino={openCasino}
      />
    );
  const betweenRounds = !round || round.phase === "complete";
  const footer = active.paused ? (
    <Button
      label="Resume training"
      onPress={() => change((a) => ({ ...a, paused: false }))}
    />
  ) : feedback ? (
    <View style={{ gap: 6 }}>
      <Text
        accessibilityLiveRegion="polite"
        style={[
          s.small,
          {
            color:
              active.session.feedback === "challenge"
                ? colors.muted
                : feedback.correct
                  ? colors.green
                  : colors.gold,
          },
        ]}
      >
        {active.session.feedback === "challenge"
          ? `${label(feedback.chosen)} recorded · review after the session`
          : feedback.correct
            ? `✓ ${label(feedback.chosen)} is the right move`
            : `${label(feedback.recommended)} is recommended · you chose ${label(feedback.chosen)}`}
      </Text>
      <View style={s.dockRow}>
        <Button label="Continue hand" onPress={next} style={s.dockPrimary} />
        {active.session.feedback === "coach" && (
          <Button
            label="Explain"
            variant="secondary"
            onPress={() => setMore(true)}
            style={s.smallButton}
          />
        )}
        <Button
          label="Save"
          variant="ghost"
          onPress={() => save(feedback.scenario)}
          style={s.smallButton}
        />
      </View>
    </View>
  ) : round?.phase === "insurance" ? (
    <View style={s.dockRow}>
      <Button
        label="Decline insurance"
        onPress={() => insure(false)}
        style={s.dockPrimary}
      />
      <Button
        label="Take insurance"
        variant="secondary"
        onPress={() => insure(true)}
        style={s.dockPrimary}
      />
    </View>
  ) : betweenRounds ? (
    checkpointNeeded ? (
      <Button
        label="Check my count"
        onPress={() => {
          Keyboard.dismiss();
          checkpoint();
        }}
      />
    ) : due ? (
      <Button label="See my session results" onPress={finish} />
    ) : (
      <View style={{ gap: 8 }}>
        <View style={s.dockRow}>
          {[1, 2, 4, 8].map((n) => (
            <Button
              key={n}
              label={`${n} units`}
              variant={bet === n ? "primary" : "secondary"}
              onPress={() => setBet(n)}
              style={s.dockPrimary}
            />
          ))}
        </View>
        <Button
          label={`Deal next round · ${bet} ${bet === 1 ? "unit" : "units"}`}
          onPress={() => {
            const expectedRounds = shoe.rounds;
            change((a) =>
              !a.shoe ||
              a.paused ||
              a.feedback ||
              a.shoe.rounds !== expectedRounds ||
              (a.shoe.round && a.shoe.round.phase !== "complete") ||
              (a.shoe.round?.phase === "complete" &&
                !!a.checkpointEvery &&
                a.shoe.rounds % a.checkpointEvery === 0 &&
                a.checkpointRound !== a.shoe.rounds)
                ? a
                : {
                    ...a,
                    shoe: startRound(a.shoe, bet, expectedRounds),
                    thinkingMs: 0,
                  },
            );
            setRunningInput("");
            setDeckInput("");
            setTrueInput("");
            setNotice("");
          }}
        />
      </View>
    )
  ) : shown && round?.phase === "playing" ? (
    <View style={{ gap: 6 }}>
      {[
        ["hit", "stand"],
        ["double", "split", "surrender"],
      ].map((row, i) => (
        <View style={s.dockRow} key={i}>
          {(row as Action[]).map((action) => (
            <Button
              key={action}
              label={label(action)}
              variant={action === "hit" ? "primary" : "secondary"}
              style={s.dockPrimary}
              disabled={!legalActions(shown, displayRules).includes(action)}
              onPress={() => choose(action)}
            />
          ))}
        </View>
      ))}
    </View>
  ) : undefined;
  return (
    <>
      <Page key={active.session.id} compact footer={footer}>
        <View style={s.compactHeader}>
          <View style={{ gap: 3, flex: 1, minWidth: 0 }}>
            <Text accessibilityRole="header" style={s.compactTitle}>
              Shoe training
            </Text>
            <Text style={s.small}>
              {active.timeLimitMs
                ? `${Math.floor(active.elapsedMs / 60000)}:${String(Math.floor(active.elapsedMs / 1000) % 60).padStart(2, "0")} / ${active.timeLimitMs / 60000} min`
                : `${shoe.rounds} / ${active.target} rounds`}
              {` · ${active.session.feedback === "coach" ? "Coach" : "Challenge"} · ${active.session.assisted ? "Guided" : "Independent"}`}
            </Text>
          </View>
          <Button
            label={active.paused ? "Resume" : "Pause"}
            variant="ghost"
            style={s.smallButton}
            onPress={() => change((a) => ({ ...a, paused: !a.paused }))}
          />
          <Button
            label="Details"
            variant="ghost"
            style={s.smallButton}
            onPress={() => {
              change((a) => ({ ...a, paused: true }));
              setMore(true);
            }}
          />
        </View>
        {active.paused ? (
          <Panel style={s.compactPanel}>
            <Heading>Your place is saved.</Heading>
            <Body>
              The timer and shoe are paused. Come back whenever you’re ready.
            </Body>
            <Button
              label={betweenRounds ? "Finish session" : "End after this round"}
              variant="secondary"
              onPress={finish}
            />
            {!!notice && <Body style={{ color: colors.gold }}>{notice}</Body>}
          </Panel>
        ) : (
          <>
            {shoe && (!round || round.phase === "complete") && !feedback && (
              <Panel
                style={[
                  s.compactPanel,
                  shortTable && checkpointNeeded
                    ? { gap: 6, padding: 10 }
                    : undefined,
                ]}
              >
                <Text style={s.small}>
                  Virtual balance {shoe.bankroll.toFixed(1)} · net{" "}
                  {signed(shoe.bankroll - 100)} units
                </Text>
                {round && (
                  <>
                    <Text style={s.compactTitle}>
                      Round complete · {signed(round.profit)} units
                    </Text>
                    <View style={s.cardRow}>
                      {round.dealer.map((c) => (
                        <PlayingCard key={c.id} card={c} small />
                      ))}
                      <Text style={s.small}>
                        Dealer {handValue(round.dealer).total}
                      </Text>
                    </View>
                    {round.hands.map((h, i) =>
                      shortTable && checkpointNeeded ? (
                        <Text key={h.id} style={s.small}>
                          Hand {i + 1}:{" "}
                          {h.cards
                            .map((card) => `${card.rank}${card.suit}`)
                            .join("  ")}{" "}
                          · {h.result} · {signed(h.profit || 0)}
                        </Text>
                      ) : (
                        <View key={h.id} style={s.cardRow}>
                          <Text style={s.small}>
                            Hand {i + 1} · {h.result} · {signed(h.profit || 0)}
                          </Text>
                          {h.cards.map((c) => (
                            <PlayingCard key={c.id} card={c} small />
                          ))}
                        </View>
                      ),
                    )}
                    {round.insuranceBet > 0 && (
                      <Body>
                        Insurance: {signed(round.insuranceProfit)} units
                      </Body>
                    )}
                  </>
                )}
                {checkpointNeeded ? (
                  <>
                    <View style={shared.between}>
                      <Text style={s.compactTitle}>Check your count</Text>
                      <Button
                        label="Done"
                        variant="ghost"
                        style={s.smallButton}
                        onPress={() => Keyboard.dismiss()}
                      />
                    </View>
                    <Text style={s.small}>
                      Estimate decks to the nearest ½, then use that estimate
                      for your true count.
                    </Text>
                    <View style={checkpointRow ? s.checkpointRow : { gap: 8 }}>
                      <View
                        style={checkpointRow ? s.checkpointField : { gap: 3 }}
                      >
                        <Text style={s.small}>Running</Text>
                        <TextInput
                          accessibilityLabel="Running count checkpoint"
                          placeholder="0"
                          placeholderTextColor={colors.muted}
                          style={[shared.input, s.checkpointInput]}
                          value={runningInput}
                          onChangeText={setRunningInput}
                          keyboardType="numbers-and-punctuation"
                          returnKeyType="done"
                          onSubmitEditing={() => Keyboard.dismiss()}
                        />
                      </View>
                      <View
                        style={checkpointRow ? s.checkpointField : { gap: 3 }}
                      >
                        <Text style={s.small}>Decks</Text>
                        <TextInput
                          accessibilityLabel="Decks remaining checkpoint"
                          placeholder="0.5–6"
                          placeholderTextColor={colors.muted}
                          style={[shared.input, s.checkpointInput]}
                          value={deckInput}
                          onChangeText={setDeckInput}
                          keyboardType="decimal-pad"
                          returnKeyType="done"
                          onSubmitEditing={() => Keyboard.dismiss()}
                        />
                      </View>
                      <View
                        style={checkpointRow ? s.checkpointField : { gap: 3 }}
                      >
                        <Text style={s.small}>True</Text>
                        <TextInput
                          accessibilityLabel="True count checkpoint"
                          placeholder="0"
                          placeholderTextColor={colors.muted}
                          style={[shared.input, s.checkpointInput]}
                          value={trueInput}
                          onChangeText={setTrueInput}
                          keyboardType="numbers-and-punctuation"
                          returnKeyType="done"
                          onSubmitEditing={() => Keyboard.dismiss()}
                        />
                      </View>
                    </View>
                    {!!checkError && (
                      <Body style={{ color: colors.red }}>{checkError}</Body>
                    )}
                  </>
                ) : (
                  <>
                    {shoe.rounds > 0 &&
                      active.checkpointRound === shoe.rounds && (
                        <Body>
                          {active.session.feedback === "coach"
                            ? `Running count ${signed(shoe.runningCount)} · about ${Math.max(0.5, Math.round(decksRemaining(shoe) * 2) / 2)} decks · true count ${signed(trueCount(shoe.runningCount, Math.max(0.5, Math.round(decksRemaining(shoe) * 2) / 2)))}`
                            : "Count checkpoint recorded. Answers appear in your session review."}
                        </Body>
                      )}
                    {!due && (
                      <Text style={s.small}>
                        Choose your virtual wager below, then deal.
                      </Text>
                    )}
                  </>
                )}
              </Panel>
            )}
            {shoe && round?.phase === "insurance" && (
              <Panel style={s.compactPanel}>
                <Text style={s.compactTitle}>Dealer shows an ace</Text>
                <View style={s.cardRow}>
                  <PlayingCard card={round.dealer[0]} small />
                  <PlayingCard hidden small />
                </View>
                <Eyebrow>YOUR EXPOSED CARDS</Eyebrow>
                <View style={s.cardRow}>
                  {round.hands[0].cards.map((card) => (
                    <PlayingCard key={card.id} card={card} small />
                  ))}
                </View>
                <Text style={s.small}>
                  Insurance is a separate half-bet wager that pays 2:1 when the
                  dealer has blackjack.
                </Text>
              </Panel>
            )}
            {shown && (
              <Animated.View style={{ opacity: fade }}>
                <View style={s.table}>
                  <View style={s.tableLine} />
                  <View style={[s.tableHands, shortTable && s.tableHandsRow]}>
                    <View style={[s.handArea, shortTable && s.handColumn]}>
                      <Eyebrow>DEALER</Eyebrow>
                      <View style={s.cardRow}>
                        <PlayingCard card={shown.dealer} small />
                        <PlayingCard hidden small />
                      </View>
                    </View>
                    {!shortTable && (
                      <Text style={s.tableMark}>BLACKJACK PAYS 3 TO 2</Text>
                    )}
                    <View style={[s.handArea, shortTable && s.handColumn]}>
                      <Eyebrow>
                        {shown.fromSplit ? "SPLIT HAND" : "YOUR HAND"}
                      </Eyebrow>
                      <View style={s.cardRow}>
                        {shown.cards.map((c) => (
                          <PlayingCard key={c.id} card={c} small />
                        ))}
                      </View>
                      <View style={shared.row}>
                        {active.session.assisted && (
                          <Text
                            style={[s.small, { color: colors.green }]}
                          >{`${handValue(shown.cards).total} · ${handValue(shown.cards).soft ? "soft" : "hard"}`}</Text>
                        )}
                      </View>
                      {active.countMode && (
                        <Chip
                          label={`Supplied true count: ${signed(shown.trueCount || 0)}`}
                        />
                      )}
                    </View>
                  </View>
                  {!feedback && active.session.assisted && (
                    <Text
                      style={[
                        s.small,
                        { color: colors.green, textAlign: "center" },
                      ]}
                    >
                      Hint:{" "}
                      {label(
                        recommend(shown, displayRules, active.countMode).action,
                      )}
                      .{" "}
                      {recommend(shown, displayRules, active.countMode).reason}
                    </Text>
                  )}
                </View>
              </Animated.View>
            )}
            {shoe &&
              !feedback &&
              round?.phase === "playing" &&
              round.hands.length > 1 && (
                <Panel style={s.compactPanel}>
                  <Text style={s.small}>
                    Other split hands · count every exposed card
                  </Text>
                  {round.hands.map((hand, index) =>
                    index === round.activeHand ? null : (
                      <View key={hand.id} style={{ gap: 8 }}>
                        <Eyebrow>
                          Hand {index + 1} ·{" "}
                          {index < round.activeHand
                            ? "finished playing"
                            : "waiting to play"}
                        </Eyebrow>
                        <View style={s.cardRow}>
                          {hand.cards.map((card) => (
                            <PlayingCard key={card.id} card={card} small />
                          ))}
                        </View>
                      </View>
                    ),
                  )}
                </Panel>
              )}
            {feedback && (
              <Text style={s.small}>
                {active.session.feedback === "coach"
                  ? feedback.explanation
                  : "Your first answer is saved. Feedback appears in the session review."}
              </Text>
            )}
            {shoe && !feedback && !checkpointNeeded && (
              <View style={{ gap: 5 }}>
                <View style={shared.between}>
                  <Text style={s.small}>
                    Shoe {shoe.shuffleNumber} ·{" "}
                    {Math.round((shoe.nextCard / 312) * 100)}% dealt
                  </Text>
                  {active.session.assisted && !checkpointNeeded && (
                    <Text style={[s.small, { color: colors.green }]}>
                      Visible count {signed(shoe.runningCount)}
                    </Text>
                  )}
                </View>
                <View
                  accessibilityLabel={`${Math.round((shoe.nextCard / 312) * 100)} percent of shoe dealt`}
                  style={s.track}
                >
                  <View
                    style={{
                      height: 8,
                      borderRadius: 4,
                      width: `${(shoe.nextCard / 312) * 100}%`,
                      backgroundColor: colors.green,
                    }}
                  />
                </View>
                {round?.phase === "complete" &&
                  active.checkpointRound === shoe.rounds &&
                  active.session.feedback === "coach" && (
                    <Button
                      label="Count walkthrough"
                      variant="ghost"
                      style={s.smallButton}
                      onPress={() => setMore(true)}
                    />
                  )}
              </View>
            )}
            {!!notice && <Body style={{ color: colors.green }}>{notice}</Body>}
          </>
        )}
      </Page>
      <DetailSheet
        visible={more}
        title={
          feedback && active.session.feedback === "coach"
            ? "Understand this decision"
            : "Your practice table"
        }
        onClose={() => setMore(false)}
        reducedMotion={data.settings.reducedMotion}
      >
        {feedback && active.session.feedback === "coach" ? (
          <DecisionExplanation
            scenario={feedback.scenario}
            rules={displayRules}
            countMode={active.countMode}
            chosen={feedback.chosen}
          />
        ) : (
          <>
            {round?.phase === "complete" && !feedback && (
              <>
                <Heading>Completed hands</Heading>
                {round.hands.map((hand, index) => (
                  <View key={hand.id} style={{ gap: 6 }}>
                    <Text style={s.small}>
                      Hand {index + 1} · {hand.result}
                    </Text>
                    <View style={s.cardRow}>
                      {hand.cards.map((card) => (
                        <PlayingCard key={card.id} card={card} small />
                      ))}
                    </View>
                  </View>
                ))}
              </>
            )}
            <Body>
              Six decks · blackjack pays 3:2 · dealer{" "}
              {displayRules.hitSoft17 ? "hits" : "stands on"} soft 17 ·{" "}
              {displayRules.surrender ? "late surrender" : "no surrender"} ·
              shoe {shoe.shuffleNumber}.
            </Body>
            <Body>
              Count every exposed card, including other split hands and the
              dealer’s final cards. The hidden hole card does not enter your
              running count until it is revealed.
            </Body>
            <Body>
              Double adds an equal bet and is available on your first two cards.
              Splitting requires a pair of equal-value cards; the table allows
              up to four hands. Split aces receive one new card each.
            </Body>
            {shown && (
              <Body>
                {actionRestriction("split", shown, displayRules) ||
                  "Split is available for the current hand."}
              </Body>
            )}
            <Body>
              {active.session.feedback === "coach"
                ? "Coach gives feedback after every decision. Your decision quality is scored separately from the outcome of the hand."
                : "Challenge saves your decisions and count checkpoints for the session review. Feedback stays hidden while you play."}
            </Body>
            {round?.phase === "complete" &&
              active.checkpointRound === shoe.rounds &&
              active.session.feedback === "coach" && (
                <>
                  <Heading>Exposed-card count walkthrough</Heading>
                  <Body>
                    {visibleCards(shoe)
                      .map(
                        (c, i, arr) =>
                          `${c.rank}${c.suit} (${signed(hiLo(c))}) → ${signed(arr.slice(0, i + 1).reduce((n, x) => n + hiLo(x), 0))}`,
                      )
                      .join("   ·   ")}
                  </Body>
                </>
              )}
          </>
        )}
        {active.paused && (
          <Body>
            The table is paused. Close this sheet and tap Resume when you are
            ready.
          </Body>
        )}
        <Button
          label={betweenRounds ? "Finish session" : "End after this round"}
          variant="secondary"
          onPress={() => {
            setMore(false);
            finish();
          }}
        />
        <Button
          label="Play casino mode"
          variant="ghost"
          onPress={() => {
            setMore(false);
            openCasino();
          }}
        />
      </DetailSheet>
    </>
  );
}
const s = StyleSheet.create({
  tableHands: { width: "100%", alignItems: "center", gap: 7 },
  tableHandsRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  handColumn: { flex: 1, minWidth: 0 },
  checkpointRow: { flexDirection: "row", gap: 8 },
  checkpointField: { flex: 1, minWidth: 0, gap: 3 },
  compactHeader: { flexDirection: "row", alignItems: "center", gap: 4 },
  compactTitle: {
    color: colors.text,
    fontSize: 18,
    lineHeight: 23,
    fontWeight: "600",
  },
  small: { color: colors.muted, fontSize: 12, lineHeight: 18, flexShrink: 1 },
  smallButton: { minHeight: 44, paddingHorizontal: 8, paddingVertical: 8 },
  dockRow: { flexDirection: "row", gap: 6 },
  dockPrimary: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    paddingHorizontal: 6,
    paddingVertical: 10,
  },
  compactPanel: { padding: 12, gap: 10 },
  checkpointInput: {
    minHeight: 44,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  cardRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
    justifyContent: "center",
  },
  table: {
    backgroundColor: "#13352F",
    borderRadius: 26,
    padding: 12,
    borderWidth: 1,
    borderColor: "#315C4D",
    gap: 7,
    alignItems: "center",
    overflow: "hidden",
  },
  tableLine: {
    position: "absolute",
    top: 10,
    left: 10,
    right: 10,
    bottom: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#51796B44",
  },
  tableMark: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 2,
    color: "#8AAC9A",
    marginVertical: 2,
  },
  handArea: { alignItems: "center", gap: 7, marginBottom: 0 },
  actions: {
    alignSelf: "stretch",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 7,
  },
  track: {
    height: 8,
    backgroundColor: colors.bg,
    borderRadius: 4,
    overflow: "hidden",
  },
});
