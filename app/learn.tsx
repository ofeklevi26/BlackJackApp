import React from "react";
import { router } from "expo-router";
import LearnScreen from "../src/screens/LearnScreen";
import { useStore } from "../src/state/store";
import { newTraining } from "../src/state/training";
import { createCountingSetup } from "../src/counting";
export default function Learn() {
  const { data, update } = useStore();
  return (
    <LearnScreen
      rules={data.settings.rules}
      completedLessons={data.completedLessons}
      onComplete={(id) =>
        update((d) => ({
          ...d,
          completedLessons: { ...d.completedLessons, [id]: Date.now() },
        }))
      }
      onPractice={(topic, scenario) => {
        if (data.active || data.counting) {
          router.push("/practice");
          return;
        }
        if (topic === "count" || topic === "true-count") {
          update((d) => ({
            ...d,
            counting: {
              ...createCountingSetup(d.settings.assistance),
              mode: topic === "true-count" ? "true-count" : "recognition",
            },
          }));
        } else if (scenario)
          update((d) => ({
            ...d,
            active: newTraining(d, { topic, scenario, reviewOnly: true }),
          }));
        router.push({ pathname: "/practice", params: { topic } });
      }}
    />
  );
}
