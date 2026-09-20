import React, { useEffect, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import {
  actionRestriction,
  handValue,
  legalActions,
  recommend,
  type Action,
  type Scenario,
} from "../engine";
import type { Training } from "../state/types";
import {
  Body,
  Button,
  DetailSheet,
  Eyebrow,
  Heading,
  PlayingCard,
  colors,
} from "../ui";
import DecisionExplanation from "./DecisionExplanation";

const ACTIONS: Action[] = ["hit", "stand", "double", "split", "surrender"];
const label = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
type Props = {
  training: Training;
  scenario?: Scenario;
  due: boolean;
  notice: string;
  reducedMotion: boolean;
  onChoose: (action: Action) => void;
  onNext: () => void;
  onPause: () => void;
  onResume: () => void;
  onFinish: () => void;
  onSave: () => void;
  onSimilar: () => void;
  onCasino: () => void;
};

/** The decision controls stay outside the optional scrolling information area. */
export default function StrategyTable({
  training,
  scenario,
  due,
  notice,
  reducedMotion,
  onChoose,
  onNext,
  onPause,
  onResume,
  onFinish,
  onSave,
  onSimilar,
  onCasino,
}: Props) {
  const [details, setDetails] = useState<
    "explanation" | "session" | "actions" | null
  >(null);
  const { height, fontScale } = useWindowDimensions();
  const compact = height < 740;
  const feedback = training.feedback;
  const shown = feedback?.scenario || scenario;
  const rules = training.session.rules;
  const coach = training.session.feedback === "coach";
  const recommendation = shown
    ? recommend(shown, rules, training.countMode)
    : undefined;
  const value = shown ? handValue(shown.cards) : undefined;
  const progress = training.timeLimitMs
    ? `${Math.floor(training.elapsedMs / 60000)}:${String(Math.floor(training.elapsedMs / 1000) % 60).padStart(2, "0")} / ${training.timeLimitMs / 60000} min`
    : `${training.session.decisions.length} / ${training.target}`;
  useEffect(
    () => setDetails(null),
    [training.session.id, feedback?.id, scenario?.id],
  );
  const openSession = () => {
    if (!training.paused && !feedback) onPause();
    setDetails("session");
  };
  return (
    <View style={s.screen}>
      <View style={s.header}>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={s.kicker}>
            {training.reviewOnly
              ? "REVIEW · UNSCORED"
              : `${coach ? "COACH" : "CHALLENGE"} · ${training.session.topic === "mixed" ? "STRATEGY" : training.session.topic.toUpperCase()}`}
          </Text>
          <Text style={s.progress}>
            {progress} {training.timeLimitMs ? "" : "decisions"}
          </Text>
        </View>
        <Button
          label={training.paused ? "Resume" : "Pause"}
          variant="ghost"
          onPress={training.paused ? onResume : onPause}
          style={s.smallButton}
        />
        <Button
          label="Options"
          variant="secondary"
          onPress={openSession}
          style={s.smallButton}
        />
      </View>
      <View
        accessibilityRole="progressbar"
        accessibilityValue={{
          min: 0,
          max: training.target,
          now: Math.min(training.session.decisions.length, training.target),
        }}
        style={s.track}
      >
        <View
          style={[
            s.fill,
            {
              width: `${Math.min(100, (training.timeLimitMs ? training.elapsedMs / training.timeLimitMs : training.session.decisions.length / training.target) * 100)}%`,
            },
          ]}
        />
      </View>
      <ScrollView
        style={s.main}
        contentContainerStyle={[s.mainContent, compact && { gap: 8 }]}
        keyboardShouldPersistTaps="handled"
      >
        {training.paused ? (
          <View style={s.pause}>
            <Text style={s.pauseSymbol}>Ⅱ</Text>
            <Heading>Your place is saved.</Heading>
            <Body>
              The decision timer is paused. Continue when you’re ready.
            </Body>
          </View>
        ) : (
          shown && (
            <>
              <View style={[s.table, compact && { padding: 14, gap: 10 }]}>
                <View
                  style={[
                    s.hands,
                    compact && fontScale < 1.3 && s.handsSideBySide,
                  ]}
                >
                  <View style={s.hand}>
                    <Text style={s.tableLabel}>DEALER</Text>
                    <View style={s.cards}>
                      <PlayingCard card={shown.dealer} small />
                      <PlayingCard hidden small />
                    </View>
                  </View>
                  {!compact && (
                    <Text style={s.tableMark}>BLACKJACK PAYS 3 TO 2</Text>
                  )}
                  <View style={s.hand}>
                    <Text style={s.tableLabel}>
                      {shown.fromSplit ? "YOUR SPLIT HAND" : "YOUR HAND"}
                    </Text>
                    <View style={s.cards}>
                      {shown.cards.map((card, index) => (
                        <View
                          key={card.id}
                          style={
                            index > 0 && shown.cards.length > 2
                              ? {
                                  marginLeft:
                                    shown.cards.length > 4 ? -34 : -24,
                                }
                              : undefined
                          }
                        >
                          <PlayingCard card={card} small />
                        </View>
                      ))}
                    </View>
                    {training.session.assisted && (
                      <Text style={s.total}>
                        {value!.total} · {value!.soft ? "soft" : "hard"}
                      </Text>
                    )}
                  </View>
                </View>
                {training.countMode && (
                  <Text style={s.count}>
                    Supplied true count: {shown.trueCount ?? 0}
                  </Text>
                )}
                {!feedback && training.session.assisted && (
                  <Text style={s.hint}>
                    Hint: {label(recommendation!.action)}.{" "}
                    {recommendation!.reason}
                  </Text>
                )}
              </View>
              {feedback ? (
                <View
                  accessibilityLiveRegion="polite"
                  style={[
                    s.feedback,
                    {
                      borderColor: !coach
                        ? colors.border
                        : feedback.correct
                          ? "#43846C"
                          : "#8E665A",
                    },
                  ]}
                >
                  <Text
                    style={[
                      s.feedbackTitle,
                      {
                        color: !coach
                          ? colors.text
                          : feedback.correct
                            ? colors.green
                            : colors.gold,
                      },
                    ]}
                  >
                    {!coach
                      ? `Recorded: ${label(feedback.chosen)}`
                      : feedback.correct
                        ? `${label(feedback.chosen)} is correct.`
                        : `${label(feedback.recommended)} is recommended.`}
                  </Text>
                  <Text style={s.feedbackBody}>
                    {coach
                      ? recommendation?.reason || feedback.explanation
                      : "Your explanation and score will appear in the session review."}
                  </Text>
                  {coach && !feedback.correct && (
                    <Text style={s.subtle}>
                      You chose {label(feedback.chosen)}.
                    </Text>
                  )}
                </View>
              ) : (
                <Text style={s.prompt}>What’s your move?</Text>
              )}
              {!!notice && (
                <Text accessibilityLiveRegion="polite" style={s.notice}>
                  {notice}
                </Text>
              )}
            </>
          )
        )}
      </ScrollView>
      <View style={s.dock}>
        {training.paused ? (
          <>
            <Button label="Resume training" onPress={onResume} />
            <Button label="Finish session" variant="ghost" onPress={onFinish} />
          </>
        ) : feedback ? (
          <>
            <View style={s.secondaryRow}>
              {coach && (
                <Button
                  label="Explain more"
                  variant="secondary"
                  onPress={() => setDetails("explanation")}
                  style={s.secondaryButton}
                />
              )}
              <Button
                label="Save for review"
                variant="ghost"
                onPress={onSave}
                style={s.secondaryButton}
              />
            </View>
            <Button
              label={due ? "See results" : "Next situation  →"}
              onPress={onNext}
            />
          </>
        ) : (
          shown && (
            <>
              <View style={s.actionRow}>
                {ACTIONS.slice(0, 3).map((action) => (
                  <Button
                    key={action}
                    label={label(action)}
                    onPress={() => onChoose(action)}
                    disabled={!legalActions(shown, rules).includes(action)}
                    variant={action === "hit" ? "primary" : "secondary"}
                    style={s.actionButton}
                  />
                ))}
              </View>
              <View style={s.actionRow}>
                {ACTIONS.slice(3).map((action) => (
                  <Button
                    key={action}
                    label={label(action)}
                    onPress={() => onChoose(action)}
                    disabled={!legalActions(shown, rules).includes(action)}
                    variant="secondary"
                    style={s.actionButton}
                  />
                ))}
                <Button
                  label="Action help"
                  variant="ghost"
                  onPress={() => {
                    onPause();
                    setDetails("actions");
                  }}
                  style={s.actionButton}
                />
              </View>
            </>
          )
        )}
      </View>
      <DetailSheet
        visible={details !== null}
        title={
          details === "explanation"
            ? "Understand this decision"
            : details === "actions"
              ? "Your available moves"
              : "Session options"
        }
        onClose={() => setDetails(null)}
        reducedMotion={reducedMotion}
      >
        {details === "explanation" && feedback && (
          <>
            <DecisionExplanation
              scenario={feedback.scenario}
              rules={rules}
              countMode={training.countMode}
              chosen={feedback.chosen}
            />
            <Button
              label="Practice similar hands"
              variant="secondary"
              onPress={() => {
                setDetails(null);
                onSimilar();
              }}
            />
          </>
        )}
        {details === "actions" && shown && (
          <>
            {ACTIONS.map((action) => (
              <View key={action} style={{ gap: 4 }}>
                <Heading>{label(action)}</Heading>
                <Body>
                  {actionRestriction(action, shown, rules) ||
                    {
                      hit: "Take another card. You can choose again if your total is below 21.",
                      stand:
                        "Keep your current total and finish playing this hand.",
                      double:
                        "Add an equal wager and receive exactly one final card.",
                      split:
                        "Add an equal wager and play each card as a separate hand.",
                      surrender:
                        "Give up the hand and recover half of the original wager.",
                    }[action]}
                </Body>
              </View>
            ))}
            <Body>Your timer stays paused when you close this panel.</Body>
          </>
        )}
        {details === "session" && (
          <>
            <Eyebrow>THIS SESSION’S RULES</Eyebrow>
            <Body>
              6 decks ·{" "}
              {rules.hitSoft17
                ? "Dealer hits soft 17"
                : "Dealer stands on soft 17"}{" "}
              · blackjack pays 3:2 ·{" "}
              {rules.surrender ? "late surrender available" : "no surrender"}.
            </Body>
            <Body>
              {coach
                ? "Coach · immediate feedback"
                : "Challenge · feedback after the session"}{" "}
              ·{" "}
              {training.session.assisted
                ? "Hints enabled"
                : "Independent practice"}{" "}
              · {training.sampling} sampling.
            </Body>
            {training.reviewOnly && (
              <Body>
                This review does not change your first-attempt statistics.
              </Body>
            )}
            <Button
              label="Finish session"
              onPress={() => {
                setDetails(null);
                onFinish();
              }}
            />
            <Button
              label="Play at the casino table"
              variant="secondary"
              onPress={() => {
                setDetails(null);
                onCasino();
              }}
            />
            <Body>
              Casino play uses virtual money and preserves this practice
              session.
            </Body>
          </>
        )}
      </DetailSheet>
    </View>
  );
}
const s = StyleSheet.create({
  screen: {
    flex: 1,
    minHeight: 0,
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    paddingHorizontal: 14,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 8,
  },
  kicker: {
    color: colors.green,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
  },
  progress: { color: colors.muted, fontSize: 12 },
  smallButton: { minHeight: 44, paddingHorizontal: 12, paddingVertical: 10 },
  track: {
    height: 3,
    borderRadius: 3,
    backgroundColor: colors.border,
    marginBottom: 10,
    overflow: "hidden",
  },
  fill: { height: 3, backgroundColor: colors.green },
  main: { flex: 1, minHeight: 0 },
  mainContent: {
    flexGrow: 1,
    gap: 12,
    justifyContent: "center",
    paddingBottom: 10,
  },
  table: {
    backgroundColor: "#13352F",
    borderWidth: 1,
    borderColor: "#315C4D",
    borderRadius: 22,
    padding: 16,
    gap: 12,
  },
  hands: { alignItems: "center", gap: 12 },
  handsSideBySide: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "flex-start",
    gap: 8,
  },
  hand: { alignItems: "center", gap: 7 },
  cards: { flexDirection: "row", justifyContent: "center", gap: 5 },
  tableLabel: {
    fontSize: 10,
    letterSpacing: 1.5,
    color: "#B8D4C5",
    fontWeight: "700",
  },
  tableMark: { color: "#7FAD94", fontSize: 9, letterSpacing: 2 },
  total: { color: colors.ivory, fontSize: 12, fontWeight: "600" },
  count: { color: colors.gold, fontSize: 13, textAlign: "center" },
  hint: {
    color: colors.green,
    fontSize: 12,
    lineHeight: 17,
    textAlign: "center",
  },
  feedback: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderRadius: 16,
    padding: 13,
    gap: 5,
  },
  feedbackTitle: { fontSize: 17, fontWeight: "700" },
  feedbackBody: { fontSize: 13, lineHeight: 18, color: colors.muted },
  subtle: { color: colors.muted, fontSize: 12 },
  prompt: {
    color: colors.text,
    textAlign: "center",
    fontSize: 17,
    fontWeight: "600",
  },
  dock: {
    paddingVertical: 10,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  actionRow: { flexDirection: "row", gap: 6 },
  actionButton: {
    flex: 1,
    minHeight: 46,
    paddingHorizontal: 5,
    paddingVertical: 9,
  },
  secondaryRow: { flexDirection: "row", gap: 6 },
  secondaryButton: {
    flex: 1,
    minHeight: 44,
    paddingHorizontal: 8,
    paddingVertical: 9,
  },
  pause: { alignItems: "center", gap: 15, padding: 24 },
  pauseSymbol: { color: colors.green, fontSize: 48 },
  notice: { color: colors.green, fontSize: 12, textAlign: "center" },
});
