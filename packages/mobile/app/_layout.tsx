/**
 * Root layout — registers the background biometric sync task.
 *
 * The task fires every 30 minutes (iOS minimum) via expo-background-fetch
 * and posts step/heart-rate data to the API without waking the UI.
 */
import { useEffect } from "react";
import { AppState, Platform } from "react-native";
import { Stack } from "expo-router";
import * as BackgroundFetch from "expo-background-fetch";
import * as TaskManager from "expo-task-manager";
import NetInfo from "@react-native-community/netinfo";
import { api } from "../lib/api";
import { flush, getPendingCount } from "../lib/offlineQueue";

const BIOMETRIC_SYNC_TASK = "NUTRISYNC_BIOMETRIC_SYNC";

// Register the task definition — must happen at module level, outside React
TaskManager.defineTask(BIOMETRIC_SYNC_TASK, async () => {
  try {
    // Dynamically import to avoid loading platform bridges on web
    const { fetchHealthKitData, fetchGoogleFitData } = await import(
      "../hooks/useBiometricSync"
    ) as any;

    const today = new Date();
    const data  = Platform.OS === "ios"
      ? await fetchHealthKitData(today)
      : await fetchGoogleFitData(today);

    if (data.steps > 0 || data.avgHeartRate > 0) {
      await api.logs.create("biometric", {
        steps:            data.steps || undefined,
        avg_heart_rate:   data.avgHeartRate > 0 ? Math.round(data.avgHeartRate) : undefined,
        source:           Platform.OS === "ios" ? "healthkit" : "googlefit",
      });
    }

    for (const workout of data.workouts ?? []) {
      await api.logs.create("activity", workout);
    }

    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

export default function RootLayout() {
  useEffect(() => {
    // Flush offline queue whenever the app comes to the foreground
    const appStateSub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        flush().then(({ succeeded, failed }) => {
          if (succeeded > 0 || failed > 0) {
            console.log(`[OfflineQueue] foreground flush: ${succeeded} ok, ${failed} pending`);
          }
        });
      }
    });

    // Also flush when network connectivity is restored
    let wasOffline = false;
    const netInfoSub = NetInfo.addEventListener((state) => {
      const isOnline = state.isConnected && state.isInternetReachable;
      if (isOnline && wasOffline) {
        getPendingCount().then((count) => {
          if (count > 0) {
            console.log(`[OfflineQueue] reconnected — flushing ${count} queued item(s)`);
            flush().then(({ succeeded, failed }) => {
              console.log(`[OfflineQueue] reconnect flush: ${succeeded} ok, ${failed} pending`);
            });
          }
        });
      }
      wasOffline = !isOnline;
    });

    // Register the background task once the app has launched
    BackgroundFetch.registerTaskAsync(BIOMETRIC_SYNC_TASK, {
      minimumInterval: 30 * 60,   // 30 minutes
      stopOnTerminate: false,     // keep running after the app is closed
      startOnBoot: true,          // resume after device reboot (Android)
    }).catch(() => {
      // Background fetch not available in Expo Go — requires Dev Client build
    });

    return () => {
      appStateSub.remove();
      netInfoSub();
      BackgroundFetch.unregisterTaskAsync(BIOMETRIC_SYNC_TASK).catch(() => {});
    };
  }, []);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}
