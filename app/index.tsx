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
  const weak = weakTopics(data.sessions)[0] || "hard";
  const completed = Object.keys(data.completedLessons).length;
  const go = (topic: string) =>
    router.push({ pathname: "/practice", params: { topic } });
  return (
    <Page>
      <View style={shared.between}>
        <View style={{ gap: 7, flex: 1, minWidth: 220 }}>
          <Eyebrow>YOUR NEXT GOOD DECISION STARTS HERE</Eyebrow>
          <Title>A little practice.{"\n"}A sharper instinct.</Title>
        </View>
        <Chip label="●  All progress saved on device" />
      </View>
      {storageError && (
        <Panel>
          <Body style={{ color: colors.red }}>{storageError}</Body>
        </Panel>
      )}
      {!data.onboarding && (
        <Panel style={{ borderColor: "#426959" }}>
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
      <LinearGradient
        colors={["#1A4B42", "#153A35", "#12292D"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[s.hero, { flexDirection: wide ? "row" : "column" }]}
      >
        <View style={{ flex: 1, gap: 17, zIndex: 1 }}>
          <View style={shared.row}>
            <Text style={s.tag}>THE DAILY PRACTICE</Text>
            <Text style={{ color: "#ABD0C1", fontSize: 12 }}>
              5 minutes, well spent
            </Text>
          </View>
          <Text style={s.heroTitle}>
            {data.active || data.counting
              ? "Your table is waiting."
              : "Build confidence,\none hand at a time."}
          </Text>
          <Body style={{ color: "#C0D9CD", maxWidth: 400 }}>
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
            <PlayingCard card={makeCard("A")} />
          </View>
          <View
            style={{
              transform: [{ rotate: "12deg" }, { translateX: -8 }],
              marginTop: -15,
            }}
          >
            <PlayingCard card={makeCard("K")} />
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
            icon: "layers-outline" as const,
            title: "Basic strategy",
            description:
              "Make the right call on hard hands, soft hands, and pairs.",
            tag: "BUILD YOUR FOUNDATION",
            action: () => go("mixed"),
          },
          {
            icon: "calculator-outline" as const,
            title: "Card counting",
            description: "Find your rhythm with Hi-Lo and true-count drills.",
            tag: "TRAIN YOUR ATTENTION",
            action: () => go("count"),
          },
          {
            icon: "diamond-outline" as const,
            title: "The practice table",
            description: "Bring it all together in a continuous six-deck shoe.",
            tag: "PUT IT INTO PRACTICE",
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
              { minWidth: wide ? 220 : 260, opacity: pressed ? 0.75 : 1 },
            ]}
          >
            <View style={s.iconBox}>
              <Ionicons name={item.icon} size={24} color={colors.green} />
            </View>
            <Eyebrow>{item.tag}</Eyebrow>
            <Heading>{item.title}</Heading>
            <Body>{item.description}</Body>
            <Text
              style={{
                color: colors.green,
                fontSize: 20,
                alignSelf: "flex-end",
              }}
            >
              ↗
            </Text>
          </Pressable>
        ))}
      </View>
      <Panel style={{ backgroundColor: "#15282C" }}>
        <View style={shared.between}>
          <View style={{ flex: 1, minWidth: 200, gap: 7 }}>
            <Eyebrow>
              {stats.count ? "RECOMMENDED FOR YOU" : "A GOOD PLACE TO BEGIN"}
            </Eyebrow>
            <Heading>
              {stats.count
                ? `Give ${weak} hands another look.`
                : "The best move has a reason."}
            </Heading>
            <Body>
              {stats.count
                ? "Your recent answers suggest a focused refresher. A few fresh situations will help it stick."
                : "Start with a short lesson, then put it into practice at your own pace."}
            </Body>
          </View>
          <Button
            label={
              stats.count ? "Practice my weak spots" : "Explore the lessons"
            }
            variant="secondary"
            onPress={() =>
              stats.count ? go("adaptive") : router.push("/learn")
            }
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
    borderColor: "#356155",
    alignItems: "center",
    gap: 12,
  },
  tag: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.4,
    color: "#D0EBDF",
    borderWidth: 1,
    borderColor: "#5C8B76",
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
    borderColor: "#54877655",
  },
  chip: {
    width: 47,
    height: 47,
    borderWidth: 4,
    borderStyle: "dashed",
    borderColor: colors.gold,
    borderRadius: 25,
    backgroundColor: "#305649",
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
    backgroundColor: "#203F37",
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  footer: {
    textAlign: "center",
    fontSize: 10,
    letterSpacing: 2,
    color: "#69858A",
    paddingVertical: 10,
  },
});
