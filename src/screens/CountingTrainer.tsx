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
import {
  Body,
  Button,
  Chip,
  DetailSheet,
  Heading,
  Page,
  Panel,
  PlayingCard,
} from "../ui";
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
  const deckHeight = 18;
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
        <View style={{ height: 118, justifyContent: "flex-end" }}>
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
    ["1", "2", "3", "⌫"],
    ["4", "5", "6", "±"],
    ["7", "8", "9", "0"],
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
    <View style={{ gap: 6, maxWidth: 440, width: "100%", alignSelf: "center" }}>
      <View style={s.keyRow}>
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
          showSoftInputOnFocus={false}
        />
        <Button
          label="Check count"
          onPress={onSubmit}
          disabled={disabled || !validCountInput(value)}
          style={s.checkButton}
        />
      </View>
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
  const [detail, setDetail] = useState<"help" | "feedback" | null>(null);
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
    setDetail(null);
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

  function openHelp() {
    if (state.phase !== "setup" && !state.paused)
      apply((previous) => ({ ...previous, paused: true }));
    setDetail("help");
  }

  const helpSheet = (
    <DetailSheet
      visible={detail === "help"}
      title={mode.title}
      onClose={() => setDetail(null)}
      reducedMotion={settings.reducedMotion}
    >
      <Body style={{ color: colors.text }}>
        {mode.subtitle}. {mode.detail}.
      </Body>
      <Body>
        Choose a drill, follow its cards or supplied context, then submit your
        answer. Only your first answer is recorded. Review the explanation
        afterward or move straight to the next checkpoint.
      </Body>
      {state.phase !== "setup" && (
        <Body>
          The session is paused while you read. Close this guide and tap Resume
          when you are ready.
        </Body>
      )}
      {state.phase === "setup" && (
        <>
          <Heading>Choose your level of help</Heading>
          <Body>
            Guided practice shows the Hi-Lo key and, for running-count drills,
            the running total. Independent practice keeps those aids hidden.
            Guided and independent results stay separate.
          </Body>
          {cardMode && (
            <Body>
              Tap to reveal cards yourself, or choose an automatic pace.
              Automatic dealing stops at every answer checkpoint. Pause freezes
              both dealing and the response clock.
            </Body>
          )}
          {state.mode === "decks" && (
            <Body>
              Compare the discard stack with the one-deck reference, then
              subtract the discarded decks from six. Estimate to the nearest
              half deck. This simplified tray trains the idea; real card
              thickness varies.
            </Body>
          )}
          {state.mode === "true-count" && (
            <Body>
              Divide the supplied running count by decks remaining. Round down
              toward negative infinity: −1 ÷ 2 = −0.5, which becomes −1.
            </Body>
          )}
        </>
      )}
      {(state.mode === "running" || state.mode === "countdown") && (
        <Body>
          The running count continues across checkpoints in one finite shuffled
          deck. Only exposed cards change it. In a long checkpoint the table
          shows the latest four cards; review every exposed card after
          answering.
        </Body>
      )}
      {(state.mode === "running" ||
        state.mode === "countdown" ||
        state.mode === "true-count") && (
        <Body>
          Use the keypad to enter a whole number. ± changes its sign; ⌫ removes
          the last digit. Check count submits the answer.
        </Body>
      )}
    </DetailSheet>
  );

  if (state.phase === "setup")
    return (
      <>
        <Page
          key="counting-setup"
          compact
          footer={
            <Button
              label={`Start ${mode.title.toLowerCase()}`}
              onPress={() =>
                apply((previous) => startCountingSession(previous))
              }
            />
          }
        >
          <View style={s.compactHeader}>
            <Text accessibilityRole="header" style={s.compactTitle}>
              Counting drills
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="How this counting drill works"
              onPress={openHelp}
              style={s.iconButton}
            >
              <Text style={s.iconText}>?</Text>
            </Pressable>
            <Button
              label="Back"
              variant="ghost"
              onPress={onExit}
              style={s.smallButton}
            />
          </View>
          <View style={s.modeGrid}>
            {COUNTING_MODES.map((item) => (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                accessibilityLabel={`${item.title}. ${item.subtitle}. ${item.detail}`}
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
                <Text style={s.modeDetail}>
                  {item.id === "recognition"
                    ? "20 cards"
                    : item.id === "pairs"
                      ? "20 pairs"
                      : item.id === "countdown"
                        ? "One full deck"
                        : "10 checkpoints"}
                </Text>
              </Pressable>
            ))}
          </View>
          <View style={s.setupOptions}>
            <View style={s.optionRow}>
              <Text style={s.optionLabel}>Help</Text>
              <Chip
                label="Guided"
                selected={state.assistance}
                onPress={() =>
                  setState((previous) => ({ ...previous, assistance: true }))
                }
              />
              <Chip
                label="Independent"
                selected={!state.assistance}
                onPress={() =>
                  setState((previous) => ({ ...previous, assistance: false }))
                }
              />
            </View>
            {cardMode && (
              <View style={s.optionRow}>
                <Text style={s.optionLabel}>Deal</Text>
                <Chip
                  label="Tap"
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
            )}
            {cardMode && state.automatic && (
              <View style={s.optionRow}>
                <Text style={s.optionLabel}>Pace</Text>
                {[
                  { label: "2s", value: 2000 },
                  { label: "1.2s", value: 1200 },
                  { label: "0.6s", value: 600 },
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
            )}
          </View>
          <Text style={s.small}>
            {mode.subtitle}.{" "}
            {state.assistance
              ? "Help is visible; results are marked guided."
              : "Answers stay hidden until you submit."}
          </Text>
        </Page>
        {helpSheet}
      </>
    );

  const question =
    state.mode === "recognition"
      ? "What is this card’s value?"
      : state.mode === "pairs"
        ? "What is this pair’s total?"
        : state.mode === "decks"
          ? "How many decks remain?"
          : state.mode === "true-count"
            ? "What is the true count?"
            : "What is your running count?";
  const footer = state.paused ? (
    <View style={s.dock}>
      <Button
        label="Resume training"
        onPress={() => apply((previous) => ({ ...previous, paused: false }))}
      />
      {state.answers.length > 0 && (
        <Button
          label={
            state.answers.length >= state.totalExercises
              ? "See session results"
              : "Finish this shorter session"
          }
          variant="ghost"
          onPress={finish}
          style={s.smallButton}
        />
      )}
    </View>
  ) : latestAnswer ? (
    <View style={s.dock}>
      <View accessibilityLiveRegion="polite" style={s.feedbackMini}>
        <Text
          style={[
            s.compactFeedback,
            {
              color:
                latestAnswer.absoluteError === 0 ? colors.green : colors.gold,
            },
          ]}
        >
          {latestAnswer.absoluteError === 0 ? "✓ Correct" : "Let’s review"}
        </Text>
        <Text style={s.small}>
          You{" "}
          {latestAnswer.kind === "deck-estimate"
            ? latestAnswer.submitted
            : signed(latestAnswer.submitted)}{" "}
          · Answer{" "}
          {latestAnswer.kind === "deck-estimate"
            ? latestAnswer.expected
            : signed(latestAnswer.expected)}
        </Text>
      </View>
      <View style={s.dockRow}>
        <Button
          label={
            state.answers.length >= state.totalExercises
              ? "See results"
              : "Next checkpoint →"
          }
          onPress={() =>
            state.answers.length >= state.totalExercises
              ? finish()
              : apply(nextCountingExercise)
          }
          style={s.primaryDockButton}
        />
        <Button
          label="Explain"
          variant="secondary"
          onPress={() => setDetail("feedback")}
          style={s.smallButton}
        />
      </View>
    </View>
  ) : state.phase === "reveal" ? (
    <Button
      label={state.automatic ? "Deal next now" : "Deal next card"}
      onPress={() => apply(revealNextCountingCard)}
    />
  ) : state.phase === "answer" && exercise ? (
    <View style={s.dock}>
      {state.mode === "recognition" || state.mode === "pairs" ? (
        <View style={s.dockRow}>
          {(state.mode === "pairs" ? [-2, -1, 0, 1, 2] : [-1, 0, 1]).map(
            (value) => (
              <Button
                key={value}
                label={signed(value)}
                onPress={() => answer(value)}
                style={s.answerChoice}
              />
            ),
          )}
        </View>
      ) : state.mode === "decks" ? (
        <View style={s.deckChoices}>
          {Array.from({ length: 13 }, (_, index) => index / 2).map((value) => (
            <Button
              key={value}
              label={`${value}`}
              onPress={() => answer(value)}
              variant="secondary"
              style={s.deckChoice}
            />
          ))}
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
    </View>
  ) : undefined;

  return (
    <>
      <Page
        key={`counting-${state.id}-${exercise?.id ?? "session"}`}
        compact
        footer={footer}
      >
        <View style={s.headerBlock}>
          <View style={s.compactHeader}>
            <View style={s.headerCopy}>
              <Text
                accessibilityRole="header"
                style={[s.compactTitle, { flex: 0 }]}
              >
                {mode.title}
              </Text>
              <Text style={s.small}>
                {Math.min(
                  state.answers.length + (latestAnswer ? 0 : 1),
                  state.totalExercises,
                )}{" "}
                / {state.totalExercises} ·{" "}
                {state.assistance ? "Guided" : "Independent"}
              </Text>
            </View>
            <Button
              label={state.paused ? "Resume" : "Pause"}
              variant="ghost"
              onPress={() =>
                apply((previous) => ({ ...previous, paused: !previous.paused }))
              }
              style={s.smallButton}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Pause and open counting help"
              onPress={openHelp}
              style={s.iconButton}
            >
              <Text style={s.iconText}>?</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Save counting session and exit"
              onPress={saveAndExit}
              style={s.iconButton}
            >
              <Text style={s.iconText}>×</Text>
            </Pressable>
          </View>
          <View
            accessibilityRole="progressbar"
            accessibilityLabel="Counting checkpoints completed"
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
        </View>
        {state.paused ? (
          <Panel style={s.compactPanel}>
            <Heading>Your place is saved.</Heading>
            <Body>
              The cards, count, and response clock are paused. Resume when you
              are ready.
            </Body>
          </Panel>
        ) : (
          exercise && (
            <Panel style={s.table}>
              <Text accessibilityRole="header" style={s.question}>
                {latestAnswer
                  ? "Checkpoint complete"
                  : state.phase === "reveal"
                    ? "Keep the count as cards appear"
                    : question}
              </Text>
              {cardMode ? (
                <>
                  <View style={s.dealtCards}>
                    {exercise.cards.slice(-4).map((card, index) => (
                      <PlayingCard
                        key={`${card.id}-${index}`}
                        card={card}
                        small
                      />
                    ))}
                    {state.phase === "reveal" && <PlayingCard hidden small />}
                  </View>
                  <Text accessibilityLiveRegion="polite" style={s.small}>
                    {state.mode === "countdown"
                      ? `${state.index} / 52 cards exposed`
                      : `${exercise.cards.length} / ${exercise.targetIndex - exercise.startIndex} cards exposed`}
                    {exercise.cards.length > 4 ? " · latest 4 shown" : ""}
                    {state.phase === "reveal" && state.automatic
                      ? ` · ${(state.speedMs / 1000).toFixed(1)}s/card`
                      : ""}
                  </Text>
                  {state.assistance && (
                    <View style={s.assistance}>
                      <Text style={s.assistanceText}>
                        2–6: +1 · 7–9: 0 · 10–A: −1
                      </Text>
                      {(state.mode === "running" ||
                        state.mode === "countdown") && (
                        <Text style={s.assistanceCount}>
                          Running count {signed(state.runningCount)}
                        </Text>
                      )}
                    </View>
                  )}
                </>
              ) : state.mode === "decks" ? (
                <DiscardTray discardedCards={exercise.discardedCards!} />
              ) : (
                <>
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
                  {state.assistance && (
                    <Text style={s.small}>
                      Divide, then round down toward −∞.
                    </Text>
                  )}
                </>
              )}
              {state.mode === "decks" && (
                <Text style={s.small}>
                  Six decks total · estimate to the nearest ½ deck
                </Text>
              )}
            </Panel>
          )
        )}
      </Page>
      {helpSheet}
      <DetailSheet
        visible={detail === "feedback"}
        title="Understand this checkpoint"
        onClose={() => setDetail(null)}
        reducedMotion={settings.reducedMotion}
      >
        {latestAnswer && (
          <>
            <Heading>
              {latestAnswer.absoluteError === 0
                ? "That’s right."
                : "A useful checkpoint."}
            </Heading>
            <Body>
              Your answer: {latestAnswer.submitted}. Correct answer:{" "}
              {latestAnswer.expected}.
            </Body>
            <Body>{countExplanation(latestAnswer)}</Body>
            {latestAnswer.cards.length > 0 && (
              <Walkthrough answer={latestAnswer} />
            )}
            <Body>
              Your first answer is the one recorded.
              {(state.mode === "running" || state.mode === "countdown") &&
                " The next checkpoint starts from the corrected running count."}
            </Body>
          </>
        )}
      </DetailSheet>
    </>
  );
}
const s = StyleSheet.create({
  compactHeader: { flexDirection: "row", alignItems: "center", gap: 4 },
  headerBlock: { gap: 7 },
  headerCopy: { flex: 1, minWidth: 0, gap: 3 },
  compactTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "600",
    flex: 1,
    minWidth: 0,
    lineHeight: 23,
  },
  iconButton: {
    width: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  iconText: { color: colors.muted, fontSize: 23, fontWeight: "500" },
  smallButton: { minHeight: 44, paddingHorizontal: 10, paddingVertical: 10 },
  compactPanel: { padding: 15, gap: 10 },
  setupOptions: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 10,
    gap: 7,
    backgroundColor: colors.surface,
  },
  optionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 7,
  },
  optionLabel: { color: colors.muted, fontSize: 12, width: 33 },
  dock: { gap: 8 },
  dockRow: { flexDirection: "row", alignItems: "stretch", gap: 6 },
  primaryDockButton: {
    flex: 1,
    minWidth: 0,
    minHeight: 46,
    paddingHorizontal: 10,
  },
  answerChoice: { flex: 1, minWidth: 0, minHeight: 46, paddingHorizontal: 4 },
  deckChoices: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  deckChoice: {
    flexBasis: "18%",
    flexGrow: 1,
    minWidth: 44,
    minHeight: 44,
    paddingHorizontal: 4,
    paddingVertical: 8,
  },
  feedbackMini: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
  },
  compactFeedback: { fontSize: 16, fontWeight: "600", flexShrink: 1 },
  question: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "500",
    lineHeight: 22,
    textAlign: "center",
    flexShrink: 1,
  },
  checkButton: {
    minWidth: 114,
    minHeight: 44,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  modeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  modeCard: {
    flexGrow: 1,
    flexBasis: "47%",
    minHeight: 62,
    borderRadius: 12,
    padding: 10,
    gap: 4,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  modeSelected: { borderColor: colors.green, backgroundColor: "#163A34" },
  modeTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 19,
  },
  modeDetail: { color: colors.green, fontSize: 11, lineHeight: 15 },
  label: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    lineHeight: 17,
  },
  small: { color: colors.muted, fontSize: 12, lineHeight: 18, flexShrink: 1 },
  table: {
    alignItems: "center",
    backgroundColor: "#112E2A",
    gap: 8,
    padding: 12,
  },
  dealtCards: {
    flexDirection: "row",
    gap: 6,
    flexWrap: "wrap",
    justifyContent: "center",
    alignItems: "center",
    minHeight: 80,
  },
  assistance: {
    alignItems: "center",
    gap: 2,
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: 9,
    backgroundColor: "#1A3B33",
  },
  assistanceText: {
    color: colors.green,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
  },
  assistanceCount: {
    color: colors.text,
    fontWeight: "600",
    fontSize: 14,
    lineHeight: 19,
  },
  progressTrack: {
    height: 3,
    backgroundColor: colors.surface2,
    borderRadius: 5,
    overflow: "hidden",
  },
  progressFill: { height: 3, backgroundColor: colors.green, borderRadius: 5 },
  numberInput: {
    color: colors.text,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    fontSize: 22,
    paddingVertical: 6,
    paddingHorizontal: 10,
    minHeight: 44,
    flex: 1,
    minWidth: 0,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
  keyRow: { flexDirection: "row", gap: 6 },
  key: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: colors.surface2,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  keyText: { color: colors.text, fontSize: 21, fontWeight: "500" },
  contextRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
    flexWrap: "wrap",
    justifyContent: "center",
  },
  contextItem: { alignItems: "center", gap: 4 },
  bigCount: {
    color: colors.text,
    fontSize: 32,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  divide: { color: colors.gold, fontSize: 26 },
  walkCard: { alignItems: "center", gap: 6 },
  walkValue: { color: colors.green, fontWeight: "700", fontSize: 15 },
  trayArea: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "flex-end",
    gap: 22,
  },
  tray: {
    width: 108,
    height: 118,
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
});
