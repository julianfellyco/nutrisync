/**
 * Smart Nutritionist chat screen.
 *
 * - Sends user messages to /api/v1/ai/chat
 * - Persists session_id across messages for conversation continuity
 * - Supports "ingredient mode": user can add available ingredients
 *   which are appended to the first message of each session
 */
import { useState, useRef, useCallback } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { api } from "../../lib/api";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export default function AiChatScreen() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [ingredients, setIngredients] = useState<string[]>([]);
  const [ingredientInput, setIngredientInput] = useState("");
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const listRef = useRef<FlatList>(null);

  const addIngredient = useCallback(() => {
    const trimmed = ingredientInput.trim();
    if (trimmed && !ingredients.includes(trimmed)) {
      setIngredients((prev) => [...prev, trimmed]);
    }
    setIngredientInput("");
  }, [ingredientInput, ingredients]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: text,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    try {
      // Only pass ingredients on the first message of a session
      const ingrToSend = !sessionId ? ingredients : [];
      const { reply, session_id } = await api.ai.chat(text, ingrToSend, sessionId);

      if (!sessionId) setSessionId(session_id);

      const assistantMsg: Message = {
        id: `${Date.now()}-reply`,
        role: "assistant",
        content: reply,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-err`,
          role: "assistant",
          content: "Sorry, I couldn't reach the nutritionist service. Please try again.",
        },
      ]);
    } finally {
      setIsLoading(false);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [input, isLoading, sessionId, ingredients]);

  const startNewSession = useCallback(() => {
    setMessages([]);
    setSessionId(undefined);
    setIngredients([]);
  }, []);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={90}
    >
      {/* Ingredient pills */}
      {ingredients.length > 0 && (
        <View style={styles.pillRow}>
          {ingredients.map((ing) => (
            <Pressable
              key={ing}
              style={styles.pill}
              onPress={() => setIngredients((prev) => prev.filter((i) => i !== ing))}
            >
              <Text style={styles.pillText}>{ing} ×</Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* Ingredient input */}
      {!sessionId && (
        <View style={styles.ingredientRow}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            placeholder="Add an ingredient..."
            value={ingredientInput}
            onChangeText={setIngredientInput}
            onSubmitEditing={addIngredient}
            returnKeyType="done"
          />
          <Pressable style={styles.addBtn} onPress={addIngredient}>
            <Text style={styles.addBtnText}>Add</Text>
          </Pressable>
        </View>
      )}

      {/* Messages */}
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        style={styles.list}
        contentContainerStyle={{ paddingVertical: 12 }}
        renderItem={({ item }) => (
          <View style={[styles.bubble, item.role === "user" ? styles.userBubble : styles.aiBubble]}>
            <Text style={item.role === "user" ? styles.userText : styles.aiText}>
              {item.content}
            </Text>
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            Ask me for a recipe based on what you have, or tell me your macros goal.
          </Text>
        }
      />

      {isLoading && <ActivityIndicator style={{ marginBottom: 8 }} color="#4CAF50" />}

      {/* Input row */}
      <View style={styles.inputRow}>
        <TextInput
          style={[styles.input, { flex: 1 }]}
          placeholder="Ask your nutritionist..."
          value={input}
          onChangeText={setInput}
          multiline
          returnKeyType="send"
          onSubmitEditing={sendMessage}
        />
        <Pressable style={styles.sendBtn} onPress={sendMessage} disabled={isLoading}>
          <Text style={styles.sendBtnText}>Send</Text>
        </Pressable>
      </View>

      {messages.length > 0 && (
        <Pressable onPress={startNewSession} style={styles.newSessionBtn}>
          <Text style={styles.newSessionText}>New session</Text>
        </Pressable>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: "#F9FAF8" },
  list:           { flex: 1, paddingHorizontal: 16 },
  emptyText:      { color: "#888", textAlign: "center", marginTop: 40, fontSize: 14 },
  bubble:         { maxWidth: "80%", borderRadius: 16, padding: 12, marginVertical: 4 },
  userBubble:     { alignSelf: "flex-end", backgroundColor: "#4CAF50" },
  aiBubble:       { alignSelf: "flex-start", backgroundColor: "#FFF", borderWidth: 1, borderColor: "#E0E0E0" },
  userText:       { color: "#FFF", fontSize: 15 },
  aiText:         { color: "#1A1A1A", fontSize: 15 },
  inputRow:       { flexDirection: "row", padding: 12, gap: 8, borderTopWidth: 1, borderColor: "#E0E0E0" },
  ingredientRow:  { flexDirection: "row", paddingHorizontal: 12, paddingTop: 8, gap: 8 },
  input:          { borderWidth: 1, borderColor: "#CCC", borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, backgroundColor: "#FFF" },
  sendBtn:        { backgroundColor: "#4CAF50", borderRadius: 22, paddingHorizontal: 20, justifyContent: "center" },
  sendBtnText:    { color: "#FFF", fontWeight: "600" },
  addBtn:         { backgroundColor: "#E8F5E9", borderRadius: 22, paddingHorizontal: 16, justifyContent: "center" },
  addBtnText:     { color: "#4CAF50", fontWeight: "600" },
  pillRow:        { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 12, paddingTop: 8, gap: 6 },
  pill:           { backgroundColor: "#E8F5E9", borderRadius: 14, paddingHorizontal: 10, paddingVertical: 4 },
  pillText:       { color: "#2E7D32", fontSize: 13 },
  newSessionBtn:  { alignSelf: "center", paddingVertical: 6, paddingHorizontal: 16, marginBottom: 8 },
  newSessionText: { color: "#888", fontSize: 13 },
});
