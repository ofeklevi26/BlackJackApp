import React, { useEffect, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useAudioPlayer } from "expo-audio";
import * as Haptics from "expo-haptics";
import {
  decksRemaining,
  handValue,
  shoeDeckCount,
  SHOE_DECK_COUNTS,
  trueCount,
  type Action,
  type Card,
  type ShoeDeckCount,
} from "../engine";
import { Body, Button as SharedButton, DetailSheet, PlayingCard } from "../ui";
import { colors } from "../ui/theme";
import { useStore } from "../state/store";
import {
  CASINO_CHIPS,
  CASINO_MAX_BET,
  CASINO_MIN_BET,
  CASINO_REFILL,
  casinoAct,
  casinoAddChip,
  casinoAvailable,
  casinoCanDeal,
  casinoCanInsure,
  casinoCanRefill,
  casinoCommitted,
  casinoDeal,
  casinoInsurance,
  casinoLegalActions,
  casinoMoney,
  casinoNet,
  casinoNewSession,
  casinoRefill,
  casinoRepeatBet,
  casinoRoundActive,
  casinoRoundLabel,
  casinoSetBet,
  createCasino,
  type CasinoState,
} from "../state/casino";

const ACTIONS: { action: Action; label: string }[] = [
  { action: "hit", label: "Hit" },
  { action: "stand", label: "Stand" },
  { action: "double", label: "Double" },
  { action: "split", label: "Split" },
  { action: "surrender", label: "Surrender" },
];
const signedMoney = (value: number) =>
  `${value > 0 ? "+" : value < 0 ? "−" : ""}${casinoMoney(Math.abs(value))}`;

function Button(props: React.ComponentProps<typeof SharedButton>) {
  return (
    <SharedButton
      {...props}
      style={[
        { minHeight: 44, paddingVertical: 9, paddingHorizontal: 12 },
        props.style,
      ]}
    />
  );
}
function CasinoCard({
  card,
  hidden,
  compact,
  small,
}: {
  card?: Card;
  hidden?: boolean;
  compact: boolean;
  small?: boolean;
}) {
  if (!compact)
    return <PlayingCard card={card} hidden={hidden} small={small} />;
  const suit =
    card?.suit === "♥"
      ? "hearts"
      : card?.suit === "♦"
        ? "diamonds"
        : card?.suit === "♠"
          ? "spades"
          : "clubs";
  const color =
    card?.suit === "♥" || card?.suit === "♦" ? "#B3444C" : "#153A36";
  return (
    <View
      accessible
      accessibilityLabel={hidden ? "Face down card" : `${card?.rank} ${suit}`}
      style={[s.compactCard, hidden && s.compactCardBack]}
    >
      {hidden ? (
        <Text style={{ color: colors.green, fontSize: 27 }}>♠</Text>
      ) : (
        <>
          <Text
            style={{
              color,
              fontWeight: "700",
              fontSize: 13,
              alignSelf: "flex-start",
            }}
          >
            {card?.rank}
          </Text>
          <Text style={{ color, fontSize: 24, lineHeight: 26 }}>
            {card?.suit}
          </Text>
        </>
      )}
    </View>
  );
}

