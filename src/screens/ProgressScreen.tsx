import React, { useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { handValue } from "../engine";
import type { Rules, Scenario } from "../engine";
import { createCountingSetup } from "../counting";
import type { CountingMode } from "../counting";
import { LESSONS } from "../content/lessons";
import { CHART_DEALERS } from "../content/chart";
import { buildHeatmap, progressCohortKey } from "../content/progress";
import { percent, summarize } from "../state/analytics";
import { exportHistory, useStore } from "../state/store";
import { newTraining } from "../state/training";
import type { Session } from "../state/types";
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
import SessionReview from "./SessionReview";

type StartRequest = {
  topic: string;
  scenario?: Scenario;
  rules?: Rules;
  reviewOnly?: boolean;
  countMode?: CountingMode;
  speedMs?: number;
  automatic?: boolean;
};
const titleCase = (text: string) =>
  text.replace(/(^|[- ])\w/g, (value) => value.replace("-", " ").toUpperCase());
function sampleSize(session: Session) {
  return (
    session.countResult?.answers.length ?? summarize(session.decisions).count
  );
}
function sessionAccuracy(session: Session) {
  return (
    session.countResult?.exactAccuracy ?? summarize(session.decisions).accuracy
  );
}
function conditions(session: Session) {
  return session.kind === "counting"
    ? `${titleCase(session.countResult?.mode ?? session.topic)} · ${session.countResult?.automatic ? `${((session.countResult?.speedMs ?? 0) / 1000).toFixed(1)}s/card` : session.countResult?.automatic === false ? "tap to deal" : "pace not recorded"} · ${session.assisted ? "assisted" : "unassisted"}`
    : `${session.kind === "simulator" ? "Shoe" : titleCase(session.topic)} · ${session.rules.hitSoft17 ? "H17" : "S17"} · surrender ${session.rules.surrender ? "on" : "off"} · ${session.feedback} · ${session.assisted ? "assisted" : "unassisted"}`;
}

export default function ProgressScreen() {
  const { data, update } = useStore();
  const router = useRouter();
  const [view, setView] = useState<"skills" | "counting">("skills");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [showConditions, setShowConditions] = useState(false);
  const [review, setReview] = useState<Session | null>(null);
  const [historyLimit, setHistoryLimit] = useState(8);
  const [exportMessage, setExportMessage] = useState("");
  const [pendingStart, setPendingStart] = useState<StartRequest | null>(null);
  const [selectedCell, setSelectedCell] = useState<{
    row: string;
    dealer: string;
  } | null>(null);
  const sessions = useMemo(
    () => [...data.sessions].sort((a, b) => b.startedAt - a.startedAt),
    [data.sessions],
  );
  const available = sessions.filter((session) =>
    view === "counting"
      ? session.kind === "counting"
      : session.kind !== "counting",
  );
  const groups = [
    ...new Map(
      available.map((session) => [progressCohortKey(session), session]),
    ).entries(),
  ];
  const key = groups.some(([groupKey]) => groupKey === selectedKey)
    ? selectedKey
    : available[0]
      ? progressCohortKey(available[0])
      : null;
  const comparable = available
    .filter((session) => progressCohortKey(session) === key)
    .sort((a, b) => a.startedAt - b.startedAt);
  const latest = comparable[comparable.length - 1];
  const stats = summarize(comparable.flatMap((session) => session.decisions));
  const trend = comparable
    .filter((session) => sampleSize(session) > 0)
    .slice(-8);
  const heatmap = buildHeatmap(
    comparable.flatMap((session) => session.decisions),
  );
  const cellRow = heatmap.find((row) => row.label === selectedCell?.row);
  const cell = selectedCell && cellRow?.cells[selectedCell.dealer];
  const countAnswers = comparable.flatMap(
    (session) => session.countResult?.answers ?? [],
  );
  const completed = LESSONS.filter(
    (lesson) => data.completedLessons[lesson.id],
  ).length;
  const weak = ["hard", "soft", "pairs"]
    .filter(
      (category) =>
        stats.groups[category].count > 0 && stats.groups[category].accuracy < 1,
    )
    .sort((a, b) => stats.groups[a].accuracy - stats.groups[b].accuracy)[0];

  function applyStart(request: StartRequest) {
    update((previous) => {
      if (request.countMode)
        return {
          ...previous,
          active: null,
          counting: {
            ...createCountingSetup(previous.settings.assistance),
            mode: request.countMode,
            ...(request.speedMs ? { speedMs: request.speedMs } : {}),
            automatic: request.automatic ?? false,
          },
        };
      const withRules = {
        ...previous,
        settings: {
          ...previous.settings,
          rules: request.rules ?? previous.settings.rules,
        },
      };
      return {
        ...previous,
        counting: null,
        active: newTraining(withRules, {
          topic: request.topic,
          scenario: request.scenario,
          reviewOnly: request.reviewOnly,
          kind: request.topic === "simulator" ? "simulator" : "strategy",
        }),
      };
    });
    setPendingStart(null);
    router.push("/practice");
  }
  function begin(request: StartRequest) {
    if (data.active || (data.counting && data.counting.phase !== "setup"))
      setPendingStart(request);
    else applyStart(request);
  }
  function practiceFromSession(session: Session, topic = session.topic) {
    begin(
      session.kind === "counting" && session.countResult
        ? {
            topic,
            countMode: session.countResult.mode,
            speedMs: session.countResult.speedMs,
            automatic: session.countResult.automatic,
          }
        : {
            topic:
              session.kind === "simulator" && topic === session.topic
                ? "simulator"
                : topic,
            rules: session.rules,
          },
    );
  }
  const confirmation = (
    <Modal
      visible={pendingStart !== null}
      transparent
      animationType="fade"
      onRequestClose={() => setPendingStart(null)}
    >
      <View style={s.modalBackdrop}>
        <Panel style={s.modalPanel}>
          <Heading>You have practice in progress.</Heading>
          <Body>
            Starting this session replaces the unfinished practice. Your
            completed sessions and saved hands stay in your history.
          </Body>
          <Button
            label="Keep current practice"
            onPress={() => {
              setPendingStart(null);
              router.push("/practice");
            }}
          />
          <Button
            label="Replace and start"
            variant="secondary"
            onPress={() => {
              if (pendingStart) applyStart(pendingStart);
            }}
          />
          <Button
            label="Cancel"
            variant="ghost"
            onPress={() => setPendingStart(null)}
          />
        </Panel>
      </View>
    </Modal>
  );

  if (review)
    return (
      <>
        <SessionReview
          key={review.id}
          session={review}
          onClose={() => setReview(null)}
          onReplay={(decision) =>
            begin({
              topic:
                review.topic === "deviations"
                  ? "deviations"
                  : decision.category,
              scenario: decision.scenario,
              rules: review.rules,
              reviewOnly: true,
            })
          }
          onPractice={(topic) => practiceFromSession(review, topic)}
        />
        {confirmation}
      </>
    );

  return (
    <>
      <Page>
        <View style={s.intro}>
          <Text style={s.eyebrow}>SMALL IMPROVEMENTS ADD UP</Text>
          <Text accessibilityRole="header" style={s.title}>
            See your skills take shape.
          </Text>
          <Body>
            Your actual practice, with the conditions and sample sizes that make
            progress meaningful.
          </Body>
        </View>
        <Panel>
          <View style={s.stats}>
            <Stat label="Sessions completed" value={String(sessions.length)} />
            <Stat
              label="Lessons completed"
              value={`${completed} / ${LESSONS.length}`}
            />
            <Stat
              label="Saved situations"
              value={String(data.bookmarks.length)}
            />
          </View>
        </Panel>

        {!sessions.length ? (
          <Panel style={s.emptyPanel}>
            <Text style={s.emptySuit}>♠</Text>
            <Heading>Your first session starts the story.</Heading>
            <Body>
              Complete a short strategy or counting session. You’ll see real
              accuracy, decision patterns, and review opportunities here.
            </Body>
            <View style={s.row}>
              <Button
                label="Try 20 strategy decisions"
                onPress={() => begin({ topic: "mixed" })}
              />
              <Button
                label="Learn the basics"
                variant="secondary"
                onPress={() => router.push("/learn")}
              />
            </View>
          </Panel>
        ) : (
          <>
            <View style={s.row}>
              <Chip
                label="Decision skills"
                selected={view === "skills"}
                onPress={() => {
                  setView("skills");
                  setSelectedKey(null);
                  setSelectedCell(null);
                }}
              />
              <Chip
                label="Card counting"
                selected={view === "counting"}
                onPress={() => {
                  setView("counting");
                  setSelectedKey(null);
                  setSelectedCell(null);
                }}
              />
            </View>
            {!latest ? (
              <Panel>
                <Heading>
                  {view === "counting"
                    ? "Your counting history starts here."
                    : "Your decision history starts here."}
                </Heading>
                <Body>
                  Complete a{" "}
                  {view === "counting"
                    ? "counting drill"
                    : "strategy or simulator session"}{" "}
                  to see its results separately.
                </Body>
                <Button
                  label={
                    view === "counting"
                      ? "Start a counting drill"
                      : "Practice strategy"
                  }
                  onPress={() =>
                    begin(
                      view === "counting"
                        ? { topic: "running", countMode: "running" }
                        : { topic: "mixed" },
                    )
                  }
                />
              </Panel>
            ) : (
              <>
                <Panel>
                  <View style={s.between}>
                    <Text style={s.eyebrow}>COMPARE LIKE WITH LIKE</Text>
                    <Button
                      label={showConditions ? "Hide groups" : "Change group"}
                      variant="ghost"
                      onPress={() => setShowConditions((value) => !value)}
                    />
                  </View>
                  <Body style={{ color: colors.text }}>
                    {conditions(latest)}
                  </Body>
                  <Body style={s.note}>
                    {comparable.length} comparable{" "}
                    {comparable.length === 1 ? "session" : "sessions"}.
                    Different topics, rules, feedback modes, and assistance
                    settings are kept separate.
                    {view === "counting"
                      ? " Counting pace is matched too."
                      : ""}
                  </Body>
                  {showConditions && (
                    <View style={s.groupList}>
                      {groups.map(([groupKey, session]) => (
                        <Pressable
                          key={groupKey}
                          accessibilityRole="button"
                          accessibilityState={{ selected: key === groupKey }}
                          onPress={() => {
                            setSelectedKey(groupKey);
                            setSelectedCell(null);
                            setShowConditions(false);
                          }}
                          style={[
                            s.groupOption,
                            key === groupKey && s.groupSelected,
                          ]}
                        >
                          <Text style={s.groupText}>{conditions(session)}</Text>
                          <Text style={s.note}>
                            {
                              available.filter(
                                (item) => progressCohortKey(item) === groupKey,
                              ).length
                            }{" "}
                            sessions{key === groupKey ? " · selected" : ""}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  )}
                  {view === "counting" ? (
                    <View style={s.stats}>
                      <Stat
                        label="Exact answer accuracy"
                        value={
                          countAnswers.length
                            ? percent(
                                countAnswers.filter(
                                  (answer) => answer.absoluteError === 0,
                                ).length / countAnswers.length,
                              )
                            : "—"
                        }
                        detail={`n=${countAnswers.length} answers`}
                      />
                      <Stat
                        label="Mean absolute error"
                        value={
                          countAnswers.length
                            ? (
                                countAnswers.reduce(
                                  (sum, answer) => sum + answer.absoluteError,
                                  0,
                                ) / countAnswers.length
                              ).toFixed(2)
                            : "—"
                        }
                        detail={
                          latest.countResult?.mode === "decks"
                            ? "Decks from the correct estimate"
                            : "Count points from the answer"
                        }
                      />
                    </View>
                  ) : (
                    <View style={s.stats}>
                      <Stat
                        label="First-attempt accuracy"
                        value={stats.count ? percent(stats.accuracy) : "—"}
                        detail={`n=${stats.count} decisions; replays excluded`}
                      />
                      <Stat
                        label="Median decision time"
                        value={
                          stats.count
                            ? `${(stats.medianMs / 1000).toFixed(1)}s`
                            : "—"
                        }
                        detail="Across this comparison group"
                      />
                    </View>
                  )}
                </Panel>

                <Panel>
                  <View style={s.between}>
                    <Heading>Accuracy over time</Heading>
                    <Chip label={`Latest ${trend.length} sessions`} />
                  </View>
                  <Body style={s.note}>
                    Oldest → newest. Tap a bar to review that session. Values
                    show accuracy, with the number of answers beneath each bar.
                  </Body>
                  {trend.length ? (
                    <View style={s.trend}>
                      {trend.map((session) => (
                        <Pressable
                          key={session.id}
                          accessibilityRole="button"
                          accessibilityLabel={`${new Date(session.startedAt).toLocaleDateString()}, ${percent(sessionAccuracy(session))} accuracy from ${sampleSize(session)} ${view === "counting" ? "answers" : "decisions"}`}
                          onPress={() => setReview(session)}
                          style={s.trendColumn}
                        >
                          <Text style={s.barValue}>
                            {percent(sessionAccuracy(session))}
                          </Text>
                          <View style={s.barTrack}>
                            <View
                              style={[
                                s.bar,
                                {
                                  height: `${sessionAccuracy(session) * 100}%`,
                                },
                              ]}
                            />
                          </View>
                          <Text style={s.barSample}>
                            n={sampleSize(session)}
                          </Text>
                          <Text style={s.barDate}>
                            {new Date(session.startedAt).toLocaleDateString(
                              undefined,
                              { month: "short", day: "numeric" },
                            )}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : (
                    <Body>No scored answers in this group yet.</Body>
                  )}
                  {trend.length === 1 && (
                    <Body style={s.note}>
                      One session gives you a starting point. Complete more
                      under the same conditions to see a trend.
                    </Body>
                  )}
                </Panel>

                {view === "skills" && (
                  <>
                    <Panel>
                      <Heading>Your skill mix</Heading>
                      <Body style={s.note}>
                        First attempts in this comparison group. A small sample
                        is a useful clue, not a settled skill rating.
                      </Body>
                      {[
                        "hard",
                        "soft",
                        "pairs",
                        "hit",
                        "stand",
                        "double",
                        "split",
                        "surrender",
                      ].map((category) => {
                        const metric = stats.groups[category];
                        return (
                          <View key={category} style={s.skillRow}>
                            <View style={s.between}>
                              <Text style={s.skillLabel}>
                                {titleCase(category)}
                                {["hard", "soft", "pairs"].includes(category)
                                  ? " hands"
                                  : " recommended"}
                              </Text>
                              <Text style={s.skillValue}>
                                {metric.count ? percent(metric.accuracy) : "—"}{" "}
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
                      {weak && (
                        <Button
                          label={`Focus on ${weak} hands`}
                          onPress={() =>
                            begin({
                              topic:
                                latest.topic === "deviations"
                                  ? "deviations"
                                  : weak,
                              rules: latest.rules,
                            })
                          }
                        />
                      )}
                    </Panel>
                    {heatmap.length > 0 && (
                      <Panel>
                        <Heading>Find patterns at the table.</Heading>
                        <Body style={s.note}>
                          First-attempt accuracy by hand and dealer upcard. H =
                          hard, S = soft; pairs show both ranks. A dash means no
                          observations. Tap a filled cell for its sample size.
                        </Body>
                        <ScrollView
                          horizontal
                          contentContainerStyle={{ paddingBottom: 10 }}
                        >
                          <View>
                            <View style={s.heatRow}>
                              <View style={s.heatLabel}>
                                <Text style={s.note}>Hand</Text>
                              </View>
                              {CHART_DEALERS.map((dealer) => (
                                <View key={dealer} style={s.heatCell}>
                                  <Text style={s.note}>{dealer}</Text>
                                </View>
                              ))}
                            </View>
                            {heatmap.map((row) => (
                              <View key={row.label} style={s.heatRow}>
                                <View style={s.heatLabel}>
                                  <Text style={s.heatText}>{row.label}</Text>
                                </View>
                                {CHART_DEALERS.map((dealer) => {
                                  const value = row.cells[dealer];
                                  const rate = value
                                    ? value.correct / value.count
                                    : 0;
                                  const chosen =
                                    selectedCell?.row === row.label &&
                                    selectedCell.dealer === dealer;
                                  return (
                                    <Pressable
                                      key={dealer}
                                      accessibilityRole="button"
                                      disabled={!value}
                                      accessibilityState={{
                                        disabled: !value,
                                        selected: chosen,
                                      }}
                                      accessibilityLabel={
                                        value
                                          ? `${row.label} versus ${dealer}: ${percent(rate)}, ${value.correct} correct from ${value.count} decisions`
                                          : `${row.label} versus ${dealer}: no observations`
                                      }
                                      onPress={() =>
                                        setSelectedCell({
                                          row: row.label,
                                          dealer,
                                        })
                                      }
                                      style={[
                                        s.heatCell,
                                        {
                                          backgroundColor: !value
                                            ? colors.bg
                                            : rate >= 0.8
                                              ? "#245342"
                                              : rate >= 0.5
                                                ? "#4A4B2E"
                                                : "#57352E",
                                          borderColor: chosen
                                            ? colors.text
                                            : "transparent",
                                        },
                                      ]}
                                    >
                                      <Text
                                        style={[
                                          s.heatText,
                                          !value && { color: colors.muted },
                                        ]}
                                      >
                                        {value ? Math.round(rate * 100) : "—"}
                                      </Text>
                                    </Pressable>
                                  );
                                })}
                              </View>
                            ))}
                          </View>
                        </ScrollView>
                        {cell && (
                          <View style={s.cellDetail}>
                            <Text style={s.skillLabel}>
                              {selectedCell!.row} vs {selectedCell!.dealer} ·{" "}
                              {percent(cell.correct / cell.count)} correct
                            </Text>
                            <Body>
                              {cell.correct} correct out of {cell.count} first
                              decisions.{" "}
                              {cell.count < 10
                                ? "A small sample; keep practicing before drawing a strong conclusion."
                                : "Use this pattern to choose your next practice set."}
                            </Body>
                            <Button
                              label="Review an example"
                              variant="secondary"
                              onPress={() =>
                                begin({
                                  topic:
                                    latest.topic === "deviations"
                                      ? "deviations"
                                      : cell.example.category,
                                  scenario: cell.example.scenario,
                                  rules: latest.rules,
                                  reviewOnly: true,
                                })
                              }
                            />
                          </View>
                        )}
                      </Panel>
                    )}
                  </>
                )}
              </>
            )}
            <Panel>
              <Heading>Your session history</Heading>
              <Body style={s.note}>
                Open a session for the original decisions, explanations, and
                counting results.
              </Body>
              {sessions.slice(0, historyLimit).map((session) => (
                <Pressable
                  key={session.id}
                  accessibilityRole="button"
                  onPress={() => setReview(session)}
                  style={s.historyRow}
                >
                  <View style={s.historyCopy}>
                    <Text style={s.historyTitle}>
                      {session.kind === "counting"
                        ? "Counting"
                        : session.kind === "simulator"
                          ? "Continuous shoe"
                          : "Strategy"}{" "}
                      · {titleCase(session.topic)}
                    </Text>
                    <Text style={s.note}>
                      {new Date(session.startedAt).toLocaleDateString(
                        undefined,
                        { month: "short", day: "numeric" },
                      )}{" "}
                      · {sampleSize(session)}{" "}
                      {session.kind === "counting" ? "answers" : "decisions"} ·{" "}
                      {session.assisted ? "assisted" : "unassisted"}
                    </Text>
                  </View>
                  <Text style={s.historyAccuracy}>
                    {sampleSize(session)
                      ? percent(sessionAccuracy(session))
                      : "—"}{" "}
                    ›
                  </Text>
                </Pressable>
              ))}
              {sessions.length > historyLimit && (
                <Button
                  label="Show more sessions"
                  variant="secondary"
                  onPress={() => setHistoryLimit((value) => value + 8)}
                />
              )}
            </Panel>
          </>
        )}

        <Panel>
          <View style={s.between}>
            <Heading>Your saved hands</Heading>
            <Chip label={`${data.bookmarks.length} saved`} />
          </View>
          {!data.bookmarks.length ? (
            <Body>
              Save a difficult decision from a session review. It will be
              waiting here for focused practice.
            </Body>
          ) : (
            data.bookmarks.map((bookmark, index) => (
              <View key={`${bookmark.scenario.id}-${index}`} style={s.bookmark}>
                <View style={s.row}>
                  {bookmark.scenario.cards.slice(0, 3).map((card) => (
                    <PlayingCard key={card.id} card={card} small />
                  ))}
                  <View style={s.bookmarkCopy}>
                    <Text style={s.skillLabel}>
                      {handValue(bookmark.scenario.cards).soft
                        ? "Soft"
                        : "Hard"}{" "}
                      {handValue(bookmark.scenario.cards).total} vs{" "}
                      {bookmark.scenario.dealer.rank}
                    </Text>
                    <Text style={s.note}>
                      {bookmark.rules.hitSoft17 ? "H17" : "S17"} · surrender{" "}
                      {bookmark.rules.surrender ? "on" : "off"}
                      {bookmark.countMode ? " · count deviation" : ""}
                    </Text>
                  </View>
                </View>
                <View style={s.row}>
                  <Button
                    label="Replay saved hand"
                    variant="secondary"
                    onPress={() =>
                      begin({
                        topic: bookmark.countMode ? "deviations" : "mixed",
                        scenario: bookmark.scenario,
                        rules: bookmark.rules,
                        reviewOnly: true,
                      })
                    }
                  />
                  <Button
                    label="Remove"
                    variant="ghost"
                    onPress={() =>
                      update((previous) => ({
                        ...previous,
                        bookmarks: previous.bookmarks.filter(
                          (_, itemIndex) => itemIndex !== index,
                        ),
                      }))
                    }
                  />
                </View>
              </View>
            ))
          )}
        </Panel>
        <View style={s.exportRow}>
          <Body style={s.note}>
            Your history is stored on this device. Export a copy to keep or
            inspect your practice data.
          </Body>
          <Button
            label="Export training history"
            variant="secondary"
            onPress={() => {
              setExportMessage("");
              void exportHistory(data)
                .then(() => setExportMessage("History export prepared."))
                .catch(() =>
                  setExportMessage(
                    "The export could not be opened. Please try again.",
                  ),
                );
            }}
          />
          {!!exportMessage && (
            <Text accessibilityLiveRegion="polite" style={s.note}>
              {exportMessage}
            </Text>
          )}
        </View>
      </Page>
      {confirmation}
    </>
  );
}

const s = StyleSheet.create({
  intro: { gap: 12, maxWidth: 720 },
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
    lineHeight: 43,
  },
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
  stats: { flexDirection: "row", flexWrap: "wrap", gap: 25 },
  note: {
    maxWidth: "100%",
    flexShrink: 1,
    color: colors.muted,
    fontSize: 12,
    lineHeight: 19,
  },
  emptyPanel: { borderColor: "#3D6357", backgroundColor: "#142B29" },
  emptySuit: { color: colors.green, fontSize: 44 },
  groupList: { gap: 9 },
  groupOption: {
    padding: 14,
    gap: 5,
    borderRadius: 10,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  groupSelected: { borderColor: colors.green },
  groupText: {
    maxWidth: "100%",
    flexShrink: 1,
    color: colors.text,
    fontSize: 13,
    lineHeight: 20,
  },
  trend: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingTop: 7,
  },
  trendColumn: { flex: 1, gap: 7, alignItems: "center", minWidth: 23 },
  barTrack: {
    height: 112,
    backgroundColor: colors.surface2,
    width: "78%",
    maxWidth: 66,
    borderRadius: 6,
    overflow: "hidden",
    justifyContent: "flex-end",
  },
  bar: {
    width: "100%",
    backgroundColor: colors.green,
    borderRadius: 5,
    minHeight: 0,
  },
  barValue: { color: colors.text, fontSize: 11, fontWeight: "600" },
  barSample: { color: colors.muted, fontSize: 10 },
  barDate: { color: colors.muted, fontSize: 9, textAlign: "center" },
  skillRow: { gap: 8 },
  skillLabel: {
    maxWidth: "100%",
    flexShrink: 1,
    color: colors.text,
    fontSize: 14,
    fontWeight: "500",
  },
  skillValue: {
    maxWidth: "100%",
    flexShrink: 1,
    color: colors.green,
    fontSize: 14,
    fontWeight: "600",
  },
  track: {
    height: 5,
    backgroundColor: colors.surface2,
    borderRadius: 5,
    overflow: "hidden",
  },
  fill: { height: 5, backgroundColor: colors.green, borderRadius: 5 },
  heatRow: { flexDirection: "row", gap: 3, marginBottom: 3 },
  heatLabel: { width: 59, height: 44, justifyContent: "center" },
  heatCell: {
    width: 46,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "transparent",
  },
  heatText: { color: colors.text, fontSize: 12, fontWeight: "500" },
  cellDetail: {
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 16,
  },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 15,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  historyCopy: { flex: 1, gap: 6 },
  historyTitle: {
    maxWidth: "100%",
    flexShrink: 1,
    color: colors.text,
    fontSize: 15,
    fontWeight: "500",
  },
  historyAccuracy: {
    maxWidth: "100%",
    flexShrink: 1,
    color: colors.green,
    fontSize: 17,
    fontWeight: "600",
  },
  bookmark: {
    gap: 15,
    paddingTop: 17,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  bookmarkCopy: { gap: 7, flex: 1, minWidth: 130 },
  exportRow: { gap: 12, alignItems: "flex-start" },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "#000000B8",
    justifyContent: "center",
    alignItems: "center",
    padding: 22,
  },
  modalPanel: { width: "100%", maxWidth: 450 },
});
