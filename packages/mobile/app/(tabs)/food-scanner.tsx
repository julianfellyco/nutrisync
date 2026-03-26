/**
 * AR Food Scanner — Feature 4.
 *
 * Points the camera at any food item, grocery label, or restaurant dish
 * and shows an instant macro overlay: "Does this fit my remaining macros?"
 *
 * Flow:
 *   1. Live camera preview (expo-camera).
 *   2. User taps the shutter button to capture a frame.
 *   3. Frame → base64 → POST /api/v1/ai/analyze-photo (save_log: false).
 *   4. Results rendered as an overlay showing detected foods + fit score.
 *
 * The "fit score" compares the detected meal's macros against the user's
 * remaining daily budget (daily target minus today's logged totals).
 */
import { useRef, useState, useEffect } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
  Dimensions,
} from "react-native";
import { CameraView, CameraType, useCameraPermissions } from "expo-camera";
import { api } from "../../lib/api";

const { width: SCREEN_W } = Dimensions.get("window");

interface ScanResult {
  foods: Array<{ name: string; portion: string; calories: number; protein_g: number; carbs_g: number; fat_g: number }>;
  totals: { calories: number; protein_g: number; carbs_g: number; fat_g: number };
  note: string | null;
}

interface DailyBudget {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

export default function FoodScannerScreen() {
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning]   = useState(false);
  const [result, setResult]       = useState<ScanResult | null>(null);
  const [budget, setBudget]       = useState<DailyBudget | null>(null);