function CompactSingleRound({ table }: { table: CasinoState }) {
  const round = table.shoe.round!;
  const hand = round.hands[0];
  const playerValue = handValue(hand.cards);
  const dealerValue = handValue(round.dealer);
  const settled = round.phase === "complete";
  const resultColor =
    settled && round.profit > 0
      ? colors.green
      : settled && round.profit < 0
        ? colors.gold
        : colors.text;
  return (
    <>
      <View style={s.compactSides}>
        <View style={s.compactSeat}>
          <Text style={s.label}>DEALER</Text>
          <View style={[s.cards, { gap: 4 }]}>
            {round.dealer.map((card, index) => (
              <View
                key={card.id}
                style={
                  index > 0 && round.dealer.length > 2
                    ? {
                        marginLeft: Math.max(
                          -31,
                          76 / (round.dealer.length - 1) - 48,
                        ),
                      }
                    : undefined
                }
              >
                <CasinoCard
                  card={card}
                  compact
                  hidden={index > 0 && !round.dealerRevealed}
                />
              </View>
            ))}
          </View>
          <Text style={s.total}>
            {round.dealerRevealed
              ? dealerValue.total > 21
                ? `${dealerValue.total} · bust`
                : dealerValue.blackjack
                  ? "Blackjack"
                  : dealerValue.total
              : "Hole card down"}
          </Text>
        </View>
        <View
          style={[s.compactSeat, round.phase === "playing" && s.activeHand]}
        >
          <View style={s.handHeader}>
            <Text style={s.handLabel}>YOUR HAND</Text>
            <Text style={s.betLabel}>{casinoMoney(hand.bet)}</Text>
          </View>
          <View style={[s.cards, { gap: 4 }]}>
            {hand.cards.map((card, index) => (
              <View
                key={card.id}
                style={
                  index > 0 && hand.cards.length > 2
                    ? {
                        marginLeft: Math.max(
                          -31,
                          76 / (hand.cards.length - 1) - 48,
                        ),
                      }
                    : undefined
                }
              >
                <CasinoCard card={card} compact />
              </View>
            ))}
          </View>
          <Text style={s.total}>
            {playerValue.total}
            {playerValue.total > 21
              ? " · bust"
              : playerValue.soft
                ? " · soft"
                : ""}
          </Text>
        </View>
      </View>
      <View style={s.compactOutcome} accessibilityLiveRegion="polite">
        <Text style={[s.roundTitle, { color: resultColor, fontSize: 17 }]}>
          {casinoRoundLabel(table)}
        </Text>
        {settled && (
          <Text style={[s.resultAmount, { color: resultColor, fontSize: 19 }]}>
            {signedMoney(round.profit)}
          </Text>
        )}
      </View>
    </>
  );
}

