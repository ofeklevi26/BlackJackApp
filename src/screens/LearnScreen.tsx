import React, { useMemo, useState } from "react";
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { hiLo, legalActions, makeScenario, recommend } from "../engine";
import { DEVIATION_RULES, STRATEGY_SOURCE } from "../engine/types";
import type { Action, Card, Rank, Rules, Scenario } from "../engine/types";
import { getDueLessons, GLOSSARY, LESSONS } from "../content/lessons";
import type { LessonExercise } from "../content/lessons";
import { CHART_DEALERS, CHART_ROWS } from "../content/chart";
import type { ChartGroup } from "../content/chart";
import {
  Body,
  Button,
  Chip,
  Heading,
  Page,
  Panel,
  PlayingCard,
} from "../ui/components";
import { colors } from "../ui/theme";

type Props = {
  rules: Rules;
  completedLessons: Record<string, number>;
  onComplete: (id: string) => void;
  onPractice: (topic: string, scenario?: Scenario) => void;
};
const labels: Record<Action, string> = {
  hit: "Hit",
  stand: "Stand",
  double: "Double",
  split: "Split",
  surrender: "Surrender",
};
const letters: Record<Action, string> = {
  hit: "H",
  stand: "S",
  double: "D",
  split: "P",
  surrender: "R",
};
const actionColors: Record<Action, string> = {
  hit: colors.green,
  stand: colors.gold,
  double: "#9CBDF2",
  split: "#C7ADF2",
  surrender: colors.red,
};
const signed = (n: number) => (n > 0 ? `+${n}` : String(n).replace("-", "−"));
function Kicker({ children }: { children: React.ReactNode }) {
  return <Text style={s.kicker}>{children}</Text>;
}

