import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  Switch,
  StyleSheet,
  Linking,
  Animated,
} from "react-native";
import { useLocalSearchParams, usePathname, router } from "expo-router";
import { useAudioPlayer } from "expo-audio";
import { useStore } from "../src/state/store";
import { newTraining } from "../src/state/training";
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
  COUNT_SOURCE,
  STRATEGY_SOURCE,
  type Rank,
  type Action,
  type Scenario,
} from "../src/engine";
import {
  Page,
  Panel,
  Title,
  Heading,
  Body,
  Eyebrow,
  Button,
  Chip,
  PlayingCard,
  Stat,
  colors,
  shared,
} from "../src/ui";
import { tapFeedback } from "../src/ui/feedback";
import CountingTrainer from "../src/screens/CountingTrainer";
import { createCountingSetup } from "../src/counting";
import SessionReview from "../src/screens/SessionReview";

const ACTIONS: Action[] = ["hit", "stand", "double", "split", "surrender"];
const label = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
const signed = (n: number) => `${n > 0 ? "+" : ""}${Number(n.toFixed(2))}`;
export default function Practice() {
  const { data, update } = useStore();
  const params = useLocalSearchParams<{ topic?: string }>();
  const path = usePathname();
  const [topic, setTopic] = useState(params.topic || "mixed");
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
    if (params.topic) {
      setTopic(params.topic);
      setSummary(null);
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
    if (!active || active.paused || active.feedback || path !== "/practice")
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
              active: {
                ...d.active,
                elapsedMs: d.active.elapsedMs + delta,
                thinkingMs: (d.active.thinkingMs || 0) + delta,
              },
            }
          : d,
      );
    }, 1000);
    return () => clearInterval(timer);
  }, [active?.session.id, active?.paused, active?.feedback?.id, path]);
  useEffect(() => {
    if (path !== "/practice" && active && !active.paused)
      update((d) =>
        d.active ? { ...d, active: { ...d.active, paused: true } } : d,
      );
  }, [path]);
  const change = (fn: (a: Training) => Training) =>
    update((d) => (d.active ? { ...d, active: fn(d.active) } : d));
  function finish() {
    if (!active) return;
    if (active.shoe?.round && active.shoe.round.phase !== "complete") {
      change((a) => ({ ...a, finishAfterRound: true }));
      setNotice(
        "This is your final round. Finish playing it to settle all virtual wagers.",
      );
      return;
    }
    const result = {
      ...active.session,
      endedAt: Date.now(),
      durationMs: active.elapsedMs,
      rounds: active.shoe?.rounds ?? active.session.decisions.length,
      profit: active.shoe ? active.shoe.bankroll - 100 : 0,
    };
    setSummary(result);
    update((d) => ({
      ...d,
      active: null,
      sessions: active.reviewOnly
        ? d.sessions
        : [...d.sessions.filter((s) => s.id !== result.id), result],
    }));
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
        }),
        checkpointEvery,
      },
    }));
  }
  function save(scenario: Scenario) {
    if (!active) return;
    update((d) => ({
      ...d,
      bookmarks: d.bookmarks.some((b) => b.scenario.id === scenario.id)
        ? d.bookmarks
        : [
            ...d.bookmarks,
            {
              scenario,
              rules: active.session.rules,
              countMode: active.countMode,
            },
          ],
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
    if (!active) return;
    if (due && !active.shoe) {
      finish();
      return;
    }
    change((a) => ({
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
    }));
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
  if (summary && !active && !data.counting)
    return (
      <Page>
        <SessionReview
          session={summary}
          onClose={() => {
            setSummary(null);
            router.push("/progress");
          }}
          onReplay={(decision) => {
            setSummary(null);
            update((d) => ({
              ...d,
              active: newTraining(
                { ...d, settings: { ...d.settings, rules: summary.rules } },
                {
                  scenario: decision.scenario,
                  topic: summary.topic,
                  target: 1,
                  reviewOnly: true,
                },
              ),
            }));
          }}
          onPractice={(newTopic) => {
            setSummary(null);
            setTopic(newTopic);
            if (summary.kind === "counting" && summary.countResult) {
              update((d) => ({
                ...d,
                counting: {
                  ...createCountingSetup(d.settings.assistance),
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
              active: newTraining(d, { topic: newTopic }),
            }));
          }}
        />
      </Page>
    );
  if (data.counting)
    return (
      <CountingTrainer
        initialState={{
          ...data.counting,
          paused: data.counting.phase !== "setup",
        }}
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
      <Page>
        <View style={{ gap: 8 }}>
          <Eyebrow>YOUR PRACTICE ROOM</Eyebrow>
          <Title>Make your next move.</Title>
          <Body>
            Choose a skill. Set your pace. Every hand has something to teach.
          </Body>
        </View>
        <View style={[shared.row, { alignItems: "stretch" }]}>
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
          {topic !== "simulator" && (
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
  return (
    <Page>
      <View style={shared.between}>
        <View style={{ gap: 7 }}>
          <Eyebrow>
            {shoe
              ? "THE PRACTICE TABLE"
              : active.reviewOnly
                ? "REVIEW · DOES NOT CHANGE MASTERY"
                : "ONE DECISION AT A TIME"}
          </Eyebrow>
          <Heading>
            {shoe
              ? "Settle in. Find your rhythm."
              : active.session.topic === "deviations"
                ? "Read the count. Choose your move."
                : "What’s your move?"}
          </Heading>
        </View>
        <View style={shared.row}>
          <Chip
            label={
              active.timeLimitMs
                ? `${Math.floor(active.elapsedMs / 60000)}:${String(Math.floor(active.elapsedMs / 1000) % 60).padStart(2, "0")} / ${active.timeLimitMs / 60000} min`
                : `${shoe ? shoe.rounds : active.session.decisions.length} / ${active.target} ${shoe ? "rounds" : "decisions"}`
            }
          />
          <Button
            label={active.paused ? "Resume" : "Pause"}
            variant="ghost"
            onPress={() => change((a) => ({ ...a, paused: !a.paused }))}
          />
          <Button label="Finish session" variant="ghost" onPress={finish} />
        </View>
      </View>
      <View style={shared.row}>
        <Chip
          label={`6 decks · ${displayRules.hitSoft17 ? "H17" : "S17"} · 3:2`}
        />
        <Chip
          label={displayRules.surrender ? "Late surrender" : "No surrender"}
        />
        <Chip
          label={active.session.feedback === "coach" ? "Coach" : "Challenge"}
        />
        <Chip label={active.session.assisted ? "Assisted" : "Unassisted"} />
        {shoe && <Chip label={`Shoe ${shoe.shuffleNumber}`} />}
      </View>
      {active.paused ? (
        <Panel>
          <Heading>Your place is saved.</Heading>
          <Body>
            The timer and shoe are paused. Come back whenever you’re ready.
          </Body>
          <Button
            label="Resume training"
            onPress={() => change((a) => ({ ...a, paused: false }))}
          />
        </Panel>
      ) : (
        <>
          {shoe && (!round || round.phase === "complete") && !feedback && (
            <Panel>
              <View style={shared.row}>
                <Stat
                  label="Virtual balance"
                  value={shoe.bankroll.toFixed(1)}
                />
                <Stat label="Net units" value={signed(shoe.bankroll - 100)} />
                <Stat label="Completed rounds" value={String(shoe.rounds)} />
              </View>
              {round && (
                <>
                  <Heading>
                    Round complete · {signed(round.profit)} units
                  </Heading>
                  <View style={shared.row}>
                    {round.dealer.map((c) => (
                      <PlayingCard key={c.id} card={c} small />
                    ))}
                    <Body>Dealer {handValue(round.dealer).total}</Body>
                  </View>
                  {round.hands.map((h, i) => (
                    <View key={h.id} style={shared.row}>
                      <Body>
                        Hand {i + 1} · {h.result} · {signed(h.profit || 0)}
                      </Body>
                      {h.cards.map((c) => (
                        <PlayingCard key={c.id} card={c} small />
                      ))}
                    </View>
                  ))}
                  {round.insuranceBet > 0 && (
                    <Body>
                      Insurance: {signed(round.insuranceProfit)} units
                    </Body>
                  )}
                </>
              )}
              {checkpointNeeded ? (
                <>
                  <Heading>Check your count</Heading>
                  <Body>
                    Before seeing the answer, enter your running count, decks
                    remaining to the nearest half deck, and the true count using
                    that estimate.
                  </Body>
                  <TextInput
                    accessibilityLabel="Running count checkpoint"
                    placeholder="Running count"
                    placeholderTextColor={colors.muted}
                    style={shared.input}
                    value={runningInput}
                    onChangeText={setRunningInput}
                    keyboardType="numbers-and-punctuation"
                  />
                  <TextInput
                    accessibilityLabel="Decks remaining checkpoint"
                    placeholder="Decks remaining"
                    placeholderTextColor={colors.muted}
                    style={shared.input}
                    value={deckInput}
                    onChangeText={setDeckInput}
                    keyboardType="decimal-pad"
                  />
                  <TextInput
                    accessibilityLabel="True count checkpoint"
                    placeholder="True count · rounded down"
                    placeholderTextColor={colors.muted}
                    style={shared.input}
                    value={trueInput}
                    onChangeText={setTrueInput}
                    keyboardType="numbers-and-punctuation"
                  />
                  {!!checkError && (
                    <Body style={{ color: colors.red }}>{checkError}</Body>
                  )}
                  <Button label="Check my count" onPress={checkpoint} />
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
                  {due ? (
                    <Button label="See my session results" onPress={finish} />
                  ) : (
                    <>
                      <Body>
                        Choose your virtual wager before the next cards are
                        dealt.
                      </Body>
                      <View style={shared.row}>
                        {[1, 2, 4, 8].map((n) => (
                          <Chip
                            key={n}
                            label={`${n} units`}
                            selected={bet === n}
                            onPress={() => setBet(n)}
                          />
                        ))}
                      </View>
                      <Button
                        label="Deal next round"
                        onPress={() => {
                          change((a) => ({
                            ...a,
                            shoe: startRound(a.shoe!, bet, a.shoe!.rounds),
                            thinkingMs: 0,
                          }));
                          setRunningInput("");
                          setDeckInput("");
                          setTrueInput("");
                          setNotice("");
                        }}
                      />
                    </>
                  )}
                </>
              )}
            </Panel>
          )}
          {shoe && round?.phase === "insurance" && (
            <Panel>
              <Heading>Dealer shows an ace</Heading>
              <View style={shared.row}>
                <PlayingCard card={round.dealer[0]} />
                <PlayingCard hidden />
              </View>
              <Eyebrow>YOUR EXPOSED CARDS</Eyebrow>
              <View style={shared.row}>
                {round.hands[0].cards.map((card) => (
                  <PlayingCard key={card.id} card={card} />
                ))}
              </View>
              <Body>
                Insurance is a separate half-bet wager that pays 2:1 when the
                dealer has blackjack.
              </Body>
              <View style={shared.row}>
                <Button
                  label="Decline insurance"
                  onPress={() => insure(false)}
                />
                <Button
                  label="Take insurance"
                  variant="secondary"
                  onPress={() => insure(true)}
                />
              </View>
            </Panel>
          )}
          {shown && (
            <Animated.View style={{ opacity: fade }}>
              <View style={s.table}>
                <View style={s.tableLine} />
                <Eyebrow>DEALER</Eyebrow>
                <View style={shared.row}>
                  <PlayingCard card={shown.dealer} />
                  <PlayingCard hidden />
                </View>
                <Text style={s.tableMark}>BLACKJACK PAYS 3 TO 2</Text>
                <View style={s.handArea}>
                  <View style={shared.row}>
                    {shown.cards.map((c) => (
                      <PlayingCard key={c.id} card={c} />
                    ))}
                  </View>
                  <View style={shared.row}>
                    <Eyebrow>
                      {shown.fromSplit ? "YOUR SPLIT HAND" : "YOUR HAND"}
                    </Eyebrow>
                    {active.session.assisted && (
                      <Chip
                        label={`${handValue(shown.cards).total} · ${handValue(shown.cards).soft ? "soft" : "hard"}`}
                      />
                    )}
                  </View>
                  {active.countMode && (
                    <Chip
                      label={`Supplied true count: ${signed(shown.trueCount || 0)}`}
                    />
                  )}
                </View>
                <View style={s.actions}>
                  {ACTIONS.map((action) => (
                    <Button
                      key={action}
                      label={label(action)}
                      variant={action === "hit" ? "primary" : "secondary"}
                      style={{ flexGrow: 1, minWidth: 82 }}
                      disabled={
                        !!feedback ||
                        !legalActions(shown, displayRules).includes(action)
                      }
                      onPress={() => choose(action)}
                    />
                  ))}
                </View>
                <Body style={{ fontSize: 12, textAlign: "center" }}>
                  {shown.fromSplit ? "After a split · " : " "}
                  {shown.cards.length > 2
                    ? "Double and surrender require the initial two cards."
                    : `Double adds an equal bet · ${actionRestriction("split", shown, displayRules) || "Split is available"}`}
                </Body>
                {!feedback && active.session.assisted && (
                  <Body style={{ color: colors.green }}>
                    Hint:{" "}
                    {label(
                      recommend(shown, displayRules, active.countMode).action,
                    )}
                    . {recommend(shown, displayRules, active.countMode).reason}
                  </Body>
                )}
              </View>
            </Animated.View>
          )}
          {feedback && (
            <Panel
              style={{
                borderColor:
                  active.session.feedback === "challenge"
                    ? colors.border
                    : feedback.correct
                      ? "#43846C"
                      : "#8E665A",
              }}
            >
              <Eyebrow>
                {active.session.feedback === "challenge"
                  ? "ANSWER RECORDED"
                  : feedback.correct
                    ? "✓ GOOD DECISION"
                    : "A MOMENT TO LEARN"}
              </Eyebrow>
              <Heading>
                {active.session.feedback === "challenge"
                  ? `You chose ${label(feedback.chosen)}.`
                  : feedback.correct
                    ? `${label(feedback.chosen)} is the right move.`
                    : `You chose ${label(feedback.chosen)}. ${label(feedback.recommended)} is recommended.`}
              </Heading>
              {active.session.feedback === "coach" && (
                <>
                  <Body>{feedback.explanation}</Body>
                  <Body style={{ fontSize: 12 }}>
                    The quality of a decision is independent of the next card.
                  </Body>
                  <Button
                    label={more ? "Less detail" : "Explain more"}
                    variant="ghost"
                    onPress={() => setMore((x) => !x)}
                  />
                  {more && (
                    <>
                      <Body>
                        {recommend(
                          feedback.scenario,
                          displayRules,
                          active.countMode,
                        ).reason ||
                          `Chart lookup: ${category(feedback.scenario)} ${handValue(feedback.scenario.cards).total} against ${feedback.scenario.dealer.rank}.`}{" "}
                        Only cards visible when you chose are used for this
                        recommendation.
                      </Body>
                      {ACTIONS.filter((a) =>
                        actionRestriction(a, feedback.scenario, displayRules),
                      ).map((a) => (
                        <Body key={a} style={{ fontSize: 12 }}>
                          {label(a)}:{" "}
                          {actionRestriction(
                            a,
                            feedback.scenario,
                            displayRules,
                          )}
                        </Body>
                      ))}
                      <Button
                        label="View strategy reference"
                        variant="ghost"
                        onPress={() =>
                          void Linking.openURL(
                            active.countMode ? COUNT_SOURCE : STRATEGY_SOURCE,
                          )
                        }
                      />
                    </>
                  )}
                </>
              )}
              <View style={shared.row}>
                <Button
                  label={
                    due && !shoe
                      ? "See results"
                      : shoe
                        ? "Continue hand"
                        : "Next situation  →"
                  }
                  onPress={next}
                />
                <Button
                  label="Save for review"
                  variant="secondary"
                  onPress={() => save(feedback.scenario)}
                />
                {!shoe && active.session.feedback === "coach" && (
                  <Button
                    label="Practice similar hands"
                    variant="ghost"
                    onPress={() =>
                      change((a) => ({
                        ...a,
                        session: { ...a.session, topic: feedback.category },
                        feedback: undefined,
                        seed: a.seed + 1337,
                        thinkingMs: 0,
                        scenario: generateScenario(
                          a.seed + 1337,
                          feedback.category,
                        ),
                      }))
                    }
                  />
                )}
              </View>
            </Panel>
          )}
          {shoe && !feedback && (
            <Panel>
              <View style={shared.between}>
                <Body>Discard tray · shoe penetration</Body>
                <Body>{Math.round((shoe.nextCard / 312) * 100)}%</Body>
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
              {active.session.assisted && !checkpointNeeded && (
                <Body>
                  Visible-card running count {signed(shoe.runningCount)}
                </Body>
              )}
              {active.checkpointRound === shoe.rounds &&
                active.session.feedback === "coach" && (
                  <>
                    <Button
                      label={
                        more
                          ? "Hide count walkthrough"
                          : "Show count walkthrough"
                      }
                      variant="ghost"
                      onPress={() => setMore((x) => !x)}
                    />
                    {more && (
                      <Body>
                        {visibleCards(shoe)
                          .map(
                            (c, i, arr) =>
                              `${c.rank}${c.suit} (${signed(hiLo(c))}) → ${signed(arr.slice(0, i + 1).reduce((n, x) => n + hiLo(x), 0))}`,
                          )
                          .join("   ·   ")}
                      </Body>
                    )}
                  </>
                )}
            </Panel>
          )}
          {!!notice && <Body style={{ color: colors.green }}>{notice}</Body>}
        </>
      )}
    </Page>
  );
}
const s = StyleSheet.create({
  table: {
    backgroundColor: "#13352F",
    borderRadius: 26,
    padding: 24,
    borderWidth: 1,
    borderColor: "#315C4D",
    gap: 19,
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
  handArea: { alignItems: "center", gap: 13, marginBottom: 5 },
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
