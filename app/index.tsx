import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  useWindowDimensions,
} from "react-native";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useStore } from "../src/state/store";
import {
  Page,
  Panel,
  Title,
  Heading,
  Body,
  Eyebrow,
  Button,
  Chip,
  Stat,
  PlayingCard,
  Reveal,
  colors,
  shared,
} from "../src/ui";
import { makeCard } from "../src/engine";
import { summarize, weakTopics, percent } from "../src/state/analytics";
import { newTraining } from "../src/state/training";
export default function Home() {
  const { data, update, storageError } = useStore();
  const wide = useWindowDimensions().width > 700;
  const stats = summarize(data.sessions.flatMap((s) => s.decisions));
  const weak = weakTopics(data.sessions)[0];
  const completed = Object.keys(data.completedLessons).length;
  const go = (topic: string) =>
    router.push({ pathname: "/practice", params: { topic } });
  return (
    <Page>
      <View style={shared.between}>
        <View style={{ gap: 7, flex: 1, minWidth: 220 }}>
          <Eyebrow>THE EDGE IS IN THE PRACTICE</Eyebrow>
          <Title>Better reads.{"\n"}Bolder moves.</Title>
        </View>
        <Chip
          label={
            storageError
              ? "Progress needs attention"
              : "●  Progress stored on this device"
          }
        />
      </View>
      {storageError && (
        <Panel>
          <Body style={{ color: colors.red }}>{storageError}</Body>
        </Panel>
      )}
      {!data.onboarding && (
        <Panel style={{ borderColor: colors.accentBorder }}>
          <Eyebrow>WELCOME TO ACEWISE</Eyebrow>
          <Heading>Let’s find your starting point.</Heading>
          <Body>
            Choose where you are today. You can explore every lesson at any
            time.
          </Body>
          <View style={shared.row}>
            {["New to blackjack", "Know the basics", "Learning to count"].map(
              (x) => (
                <Chip
                  key={x}
                  label={x}
                  selected={data.experience === x}
                  onPress={() =>
                    update((d) => ({
                      ...d,
                      experience: x,
                      goal:
                        x === "Learning to count"
                          ? "Card counting"
                          : "Basic strategy",
                    }))
                  }
                />
              ),
            )}
          </View>
          <View style={shared.row}>
            {["Basic strategy", "Card counting"].map((x) => (
              <Chip
                key={x}
                label={x}
                selected={data.goal === x}
                onPress={() => update((d) => ({ ...d, goal: x }))}
              />
            ))}
          </View>
          <View style={shared.row}>
            <Button
              label="Personalize my practice"
              onPress={() => {
                update((d) => ({ ...d, onboarding: true }));
                router.push(
                  data.goal === "Card counting"
                    ? { pathname: "/practice", params: { topic: "count" } }
                    : "/learn",
                );
              }}
            />
            <Button
              label="Try a 5-hand diagnostic"
              variant="secondary"
              onPress={() => {
                update((d) => ({
                  ...d,
                  onboarding: true,
                  active: newTraining(
                    {
                      ...d,
                      settings: {
                        ...d.settings,
                        assistance: false,
                        feedback: "challenge",
                      },
                    },
                    { target: 5, topic: "mixed" },
                  ),
                }));
                router.push("/practice");
              }}
            />
            <Button
              label="Skip for now"
              variant="ghost"
              onPress={() => update((d) => ({ ...d, onboarding: true }))}
            />
          </View>
        </Panel>
      )}
      <Reveal reducedMotion={data.settings.reducedMotion}>
        <LinearGradient
          colors={["#183D7D", "#152C57", "#30223F"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[s.hero, { flexDirection: wide ? "row" : "column" }]}
        >
          <View style={{ flex: 1, gap: 17, zIndex: 1 }}>
            <View style={shared.row}>
              <Text style={s.tag}>YOUR NEXT LEVEL</Text>
              <Text style={{ color: "#B9D1FF", fontSize: 12 }}>
                A few minutes. A sharper instinct.
              </Text>
            </View>
            <Text style={s.heroTitle}>
              {data.active || data.counting
                ? "Your table is waiting."
                : "Make your\nnext move count."}
            </Text>
            <Body style={{ color: "#CBDCFF", maxWidth: 400 }}>
              Know your move. Understand the why. Turn every decision into
              something you can use.
            </Body>
            <View style={{ alignSelf: "flex-start", marginTop: 8 }}>
              <Button
                label={
                  data.active || data.counting
                    ? "Continue training  →"
                    : "Start a quick session  →"
                }
                onPress={() => {
                  if (!data.active && !data.counting)
                    update((d) => ({
                      ...d,
                      active: newTraining(d, { target: 10 }),
                    }));
                  router.push("/practice");
                }}
              />
            </View>
          </View>
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[
              s.heroArt,
              { width: wide ? 270 : "100%", height: wide ? 220 : 155 },
            ]}
          >
            <View style={[s.ring, { width: 220, height: 220 }]} />
            <View style={[s.ring, { width: 180, height: 180 }]} />
            <View
              style={{
                transform: [{ rotate: "-18deg" }, { translateX: 22 }],
                marginTop: 26,
              }}
            >
              <PlayingCard card={{ ...makeCard("A", "home-ace"), suit: "♠" }} />
            </View>
            <View
              style={{
                transform: [{ rotate: "12deg" }, { translateX: -8 }],
                marginTop: -15,
              }}
            >
              <PlayingCard
                card={{ ...makeCard("K", "home-king"), suit: "♥" }}
              />
            </View>
            <View style={s.chip}>
              <Text
                style={{ color: colors.gold, fontSize: 12, fontWeight: "700" }}
              >
                21
              </Text>
            </View>
          </View>
        </LinearGradient>
      </Reveal>
      <View style={s.milestone}>
        <View style={s.milestoneIcon}>
          <Ionicons
            name="ribbon-outline"
            size={24}
            color={completed === 10 ? colors.red : colors.blue}
          />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 8 }}>
          <View style={shared.between}>
            <Text
              style={{ color: colors.text, fontSize: 14, fontWeight: "700" }}
            >
              {completed === 10
                ? "Learning path complete"
                : "Build your blackjack instinct"}
            </Text>
            <Text style={{ color: colors.blue, fontSize: 12 }}>
              {completed}/10 lessons
            </Text>
          </View>
          <View
            accessibilityRole="progressbar"
            accessibilityLabel="Learning path"
            accessibilityValue={{ min: 0, max: 10, now: completed }}
            style={s.segments}
          >
            {Array.from({ length: 10 }, (_, index) => (
              <View
                key={index}
                style={[
                  s.segment,
                  index < completed && {
                    backgroundColor: index === 9 ? colors.red : colors.blue,
                  },
                ]}
              />
            ))}
          </View>
        </View>
      </View>
      <Panel>
        <View style={shared.row}>
          <Stat
            label="Decision accuracy"
            value={stats.count ? percent(stats.accuracy) : "—"}
            detail={`${stats.count} first attempts`}
          />
          <Stat
            label="Sessions completed"
            value={String(data.sessions.length)}
          />
          <Stat label="Lessons learned" value={`${completed}/10`} />
          <Stat
            label="Typical decision"
            value={stats.count ? `${(stats.medianMs / 1000).toFixed(1)}s` : "—"}
          />
        </View>
      </Panel>
      <View style={shared.between}>
        <Heading>Find your focus</Heading>
        <Text style={{ color: colors.muted, fontSize: 13 }}>
          Small steps. Lasting skill.
        </Text>
      </View>
      <View style={[shared.row, { alignItems: "stretch" }]}>
        {[
          {
            icon: "cash-outline" as const,
            title: "Casino table",
            description:
              "Bet virtual money and play complete rounds. No quizzes, just blackjack.",
            tag: "TAKE A SEAT",
            accent: colors.red,
            action: () => go("casino"),
          },
          {
            icon: "layers-outline" as const,
            title: "Basic strategy",
            description:
              "Make the right call on hard hands, soft hands, and pairs.",
            tag: "BUILD YOUR FOUNDATION",
            accent: colors.blue,
            action: () => go("mixed"),
          },
          {
            icon: "calculator-outline" as const,
            title: "Card counting",
            description: "Find your rhythm with Hi-Lo and true-count drills.",
            tag: "TRAIN YOUR ATTENTION",
            accent: colors.blue,
            action: () => go("count"),
          },
          {
            icon: "diamond-outline" as const,
            title: "The practice table",
            description: "Bring it all together in a continuous six-deck shoe.",
            tag: "PUT IT INTO PRACTICE",
            accent: colors.red,
            action: () => go("simulator"),
          },
        ].map((item) => (
          <Pressable
            key={item.title}
            onPress={item.action}
            accessibilityRole="button"
            accessibilityLabel={item.title}
            style={({ pressed }) => [
              s.focus,
              {
                minWidth: wide ? 220 : 260,
                opacity: pressed ? 0.75 : 1,
                borderTopColor: item.accent,
                borderTopWidth: 2,
              },
            ]}
          >
            <View
              style={[
                s.iconBox,
                {
                  backgroundColor:
                    item.accent === colors.red
                      ? colors.redSoft
                      : colors.accentSoft,
                },
              ]}
            >
              <Ionicons name={item.icon} size={24} color={item.accent} />
            </View>
            <Eyebrow>{item.tag}</Eyebrow>
            <Heading>{item.title}</Heading>
            <Body>{item.description}</Body>
            <Text
              style={{
                color: item.accent,
                fontSize: 20,
                alignSelf: "flex-end",
              }}
            >
              ↗
            </Text>
          </Pressable>
        ))}
      </View>
      <Panel style={{ backgroundColor: colors.surface }}>
        <View style={shared.between}>
          <View style={{ flex: 1, minWidth: 200, gap: 7 }}>
            <Eyebrow>
              {weak ? "RECOMMENDED FOR YOU" : "KEEP BUILDING YOUR SKILLS"}
            </Eyebrow>
            <Heading>
              {weak
                ? `Give ${weak} hands another look.`
                : "The best move has a reason."}
            </Heading>
            <Body>
              {weak
                ? "Your recent answers suggest a focused refresher. A few fresh situations will help it stick."
                : "Start with a short lesson, then put it into practice at your own pace."}
            </Body>
          </View>
          <Button
            label={weak ? "Practice my weak spots" : "Explore the lessons"}
            variant="secondary"
            onPress={() => (weak ? go("adaptive") : router.push("/learn"))}
          />
        </View>
      </Panel>
      <Text style={s.footer}>LEARN THE STRATEGY. TRUST THE PROCESS.</Text>
    </Page>
  );
}
const s = StyleSheet.create({
  hero: {
    padding: 28,
    borderRadius: 24,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.accentBorder,
    alignItems: "center",
    gap: 12,
  },
  tag: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.4,
    color: "#E0EBFF",
    borderWidth: 1,
    borderColor: "#648AC3",
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  heroTitle: {
    fontSize: 33,
    lineHeight: 40,
    fontWeight: "600",
    color: colors.text,
    letterSpacing: -0.9,
  },
  heroArt: {
    justifyContent: "center",
    alignItems: "center",
    flexDirection: "row",
  },
  ring: {
    position: "absolute",
    borderRadius: 120,
    borderWidth: 1,
    borderColor: "#82AAEF44",
  },
  chip: {
    width: 47,
    height: 47,
    borderWidth: 4,
    borderStyle: "dashed",
    borderColor: colors.gold,
    borderRadius: 25,
    backgroundColor: colors.redSoft,
    position: "absolute",
    bottom: 4,
    right: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  focus: {
    flex: 1,
    padding: 23,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 14,
  },
  iconBox: {
    width: 46,
    height: 46,
    backgroundColor: colors.accentSoft,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  footer: {
    textAlign: "center",
    fontSize: 10,
    letterSpacing: 2,
    color: colors.muted,
    paddingVertical: 10,
  },
  milestone: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 18,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  milestoneIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accentSoft,
  },
  segments: { flexDirection: "row", gap: 4, width: "100%" },
  segment: {
    flex: 1,
    height: 6,
    borderRadius: 4,
    backgroundColor: colors.surface2,
  },
});
