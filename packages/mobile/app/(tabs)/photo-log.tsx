/**
 * Photo-to-Macro Logging screen.
 *
 * Feature 1 — Computer Vision meal logging:
 *   1. User takes a photo with the camera (or picks from gallery).
 *   2. Image is base64-encoded and sent to POST /api/v1/ai/analyze-photo.
 *   3. Claude Vision identifies foods and estimates macros.
 *   4. User reviews the breakdown and taps "Log this meal" to save.
 *
 * Requires: expo-camera, expo-image-picker (both in managed workflow)
 */
import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Image,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { api } from "../../lib/api";

interface DetectedFood {
  name: string;
  portion: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  confidence: "high" | "medium" | "low";
}

interface Analysis {
  foods: DetectedFood[];
  totals: { calories: number; protein_g: number; carbs_g: number; fat_g: number };
  log_id: string | null;
  note: string | null;
}

const CONF_COLOR: Record<string, string> = {
  high:   "#3D6B4F",
  medium: "#D97706",
  low:    "#E11D48",
};

export default function PhotoLogScreen() {
  const [imageUri, setImageUri]     = useState<string | null>(null);
  const [imageB64, setImageB64]     = useState<string | null>(null);
  const [analysis, setAnalysis]     = useState<Analysis | null>(null);
  const [loading, setLoading]       = useState(false);
  const [saved, setSaved]           = useState(false);

  async function pickImage(fromCamera: boolean) {
    let result;
    if (fromCamera) {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission required", "Camera access is needed to log meals by photo.");
        return;
      }
      result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.6,
        base64: true,
      });
    } else {
      result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.6,
        base64: true,
      });
    }
    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    setImageUri(asset.uri);
    setImageB64(asset.base64 ?? null);
    setAnalysis(null);
    setSaved(false);
  }

  async function analyse() {
    if (!imageB64) return;
    setLoading(true);
    try {
      const data = await api.ai.analyzePhoto(imageB64, { save_log: false });
      setAnalysis(data as Analysis);
    } catch (e: any) {
      Alert.alert("Analysis failed", e.message ?? "Could not reach the AI service.");
    } finally {
      setLoading(false);
    }
  }

  async function logMeal() {
    if (!imageB64) return;
    setLoading(true);
    try {
      const data = await api.ai.analyzePhoto(imageB64, { save_log: true });
      setAnalysis(data as Analysis);
      setSaved(true);
    } catch (e: any) {
      Alert.alert("Save failed", e.message ?? "Could not save the meal log.");
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setImageUri(null);
    setImageB64(null);
    setAnalysis(null);
    setSaved(false);
  }

  return (
    <ScrollView style={s.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <Text style={s.heading}>Photo Log</Text>
      <Text style={s.sub}>Snap a photo of your meal — Claude identifies ingredients and estimates macros instantly.</Text>

      {!imageUri ? (
        <View style={s.pickRow}>
          <Pressable style={s.pickBtn} onPress={() => pickImage(true)}>
            <Text style={s.pickIcon}>📷</Text>
            <Text style={s.pickLabel}>Camera</Text>
          </Pressable>
          <Pressable style={s.pickBtn} onPress={() => pickImage(false)}>
            <Text style={s.pickIcon}>🖼️</Text>
            <Text style={s.pickLabel}>Gallery</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <Image source={{ uri: imageUri }} style={s.preview} resizeMode="cover" />

          {!analysis && (
            <Pressable
              style={[s.actionBtn, loading && { opacity: 0.5 }]}
              onPress={analyse}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={s.actionBtnText}>Analyse meal</Text>
              )}
            </Pressable>
          )}

          {analysis && (
            <View style={s.result}>
              {/* Totals */}
              <View style={s.totalsRow}>
                {[
                  { label: "Cal",     val: `${Math.round(analysis.totals.calories)}` },
                  { label: "Protein", val: `${Math.round(analysis.totals.protein_g)}g` },
                  { label: "Carbs",   val: `${Math.round(analysis.totals.carbs_g)}g` },
                  { label: "Fat",     val: `${Math.round(analysis.totals.fat_g)}g` },
                ].map((item) => (
                  <View key={item.label} style={s.totalCard}>
                    <Text style={s.totalVal}>{item.val}</Text>
                    <Text style={s.totalLabel}>{item.label}</Text>
                  </View>
                ))}
              </View>

              {/* Food breakdown */}
              <Text style={s.sectionTitle}>Detected foods</Text>
              {analysis.foods.map((f, i) => (
                <View key={i} style={s.foodRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.foodName}>{f.name}</Text>
                    <Text style={s.foodPortion}>{f.portion}</Text>
                  </View>
                  <Text style={s.foodCal}>{Math.round(f.calories)} kcal</Text>
                  <View style={[s.confDot, { backgroundColor: CONF_COLOR[f.confidence] }]} />
                </View>
              ))}

              {analysis.note && (
                <Text style={s.note}>{analysis.note}</Text>
              )}

              {/* Confidence legend */}
              <View style={s.legend}>
                {Object.entries(CONF_COLOR).map(([k, c]) => (
                  <View key={k} style={s.legendItem}>
                    <View style={[s.confDot, { backgroundColor: c }]} />
                    <Text style={s.legendText}>{k}</Text>
                  </View>
                ))}
              </View>

              {saved ? (
                <View style={s.savedBadge}>
                  <Text style={s.savedText}>✓ Meal logged successfully</Text>
                </View>
              ) : (
                <Pressable
                  style={[s.logBtn, loading && { opacity: 0.5 }]}
                  onPress={logMeal}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={s.logBtnText}>Log this meal</Text>
                  )}
                </Pressable>
              )}
            </View>
          )}

          <Pressable style={s.resetBtn} onPress={reset}>
            <Text style={s.resetText}>← New photo</Text>
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container:   { flex: 1, backgroundColor: "#F7F5F2", padding: 20 },
  heading:     { fontSize: 26, fontWeight: "700", color: "#1C1917", marginBottom: 6 },
  sub:         { fontSize: 13, color: "#A8A29E", marginBottom: 24, lineHeight: 20 },
  pickRow:     { flexDirection: "row", gap: 12 },
  pickBtn:     { flex: 1, backgroundColor: "#fff", borderRadius: 12, padding: 24,
                 alignItems: "center", borderWidth: 1, borderColor: "rgba(0,0,0,0.08)" },
  pickIcon:    { fontSize: 32, marginBottom: 8 },
  pickLabel:   { fontSize: 14, fontWeight: "600", color: "#1C1917" },
  preview:     { width: "100%", height: 240, borderRadius: 12, marginBottom: 16 },
  actionBtn:   { backgroundColor: "#3D6B4F", borderRadius: 8, padding: 14,
                 alignItems: "center", marginBottom: 12 },
  actionBtnText: { color: "#fff", fontWeight: "600", fontSize: 15 },
  result:      { backgroundColor: "#fff", borderRadius: 12, padding: 16,
                 borderWidth: 1, borderColor: "rgba(0,0,0,0.07)", marginBottom: 12 },
  totalsRow:   { flexDirection: "row", gap: 8, marginBottom: 16 },
  totalCard:   { flex: 1, backgroundColor: "#F7F5F2", borderRadius: 8, padding: 10, alignItems: "center" },
  totalVal:    { fontSize: 18, fontWeight: "700", color: "#3D6B4F" },
  totalLabel:  { fontSize: 11, color: "#A8A29E", marginTop: 2 },
  sectionTitle:{ fontSize: 12, fontWeight: "600", color: "#A8A29E", textTransform: "uppercase",
                 letterSpacing: 0.8, marginBottom: 10 },
  foodRow:     { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8,
                 borderTopWidth: 1, borderTopColor: "rgba(0,0,0,0.04)" },
  foodName:    { fontSize: 14, fontWeight: "500", color: "#1C1917" },
  foodPortion: { fontSize: 12, color: "#A8A29E", marginTop: 1 },
  foodCal:     { fontSize: 13, fontWeight: "600", color: "#57534E" },
  confDot:     { width: 8, height: 8, borderRadius: 4 },
  note:        { fontSize: 12, color: "#A8A29E", fontStyle: "italic",
                 marginTop: 12, lineHeight: 18 },
  legend:      { flexDirection: "row", gap: 12, marginTop: 12, paddingTop: 12,
                 borderTopWidth: 1, borderTopColor: "rgba(0,0,0,0.05)" },
  legendItem:  { flexDirection: "row", alignItems: "center", gap: 5 },
  legendText:  { fontSize: 11, color: "#A8A29E" },
  logBtn:      { backgroundColor: "#3D6B4F", borderRadius: 8, padding: 14,
                 alignItems: "center", marginTop: 14 },
  logBtnText:  { color: "#fff", fontWeight: "600", fontSize: 15 },
  savedBadge:  { backgroundColor: "#F0F7F3", borderRadius: 8, padding: 12,
                 alignItems: "center", marginTop: 14 },
  savedText:   { color: "#3D6B4F", fontWeight: "600", fontSize: 14 },
  resetBtn:    { paddingVertical: 12, alignItems: "center" },
  resetText:   { fontSize: 13, color: "#A8A29E" },
});
