import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AppState,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import { hiLo } from "../engine";
import { Body, Button, Chip, Heading, Page, Panel, PlayingCard } from "../ui";
import { colors } from "../ui/theme";
import {
  advanceCountingTime,
  COUNTING_MODES,
  CountAnswer,
  countExplanation,
  CountingState,
  CountResult,
  createCountingSetup,
  describeMode,
  finishCountingSession,
  nextCountingExercise,
  normalizeCountInput,
  revealNextCountingCard,
  signed,
  startCountingSession,
  submitCountAnswer,
  validCountInput,
} from "../counting";

export type { CountingState, CountResult } from "../counting";

interface Props {
  initialState?: CountingState;
  onSave: (state: CountingState | null) => void;
  onComplete: (result: CountResult) => void;
  onExit: () => void;
  settings: { assistance: boolean; reducedMotion: boolean; haptics: boolean };
}

function DiscardTray({ discardedCards }: { discardedCards: number }) {
  const deckHeight = 28;
  const height = (discardedCards / 52) * deckHeight;
  return (
    <View style={s.trayArea}>
      <View style={{ alignItems: "center", gap: 10 }}>
        <View
          accessible
          accessibilityLabel="Visual discard tray. Estimate the height against the one-deck reference beside it."
          style={s.tray}
        >
          {[1, 2, 3, 4, 5, 6].map((mark) => (
            <View
              key={mark}
              style={[s.trayMark, { bottom: mark * deckHeight }]}
            />
          ))}
          <View style={[s.discards, { height }]}>
            {Array.from({ length: Math.floor(height / 3) }, (_, i) => (
              <View key={i} style={[s.cardEdge, { bottom: i * 3 }]} />
            ))}
          </View>
        </View>
        <Text style={s.small}>Discard tray</Text>
      </View>
      <View style={{ alignItems: "center", gap: 10 }}>
        <View style={{ height: 184, justifyContent: "flex-end" }}>
          <View style={[s.referenceDeck, { height: deckHeight }]}>
            {Array.from({ length: 9 }, (_, i) => (
              <View key={i} style={[s.cardEdge, { bottom: i * 3 }]} />
            ))}
          </View>
        </View>
        <Text style={s.small}>1 deck reference</Text>
      </View>
    </View>
  );
}