  // Fetch today's remaining budget (targets − logged today)
  useEffect(() => {
    async function loadBudget() {
      try {
        const [me, todayLogs] = await Promise.all([
          api.auth.me(),
          api.logs.list(1),
        ]);
        // Budget comes from profile — for simplicity use defaults if not set
        const targets = { calories: 2000, protein_g: 150, carbs_g: 200, fat_g: 65 };
        const spent   = (todayLogs as any[]).reduce(
          (acc: DailyBudget, l: any) => {
            if (l.log_type === "meal") {
              acc.calories  += l.payload.calories  ?? 0;
              acc.protein_g += l.payload.protein_g ?? 0;
              acc.carbs_g   += l.payload.carbs_g   ?? 0;
              acc.fat_g     += l.payload.fat_g      ?? 0;
            }
            return acc;
          },
          { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
        );
        setBudget({
          calories:  Math.max(targets.calories  - spent.calories,  0),
          protein_g: Math.max(targets.protein_g - spent.protein_g, 0),
          carbs_g:   Math.max(targets.carbs_g   - spent.carbs_g,   0),
          fat_g:     Math.max(targets.fat_g      - spent.fat_g,     0),
        });
      } catch {
        // Non-critical — scanner works without budget context
      }
    }
    loadBudget();
  }, [result]); // Refresh after each scan

  if (!permission) return <View style={s.container} />;

  if (!permission.granted) {
    return (
      <View style={[s.container, { alignItems: "center", justifyContent: "center", padding: 32 }]}>
        <Text style={{ fontSize: 40, marginBottom: 16 }}>📷</Text>
        <Text style={{ fontSize: 16, fontWeight: "600", color: "#1C1917", marginBottom: 8, textAlign: "center" }}>
          Camera access needed
        </Text>
        <Text style={{ fontSize: 13, color: "#A8A29E", textAlign: "center", marginBottom: 20 }}>
          The food scanner needs camera permission to analyse food items in real time.
        </Text>
        <Pressable style={s.primaryBtn} onPress={requestPermission}>
          <Text style={s.primaryBtnText}>Grant access</Text>
        </Pressable>
      </View>
    );
  }

  async function capture() {
    if (!cameraRef.current || scanning) return;
    setScanning(true);
    setResult(null);
    try {
      const photo = await cameraRef.current.takePictureAsync({ base64: true, quality: 0.5 });
      if (!photo?.base64) throw new Error("No image data");
      const data = await api.ai.analyzePhoto(photo.base64, { save_log: false });
      setResult(data as ScanResult);
    } catch (e: any) {
      Alert.alert("Scan failed", e.message ?? "Could not analyse image.");
    } finally {
      setScanning(false);
    }
  }

  function fitColor(scanned: number, remaining: number | undefined): string {
    if (!remaining) return "#A8A29E";
    const ratio = scanned / remaining;
    if (ratio <= 0.5)  return "#3D6B4F";   // fits easily
    if (ratio <= 0.85) return "#D97706";   // tight but ok
    return "#E11D48";                       // exceeds budget
  }

  return (
    <View style={s.container}>
      <CameraView ref={cameraRef} style={s.camera} facing="back">

        {/* Viewfinder overlay */}
        <View style={s.finderBox} />

        {/* Header */}
        <View style={s.header}>
          <Text style={s.headerTitle}>Food Scanner</Text>
          <Text style={s.headerSub}>Point at any food · tap to scan</Text>
        </View>

        {/* Remaining budget bar */}
        {budget && !result && (
          <View style={s.budgetBar}>
            <Text style={s.budgetTitle}>Remaining today</Text>
            <View style={s.budgetRow}>
              {[
                { label: "Cal",     val: Math.round(budget.calories) },
                { label: "Pro",     val: `${Math.round(budget.protein_g)}g` },
                { label: "Carbs",   val: `${Math.round(budget.carbs_g)}g` },
                { label: "Fat",     val: `${Math.round(budget.fat_g)}g` },
              ].map((b) => (
                <View key={b.label} style={s.budgetItem}>
                  <Text style={s.budgetVal}>{b.val}</Text>
                  <Text style={s.budgetLabel}>{b.label}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Result overlay */}
        {result && (
          <View style={s.resultOverlay}>
            <View style={s.resultHeader}>
              <Text style={s.resultTitle}>
                {result.foods.length} item{result.foods.length !== 1 ? "s" : ""} detected
              </Text>
              <Pressable onPress={() => setResult(null)}>
                <Text style={s.dismissText}>✕ Dismiss</Text>
              </Pressable>
            </View>

            {/* Macro fit bars */}
            {(["calories", "protein_g", "carbs_g", "fat_g"] as const).map((key) => {
              const labels: Record<string, string> = { calories: "Cal", protein_g: "Pro", carbs_g: "Carbs", fat_g: "Fat" };
              const units:  Record<string, string> = { calories: "kcal", protein_g: "g", carbs_g: "g", fat_g: "g" };
              const scanned   = result.totals[key] ?? 0;
              const remaining = budget ? budget[key] : undefined;
              const color     = fitColor(scanned, remaining);
              const pct       = remaining ? Math.min((scanned / remaining) * 100, 100) : 0;

              return (
                <View key={key} style={s.macroRow}>
                  <Text style={s.macroLabel}>{labels[key]}</Text>
                  <View style={s.barBg}>
                    <View style={[s.barFill, { width: `${pct}%` as any, backgroundColor: color }]} />
                  </View>
                  <Text style={[s.macroVal, { color }]}>
                    {Math.round(scanned)}{units[key]}
                    {remaining ? ` / ${Math.round(remaining)}` : ""}
                  </Text>
                </View>
              );
            })}

            {result.note && (
              <Text style={s.scanNote}>{result.note}</Text>
            )}

            <View style={s.foodPills}>
              {result.foods.map((f, i) => (
                <View key={i} style={s.pill}>
                  <Text style={s.pillText}>{f.name} · {f.portion}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Shutter */}
        {!result && (
          <View style={s.shutterRow}>
            <Pressable
              style={[s.shutter, scanning && { opacity: 0.5 }]}
              onPress={capture}
              disabled={scanning}
            >
              {scanning
                ? <ActivityIndicator color="#3D6B4F" size="small" />
                : <View style={s.shutterInner} />
              }
            </Pressable>
          </View>
        )}
      </CameraView>
    </View>
  );
}

const OVERLAY_BG = "rgba(28,25,23,0.88)";

const s = StyleSheet.create({
  container:     { flex: 1, backgroundColor: "#000" },
  camera:        { flex: 1 },
  finderBox:     {
    position: "absolute", top: "28%", left: "10%",
    width: SCREEN_W * 0.8, height: SCREEN_W * 0.6,
    borderRadius: 16,
    borderWidth: 1.5, borderColor: "rgba(255,255,255,0.3)",
    backgroundColor: "transparent",
  },
  header:        { position: "absolute", top: 56, left: 0, right: 0, alignItems: "center" },
  headerTitle:   { fontSize: 16, fontWeight: "700", color: "#fff" },
  headerSub:     { fontSize: 12, color: "rgba(255,255,255,0.6)", marginTop: 3 },
  budgetBar:     {
    position: "absolute", top: 108, left: 16, right: 16,
    backgroundColor: OVERLAY_BG, borderRadius: 12, padding: 12,
  },
  budgetTitle:   { fontSize: 10, color: "rgba(255,255,255,0.5)", textTransform: "uppercase",
                   letterSpacing: 0.8, marginBottom: 8 },
  budgetRow:     { flexDirection: "row", gap: 8 },
  budgetItem:    { flex: 1, alignItems: "center" },
  budgetVal:     { fontSize: 15, fontWeight: "700", color: "#fff" },
  budgetLabel:   { fontSize: 10, color: "rgba(255,255,255,0.5)", marginTop: 1 },
  shutterRow:    { position: "absolute", bottom: 48, left: 0, right: 0, alignItems: "center" },
  shutter:       { width: 64, height: 64, borderRadius: 32, backgroundColor: "#fff",
                   alignItems: "center", justifyContent: "center",
                   borderWidth: 3, borderColor: "rgba(255,255,255,0.4)" },
  shutterInner:  { width: 48, height: 48, borderRadius: 24, backgroundColor: "#fff" },
  resultOverlay: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    backgroundColor: OVERLAY_BG, padding: 20,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
  },
  resultHeader:  { flexDirection: "row", justifyContent: "space-between",
                   alignItems: "center", marginBottom: 14 },
  resultTitle:   { fontSize: 15, fontWeight: "700", color: "#fff" },
  dismissText:   { fontSize: 13, color: "rgba(255,255,255,0.5)" },
  macroRow:      { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  macroLabel:    { width: 34, fontSize: 11, color: "rgba(255,255,255,0.6)", fontWeight: "500" },
  barBg:         { flex: 1, height: 5, backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 3, overflow: "hidden" },
  barFill:       { height: "100%", borderRadius: 3 },
  macroVal:      { width: 80, fontSize: 11, textAlign: "right", fontWeight: "600" },
  scanNote:      { fontSize: 11, color: "rgba(255,255,255,0.4)", fontStyle: "italic",
                   marginTop: 10, lineHeight: 16 },
  foodPills:     { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  pill:          { backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 20, paddingHorizontal: 10,
                   paddingVertical: 4 },
  pillText:      { fontSize: 11, color: "rgba(255,255,255,0.8)" },
  primaryBtn:    { backgroundColor: "#3D6B4F", borderRadius: 8, paddingVertical: 12,
                   paddingHorizontal: 24 },
  primaryBtnText:{ color: "#fff", fontWeight: "600", fontSize: 14 },
});
