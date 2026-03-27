/**
 * Unified biometric sync hook.
 *
 * iOS  → react-native-health  (HealthKit)
 * Android → @react-native-google-fit/google-fit  (Google Fit)
 *
 * Usage:
 *   const { sync, lastSynced, isLoading } = useBiometricSync();
 *   await sync();   // call on app foreground or manually
 *
 * Background sync: register a background task in app/_layout.tsx using
 * expo-background-fetch that calls sync() every 30 minutes.
 */
import { useCallback, useState } from "react";
import { Platform } from "react-native";
import { api } from "../lib/api";
import { enqueue } from "../lib/offlineQueue";

// ── Types ──────────────────────────────────────────────────────────────────────

interface BiometricPayload {
  steps?: number;
  avg_heart_rate?: number;
  weight_kg?: number;
  body_fat_pct?: number;
  source: "healthkit" | "googlefit" | "manual";
}

interface ActivityPayload {
  type: string;
  duration_min: number;
  steps?: number;
  avg_heart_rate?: number;
  source: "healthkit" | "googlefit";
}

// ── Platform adapters ──────────────────────────────────────────────────────────

async function fetchHealthKitData(date: Date): Promise<{
  steps: number;
  avgHeartRate: number;
  workouts: ActivityPayload[];
}> {
  // react-native-health must be linked natively (not available in Expo Go).
  // Install: npx expo install react-native-health
  const AppleHealthKit = require("react-native-health").default;

  const startDate = new Date(date);
  startDate.setHours(0, 0, 0, 0);
  const endDate = new Date(date);
  endDate.setHours(23, 59, 59, 999);

  const [steps, heartRateSamples, workouts] = await Promise.allSettled([
    new Promise<number>((resolve, reject) =>
      AppleHealthKit.getStepCount(
        { date: date.toISOString() },
        (err: Error, result: { value: number }) => (err ? reject(err) : resolve(result.value)),
      ),
    ),
    new Promise<{ value: number }[]>((resolve, reject) =>
      AppleHealthKit.getHeartRateSamples(
        { startDate: startDate.toISOString(), endDate: endDate.toISOString() },
        (err: Error, results: { value: number }[]) => (err ? reject(err) : resolve(results)),
      ),
    ),
    new Promise<any[]>((resolve, reject) =>
      AppleHealthKit.getSamples(
        {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          type: "Workout",
        },
        (err: Error, results: any[]) => (err ? reject(err) : resolve(results)),
      ),
    ),
  ]);

  const stepCount = steps.status === "fulfilled" ? steps.value : 0;

  const hrValues =
    heartRateSamples.status === "fulfilled" ? heartRateSamples.value.map((s) => s.value) : [];
  const avgHR = hrValues.length ? hrValues.reduce((a, b) => a + b, 0) / hrValues.length : 0;

  const activityPayloads: ActivityPayload[] =
    workouts.status === "fulfilled"
      ? workouts.value.map((w) => ({
          type: w.activityName ?? "workout",
          duration_min: Math.round((w.duration ?? 0) / 60),
          avg_heart_rate: w.heartRate ?? undefined,
          source: "healthkit",
        }))
      : [];

  return { steps: stepCount, avgHeartRate: avgHR, workouts: activityPayloads };
}

async function fetchGoogleFitData(date: Date): Promise<{
  steps: number;
  avgHeartRate: number;
  workouts: ActivityPayload[];
}> {
  // @react-native-google-fit/google-fit
  // Install: npx expo install @react-native-google-fit/google-fit
  const GoogleFit = require("@react-native-google-fit/google-fit").default;
  const { Scopes } = require("@react-native-google-fit/google-fit");

  await GoogleFit.authorize({ scopes: [Scopes.FITNESS_ACTIVITY_READ, Scopes.FITNESS_BODY_READ] });

  const startDate = new Date(date);
  startDate.setHours(0, 0, 0, 0);
  const endDate = new Date(date);
  endDate.setHours(23, 59, 59, 999);

  const [stepsResult, heartResult] = await Promise.allSettled([
    GoogleFit.getDailyStepCountSamples({
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    }),
    GoogleFit.getHeartRateSamples({
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    }),
  ]);

  let steps = 0;
  if (stepsResult.status === "fulfilled") {
    // GoogleFit returns an array of sources; prefer "estimated_steps" source
    const estimated = stepsResult.value.find((s: any) =>
      s.source?.includes("estimated_steps"),
    );
    const source = estimated ?? stepsResult.value[0];
    steps = source?.steps?.reduce((sum: number, d: any) => sum + (d.value ?? 0), 0) ?? 0;
  }

  const hrValues =
    heartResult.status === "fulfilled"
      ? heartResult.value.map((s: any) => s.value as number)
      : [];
  const avgHR = hrValues.length ? hrValues.reduce((a, b) => a + b, 0) / hrValues.length : 0;

  return { steps, avgHeartRate: avgHR, workouts: [] };
}

// ── Hook ───────────────────────────────────────────────────────────────────────

export function useBiometricSync() {
  const [isLoading, setIsLoading] = useState(false);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sync = useCallback(async (date = new Date()) => {
    setIsLoading(true);
    setError(null);

    try {
      const data =
        Platform.OS === "ios"
          ? await fetchHealthKitData(date)
          : await fetchGoogleFitData(date);

      // Post biometric summary
      if (data.steps > 0 || data.avgHeartRate > 0) {
        const payload: BiometricPayload = {
          steps: data.steps || undefined,
          avg_heart_rate: data.avgHeartRate > 0 ? Math.round(data.avgHeartRate) : undefined,
          source: Platform.OS === "ios" ? "healthkit" : "googlefit",
        };
        try {
          await api.logs.create("biometric", payload, date.toISOString());
        } catch {
          await enqueue("/api/v1/logs", "POST", {
            log_type: "biometric",
            payload,
            logged_at: date.toISOString(),
          });
        }
      }

      // Post individual workouts
      for (const workout of data.workouts) {
        try {
          await api.logs.create("activity", workout, date.toISOString());
        } catch {
          await enqueue("/api/v1/logs", "POST", {
            log_type: "activity",
            payload: workout,
            logged_at: date.toISOString(),
          });
        }
      }

      setLastSynced(new Date());
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sync failed";
      setError(message);
      console.error("[BiometricSync]", message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { sync, lastSynced, isLoading, error };
}