function Walkthrough({ answer }: { answer: CountAnswer }) {
  let running =
    answer.kind === "running-count" ? (answer.startingCount ?? 0) : 0;
  return (
    <View style={{ gap: 10 }}>
      <Text style={s.label}>EXPOSED CARD WALKTHROUGH</Text>
      <View style={s.wrap}>
        {answer.cards.map((card, i) => {
          running += hiLo(card);
          return (
            <View key={`${card.id}-${i}`} style={s.walkCard}>
              <PlayingCard card={card} small />
              <Text style={s.walkValue}>{signed(hiLo(card))}</Text>
              {answer.kind !== "card-value" && (
                <Text style={s.small}>
                  {answer.kind === "running-count" ? "Count" : "Sum"}{" "}
                  {signed(running)}
                </Text>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

function NumberEntry({
  value,
  onChange,
  onSubmit,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled: boolean;
}) {
  const keys = [
    ["1", "2", "3"],
    ["4", "5", "6"],
    ["7", "8", "9"],
    ["±", "0", "⌫"],
  ];
  function press(key: string) {
    if (key === "⌫") onChange(value.slice(0, -1));
    else if (key === "±")
      onChange(value.startsWith("-") ? value.slice(1) : `-${value}`);
    else if (value.replace("-", "").length < 3)
      onChange(
        value === "0" ? key : value === "-0" ? `-${key}` : `${value}${key}`,
      );
  }
  return (
    <View
      style={{ gap: 12, maxWidth: 400, width: "100%", alignSelf: "center" }}
    >
      <TextInput
        accessibilityLabel="Your count"
        value={value}
        onChangeText={(text) => onChange(normalizeCountInput(text))}
        placeholder="Your count"
        placeholderTextColor={colors.muted}
        onSubmitEditing={onSubmit}
        returnKeyType="done"
        style={s.numberInput}
        editable={!disabled}
      />
      {keys.map((row, index) => (
        <View style={s.keyRow} key={index}>
          {row.map((key) => (
            <Pressable
              key={key}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityLabel={
                key === "±"
                  ? "Toggle positive or negative"
                  : key === "⌫"
                    ? "Delete last digit"
                    : key
              }
              onPress={() => press(key)}
              style={({ pressed }) => [s.key, { opacity: pressed ? 0.65 : 1 }]}
            >
              <Text style={s.keyText}>{key}</Text>
            </Pressable>
          ))}
        </View>
      ))}
      <Button
        label="Check my count"
        onPress={onSubmit}
        disabled={disabled || !validCountInput(value)}
      />
      {value !== "" && value !== "-" && !validCountInput(value) && (
        <Body style={{ color: colors.gold }}>
          Enter a whole count, such as −3, 0, or +2.
        </Body>
      )}
    </View>
  );
}

export default function CountingTrainer({
  initialState,
  onSave,
  onComplete,
  onExit,
  settings,
}: Props) {
  const [state, setState] = useState<CountingState>(() =>
    initialState
      ? { ...initialState, paused: initialState.phase !== "setup" }
      : createCountingSetup(settings.assistance),
  );
  const [input, setInput] = useState("");
  const [showWalkthrough, setShowWalkthrough] = useState(false);
  const stateRef = useRef(state);
  const saveRef = useRef(onSave);
  const clockRef = useRef(Date.now());
  const foregroundRef = useRef(
    AppState.currentState === "active" || AppState.currentState == null,
  );
  const completedRef = useRef(false);
  const submittedExerciseRef = useRef<string | null>(null);
  stateRef.current = state;
  saveRef.current = onSave;

  const apply = useCallback(
    (transition: (previous: CountingState) => CountingState) => {
      const now = Date.now();
      const elapsed = foregroundRef.current
        ? Math.max(0, now - clockRef.current)
        : 0;
      clockRef.current = now;
      setState((previous) =>
        transition(advanceCountingTime(previous, elapsed)),
      );
    },
    [],
  );

  useEffect(() => {
    if (state.phase !== "setup" && !completedRef.current)
      saveRef.current(state);
  }, [state]);

  // Settings and app-wide lifecycle controls may pause a mounted trainer.
  // Resuming is always an explicit action inside the visible trainer.
  useEffect(() => {
    if (initialState?.paused)
      apply((previous) =>
        previous.paused ? previous : { ...previous, paused: true },
      );
  }, [initialState?.paused, apply]);

  useEffect(() => {
    const timer = setInterval(() => apply((previous) => previous), 1000);
    const subscription = AppState.addEventListener("change", (appState) => {
      if (appState !== "active") {
        apply((previous) =>
          previous.phase !== "setup" && previous.phase !== "complete"
            ? { ...previous, paused: true }
            : previous,
        );
        foregroundRef.current = false;
      } else {
        foregroundRef.current = true;
        clockRef.current = Date.now();
      }
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [apply]);

  useEffect(() => {
    if (state.phase !== "reveal" || !state.automatic || state.paused) return;
    const timer = setInterval(() => {
      if (foregroundRef.current) apply(revealNextCountingCard);
    }, state.speedMs);
    return () => clearInterval(timer);
  }, [state.phase, state.automatic, state.speedMs, state.paused, apply]);

  useEffect(() => {
    setInput("");
    setShowWalkthrough(false);
  }, [state.exercise?.id]);

  function answer(value: number) {
    if (
      stateRef.current.phase !== "answer" ||
      stateRef.current.paused ||
      submittedExerciseRef.current === stateRef.current.exercise?.id ||
      !Number.isFinite(value)
    )
      return;
    submittedExerciseRef.current = stateRef.current.exercise?.id ?? null;
    if (settings.haptics) {
      void Haptics.notificationAsync(
        value === stateRef.current.exercise?.expected
          ? Haptics.NotificationFeedbackType.Success
          : Haptics.NotificationFeedbackType.Warning,
      ).catch(() => {});
    }
    apply((previous) => submitCountAnswer(previous, value));
  }

  function finish() {
    if (completedRef.current) return;
    const now = Date.now();
    const current = advanceCountingTime(
      stateRef.current,
      foregroundRef.current ? now - clockRef.current : 0,
    );
    completedRef.current = true;
    saveRef.current(null);
    onComplete(finishCountingSession(current, now));
  }

  function saveAndExit() {
    const now = Date.now();
    const current = advanceCountingTime(
      stateRef.current,
      foregroundRef.current ? now - clockRef.current : 0,
    );
    const paused = { ...current, paused: true };
    stateRef.current = paused;
    setState(paused);
    if (paused.phase !== "setup") saveRef.current(paused);
    onExit();
  }

  const mode = describeMode(state.mode);
  const exercise = state.exercise;
  const latestAnswer =
    state.phase === "feedback" || state.phase === "complete"
      ? state.answers[state.answers.length - 1]
      : undefined;
  const cardMode = !["decks", "true-count"].includes(state.mode);

  if (state.phase === "setup")
    return (
      <Page key="counting-setup">
        <View style={s.between}>
          <Text style={s.eyebrow}>BUILD YOUR COUNTING INSTINCT</Text>
          <Button label="Back" variant="ghost" onPress={onExit} />
        </View>
        <View style={{ gap: 8 }}>
          <Text accessibilityRole="header" style={s.title}>
            {"A little focus.\nA stronger count."}
          </Text>
          <Body>
            Start with card values, then build up to a full deck. Short drills
            make accuracy a habit.
          </Body>
        </View>
        <View style={s.modeGrid}>
          {COUNTING_MODES.map((item) => (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityState={{ selected: state.mode === item.id }}
              onPress={() =>
                setState((previous) => ({ ...previous, mode: item.id }))
              }
              style={({ pressed }) => [
                s.modeCard,
                state.mode === item.id && s.modeSelected,
                { opacity: pressed ? 0.8 : 1 },
              ]}
            >
              <Text style={s.modeTitle}>{item.title}</Text>
              <Text style={s.modeSubtitle}>{item.subtitle}</Text>
              <Text style={s.modeDetail}>{item.detail}</Text>
            </Pressable>
          ))}
        </View>
        <Panel>
          <Heading>Make it your pace</Heading>
          <Text style={s.label}>ASSISTANCE</Text>
          <View style={s.wrap}>
            <Chip
              label="Guided · show help"
              selected={state.assistance}
              onPress={() =>
                setState((previous) => ({ ...previous, assistance: true }))
              }
            />
            <Chip
              label="Independent · hide help"
              selected={!state.assistance}
              onPress={() =>
                setState((previous) => ({ ...previous, assistance: false }))
              }
            />
          </View>
          <Body>
            {state.assistance
              ? "See the Hi-Lo key and a live running count during card drills. Guided answers are recorded separately."
              : "Keep the count yourself. Answers stay hidden until you submit; corrections still appear afterward."}
          </Body>
          {cardMode && (
            <>
              <Text style={s.label}>DEALING</Text>
              <View style={s.wrap}>
                <Chip
                  label="Tap to deal"
                  selected={!state.automatic}
                  onPress={() =>
                    setState((previous) => ({ ...previous, automatic: false }))
                  }
                />
                <Chip
                  label="Automatic"
                  selected={state.automatic}
                  onPress={() =>
                    setState((previous) => ({ ...previous, automatic: true }))
                  }
                />
              </View>
              {state.automatic && (
                <>
                  <View style={s.wrap}>
                    {[
                      { label: "Relaxed · 2s", value: 2000 },
                      { label: "Steady · 1.2s", value: 1200 },
                      { label: "Quick · 0.6s", value: 600 },
                    ].map((speed) => (
                      <Chip
                        key={speed.value}
                        label={speed.label}
                        selected={state.speedMs === speed.value}
                        onPress={() =>
                          setState((previous) => ({
                            ...previous,
                            speedMs: speed.value,
                          }))
                        }
                      />
                    ))}
                  </View>
                  <Body>
                    Dealing pauses at each checkpoint until you answer. You can
                    pause the whole session at any time.
                  </Body>
                </>
              )}
            </>
          )}
          {state.mode === "decks" && (
            <Body>
              Use the one-deck reference to estimate cards already discarded,
              then subtract from six. This simplified tray builds your eye; real
              card thickness varies.
            </Body>
          )}
          {state.mode === "true-count" && (
            <Body>
              These are supplied count contexts. Divide running count by decks
              remaining, then round down toward −∞. For example, −1 ÷ 2 becomes
              −1.
            </Body>
          )}
          <Button
            label={`Start ${mode.title.toLowerCase()}`}
            onPress={() => apply((previous) => startCountingSession(previous))}
          />
        </Panel>
      </Page>
    );

  return (
    <Page key={`counting-${state.id}-${exercise?.id ?? "session"}`}>
      <View style={s.between}>
        <View style={{ gap: 5 }}>
          <Text style={s.eyebrow}>COUNTING LAB</Text>
          <Heading>{mode.title}</Heading>
        </View>
        <Button label="Save & exit" variant="ghost" onPress={saveAndExit} />
      </View>
      <View style={s.between}>
        <Text style={s.small}>
          Checkpoint{" "}
          {Math.min(
            state.answers.length + (latestAnswer ? 0 : 1),
            state.totalExercises,
          )}{" "}
          of {state.totalExercises} ·{" "}
          {state.assistance ? "Guided" : "Independent"}
        </Text>
        <Button
          label={state.paused ? "Resume" : "Pause"}
          variant="secondary"
          onPress={() =>
            apply((previous) => ({ ...previous, paused: !previous.paused }))
          }
        />
      </View>
      <View
        accessibilityRole="progressbar"
        accessibilityValue={{
          min: 0,
          max: state.totalExercises,
          now: state.answers.length,
        }}
        style={s.progressTrack}
      >
        <View
          style={[
            s.progressFill,
            {
              width: `${(state.answers.length / state.totalExercises) * 100}%`,
            },
          ]}
        />
      </View>
      {state.paused ? (
        <Panel>
          <Heading>Your place is saved.</Heading>
          <Body>
            The cards, count, and answers will be here when you return. Your
            decision timer is paused.
          </Body>
          <Button
            label="Continue session"
            onPress={() =>
              apply((previous) => ({ ...previous, paused: false }))
            }
          />
          {state.answers.length > 0 && (
            <Button
              label={
                state.answers.length >= state.totalExercises
                  ? "See session results"
                  : "Finish this shorter session"
              }
              variant="secondary"
              onPress={finish}
            />
          )}
        </Panel>
      ) : (
        <>
          {exercise && (
            <Panel style={s.table}>
              {cardMode ? (
                <>
                  <Text style={s.label}>
                    {state.mode === "countdown"
                      ? `FULL DECK · ${state.index} OF 52 CARDS EXPOSED`
                      : state.mode === "pairs"
                        ? "ADD THIS PAIR’S HI-LO VALUES"
                        : state.mode === "recognition"
                          ? "WHAT IS THIS CARD’S HI-LO VALUE?"
                          : "KEEP THE COUNT AS EACH CARD APPEARS"}
                  </Text>
                  <View style={s.dealtCards}>
                    {exercise.cards.slice(-4).map((card, index) => (
                      <View key={`${card.id}-${index}`}>
                        <PlayingCard
                          card={card}
                          small={exercise.cards.length > 3}
                        />
                      </View>
                    ))}
                    {state.phase === "reveal" && (
                      <PlayingCard hidden small={exercise.cards.length > 3} />
                    )}
                  </View>
                  {state.mode !== "recognition" && (
                    <Text style={s.small}>
                      {exercise.cards.length} of{" "}
                      {exercise.targetIndex - exercise.startIndex} cards in this
                      checkpoint
                      {state.mode === "countdown" && exercise.cards.length > 4
                        ? " · showing latest 4"
                        : ""}
                    </Text>
                  )}
                  {state.assistance && (
                    <View style={s.assistance}>
                      <Text style={s.assistanceText}>
                        2–6 → +1 7–9 → 0 10–A → −1
                      </Text>
                      {(state.mode === "running" ||
                        state.mode === "countdown") && (
                        <Text style={s.assistanceCount}>
                          Running count: {signed(state.runningCount)}
                        </Text>
                      )}
                    </View>
                  )}
                  {state.phase === "reveal" && (
                    <Button
                      label={
                        state.automatic ? "Deal next now" : "Deal next card"
                      }
                      variant="secondary"
                      onPress={() => apply(revealNextCountingCard)}
                    />
                  )}
                </>
              ) : state.mode === "decks" ? (
                <>
                  <Text style={s.label}>
                    SIX-DECK SHOE · ESTIMATE TO THE NEAREST ½ DECK
                  </Text>
                  <DiscardTray discardedCards={exercise.discardedCards!} />
                  <Heading>How many decks remain?</Heading>
                  <Body style={{ textAlign: "center" }}>
                    Estimate the discarded stack, then subtract it from six.
                  </Body>
                </>
              ) : (
                <>
                  <Text style={s.label}>SUPPLIED COUNT CONTEXT</Text>
                  <View style={s.contextRow}>
                    <View style={s.contextItem}>
                      <Text style={s.bigCount}>
                        {signed(exercise.runningCount!)}
                      </Text>
                      <Text style={s.small}>Running count</Text>
                    </View>
                    <Text style={s.divide}>÷</Text>
                    <View style={s.contextItem}>
                      <Text style={s.bigCount}>{exercise.decksRemaining}</Text>
                      <Text style={s.small}>Decks remaining</Text>
                    </View>
                  </View>
                  <Heading>What is the true count?</Heading>
                  {state.assistance && (
                    <Body style={{ textAlign: "center" }}>
                      Running count ÷ decks remaining. Round down toward
                      negative infinity, including negative answers.
                    </Body>
                  )}
                </>
              )}
            </Panel>
          )}

          {state.phase === "answer" && exercise && (
            <Panel>
              {cardMode && (
                <Heading>
                  {state.mode === "recognition"
                    ? "Choose the card’s value"
                    : state.mode === "pairs"
                      ? "What is the pair’s total?"
                      : "What is your running count?"}
                </Heading>
              )}
              {state.mode === "recognition" || state.mode === "pairs" ? (
                <View style={s.wrap}>
                  {(state.mode === "pairs"
                    ? [-2, -1, 0, 1, 2]
                    : [-1, 0, 1]
                  ).map((value) => (
                    <Button
                      key={value}
                      label={signed(value)}
                      onPress={() => answer(value)}
                      style={{ flex: 1, minWidth: 58 }}
                    />
                  ))}
                </View>
              ) : state.mode === "decks" ? (
                <View style={s.wrap}>
                  {Array.from({ length: 13 }, (_, index) => index / 2).map(
                    (value) => (
                      <Button
                        key={value}
                        label={`${value}`}
                        onPress={() => answer(value)}
                        variant="secondary"
                        style={{ minWidth: 64, flexGrow: 1 }}
                      />
                    ),
                  )}
                </View>
              ) : (
                <NumberEntry
                  value={input}
                  onChange={setInput}
                  onSubmit={() => {
                    if (validCountInput(input)) answer(Number(input));
                  }}
                  disabled={false}
                />
              )}
              <Body style={{ fontSize: 13 }}>
                Submit your estimate before the correction is revealed. Your
                first answer is the one recorded.
              </Body>
            </Panel>
          )}

          {latestAnswer && (
            <Panel
              style={{
                borderColor:
                  latestAnswer.absoluteError === 0 ? colors.green : colors.gold,
              }}
            >
              <Text
                accessibilityRole="header"
                accessibilityLiveRegion="polite"
                style={[
                  s.feedbackTitle,
                  {
                    color:
                      latestAnswer.absoluteError === 0
                        ? colors.green
                        : colors.gold,
                  },
                ]}
              >
                {latestAnswer.absoluteError === 0
                  ? "That’s right."
                  : "A useful checkpoint."}
              </Text>
              <View style={s.wrap}>
                <Chip
                  label={`Your answer ${latestAnswer.kind === "deck-estimate" ? latestAnswer.submitted : signed(latestAnswer.submitted)}`}
                />
                <Chip
                  label={`Correct ${latestAnswer.kind === "deck-estimate" ? latestAnswer.expected : signed(latestAnswer.expected)}`}
                  selected
                />
              </View>
              <Body>{countExplanation(latestAnswer)}</Body>
              {latestAnswer.cards.length > 0 && (
                <>
                  <Button
                    label={
                      showWalkthrough
                        ? "Hide card walkthrough"
                        : "Review each exposed card"
                    }
                    variant="secondary"
                    onPress={() => setShowWalkthrough((previous) => !previous)}
                  />
                  {showWalkthrough && <Walkthrough answer={latestAnswer} />}
                </>
              )}
              <Button
                label={
                  state.answers.length >= state.totalExercises
                    ? "See session results"
                    : "Next checkpoint"
                }
                onPress={() =>
                  state.answers.length >= state.totalExercises
                    ? finish()
                    : apply(nextCountingExercise)
                }
              />
            </Panel>
          )}
        </>
      )}
      <Text style={s.footer}>
        {state.mode === "running" || state.mode === "countdown"
          ? "One finite, shuffled deck. Only exposed cards change your count."
          : "A focused drill. Small, consistent practice builds fluency."}
      </Text>
    </Page>
  );
}

const s = StyleSheet.create({
  title: {
    color: colors.text,
    fontSize: 36,
    lineHeight: 43,
    fontWeight: "600",
    letterSpacing: -1,
  },
  eyebrow: {
    color: colors.green,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 2,
  },
  between: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  modeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  modeCard: {
    flexGrow: 1,
    flexBasis: 280,
    borderRadius: 17,
    padding: 20,
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  modeSelected: { borderColor: colors.green, backgroundColor: "#163A34" },
  modeTitle: { color: colors.text, fontSize: 19, fontWeight: "600" },
  modeSubtitle: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  modeDetail: { color: colors.green, fontSize: 12, lineHeight: 19 },
  label: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    lineHeight: 17,
  },
  small: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  table: {
    alignItems: "center",
    backgroundColor: "#112E2A",
    gap: 20,
    paddingVertical: 27,
  },
  dealtCards: {
    flexDirection: "row",
    gap: 9,
    flexWrap: "wrap",
    justifyContent: "center",
    alignItems: "center",
    minHeight: 119,
  },
  assistance: {
    alignItems: "center",
    gap: 8,
    padding: 13,
    borderRadius: 12,
    backgroundColor: "#1A3B33",
  },
  assistanceText: {
    color: colors.green,
    fontSize: 12,
    lineHeight: 20,
    textAlign: "center",
  },
  assistanceCount: { color: colors.text, fontWeight: "700", fontSize: 19 },
  progressTrack: {
    height: 5,
    backgroundColor: colors.surface2,
    borderRadius: 5,
    overflow: "hidden",
  },
  progressFill: { height: 5, backgroundColor: colors.green, borderRadius: 5 },
  numberInput: {
    color: colors.text,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    fontSize: 27,
    padding: 15,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
  keyRow: { flexDirection: "row", gap: 10 },
  key: {
    flex: 1,
    minHeight: 53,
    borderRadius: 11,
    backgroundColor: colors.surface2,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  keyText: { color: colors.text, fontSize: 22, fontWeight: "500" },
  contextRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 24,
    flexWrap: "wrap",
    justifyContent: "center",
  },
  contextItem: { alignItems: "center", gap: 7 },
  bigCount: {
    color: colors.text,
    fontSize: 43,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  divide: { color: colors.gold, fontSize: 33 },
  feedbackTitle: { fontSize: 24, fontWeight: "600", letterSpacing: -0.4 },
  walkCard: { alignItems: "center", gap: 6 },
  walkValue: { color: colors.green, fontWeight: "700", fontSize: 15 },
  trayArea: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "flex-end",
    gap: 26,
  },
  tray: {
    width: 108,
    height: 184,
    borderWidth: 2,
    borderColor: "#78968C",
    borderTopWidth: 0,
    borderBottomLeftRadius: 5,
    borderBottomRightRadius: 5,
    justifyContent: "flex-end",
    paddingHorizontal: 5,
    backgroundColor: "#122823",
  },
  trayMark: {
    position: "absolute",
    height: 1,
    right: 0,
    width: 12,
    backgroundColor: "#78968C",
  },
  discards: {
    backgroundColor: "#E4DFD1",
    borderRadius: 3,
    width: 92,
    overflow: "hidden",
  },
  referenceDeck: {
    backgroundColor: "#E4DFD1",
    borderRadius: 3,
    width: 76,
    overflow: "hidden",
  },
  cardEdge: {
    position: "absolute",
    height: 1,
    left: 0,
    right: 0,
    backgroundColor: "#AAA698",
  },
  footer: {
    color: colors.muted,
    fontSize: 12,
    textAlign: "center",
    lineHeight: 19,
  },
});