/** A separate persistent virtual table: no training decisions or learning metrics are recorded. */
export default function CasinoScreen({ onExit }: { onExit: () => void }) {
  const { data, update, storageError } = useStore();
  const [showRules, setShowRules] = useState(false);
  const [selectedDecks, setSelectedDecks] = useState<ShoeDeckCount>(6);
  const [shoeNotice, setShoeNotice] = useState("");
  const [revealedCountKey, setRevealedCountKey] = useState<string | null>(null);
  const previousShoe = useRef<{ id: string; number: number } | null>(null);
  const { height, width, fontScale } = useWindowDimensions();
  const compact = height < 740 && fontScale <= 1.2;
  const sideBySide =
    compact || (width < 600 && height < 940 && fontScale <= 1.2);
  const smallCards = height < 940 || width < 600;
  const player = useAudioPlayer(require("../../assets/card.wav"));
  const table = data.casino;
  const needsTable = !table;
  useEffect(() => {
    if (needsTable)
      update((previous) =>
        previous.casino
          ? previous
          : { ...previous, casino: createCasino(previous.settings.rules) },
      );
  }, [update, needsTable]);

  useEffect(() => {
    if (!table) return;
    const previous = previousShoe.current;
    if (previous && previous.id !== table.id)
      setShoeNotice("Fresh session · new shoe and $1,000 in virtual chips");
    else if (previous && table.shoe.shuffleNumber > previous.number)
      setShoeNotice(`Fresh shuffle · shoe ${table.shoe.shuffleNumber}`);
    previousShoe.current = { id: table.id, number: table.shoe.shuffleNumber };
  }, [table?.id, table?.shoe.shuffleNumber]);

  function change(
    transition: (value: CasinoState) => CasinoState,
    feedback = false,
  ) {
    update((previous) => {
      if (!previous.casino) return previous;
      const next = transition(previous.casino);
      return next === previous.casino
        ? previous
        : { ...previous, casino: next };
    });
    if (feedback && data.settings.haptics)
      void Haptics.selectionAsync().catch(() => {});
    if (feedback && data.settings.sound) {
      void Promise.resolve(player.seekTo(0))
        .then(() => player.play())
        .catch(() => {});
    }
  }
  if (!table)
    return (
      <View style={s.loading}>
        <Body>Preparing your table…</Body>
      </View>
    );
  const round = table.shoe.round;
  const active = casinoRoundActive(table);
  const settled = round?.phase === "complete";
  const available = casinoAvailable(table);
  const committed = casinoCommitted(table);
  const legal = casinoLegalActions(table);
  const revision = table.revision;
  const deckCount = shoeDeckCount(table.shoe);
  const totalCards = table.shoe.cards.length;
  const remainingCards = Math.max(0, totalCards - table.shoe.nextCard);
  const remainingDecks = Math.round((remainingCards / 52) * 2) / 2;
  // Reveal belongs to this round only; do not persist it with the saved table.
  const countKey = `${table.id}:${table.shoe.shuffleNumber}:${round?.id ?? "ready"}`;
  const countRevealed = revealedCountKey === countKey;
  const exactDecksRemaining = decksRemaining(table.shoe);
  const currentTrueCount =
    exactDecksRemaining > 0
      ? trueCount(table.shoe.runningCount, exactDecksRemaining)
      : null;
  const countLabel = (value: number | null) =>
    value === null ? "—" : value > 0 ? `+${value}` : `${value}`;
  const dealtPercent = Math.min(100, (table.shoe.nextCard / totalCards) * 100);
  const activeBet = round?.hands[round.activeHand]?.bet ?? 0;
  const resultColor =
    !settled || round.profit === 0
      ? colors.text
      : round.profit > 0
        ? colors.green
        : colors.gold;

  return (
    <View style={s.screen}>
      <View style={[s.header, compact && { paddingTop: 4 }]}>
        <View style={{ flex: 1, minWidth: 150, flexShrink: 1 }}>
          <Text style={s.eyebrow}>VIRTUAL BLACKJACK</Text>
          <Text accessibilityRole="header" style={s.title}>
            The casino table
          </Text>
        </View>
        <View style={s.headerActions}>
          <Button
            label="Table"
            variant="ghost"
            onPress={() => {
              setSelectedDecks(deckCount);
              setShowRules(true);
            }}
          />
          <Button label="Exit" variant="ghost" onPress={onExit} />
        </View>
      </View>
      <View style={[s.wallet, compact && { paddingVertical: 4 }]}>
        <View style={{ minWidth: 0, flexShrink: 1 }}>
          <Text style={s.small}>Available</Text>
          <Text
            accessibilityLabel={`Available virtual balance ${casinoMoney(available)}`}
            style={[s.balance, compact && { fontSize: 24 }]}
          >
            {casinoMoney(available)}
          </Text>
        </View>
        <View style={s.walletRight}>
          <Text style={s.small}>
            On the table{" "}
            <Text style={s.walletValue}>{casinoMoney(committed)}</Text>
          </Text>
          <Text style={s.small}>
            Balance{" "}
            <Text style={s.walletValue}>
              {casinoMoney(table.shoe.bankroll)}
            </Text>
          </Text>
        </View>
      </View>
      <ScrollView
        style={{ flex: 1, minHeight: 0 }}
        contentContainerStyle={s.tableScroll}
        keyboardShouldPersistTaps="handled"
      >
        <View
          style={[
            s.felt,
            smallCards && { gap: 8, paddingVertical: 12 },
            compact && { gap: 6, paddingVertical: 7 },
          ]}
        >
          <View style={s.feltLine} pointerEvents="none" />
          {sideBySide && round?.hands.length === 1 ? (
            <CompactSingleRound table={table} />
          ) : (
            <>
              <View style={s.dealerTitle}>
                <Text style={s.label}>DEALER</Text>
                {round?.dealerRevealed && (
                  <Text style={s.total}>
                    {handValue(round.dealer).total > 21
                      ? "Bust"
                      : handValue(round.dealer).blackjack
                        ? "Blackjack"
                        : handValue(round.dealer).total}
                  </Text>
                )}
              </View>
              <View style={s.cards}>
                {round ? (
                  round.dealer.map((card, index) => (
                    <CasinoCard
                      key={card.id}
                      card={card}
                      compact={compact}
                      hidden={index > 0 && !round.dealerRevealed}
                      small={smallCards || round.dealer.length > 3}
                    />
                  ))
                ) : (
                  <>
                    <CasinoCard hidden compact={compact} small={smallCards} />
                    <CasinoCard hidden compact={compact} small={smallCards} />
                  </>
                )}
              </View>
              <View
                style={[
                  s.tableMessage,
                  compact &&
                    settled && {
                      flexDirection: "row",
                      gap: 9,
                      marginVertical: 0,
                    },
                ]}
                accessibilityLiveRegion="polite"
              >
                <Text style={[s.roundTitle, { color: resultColor }]}>
                  {casinoRoundLabel(table)}
                </Text>
                {settled && (
                  <Text
                    style={[
                      s.resultAmount,
                      { color: resultColor },
                      compact && { fontSize: 20 },
                    ]}
                  >
                    {signedMoney(round.profit)}
                  </Text>
                )}
                {!round && (
                  <Text style={s.feltCaption}>
                    BLACKJACK PAYS 3:2 · DEALER{" "}
                    {table.shoe.rules.hitSoft17 ? "HITS" : "STANDS ON"} SOFT 17
                  </Text>
                )}
              </View>
              {round ? (
                <View style={s.hands}>
                  {round.hands.map((hand, index) => {
                    const value = handValue(hand.cards);
                    const playing =
                      round.phase === "playing" && index === round.activeHand;
                    const status =
                      hand.result === "blackjack"
                        ? "Blackjack"
                        : hand.result === "win"
                          ? "Win"
                          : hand.result === "loss"
                            ? "Loss"
                            : hand.result === "push"
                              ? "Push"
                              : hand.result === "surrender"
                                ? "Surrendered"
                                : hand.status === "bust"
                                  ? "Bust"
                                  : hand.status === "stood"
                                    ? "Stood"
                                    : playing
                                      ? "Playing"
                                      : round.phase === "insurance"
                                        ? "Your hand"
                                        : "Waiting";
                    return (
                      <View
                        key={hand.id}
                        style={[
                          s.hand,
                          compact && { padding: 6, gap: 4 },
                          playing && s.activeHand,
                          round.hands.length === 1 && s.singleHand,
                        ]}
                      >
                        <View style={s.handHeader}>
                          <Text
                            style={[
                              s.handLabel,
                              playing && { color: colors.green },
                            ]}
                          >
                            {round.hands.length > 1
                              ? `HAND ${index + 1}`
                              : "YOUR HAND"}
                            {playing ? " · ACTIVE" : ""}
                          </Text>
                          <Text style={s.betLabel}>
                            {casinoMoney(hand.bet)}
                          </Text>
                        </View>
                        <View style={s.cards}>
                          {hand.cards.map((card) => (
                            <CasinoCard
                              key={card.id}
                              card={card}
                              compact={compact}
                              small={
                                smallCards ||
                                round.hands.length > 1 ||
                                hand.cards.length > 3
                              }
                            />
                          ))}
                        </View>
                        <View style={s.handFooter}>
                          <Text style={s.total}>
                            {value.total > 21
                              ? `${value.total} · bust`
                              : `${value.total}${value.soft ? " · soft" : ""}`}
                          </Text>
                          <Text
                            style={[
                              s.handStatus,
                              hand.profit && hand.profit > 0
                                ? { color: colors.green }
                                : undefined,
                            ]}
                          >
                            {status}
                            {hand.profit !== undefined
                              ? ` · ${signedMoney(hand.profit)}`
                              : ""}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              ) : !compact ? (
                <View style={s.emptyBet}>
                  <Text style={s.emptyBetMark}>♠</Text>
                  <Text style={s.feltCaption}>YOUR SEAT IS READY</Text>
                </View>
              ) : null}
            </>
          )}
          {!!round?.insuranceBet && (
            <Text style={s.insuranceResult}>
              Insurance {casinoMoney(round.insuranceBet)}
              {round.phase !== "insurance"
                ? ` · ${signedMoney(round.insuranceProfit)}`
                : ""}
            </Text>
          )}
        </View>
        <View style={s.shoeMeter}>
          <View style={s.shoeInfoRow}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[s.caption, { textAlign: "left" }]}>
                {deckCount}-deck shoe · #{table.shoe.shuffleNumber}
              </Text>
              <Text style={[s.caption, { textAlign: "left" }]}>
                About {remainingDecks} {remainingDecks === 1 ? "deck" : "decks"}{" "}
                left
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                countRevealed
                  ? `Hide counts. Running count ${table.shoe.runningCount}. True count ${currentTrueCount ?? "unavailable"}.`
                  : "Show running count and true count"
              }
              accessibilityState={{ expanded: countRevealed }}
              onPress={() =>
                setRevealedCountKey(countRevealed ? null : countKey)
              }
              style={({ pressed }) => [
                s.countPeek,
                countRevealed && { borderColor: colors.green },
                { opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Text style={s.countValue}>
                {countRevealed
                  ? `Running ${countLabel(table.shoe.runningCount)} · True ${countLabel(currentTrueCount)}`
                  : "Running ••• · True •••"}
              </Text>
              <Text style={s.caption}>
                {countRevealed ? "Tap to hide counts" : "Tap to reveal counts"}
              </Text>
            </Pressable>
          </View>
          <View
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel={`Cards dealt from the ${deckCount}-deck shoe`}
            accessibilityValue={{
              min: 0,
              max: totalCards,
              now: table.shoe.nextCard,
              text: `${table.shoe.nextCard} dealt; ${remainingCards} of ${totalCards} cards remain`,
            }}
            style={s.shoeTrack}
          >
            <View style={[s.shoeFill, { width: `${dealtPercent}%` }]} />
          </View>
          {!!shoeNotice && (
            <Text
              accessibilityLiveRegion="polite"
              style={[s.caption, { color: colors.green }]}
            >
              {shoeNotice}
            </Text>
          )}
        </View>
        {storageError && (
          <Text accessibilityLiveRegion="polite" style={s.storageWarning}>
            {storageError}
          </Text>
        )}
      </ScrollView>
      <View
        style={[
          s.controls,
          compact && { paddingTop: 7, paddingBottom: 8, gap: 6 },
        ]}
      >
        {round?.phase === "insurance" ? (
          <>
            <View style={s.controlHeading}>
              <Text style={s.controlTitle}>Insurance</Text>
              <Text style={s.small}>
                Optional {casinoMoney(round.hands[0].bet / 2)} · pays 2:1
              </Text>
            </View>
            <View style={s.actionRow}>
              <Button
                label="No insurance"
                onPress={() =>
                  change(
                    (value) => casinoInsurance(value, false, revision),
                    true,
                  )
                }
                style={{ flex: 1 }}
              />
              <Button
                label={`Insure ${casinoMoney(round.hands[0].bet / 2)}`}
                variant="secondary"
                disabled={!casinoCanInsure(table)}
                onPress={() =>
                  change(
                    (value) => casinoInsurance(value, true, revision),
                    true,
                  )
                }
                style={{ flex: 1 }}
              />
            </View>
            {!casinoCanInsure(table) && (
              <Text style={s.caption}>
                Your available balance does not cover insurance.
              </Text>
            )}
          </>
        ) : active ? (
          <>
            <View style={s.controlHeading}>
              <Text style={s.controlTitle}>
                {round!.hands.length > 1
                  ? `Playing hand ${round!.activeHand + 1}`
                  : "Your move"}
              </Text>
              <Text style={s.small}>Bet {casinoMoney(activeBet)}</Text>
            </View>
            <View style={s.actionRow}>
              {ACTIONS.slice(0, 2).map((item) => (
                <Button
                  key={item.action}
                  label={item.label}
                  disabled={!legal.includes(item.action)}
                  variant={item.action === "hit" ? "primary" : "secondary"}
                  onPress={() =>
                    change(
                      (value) => casinoAct(value, item.action, revision),
                      true,
                    )
                  }
                  style={{ flex: 1 }}
                />
              ))}
            </View>
            <View style={s.actionRow}>
              {ACTIONS.slice(2).map((item) => (
                <Button
                  key={item.action}
                  label={item.label}
                  disabled={!legal.includes(item.action)}
                  variant="secondary"
                  onPress={() =>
                    change(
                      (value) => casinoAct(value, item.action, revision),
                      true,
                    )
                  }
                  style={{ flex: 1, paddingHorizontal: 8 }}
                />
              ))}
            </View>
            {available < activeBet &&
              round!.hands[round!.activeHand].cards.length === 2 && (
                <Text style={s.caption}>
                  Double and split need {casinoMoney(activeBet)} in available
                  chips.
                </Text>
              )}
          </>
        ) : (
          <>
            <View style={s.controlHeading}>
              <View style={s.betHeading}>
                <Text style={s.small}>Your wager</Text>
                <Text style={s.wager}>{casinoMoney(table.selectedBet)}</Text>
              </View>
              <View style={s.headerActions}>
                <Button
                  label="Clear"
                  variant="ghost"
                  disabled={table.selectedBet === 0}
                  onPress={() => change((value) => casinoSetBet(value, 0))}
                />
                <Button
                  label="Repeat bet"
                  variant="ghost"
                  disabled={
                    table.lastBet > available ||
                    table.selectedBet === table.lastBet
                  }
                  onPress={() => change(casinoRepeatBet)}
                />
              </View>
            </View>
            <View style={s.chips}>
              {CASINO_CHIPS.map((chip, index) => {
                const disabled =
                  table.selectedBet + chip >
                  Math.min(CASINO_MAX_BET, available);
                return (
                  <Pressable
                    key={chip}
                    accessibilityRole="button"
                    accessibilityLabel={`Add ${casinoMoney(chip)} virtual chips`}
                    accessibilityState={{ disabled }}
                    disabled={disabled}
                    onPress={() =>
                      change((value) => casinoAddChip(value, chip), true)
                    }
                    style={({ pressed }) => [
                      s.chip,
                      compact && { width: 40, height: 40, borderRadius: 20 },
                      {
                        borderColor: [
                          colors.text,
                          colors.green,
                          colors.gold,
                          "#96ADD9",
                          "#B597C4",
                        ][index],
                        opacity: disabled ? 0.35 : pressed ? 0.7 : 1,
                      },
                    ]}
                  >
                    <Text style={s.chipValue}>{casinoMoney(chip)}</Text>
                  </Pressable>
                );
              })}
            </View>
            {casinoCanRefill(table) ? (
              <Button
                label={`Add ${casinoMoney(CASINO_REFILL)} virtual chips`}
                onPress={() =>
                  change((value) => casinoRefill(value, revision), true)
                }
              />
            ) : (
              <Button
                label={
                  casinoCanDeal(table)
                    ? `${settled ? "Deal next hand" : "Deal"} · ${casinoMoney(table.selectedBet)}`
                    : table.selectedBet > available
                      ? "Lower your wager to continue"
                      : "Choose your chips to deal"
                }
                disabled={!casinoCanDeal(table)}
                onPress={() => {
                  setShoeNotice("");
                  change((value) => casinoDeal(value, revision), true);
                }}
              />
            )}
          </>
        )}
      </View>
      <DetailSheet
        visible={showRules}
        title="Your table"
        reducedMotion={data.settings.reducedMotion}
        onClose={() => setShowRules(false)}
      >
        <View style={s.sessionPanel}>
          <Text accessibilityRole="header" style={s.controlTitle}>
            Shoe & new session
          </Text>
          <Body>Choose how many decks go into your next fresh session.</Body>
          <View style={s.deckOptions}>
            {SHOE_DECK_COUNTS.map((decks) => (
              <Pressable
                key={decks}
                accessibilityRole="button"
                accessibilityLabel={`${decks} ${decks === 1 ? "deck" : "decks"} for a fresh session`}
                accessibilityState={{ selected: selectedDecks === decks }}
                onPress={() => setSelectedDecks(decks)}
                style={({ pressed }) => [
                  s.deckOption,
                  selectedDecks === decks && s.deckSelected,
                  { opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <Text
                  style={[
                    s.deckNumber,
                    selectedDecks === decks && { color: colors.green },
                  ]}
                >
                  {decks}
                </Text>
                <Text style={s.caption}>{decks === 1 ? "deck" : "decks"}</Text>
              </Pressable>
            ))}
          </View>
          <Body>
            Start with a freshly shuffled shoe and {casinoMoney(CASINO_REFILL)}{" "}
            in virtual chips. The count, discard tray, completed rounds, and
            table net return to zero. Your table rules stay the same.
          </Body>
          {active && (
            <Text style={{ color: colors.gold, fontSize: 14, lineHeight: 20 }}>
              Finish the current hand first. Your wagers stay on the table until
              it settles.
            </Text>
          )}
          <Button
            label="Start fresh session"
            disabled={active}
            onPress={() => {
              const expectedId = table.id;
              const expectedRevision = revision;
              const decks = selectedDecks;
              const now = Date.now();
              const seed = Math.floor(Math.random() * 0x7fffffff);
              change(
                (value) =>
                  value.id !== expectedId
                    ? value
                    : casinoNewSession(
                        value,
                        decks,
                        expectedRevision,
                        seed,
                        now,
                      ),
                true,
              );
              setShowRules(false);
            }}
          />
        </View>
        <Text accessibilityRole="header" style={s.controlTitle}>
          Current shoe
        </Text>
        <Body>
          {deckCount} {deckCount === 1 ? "deck" : "decks"} · shoe{" "}
          {table.shoe.shuffleNumber} · {table.shoe.nextCard} cards dealt ·{" "}
          {remainingCards} of {totalCards} cards remaining.
        </Body>
        <Body>
          The table shuffles between rounds at the 75% cut card, or earlier when
          too few cards remain to safely finish a full round. The shoe number
          increases after each automatic shuffle. Small shoes can reach the
          safety limit sooner.
        </Body>
        <Text accessibilityRole="header" style={s.controlTitle}>
          Table rules
        </Text>
        <Body>
          Tap the hidden counts beside the shoe meter whenever you want to check
          yourself. Running count includes all exposed cards since the shuffle,
          never the dealer’s face-down card. True count divides by the exact
          undealt decks and rounds down, including negative values. Counts
          update while revealed and hide again for each new round.
        </Body>
        <Body>
          {deckCount} {deckCount === 1 ? "deck" : "decks"} · blackjack pays 3:2
          · dealer {table.shoe.rules.hitSoft17 ? "hits" : "stands on"} soft 17 ·
          dealer checks for blackjack.
        </Body>
        <Body>
          Double on the first two cards, including after splitting. Split up to
          four hands. Split aces get one extra card each and cannot be resplit.
          A split 21 pays 1:1.
        </Body>
        <Body>
          {table.shoe.rules.surrender
            ? "Late surrender is available on the original two-card hand after the dealer checks."
            : "Surrender is unavailable at this table."}
        </Body>
        <Body>
          Wagers are reserved until the round settles. Available chips exclude
          every hand’s stake and insurance. The balance updates once at
          settlement.
        </Body>
        <Body>
          This table uses virtual money only. There are no purchases, deposits
          of real money, or cashouts. Wagers range from{" "}
          {casinoMoney(CASINO_MIN_BET)} to {casinoMoney(CASINO_MAX_BET)}.
        </Body>
        <View style={s.controlHeading}>
          <Body>Completed rounds {table.shoe.rounds}</Body>
          <Body>Table net {signedMoney(casinoNet(table))}</Body>
        </View>
      </DetailSheet>
    </View>
  );
}

const s = StyleSheet.create({
  shoeMeter: { width: "100%", maxWidth: 920, gap: 3 },
  shoeInfoRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  countPeek: {
    minHeight: 44,
    flexShrink: 1,
    maxWidth: "60%",
    paddingHorizontal: 10,
    paddingVertical: 4,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: colors.surface,
  },
  countValue: {
    color: colors.green,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600",
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
  shoeTrack: {
    height: 3,
    borderRadius: 3,
    backgroundColor: colors.surface2,
    overflow: "hidden",
  },
  shoeFill: { height: 3, backgroundColor: colors.green },
  sessionPanel: {
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    borderRadius: 16,
    gap: 12,
  },
  deckOptions: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  deckOption: {
    flexGrow: 1,
    flexBasis: 42,
    minWidth: 44,
    minHeight: 58,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: colors.surface,
  },
  deckSelected: { borderColor: colors.green, backgroundColor: "#163A34" },
  deckNumber: { color: colors.text, fontSize: 20, fontWeight: "600" },
  screen: { flex: 1, minHeight: 0, backgroundColor: colors.bg },
  compactCard: {
    width: 44,
    height: 60,
    borderRadius: 7,
    paddingHorizontal: 6,
    paddingVertical: 4,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.ivory,
  },
  compactCardBack: {
    borderWidth: 1,
    borderColor: "#68907B",
    backgroundColor: "#1C4943",
  },
  compactSides: {
    flexDirection: "row",
    gap: 8,
    width: "100%",
    alignItems: "flex-start",
  },
  compactSeat: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderColor: "#446C59",
    borderRadius: 12,
    padding: 6,
    gap: 7,
    alignItems: "center",
    backgroundColor: "#082C2670",
  },
  compactOutcome: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    paddingVertical: 2,
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 4,
  },
  headerActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    flexShrink: 1,
    alignItems: "center",
    gap: 0,
  },
  eyebrow: {
    color: colors.green,
    fontSize: 9,
    letterSpacing: 1.5,
    fontWeight: "700",
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "600",
    letterSpacing: -0.5,
  },
  wallet: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 12,
  },
  walletRight: {
    alignItems: "flex-end",
    flexShrink: 1,
    maxWidth: "100%",
    gap: 4,
  },
  walletValue: { color: colors.text, fontWeight: "600" },
  balance: {
    color: colors.text,
    fontSize: 29,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  small: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  tableScroll: {
    paddingHorizontal: 12,
    paddingBottom: 4,
    alignItems: "center",
    gap: 5,
  },
  felt: {
    width: "100%",
    maxWidth: 920,
    backgroundColor: "#103F34",
    borderRadius: 26,
    paddingHorizontal: 12,
    paddingVertical: 15,
    borderWidth: 1,
    borderColor: "#366957",
    gap: 10,
    alignItems: "center",
  },
  feltLine: {
    position: "absolute",
    top: 7,
    bottom: 7,
    left: 7,
    right: 7,
    borderWidth: 1,
    borderColor: "#8EB59D33",
    borderRadius: 21,
  },
  dealerTitle: { flexDirection: "row", alignItems: "center", gap: 10 },
  label: {
    color: "#BFCEC0",
    fontSize: 10,
    letterSpacing: 2,
    fontWeight: "700",
  },
  cards: {
    flexDirection: "row",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: 7,
  },
  tableMessage: { alignItems: "center", gap: 2, marginVertical: 3 },
  roundTitle: {
    color: colors.text,
    fontSize: 19,
    fontWeight: "600",
    textAlign: "center",
  },
  resultAmount: {
    fontSize: 24,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  feltCaption: {
    color: "#A6BBAA",
    fontSize: 9,
    letterSpacing: 1,
    textAlign: "center",
    lineHeight: 15,
  },
  hands: {
    flexDirection: "row",
    flexWrap: "wrap",
    width: "100%",
    gap: 8,
    justifyContent: "center",
  },
  hand: {
    minWidth: 133,
    flexGrow: 1,
    flexBasis: 140,
    padding: 9,
    borderWidth: 1,
    borderColor: "#446C59",
    borderRadius: 13,
    gap: 9,
    backgroundColor: "#082C2670",
  },
  activeHand: { borderColor: colors.green, backgroundColor: "#1D5242" },
  singleHand: { flexGrow: 0, width: "100%", maxWidth: 440, flexBasis: "auto" },
  handHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 5,
    flexWrap: "wrap",
  },
  handLabel: {
    color: "#C5D2C6",
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.6,
  },
  betLabel: { color: colors.gold, fontSize: 13, fontWeight: "700" },
  handFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 6,
    flexWrap: "wrap",
    alignItems: "center",
  },
  total: { color: colors.text, fontSize: 15, fontWeight: "700" },
  handStatus: { color: "#C5D2C6", fontSize: 11, fontWeight: "600" },
  emptyBet: {
    minHeight: 110,
    justifyContent: "center",
    alignItems: "center",
    gap: 7,
  },
  emptyBetMark: { color: "#73A487", fontSize: 54 },
  insuranceResult: { color: colors.gold, fontSize: 12 },
  caption: {
    color: colors.muted,
    fontSize: 10,
    textAlign: "center",
    lineHeight: 16,
  },
  storageWarning: { color: colors.gold, fontSize: 12, lineHeight: 18 },
  controls: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 9,
    backgroundColor: colors.surface,
  },
  controlHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
    flexWrap: "wrap",
  },
  controlTitle: { color: colors.text, fontSize: 16, fontWeight: "600" },
  actionRow: { flexDirection: "row", gap: 8 },
  betHeading: { flexDirection: "row", alignItems: "center", gap: 10 },
  wager: { color: colors.gold, fontSize: 23, fontWeight: "700" },
  chips: { flexDirection: "row", justifyContent: "space-between", gap: 7 },
  chip: {
    width: 48,
    height: 48,
    borderWidth: 3,
    borderStyle: "dashed",
    borderRadius: 24,
    backgroundColor: colors.bg,
    justifyContent: "center",
    alignItems: "center",
  },
  chipValue: { color: colors.text, fontWeight: "700", fontSize: 12 },
});
