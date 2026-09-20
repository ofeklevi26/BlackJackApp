import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { handValue } from "../engine";
import { countExplanation, signed } from "../counting";
import {
  assistanceProfile,
  percent,
  summarize,
  summarizeCounts,
} from "../state/analytics";
import { bookmarkKey, setBookmark } from "../content/progress";
import { useStore } from "../state/store";
import type { Decision, Session } from "../state/types";
import {
  Body,
  Button,
  Chip,
  Heading,
  Page,
  Panel,
  PlayingCard,
  Stat,
} from "../ui/components";
import { colors } from "../ui/theme";

type Props = {
  session: Session;
  onReplay: (decision: Decision) => void;
  onPractice: (topic: string) => void;
  onClose?: () => void;
};
const titleCase = (text: string) =>
  text.replace(/(^|[- ])\w/g, (value) => value.replace("-", " ").toUpperCase());
const accuracy = (value: { count: number; accuracy: number }) =>
  value.count ? percent(value.accuracy) : "—";
const time = (ms: number) =>
  ms < 60000
    ? `${Math.max(0, Math.round(ms / 1000))} sec`
    : `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;

function handLabel(decision: Decision) {
  const value = handValue(decision.scenario.cards);
  return `${decision.category === "pairs" ? decision.scenario.cards.map((card) => card.rank).join(" + ") : `${value.soft ? "Soft" : "Hard"} ${value.total}`} vs ${decision.scenario.dealer.rank}`;
}

function DecisionDetail({
  decision,
  session,
  onReplay,
}: {
  decision: Decision;
  session: Session;
  onReplay: (decision: Decision) => void;
}) {
  const { data, update } = useStore();
  const bookmark = {
    scenario: decision.scenario,
    rules: session.rules,
    countMode: session.topic === "deviations",
  };
  const saved = data.bookmarks.some(
    (item) => bookmarkKey(item) === bookmarkKey(bookmark),
  );
  function toggleSaved() {
    update((previous) => ({
      ...previous,
      bookmarks: setBookmark(previous.bookmarks, bookmark, !saved),
    }));
  }
  return (
    <View style={s.detail}>
      <View style={s.table}>
        <View style={s.hand}>
          <Text style={s.label}>YOUR ORIGINAL HAND</Text>
          <View style={s.row}>
            {decision.scenario.cards.map((card) => (
              <PlayingCard key={card.id} card={card} small />
            ))}
          </View>
        </View>
        <View style={s.hand}>
          <Text style={s.label}>DEALER UPCARD</Text>
          <PlayingCard card={decision.scenario.dealer} small />
        </View>
      </View>
      <View style={s.row}>
        <Chip label={`You chose ${titleCase(decision.chosen)}`} />
        <Chip
          label={`Recommended: ${titleCase(decision.recommended)}`}
          selected
        />
        {decision.scenario.trueCount !== undefined && (
          <Chip label={`True count ${signed(decision.scenario.trueCount)}`} />
        )}
      </View>
      <Body style={{ color: colors.text }}>{decision.explanation}</Body>
      <Body style={s.note}>
        {(decision.responseMs / 1000).toFixed(1)} seconds ·{" "}
        {decision.assisted ? "Assisted" : "Unassisted"} ·{" "}
        {decision.replay
          ? "Review attempt, excluded from first-attempt accuracy"
          : "First attempt"}
        {decision.scenario.fromSplit ? " · Split hand" : ""}
      </Body>
      <View style={s.row}>
        <Button
          label="Replay this decision"
          onPress={() => onReplay(decision)}
        />
        <Button
          label={saved ? "✓ Saved · remove" : "Save difficult hand"}
          variant="secondary"
          onPress={toggleSaved}
        />
      </View>
      <Body style={s.note}>
        Replay starts from this decision’s original cards and rules. It is
        review practice and does not change your first-attempt result.
      </Body>
    </View>
  );
}

function CheckpointStats({ session }: { session: Session }) {
  const points = session.checkpoints ?? [];
  if (!points.length) return null;
  const metrics = [
    {
      label: "Running count",
      expected: "runningExpected",
      submitted: "runningSubmitted",
      unit: "count points",
    },
    {
      label: "Deck estimate",
      expected: "decksExpected",
      submitted: "decksSubmitted",
      unit: "decks",
    },
    {
      label: "True count",
      expected: "trueExpected",
      submitted: "trueSubmitted",
      unit: "count points",
    },
  ] as const;
  return (
    <Panel>
      <Text style={s.eyebrow}>SHOE CHECKPOINTS</Text>
      <Heading>Keep counting and decisions separate.</Heading>
      <Body>
        {points.length} checkpoints ·{" "}
        {session.assisted ? "Assisted session" : "Unassisted session"}. Count
        error is the distance from the correct value.
      </Body>
      {metrics.map((metric) => {
        const exact = points.filter(
          (point) => point[metric.expected] === point[metric.submitted],
        ).length;
        const error =
          points.reduce(
            (sum, point) =>
              sum + Math.abs(point[metric.expected] - point[metric.submitted]),
            0,
          ) / points.length;
        return (
          <View key={metric.label} style={s.metricRow}>
            <Text style={s.metricLabel}>{metric.label}</Text>
            <Text style={s.metricValue}>
              {percent(exact / points.length)} exact
            </Text>
            <Text style={s.note}>
              {error.toFixed(2)} {metric.unit} average error · n={points.length}
            </Text>
          </View>
        );
      })}
    </Panel>
  );
}

export default function SessionReview({
  session,
  onReplay,
  onPractice,
  onClose,
}: Props) {
  const [filter, setFilter] = useState<"all" | "mistakes">("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [visible, setVisible] = useState(10);
  const stats = summarize(session.decisions);
  const count = session.countResult;
  const countStats = summarizeCounts(count?.answers ?? []);
  const mistakes = session.decisions.filter(
    (decision) => !decision.correct && !decision.replay,
  );
  const grouped = new Map<string, { decision: Decision; frequency: number }>();
  for (const decision of mistakes) {
    const key = `${handLabel(decision)}/${decision.chosen}/${decision.recommended}`;
    const previous = grouped.get(key);
    grouped.set(key, {
      decision: previous?.decision ?? decision,
      frequency: (previous?.frequency ?? 0) + 1,
    });
  }
  const top = [...grouped.values()]
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, 3);
  const listed =
    filter === "mistakes"
      ? session.decisions.filter((decision) => !decision.correct)
      : session.decisions;
  const countAnswers =
    count?.answers.filter(
      (answer) => filter === "all" || answer.absoluteError !== 0,
    ) ?? [];

  return (
    <Page>
      {onClose && (
        <View style={s.row}>
          <Button
            label="‹ Back to progress"
            variant="ghost"
            onPress={onClose}
          />
        </View>
      )}
      <View style={s.intro}>
        <Text style={s.eyebrow}>YOUR SESSION, EXPLAINED</Text>
        <Text accessibilityRole="header" style={s.title}>
          A clearer next step.
        </Text>
        <Body>
          {titleCase(session.topic)} ·{" "}
          {session.kind === "simulator"
            ? "Continuous shoe"
            : session.kind === "counting"
              ? "Counting practice"
              : "Strategy practice"}{" "}
          · {new Date(session.startedAt).toLocaleString()}
        </Body>
      </View>
      <View style={s.row}>
        <Chip
          label={
            session.feedback === "coach"
              ? "Coach feedback"
              : "Challenge feedback"
          }
        />
        <Chip label={titleCase(assistanceProfile(session))} />
        <Chip label={`${time(session.durationMs)} active practice`} />
      </View>

      {count ? (
        <>
          <Panel>
            <View style={s.stats}>
              <Stat
                label="Exact count accuracy"
                value={countStats.count ? percent(countStats.accuracy) : "—"}
                detail={`${count.answers.filter((answer) => answer.absoluteError === 0).length} correct / ${count.answers.length} answers`}
              />
              <Stat
                label="Average absolute error"
                value={
                  count.answers.length
                    ? countStats.meanAbsoluteError.toFixed(2)
                    : "—"
                }
                detail={
                  count.mode === "decks"
                    ? "Decks from the correct estimate"
                    : "Count points from the answer"
                }
              />
              <Stat
                label="Median response"
                value={
                  count.answers.length
                    ? `${(countStats.medianMs / 1000).toFixed(1)}s`
                    : "—"
                }
                detail="Answer time after cards appear"
              />
            </View>
          </Panel>
          <Panel>
            <Heading>Your counting conditions</Heading>
            <Body>
              {count.assisted
                ? "Assistance was used in this session."
                : "No counting assistance was used."}{" "}
              Compare results with sessions in the same mode, at the same pace,
              and with the same assistance setting.
            </Body>
            <View style={s.row}>
              <Chip label={titleCase(count.mode)} />
              <Chip
                label={
                  count.mode === "decks" || count.mode === "true-count"
                    ? "Self-paced prompts"
                    : count.automatic
                      ? `${(count.speedMs / 1000).toFixed(1)}s per card`
                      : count.automatic === false
                        ? "Tap to deal"
                        : "Pace not recorded"
                }
              />
              <Chip label={`${count.answers.length} answers`} />
            </View>
            {(["Unassisted", "Assisted"] as const).map((label) => {
              const items = count.answers.filter(
                (answer) => answer.assisted === (label === "Assisted"),
              );
              return (
                <View key={label} style={s.metricRow}>
                  <Text style={s.metricLabel}>{label}</Text>
                  <Text style={s.metricValue}>
                    {items.length
                      ? percent(
                          items.filter((answer) => answer.absoluteError === 0)
                            .length / items.length,
                        )
                      : "—"}
                  </Text>
                  <Text style={s.note}>n={items.length}</Text>
                </View>
              );
            })}
          </Panel>
        </>
      ) : (
        <>
          <Panel>
            <View style={s.stats}>
              <Stat
                label="First-attempt accuracy"
                value={accuracy(stats)}
                detail={`${session.decisions.filter((decision) => !decision.replay && decision.correct).length} correct / ${stats.count} decisions`}
              />
              <Stat
                label="Median decision time"
                value={
                  stats.count ? `${(stats.medianMs / 1000).toFixed(1)}s` : "—"
                }
                detail="Replays excluded"
              />
              <Stat
                label="Hands completed"
                value={String(session.rounds)}
                detail={
                  session.kind === "simulator"
                    ? "Rounds in the continuous shoe"
                    : "Generated situations"
                }
              />
            </View>
          </Panel>
          <Panel>
            <Heading>Accuracy under your table rules</Heading>
            <Body>
              Six decks · dealer{" "}
              {session.rules.hitSoft17 ? "hits" : "stands on"} soft 17 · late
              surrender {session.rules.surrender ? "on" : "off"} · double after
              split.
            </Body>
            {session.kind === "strategy" && (
              <Body style={s.note}>
                Situation sampling: {session.sampling ?? "not recorded"}.
              </Body>
            )}
            <View style={s.stats}>
              <Stat
                label="Unassisted"
                value={accuracy(stats.unassisted)}
                detail={`n=${stats.unassisted.count} decisions`}
              />
              <Stat
                label="Assisted"
                value={accuracy(stats.assisted)}
                detail={`n=${stats.assisted.count} decisions`}
              />
            </View>
            <Body style={s.note}>
              A correct choice can lose a hand. Accuracy measures your decision
              before the next card was known.
            </Body>
          </Panel>
          {stats.count > 0 && (
            <Panel>
              <Heading>Where your decisions landed</Heading>
              {["hard", "soft", "pairs"].map((category) => {
                const metric = stats.groups[category];
                return (
                  <View key={category} style={s.category}>
                    <View style={s.between}>
                      <Text style={s.metricLabel}>
                        {titleCase(category)} hands
                      </Text>
                      <Text style={s.metricValue}>
                        {accuracy(metric)}{" "}
                        <Text style={s.note}>· n={metric.count}</Text>
                      </Text>
                    </View>
                    <View style={s.track}>
                      <View
                        style={[
                          s.fill,
                          {
                            width: `${metric.accuracy * 100}%`,
                            opacity: metric.count ? 1 : 0,
                          },
                        ]}
                      />
                    </View>
                  </View>
                );
              })}
            </Panel>
          )}
          <CheckpointStats session={session} />
          {!!session.insurance?.length && (
            <Panel>
              <Text style={s.eyebrow}>INSURANCE DECISIONS</Text>
              <Heading>
                {percent(
                  session.insurance.filter((choice) => choice.correct).length /
                    session.insurance.length,
                )}{" "}
                correct
              </Heading>
              <Body>
                {session.insurance.filter((choice) => choice.correct).length}{" "}
                correct out of {session.insurance.length} insurance choices.
                These side-bet decisions are tracked separately from hit, stand,
                double, split, and surrender accuracy.
              </Body>
              {session.insurance.map((choice, index) => (
                <View key={`${choice.round}-${index}`} style={s.answerRow}>
                  <View style={s.between}>
                    <Text style={s.metricLabel}>Round {choice.round}</Text>
                    <Text
                      style={[
                        s.metricValue,
                        { color: choice.correct ? colors.green : colors.gold },
                      ]}
                    >
                      {choice.correct ? "✓ Correct" : "Review"}
                    </Text>
                  </View>
                  <Body>
                    You {choice.taken ? "took" : "declined"} insurance.
                    Recommended:{" "}
                    {choice.recommended
                      ? "take insurance"
                      : "decline insurance"}
                    .
                  </Body>
                  <Body style={s.note}>
                    This feedback evaluates the insurance choice at the time it
                    was made, independently of the dealer’s eventual hand.
                  </Body>
                </View>
              ))}
            </Panel>
          )}
          {session.kind === "simulator" && (
            <Panel>
              <Text style={s.eyebrow}>SIMULATED OUTCOMES</Text>
              <Heading>
                {session.profit >= 0 ? "+" : "−"}
                {Math.abs(session.profit).toFixed(1)} units
              </Heading>
              <Body>
                The net simulated result from {session.rounds} completed rounds.
                This is the change in virtual bankroll, including your chosen
                wagers, doubles, splits, and insurance. It is separate from
                skill accuracy; short sessions can swing either way.
              </Body>
            </Panel>
          )}
        </>
      )}

      {!!top.length && (
        <Panel>
          <Text style={s.eyebrow}>YOUR NEXT LEARNING OPPORTUNITIES</Text>
          <Heading>Make these decisions familiar.</Heading>
          {top.map(({ decision, frequency }, index) => (
            <View key={decision.id} style={s.mistake}>
              <View style={s.between}>
                <Text style={s.mistakeTitle}>
                  {index + 1}. {handLabel(decision)}
                </Text>
                <Chip
                  label={`${frequency} ${frequency === 1 ? "miss" : "misses"}`}
                />
              </View>
              <Body>
                You chose {titleCase(decision.chosen)}. The recommendation was{" "}
                {titleCase(decision.recommended)}.
              </Body>
              <Body>{decision.explanation}</Body>
              <View style={s.row}>
                <Button
                  label="Replay this hand"
                  variant="secondary"
                  onPress={() => onReplay(decision)}
                />
                <Button
                  label={
                    session.topic === "deviations"
                      ? "Practice count deviations"
                      : `Practice ${decision.category} hands`
                  }
                  variant="ghost"
                  onPress={() =>
                    onPractice(
                      session.topic === "deviations"
                        ? "deviations"
                        : decision.category,
                    )
                  }
                />
              </View>
            </View>
          ))}
        </Panel>
      )}
      {!count && stats.count > 0 && !mistakes.length && (
        <Panel style={{ borderColor: "#416D5C" }}>
          <Heading>Every first hand decision was correct.</Heading>
          <Body>
            Keep building consistency across more sessions. The next useful
            challenge is the same rule set with less assistance or a different
            mix of hands.
          </Body>
        </Panel>
      )}

      <Panel>
        <View style={s.between}>
          <Heading>{count ? "Every count answer" : "Every decision"}</Heading>
          <View style={s.row}>
            <Chip
              label="All"
              selected={filter === "all"}
              onPress={() => {
                setFilter("all");
                setVisible(10);
              }}
            />
            <Chip
              label="Mistakes"
              selected={filter === "mistakes"}
              onPress={() => {
                setFilter("mistakes");
                setVisible(10);
              }}
            />
          </View>
        </View>
        {count ? (
          <>
            {!countAnswers.length && (
              <Body>
                {filter === "mistakes"
                  ? "No count errors in this session."
                  : "This session has no submitted count answers."}
              </Body>
            )}
            {countAnswers.slice(0, visible).map((answer) => (
              <View key={answer.id} style={s.answerRow}>
                <View style={s.between}>
                  <Text style={s.metricLabel}>{titleCase(answer.kind)}</Text>
                  <Text
                    style={[
                      s.metricValue,
                      {
                        color:
                          answer.absoluteError === 0
                            ? colors.green
                            : colors.gold,
                      },
                    ]}
                  >
                    {answer.absoluteError === 0
                      ? "✓ Correct"
                      : `Error ${answer.absoluteError}`}
                  </Text>
                </View>
                <Body>
                  You answered {signed(answer.submitted)} · correct answer{" "}
                  {signed(answer.expected)}
                </Body>
                <Body style={s.note}>{countExplanation(answer)}</Body>
                <Body style={s.note}>
                  {answer.assisted ? "Assisted" : "Unassisted"} ·{" "}
                  {(answer.responseMs / 1000).toFixed(1)}s
                </Body>
              </View>
            ))}
            {countAnswers.length > visible && (
              <Button
                label={`Show more (${countAnswers.length - visible} remaining)`}
                variant="secondary"
                onPress={() => setVisible((value) => value + 10)}
              />
            )}
          </>
        ) : (
          <>
            {!listed.length && (
              <Body>
                {filter === "mistakes"
                  ? "No mistakes to review in this session."
                  : "This session has no recorded decisions."}
              </Body>
            )}
            {listed.slice(0, visible).map((decision) => (
              <View key={decision.id} style={s.decisionRow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: expanded === decision.id }}
                  onPress={() =>
                    setExpanded(expanded === decision.id ? null : decision.id)
                  }
                  style={s.decisionTrigger}
                >
                  <View style={s.decisionCopy}>
                    <Text style={s.metricLabel}>{handLabel(decision)}</Text>
                    <Text style={s.note}>
                      {titleCase(decision.chosen)} →{" "}
                      {titleCase(decision.recommended)}
                      {decision.replay ? " · Replay" : ""}
                    </Text>
                  </View>
                  <Text
                    style={{
                      color: decision.correct ? colors.green : colors.gold,
                      fontWeight: "600",
                    }}
                  >
                    {decision.correct ? "✓ Correct" : "Review"}{" "}
                    {expanded === decision.id ? "−" : "+"}
                  </Text>
                </Pressable>
                {expanded === decision.id && (
                  <DecisionDetail
                    decision={decision}
                    session={session}
                    onReplay={onReplay}
                  />
                )}
              </View>
            ))}
            {listed.length > visible && (
              <Button
                label={`Show more (${listed.length - visible} remaining)`}
                variant="secondary"
                onPress={() => setVisible((value) => value + 10)}
              />
            )}
          </>
        )}
      </Panel>
      <Button
        label="Start another focused session"
        onPress={() => onPractice(session.topic)}
      />
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
    gap: 12,
  },
  intro: { gap: 12 },
  eyebrow: {
    maxWidth: "100%",
    flexShrink: 1,
    color: colors.green,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.6,
  },
  title: {
    maxWidth: "100%",
    flexShrink: 1,
    color: colors.text,
    fontSize: 35,
    fontWeight: "600",
    letterSpacing: -1,
  },
  stats: { flexDirection: "row", flexWrap: "wrap", gap: 24 },
  note: {
    maxWidth: "100%",
    flexShrink: 1,
    color: colors.muted,
    fontSize: 12,
    lineHeight: 19,
  },
  metricRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 15,
  },
  metricLabel: {
    maxWidth: "100%",
    flexShrink: 1,
    color: colors.text,
    fontSize: 15,
    fontWeight: "500",
  },
  metricValue: {
    maxWidth: "100%",
    flexShrink: 1,
    color: colors.green,
    fontSize: 15,
    fontWeight: "600",
  },
  category: { gap: 9 },
  track: {
    height: 5,
    backgroundColor: colors.surface2,
    borderRadius: 5,
    overflow: "hidden",
  },
  fill: { height: 5, backgroundColor: colors.green, borderRadius: 5 },
  mistake: {
    gap: 12,
    paddingTop: 17,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  mistakeTitle: { color: colors.text, fontSize: 18, fontWeight: "500" },
  decisionRow: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 13,
    overflow: "hidden",
  },
  decisionTrigger: {
    minHeight: 70,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 15,
  },
  decisionCopy: { flex: 1, gap: 5 },
  detail: { paddingHorizontal: 16, paddingBottom: 18, gap: 15 },
  table: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-around",
    padding: 18,
    gap: 20,
    borderRadius: 13,
    backgroundColor: "#102B2A",
  },
  hand: { gap: 10, alignItems: "center" },
  label: {
    maxWidth: "100%",
    flexShrink: 1,
    color: colors.muted,
    fontSize: 10,
    letterSpacing: 1,
  },
  answerRow: {
    gap: 9,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 17,
  },
});
