import React, { useMemo, useState } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";
import {
  explainDecision,
  type Action,
  type Rules,
  type Scenario,
} from "../engine";
import { Body, Button, Chip, Eyebrow, Heading, colors } from "../ui";

export type DecisionExplanationProps = {
  scenario: Scenario;
  rules: Rules;
  countMode?: boolean;
  chosen?: Action;
  /** Content only: the caller owns the expand control, dialog, and scrolling. */
  expanded?: boolean;
};
const label = (value: string) => value[0].toUpperCase() + value.slice(1);
const signed = (value: number) => `${value >= 0 ? "+" : ""}${value}`;

export default function DecisionExplanation({
  scenario,
  rules,
  countMode = false,
  chosen,
  expanded = true,
}: DecisionExplanationProps) {
  const [sourceError, setSourceError] = useState<string | null>(null);
  const detail = useMemo(
    () =>
      expanded ? explainDecision(scenario, rules, countMode, chosen) : null,
    [scenario, rules, countMode, chosen, expanded],
  );
  if (!detail) return null;
  return (
    <View style={s.container}>
      <View style={s.section}>
        <Eyebrow>UNDERSTAND THIS DECISION</Eyebrow>
        <Heading>{detail.title}</Heading>
        <Body>{detail.hand.detail}</Body>
        <View style={s.draw}>
          <Text style={s.smallHeading}>What a hit can do</Text>
          <Body>{detail.hand.drawSummary}</Body>
        </View>
      </View>
      <View style={s.section}>
        <Text accessibilityRole="header" style={s.smallHeading}>
          Read the dealer
        </Text>
        <Body>{detail.dealer}</Body>
      </View>
      <View style={[s.section, s.recommendation]}>
        <Text accessibilityRole="header" style={s.smallHeading}>
          Why {detail.recommendation.action} here?
        </Text>
        <Body>{detail.recommendation.explanation}</Body>
      </View>
      {detail.deviation && (
        <View style={s.highlight}>
          <Text accessibilityRole="header" style={s.smallHeading}>
            The count changes the comparison
          </Text>
          <View style={s.row}>
            <Chip label={`Baseline: ${label(detail.deviation.baseline)}`} />
            <Chip label={`Index: ${signed(detail.deviation.index)}`} />
            <Chip
              label={`Snapshot count: ${signed(detail.deviation.suppliedCount)}`}
              selected
            />
          </View>
          <Body>{detail.deviation.explanation}</Body>
        </View>
      )}
      {detail.alternatives.length > 0 && (
        <View style={s.section}>
          <Text accessibilityRole="header" style={s.smallHeading}>
            Compare your options
          </Text>
          {detail.alternatives.map((alternative) => (
            <View
              key={alternative.action}
              style={[s.option, alternative.chosen && s.chosen]}
            >
              <Text
                style={[
                  s.optionTitle,
                  alternative.chosen && { color: colors.red },
                ]}
              >
                {label(alternative.action)}
                {alternative.chosen ? " · your choice" : ""}
              </Text>
              <Body>{alternative.explanation}</Body>
            </View>
          ))}
        </View>
      )}
      <View style={s.section}>
        <Text accessibilityRole="header" style={s.smallHeading}>
          Rules that matter
        </Text>
        {detail.ruleEffects.map((effect) => (
          <Body key={effect}>{effect}</Body>
        ))}
        {!!detail.scopeNote && <Body>{detail.scopeNote}</Body>}
      </View>
      <View style={s.highlight}>
        <Text accessibilityRole="header" style={s.smallHeading}>
          Take this into the next hand
        </Text>
        <Body style={{ color: colors.text }}>{detail.takeaway}</Body>
        <Text style={s.patternTitle}>
          Basic strategy for these cards and legal actions
        </Text>
        {detail.pattern.map((pattern) => (
          <View style={s.patternRow} key={pattern.action}>
            <Text style={s.patternAction}>{label(pattern.action)}</Text>
            <Text style={s.patternCards}>{pattern.dealers.join("  ·  ")}</Text>
          </View>
        ))}
        <Body style={s.note}>
          Numbers in this row are dealer upcards. A means ace; 10 also covers J,
          Q and K.
          {detail.deviation
            ? " The count threshold above applies to the current matchup separately."
            : ""}
        </Body>
      </View>
      <View style={s.section}>
        <Body style={s.note}>
          This explanation uses the original decision's visible cards and rules.
          A winning or losing outcome afterward does not change its grade.
        </Body>
        <View style={s.row}>
          {detail.sources.map((source) => (
            <Button
              key={source.url}
              label={source.label}
              variant="ghost"
              onPress={() => {
                setSourceError(null);
                void Linking.openURL(source.url).catch(() =>
                  setSourceError(
                    "The reference could not be opened. Please try again.",
                  ),
                );
              }}
            />
          ))}
        </View>
        {!!sourceError && (
          <Text
            accessibilityLiveRegion="polite"
            style={[s.note, { color: colors.warning }]}
          >
            {sourceError}
          </Text>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { gap: 24 },
  section: { gap: 12 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  smallHeading: { color: colors.text, fontSize: 16, fontWeight: "700" },
  draw: {
    backgroundColor: colors.surface2,
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
  recommendation: {
    backgroundColor: colors.accentSoft,
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
    borderRadius: 12,
    padding: 14,
  },
  highlight: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accentBorder,
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    gap: 12,
  },
  option: {
    borderLeftWidth: 2,
    borderLeftColor: colors.border,
    paddingLeft: 13,
    gap: 5,
  },
  chosen: { borderLeftColor: colors.red },
  optionTitle: { color: colors.text, fontWeight: "600", fontSize: 14 },
  patternTitle: { color: colors.muted, fontSize: 12, marginTop: 3 },
  patternRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  patternAction: {
    color: colors.accent,
    width: 80,
    fontSize: 14,
    fontWeight: "600",
  },
  patternCards: { flex: 1, color: colors.text, fontSize: 14, lineHeight: 20 },
  note: { fontSize: 12, lineHeight: 18 },
});
