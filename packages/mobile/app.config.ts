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
      NSCameraUsageDescription:
        "NutriSync uses the camera to analyse your meals and identify food items.",
      NSPhotoLibraryUsageDescription:
        "NutriSync accesses your photo library so you can log meals from existing photos.",
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
      "android.permission.ACTIVITY_RECOGNITION",
      "android.permission.BODY_SENSORS",
      "android.permission.health.READ_STEPS",
      "android.permission.health.READ_HEART_RATE",
      "android.permission.health.READ_WEIGHT",
      "android.permission.CAMERA",
      "android.permission.READ_EXTERNAL_STORAGE",
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
    "expo-camera",
    "expo-image-picker",
  ],

  extra: {
    // TODO: run 'eas init' in packages/mobile to generate a real project ID
    eas: { projectId: "TODO-run-eas-init" },
  },
});