function Exercise({
  exercise,
  rules,
  guided,
  onSolved,
}: {
  exercise: LessonExercise;
  rules: Rules;
  guided: boolean;
  onSolved?: () => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(0);
  const scenario = useMemo(
    () =>
      exercise.kind === "strategy"
        ? makeScenario(exercise.ranks, exercise.dealer, {
            trueCount: exercise.trueCount,
          })
        : undefined,
    [exercise],
  );
  const activeRules =
    exercise.kind === "strategy" && exercise.useDeviationRules
      ? DEVIATION_RULES
      : rules;
  const answer =
    scenario && exercise.kind === "strategy"
      ? recommend(scenario, activeRules, exercise.countMode)
      : undefined;
  const cards = useMemo<Card[]>(
    () =>
      exercise.kind === "count"
        ? exercise.ranks.map((rank, index) => ({
            id: `lesson-count-${index}`,
            rank,
            suit: index % 2 ? "♥" : "♠",
          }))
        : [],
    [exercise],
  );
  const count = cards.reduce((total, card) => total + hiLo(card), 0);
  const options =
    exercise.kind === "choice"
      ? exercise.choices
      : exercise.kind === "count"
        ? exercise.choices.map((value) => ({
            id: String(value),
            label: signed(value),
          }))
        : legalActions(scenario!, activeRules).map((action) => ({
            id: action,
            label: labels[action],
          }));
  const correctId =
    exercise.kind === "choice"
      ? exercise.correctId
      : exercise.kind === "count"
        ? String(count)
        : answer!.action;
  const correct = selected === correctId;
  const explanation =
    exercise.kind === "choice"
      ? exercise.explanation
      : exercise.kind === "strategy"
        ? answer!.explanation
        : `Start at 0. These cards contribute ${cards.map((card) => signed(hiLo(card))).join(", ")}. The final running count is ${signed(count)}.`;
  const ready = exercise.kind !== "count" || revealed === cards.length;

  function choose(id: string) {
    if (selected !== null || !ready) return;
    setSelected(id);
    if (id === correctId) onSolved?.();
  }

  return (
    <View style={s.exercise}>
      <Body style={s.prompt}>{exercise.prompt}</Body>
      {scenario && (
        <View style={s.table}>
          <View style={s.hand}>
            <Kicker>Your hand</Kicker>
            <View style={s.row}>
              {scenario.cards.map((card) => (
                <PlayingCard key={card.id} card={card} small />
              ))}
            </View>
          </View>
          <View style={s.hand}>
            <Kicker>Dealer</Kicker>
            <PlayingCard card={scenario.dealer} small />
          </View>
          {exercise.kind === "strategy" && exercise.trueCount !== undefined && (
            <Chip label={`True count ${signed(exercise.trueCount)}`} selected />
          )}
        </View>
      )}
      {exercise.kind === "strategy" && exercise.useDeviationRules && (
        <Body style={s.note}>
          Worked-example rules: dealer stands on soft 17 · surrender off ·
          introductory Hi-Lo deviation.
        </Body>
      )}
      {exercise.kind === "count" && (
        <View style={s.exercise}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.countRow}
          >
            {cards.map((card, i) => (
              <View key={card.id} style={s.hand}>
                <PlayingCard card={card} hidden={i >= revealed} small />
                <Text style={s.tag}>
                  {i < revealed && (guided || selected !== null)
                    ? signed(hiLo(card))
                    : " "}
                </Text>
              </View>
            ))}
          </ScrollView>
          <View style={s.between}>
            <Text style={s.note}>
              {revealed} / {cards.length} cards exposed
            </Text>
            {guided && (
              <Text style={s.tag}>
                Running count{" "}
                {signed(
                  cards
                    .slice(0, revealed)
                    .reduce((n, card) => n + hiLo(card), 0),
                )}
              </Text>
            )}
          </View>
          {!ready && (
            <Button
              label={revealed === 0 ? "Reveal first card" : "Reveal next card"}
              variant="secondary"
              onPress={() =>
                setRevealed((value) => Math.min(value + 1, cards.length))
              }
            />
          )}
          {ready && (
            <Body>
              {guided
                ? "Use the steps above to check your final count."
                : "All cards are exposed. What is the running count?"}
            </Body>
          )}
        </View>
      )}
      {ready && (
        <View style={s.options}>
          {options.map((option) => (
            <Pressable
              key={option.id}
              accessibilityRole="button"
              accessibilityState={{
                selected: selected === option.id,
                disabled: selected !== null,
              }}
              disabled={selected !== null}
              onPress={() => choose(option.id)}
              style={({ pressed }) => [
                s.option,
                selected !== null && option.id === correctId && s.correctOption,
                selected === option.id && !correct && s.wrongOption,
                pressed && { opacity: 0.75 },
              ]}
            >
              <Text
                style={[
                  s.optionText,
                  selected !== null &&
                    option.id === correctId && { color: colors.green },
                ]}
              >
                {selected !== null && option.id === correctId ? "✓ " : ""}
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
      {selected !== null && (
        <View
          accessibilityLiveRegion="polite"
          style={[s.feedback, !correct && s.reviewFeedback]}
        >
          <Text
            style={[
              s.feedbackTitle,
              { color: correct ? colors.green : colors.gold },
            ]}
          >
            {correct
              ? guided
                ? "That’s right"
                : "Knowledge check passed"
              : "Let’s review this one"}
          </Text>
          <Body style={{ color: colors.text }}>{explanation}</Body>
          {answer?.baseline && (
            <Body style={s.note}>
              Basic strategy: {labels[answer.baseline]}. With this count:{" "}
              {labels[answer.action]}.
            </Body>
          )}
          {!correct && (
            <Button
              label="Try again"
              variant="secondary"
              onPress={() => setSelected(null)}
            />
          )}
        </View>
      )}
    </View>
  );
}

function StrategyChart({
  rules,
  onPractice,
}: Pick<Props, "rules" | "onPractice">) {
  const [group, setGroup] = useState<ChartGroup>("hard");
  const [rowIndex, setRowIndex] = useState(7);
  const [dealer, setDealer] = useState<Rank>("6");
  const rows = CHART_ROWS[group];
  const row = rows[Math.min(rowIndex, rows.length - 1)];
  const scenario = useMemo(
    () => makeScenario(row.ranks, dealer),
    [row, dealer],
  );
  const answer = recommend(scenario, rules, false);
  const chart = useMemo(
    () =>
      rows.map((item) =>
        CHART_DEALERS.map((upcard) =>
          recommend(makeScenario(item.ranks, upcard), rules, false),
        ),
      ),
    [rows, rules],
  );
  return (
    <>
      <View style={s.intro}>
        <Kicker>Your pocket reference</Kicker>
        <Heading>Make the chart make sense.</Heading>
        <Body>
          Choose a hand type, then tap a cell to see the hand and the reason
          behind its recommendation.
        </Body>
      </View>
      <Panel>
        <View style={s.row}>
          {(["hard", "soft", "pairs"] as ChartGroup[]).map((item) => (
            <Chip
              key={item}
              label={
                item === "pairs"
                  ? "Pairs"
                  : `${item === "hard" ? "Hard" : "Soft"} hands`
              }
              selected={group === item}
              onPress={() => {
                setGroup(item);
                setRowIndex(0);
              }}
            />
          ))}
        </View>
        <Body style={s.note}>
          Six decks · dealer {rules.hitSoft17 ? "hits" : "stands on"} soft 17 ·
          double after split · late surrender {rules.surrender ? "on" : "off"}
        </Body>
        <Body style={s.note}>
          Dealer upcard → · Swipe the table horizontally on smaller screens.
        </Body>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator
          contentContainerStyle={{ paddingBottom: 10 }}
        >
          <View>
            <View style={s.chartRow}>
              <View style={s.rowLabel}>
                <Text style={s.chartHeader}>Hand</Text>
              </View>
              {CHART_DEALERS.map((upcard) => (
                <View key={upcard} style={s.cell}>
                  <Text style={s.chartHeader}>{upcard}</Text>
                </View>
              ))}
            </View>
            {rows.map((item, index) => (
              <View key={item.label} style={s.chartRow}>
                <View style={s.rowLabel}>
                  <Text
                    style={[
                      s.chartHeader,
                      index === rowIndex && { color: colors.text },
                    ]}
                  >
                    {item.label}
                  </Text>
                </View>
                {CHART_DEALERS.map((upcard, column) => {
                  const action = chart[index][column].action;
                  const selected = index === rowIndex && upcard === dealer;
                  return (
                    <Pressable
                      key={upcard}
                      accessibilityRole="button"
                      accessibilityLabel={`${group} ${item.label} against dealer ${upcard}: ${labels[action]}`}
                      accessibilityState={{ selected }}
                      onPress={() => {
                        setRowIndex(index);
                        setDealer(upcard);
                      }}
                      style={({ pressed }) => [
                        s.cell,
                        s.chartAction,
                        selected && s.chartSelected,
                        pressed && { opacity: 0.7 },
                      ]}
                    >
                      <Text
                        style={[s.chartLetter, { color: actionColors[action] }]}
                      >
                        {letters[action]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>
        </ScrollView>
        <View style={s.row}>
          {(Object.keys(labels) as Action[]).map((action) => (
            <Text
              key={action}
              style={[s.note, { color: actionColors[action] }]}
            >
              {letters[action]} · {labels[action]}
            </Text>
          ))}
        </View>
        <Body style={s.note}>
          Initial two-card decisions. Check the pair chart before hard totals.
          The live trainer handles restrictions after a hit or split.
          Count-based deviations are taught separately.
        </Body>
      </Panel>
      <Panel style={{ borderColor: "#41655D" }}>
        <View style={s.between}>
          <View style={s.hand}>
            <Kicker>Your hand</Kicker>
            <View style={s.row}>
              {scenario.cards.map((card) => (
                <PlayingCard key={card.id} card={card} small />
              ))}
            </View>
          </View>
          <View style={s.hand}>
            <Kicker>Dealer</Kicker>
            <PlayingCard card={scenario.dealer} small />
          </View>
          <View style={s.exercise}>
            <Kicker>Recommended</Kicker>
            <Text
              style={[s.largeAction, { color: actionColors[answer.action] }]}
            >
              {labels[answer.action]}
            </Text>
          </View>
        </View>
        <Body>{answer.explanation}</Body>
        <Button
          label="Practice this situation"
          onPress={() => onPractice(group, scenario)}
        />
        <Pressable
          accessibilityRole="link"
          onPress={() => {
            void Linking.openURL(STRATEGY_SOURCE);
          }}
          style={s.sourceLink}
        >
          <Text style={s.sourceText}>
            Strategy reference · Wizard of Odds ↗
          </Text>
        </Pressable>
      </Panel>
    </>
  );
}

export default function LearnScreen({
  rules,
  completedLessons,
  onComplete,
  onPractice,
}: Props) {
  const [tab, setTab] = useState<"path" | "chart" | "glossary">("path");
  const [lessonId, setLessonId] = useState<string | null>(null);
  const [openTerm, setOpenTerm] = useState<string | null>("Running count");
  const lessonIndex = LESSONS.findIndex((item) => item.id === lessonId);
  const lesson = LESSONS[lessonIndex];
  const completed = LESSONS.filter((item) => completedLessons[item.id]).length;
  const next = LESSONS.find((item) => !completedLessons[item.id]) ?? LESSONS[0];
  const due = getDueLessons(completedLessons);
  return (
    <Page key={`${tab}-${lessonId ?? "overview"}`}>
      <View style={s.row}>
        <Chip
          label="Learning path"
          selected={tab === "path"}
          onPress={() => setTab("path")}
        />
        <Chip
          label="Strategy chart"
          selected={tab === "chart"}
          onPress={() => setTab("chart")}
        />
        <Chip
          label="Glossary"
          selected={tab === "glossary"}
          onPress={() => setTab("glossary")}
        />
      </View>
      {tab === "path" && !lesson && (
        <>
          <View style={s.intro}>
            <Kicker>Small lessons. Lasting instincts.</Kicker>
            <Text accessibilityRole="header" style={s.title}>
              Understand the game. Trust your decisions.
            </Text>
            <Body>
              Ten short lessons take you from your first hand to counting a
              shoe. Learn one idea, try it, then check your understanding.
            </Body>
          </View>
          <Panel style={s.progressPanel}>
            <View style={s.between}>
              <Kicker>Your learning path</Kicker>
              <Text style={s.tag}>
                {completed} / {LESSONS.length} complete
              </Text>
            </View>
            <View
              accessibilityRole="progressbar"
              accessibilityValue={{
                min: 0,
                max: LESSONS.length,
                now: completed,
              }}
              accessibilityLabel="Lessons completed"
              style={s.track}
            >
              <View
                style={[
                  s.fill,
                  { width: `${(completed / LESSONS.length) * 100}%` },
                ]}
              />
            </View>
            <View style={s.between}>
              <View style={s.progressCopy}>
                <Text style={s.nextTitle}>
                  {completed === LESSONS.length
                    ? "Your foundation is in place."
                    : next.title}
                </Text>
                <Body>
                  {completed === LESSONS.length
                    ? "Keep your skills fresh with focused practice."
                    : `${next.minutes} minutes · ${next.description}`}
                </Body>
              </View>
              <Button
                label={
                  completed === LESSONS.length
                    ? "Review lessons"
                    : completed
                      ? "Continue learning"
                      : "Start first lesson"
                }
                onPress={() => setLessonId(next.id)}
              />
            </View>
          </Panel>
          {due.length > 0 && (
            <Panel style={s.reviewPanel}>
              <Kicker>A little spaced practice</Kicker>
              <Heading>Ready for a refresher.</Heading>
              <Body>
                {due.length} {due.length === 1 ? "lesson is" : "lessons are"}{" "}
                due for review. Revisit a completed lesson after seven days to
                strengthen recall.
              </Body>
              <Body style={{ color: colors.text }}>
                {due[0].title} · last completed{" "}
                {new Date(completedLessons[due[0].id]).toLocaleDateString()}
              </Body>
              <Button
                label="Review this lesson"
                onPress={() => setLessonId(due[0].id)}
              />
              <Body style={s.note}>
                Passing its knowledge check again resets the seven-day review
                reminder.
              </Body>
            </Panel>
          )}
          <View style={s.lessonList}>
            {LESSONS.map((item, index) => {
              const done = !!completedLessons[item.id];
              const needsReview = due.some(
                (reviewLesson) => reviewLesson.id === item.id,
              );
              return (
                <Pressable
                  key={item.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Lesson ${index + 1}: ${item.title}, ${item.minutes} minutes${done ? ", completed" : ""}`}
                  onPress={() => setLessonId(item.id)}
                  style={({ pressed }) => [
                    s.lessonRow,
                    pressed && { backgroundColor: colors.surface2 },
                  ]}
                >
                  <View
                    style={[
                      s.numberBox,
                      done && { backgroundColor: "#1C3E36" },
                    ]}
                  >
                    <Text style={[s.number, done && { color: colors.green }]}>
                      {done ? "✓" : String(index + 1).padStart(2, "0")}
                    </Text>
                  </View>
                  <View style={s.lessonCopy}>
                    <Text style={s.lessonTitle}>{item.title}</Text>
                    <Text style={s.lessonDescription}>{item.description}</Text>
                    <Text
                      style={[s.meta, needsReview && { color: colors.gold }]}
                    >
                      {item.minutes} min ·{" "}
                      {needsReview
                        ? "Review due · last practiced 7+ days ago"
                        : done
                          ? "Completed · open to review"
                          : "Example + practice + knowledge check"}
                    </Text>
                  </View>
                  <Text style={s.arrow}>›</Text>
                </Pressable>
              );
            })}
          </View>
          <Body style={s.note}>
            No lesson is locked. Start with the basics or jump to the skill you
            want to strengthen. Lesson checks are practice and stay separate
            from your session statistics.
          </Body>
        </>
      )}
      {tab === "path" && lesson && (
        <>
          <View style={s.between}>
            <Button
              label="‹ All lessons"
              variant="ghost"
              onPress={() => setLessonId(null)}
            />
            <Chip label={`Lesson ${lessonIndex + 1} of ${LESSONS.length}`} />
          </View>
          <View style={s.intro}>
            <Kicker>
              {lesson.minutes} minutes ·{" "}
              {completedLessons[lesson.id]
                ? "Completed"
                : "Build your foundation"}
            </Kicker>
            <Text accessibilityRole="header" style={s.title}>
              {lesson.title}
            </Text>
            <Body>{lesson.description}</Body>
          </View>
          <Panel>
            <Kicker>The key idea</Kicker>
            <Text style={s.keyIdea}>{lesson.keyIdea}</Text>
            {lesson.paragraphs.map((paragraph) => (
              <Body key={paragraph}>{paragraph}</Body>
            ))}
            <View style={s.example}>
              <Text style={s.exampleTitle}>{lesson.example.title}</Text>
              <Body>{lesson.example.text}</Body>
            </View>
          </Panel>
          <Panel>
            <Kicker>01 · Guided practice</Kicker>
            <Heading>Try it with a little help.</Heading>
            <Exercise
              key={`${lesson.id}-guided-${rules.hitSoft17}-${rules.surrender}`}
              exercise={lesson.guided}
              rules={rules}
              guided
            />
          </Panel>
          <Panel>
            <Kicker>02 · Knowledge check</Kicker>
            <Heading>Your turn.</Heading>
            <Exercise
              key={`${lesson.id}-quiz-${rules.hitSoft17}-${rules.surrender}`}
              exercise={lesson.quiz}
              rules={rules}
              guided={false}
              onSolved={() => onComplete(lesson.id)}
            />
          </Panel>
          {!!completedLessons[lesson.id] && (
            <Panel style={s.completion}>
              <Kicker>✓ Lesson complete</Kicker>
              <Heading>One more skill in your toolkit.</Heading>
              <Body>
                Repetition turns understanding into an instinct. Practice this
                topic or keep going through the path.
              </Body>
              <View style={s.row}>
                <Button
                  label="Practice this skill"
                  onPress={() => onPractice(lesson.topic)}
                />
                {LESSONS[lessonIndex + 1] ? (
                  <Button
                    label="Next lesson →"
                    variant="secondary"
                    onPress={() => setLessonId(LESSONS[lessonIndex + 1].id)}
                  />
                ) : (
                  <Button
                    label="Back to learning path"
                    variant="secondary"
                    onPress={() => setLessonId(null)}
                  />
                )}
              </View>
            </Panel>
          )}
        </>
      )}
      {tab === "chart" && (
        <StrategyChart rules={rules} onPractice={onPractice} />
      )}
      {tab === "glossary" && (
        <>
          <View style={s.intro}>
            <Kicker>Clear language. Clear thinking.</Kicker>
            <Heading>A little vocabulary goes a long way.</Heading>
            <Body>
              Tap a term for a quick explanation. You will meet each of these
              ideas in the lessons and the trainer.
            </Body>
          </View>
          <View style={s.glossary}>
            {GLOSSARY.map((item) => {
              const open = item.term === openTerm;
              return (
                <View key={item.term} style={s.term}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ expanded: open }}
                    accessibilityLabel={item.term}
                    onPress={() => setOpenTerm(open ? null : item.term)}
                    style={s.termTrigger}
                  >
                    <Text style={s.termTitle}>{item.term}</Text>
                    <Text style={s.termToggle}>{open ? "−" : "+"}</Text>
                  </Pressable>
                  {open && <Body style={s.definition}>{item.definition}</Body>}
                </View>
              );
            })}
          </View>
        </>
      )}
    </Page>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 10,
  },
  between: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },
  kicker: {
    color: colors.green,
    fontWeight: "700",
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    flexShrink: 1,
    maxWidth: "100%",
  },
  intro: { gap: 13, maxWidth: 720 },
  title: {
    maxWidth: "100%",
    flexShrink: 1,
    color: colors.text,
    fontSize: 35,
    fontWeight: "600",
    letterSpacing: -1.1,
    lineHeight: 43,
  },
  reviewPanel: { backgroundColor: "#292D25", borderColor: "#626448" },
  progressPanel: { backgroundColor: "#142C2C", borderColor: "#335B50" },
  progressCopy: { flex: 1, minWidth: 200, gap: 6 },
  nextTitle: {
    maxWidth: "100%",
    flexShrink: 1,
    color: colors.text,
    fontSize: 21,
    fontWeight: "600",
  },
  track: {
    backgroundColor: "#29423E",
    height: 5,
    borderRadius: 8,
    overflow: "hidden",
  },
  fill: { height: 5, borderRadius: 8, backgroundColor: colors.green },
  lessonList: { gap: 9 },
  lessonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 15,
    padding: 17,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  numberBox: {
    width: 44,
    height: 44,
    borderRadius: 13,
    backgroundColor: colors.surface2,
    alignItems: "center",
    justifyContent: "center",
  },
  number: {
    color: colors.muted,
    fontSize: 15,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  lessonCopy: { flex: 1, gap: 5 },
  lessonTitle: {
    maxWidth: "100%",
    flexShrink: 1,
    color: colors.text,
    fontSize: 16,
    fontWeight: "600",
  },
  lessonDescription: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  meta: {
    maxWidth: "100%",
    flexShrink: 1,
    color: colors.green,
    fontSize: 11,
    lineHeight: 17,
  },
  arrow: { color: colors.muted, fontSize: 27 },
  keyIdea: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "500",
    lineHeight: 31,
  },
  example: {
    borderLeftWidth: 3,
    borderLeftColor: colors.gold,
    paddingLeft: 16,
    paddingVertical: 5,
    gap: 8,
  },
  exampleTitle: { color: colors.gold, fontSize: 14, fontWeight: "600" },
  exercise: { gap: 17 },
  prompt: { color: colors.text, fontSize: 16, lineHeight: 25 },
  table: {
    backgroundColor: "#102B2A",
    borderRadius: 15,
    padding: 19,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-around",
    gap: 20,
  },
  hand: { alignItems: "center", gap: 10 },
  options: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  option: {
    flexGrow: 1,
    flexBasis: 110,
    minHeight: 49,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
    paddingVertical: 14,
    paddingHorizontal: 17,
    justifyContent: "center",
    alignItems: "center",
  },
  correctOption: { backgroundColor: "#1C3E36", borderColor: "#4A9B7F" },
  wrongOption: { backgroundColor: "#392E2B", borderColor: "#976B58" },
  optionText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
    lineHeight: 21,
  },
  feedback: {
    backgroundColor: "#15372F",
    borderWidth: 1,
    borderColor: "#345A4D",
    borderRadius: 13,
    padding: 17,
    gap: 9,
  },
  reviewFeedback: { backgroundColor: "#302E24", borderColor: "#635C3E" },
  feedbackTitle: { fontSize: 16, fontWeight: "600" },
  completion: { borderColor: "#4A9B7F", backgroundColor: "#142E29" },
  countRow: { gap: 10, paddingBottom: 5 },
  tag: {
    maxWidth: "100%",
    flexShrink: 1,
    color: colors.green,
    minHeight: 20,
    fontSize: 14,
    fontWeight: "600",
  },
  note: { fontSize: 12, color: colors.muted, lineHeight: 19 },
  chartRow: { flexDirection: "row", gap: 3, marginBottom: 3 },
  cell: {
    width: 46,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 7,
  },
  rowLabel: { width: 59, height: 44, justifyContent: "center", paddingLeft: 5 },
  chartHeader: { color: colors.muted, fontWeight: "600", fontSize: 12 },
  chartAction: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: "transparent",
  },
  chartSelected: { borderColor: colors.text, backgroundColor: "#34504E" },
  chartLetter: { fontWeight: "700", fontSize: 14 },
  largeAction: { fontSize: 28, fontWeight: "600" },
  sourceLink: { minHeight: 44, justifyContent: "center" },
  sourceText: {
    fontSize: 12,
    color: colors.muted,
    textDecorationLine: "underline",
  },
  glossary: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 17,
    backgroundColor: colors.surface,
    overflow: "hidden",
  },
  term: { borderBottomWidth: 1, borderBottomColor: colors.border },
  termTrigger: {
    minHeight: 66,
    paddingHorizontal: 21,
    paddingVertical: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 15,
  },
  termTitle: {
    maxWidth: "100%",
    flexShrink: 1,
    color: colors.text,
    fontSize: 16,
    fontWeight: "500",
    flex: 1,
  },
  termToggle: { color: colors.green, fontSize: 23 },
  definition: { paddingHorizontal: 21, paddingBottom: 22, maxWidth: 760 },
});
