/**
 * Dashboard tab — today's summary + biometric sync trigger.
 *
 * Connects to WebSocket so new logs posted from any device
 * appear in real-time without a manual refresh.
 */
import { useCallback, useEffect, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useBiometricSync } from "../../hooks/useBiometricSync";
import { useWebSocket } from "../../hooks/useWebSocket";
import { api } from "../../lib/api";

interface LogSummary {
  calories: number;
  protein_g: number;
  steps: number;
  avg_heart_rate: number;
  current_streak: number;
  meals_logged: number;
}

function sumLogs(logs: any[]): LogSummary {
  return logs.reduce(
    (acc, l) => {
      if (l.log_type === "meal") {
        acc.calories  += l.payload.calories  ?? 0;
        acc.protein_g += l.payload.protein_g ?? 0;
        acc.meals_logged += 1;
      }
      if (l.log_type === "biometric" || l.log_type === "activity") {
        acc.steps           += l.payload.steps           ?? 0;
        acc.avg_heart_rate   = l.payload.avg_heart_rate  ?? acc.avg_heart_rate;
      }
      return acc;
    },
    { calories: 0, protein_g: 0, steps: 0, avg_heart_rate: 0, meals_logged: 0, current_streak: 0 },
  );
}

export default function DashboardScreen() {
  const [summary, setSummary] = useState<LogSummary | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const { sync, isLoading: syncing, lastSynced } = useBiometricSync();

  const fetchToday = useCallback(async () => {
    const logs = await api.logs.list(1);
    setSummary(sumLogs(logs as any[]));
  }, []);

  // Live update: re-fetch summary whenever the server pushes a new_log event
  useWebSocket({
    onEvent: (event) => {
      if (event.event === "new_log") fetchToday();
    },
  });

  useEffect(() => { fetchToday(); }, [fetchToday]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchToday(), sync()]);
    setRefreshing(false);
  }, [fetchToday, sync]);

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Text style={styles.heading}>Today</Text>

      {summary && (
        <View style={styles.grid}>
          <StatCard label="Calories"  value={`${Math.round(summary.calories)} kcal`} />
          <StatCard label="Protein"   value={`${Math.round(summary.protein_g)} g`} />
          <StatCard label="Steps"     value={summary.steps.toLocaleString()} />
          <StatCard label="Heart Rate" value={summary.avg_heart_rate ? `${Math.round(summary.avg_heart_rate)} bpm` : "—"} />
          <StatCard label="Meals" value={String(summary.meals_logged)} />
          {summary.current_streak > 0 && <StatCard label="🔥 Streak" value={String(summary.current_streak) + ' day streak'} />}
        </View>
      )}

      <Pressable
        style={[styles.syncBtn, syncing && { opacity: 0.6 }]}
        onPress={() => sync()}
        disabled={syncing}
      >
        <Text style={styles.syncBtnText}>
          {syncing ? "Syncing…" : "Sync Health Data"}
        </Text>
      </Pressable>

      {lastSynced && (
        <Text style={styles.lastSynced}>
          Last synced: {lastSynced.toLocaleTimeString()}
        </Text>
      )}
    </ScrollView>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardValue}>{value}</Text>
      <Text style={styles.cardLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: "#F9FAF8", padding: 20 },
  heading:      { fontSize: 28, fontWeight: "700", marginBottom: 20, color: "#1A1A1A" },
  grid:         { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  card:         { backgroundColor: "#FFF", borderRadius: 16, padding: 16, width: "47%",
                  shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  cardValue:    { fontSize: 22, fontWeight: "700", color: "#2E7D32" },
  cardLabel:    { fontSize: 13, color: "#888", marginTop: 4 },
  syncBtn:      { backgroundColor: "#4CAF50", borderRadius: 14, padding: 16,
                  alignItems: "center", marginTop: 24 },
  syncBtnText:  { color: "#FFF", fontWeight: "600", fontSize: 16 },
  lastSynced:   { textAlign: "center", color: "#AAA", fontSize: 12, marginTop: 8 },
});
