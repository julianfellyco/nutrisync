import { ExpoConfig, ConfigContext } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "NutriSync",
  slug: "nutrisync",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "light",
  splash: { image: "./assets/splash.png", resizeMode: "contain", backgroundColor: "#ffffff" },

  ios: {
    bundleIdentifier: "com.nutrisync.app",
    supportsTablet: false,
    // HealthKit entitlement — required for react-native-health
    infoPlist: {
      NSHealthShareUsageDescription:
        "NutriSync reads your step count and heart rate to sync your daily activity.",
      NSHealthUpdateUsageDescription:
        "NutriSync saves meal logs to your Health app.",
    },
    entitlements: {
      "com.apple.developer.healthkit": true,
      "com.apple.developer.healthkit.background-delivery": true,
    },
  },

  android: {
    package: "com.nutrisync.app",
    adaptiveIcon: { foregroundImage: "./assets/adaptive-icon.png", backgroundColor: "#ffffff" },
    permissions: [
      // Google Fit / Health Connect
      "android.permission.ACTIVITY_RECOGNITION",
      "android.permission.BODY_SENSORS",
      "android.permission.health.READ_STEPS",
      "android.permission.health.READ_HEART_RATE",
      "android.permission.health.READ_WEIGHT",
    ],
  },

  plugins: [
    // react-native-health — HealthKit bridge (iOS only)
    [
      "react-native-health",
      {
        isClinicalDataEnabled: false,
      },
    ],
    // Expo Dev Client — required for native module support outside Expo Go
    "expo-dev-client",
    // Background fetch for periodic biometric sync
    [
      "expo-background-fetch",
      { minimumInterval: 1800 }, // 30 minutes
    ],
    // Task manager required by background-fetch
    "expo-task-manager",
  ],

  extra: {
    eas: { projectId: "replace-with-your-eas-project-id" },
  },
});
