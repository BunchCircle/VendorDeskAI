import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  FlatList,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { GradientButton } from "@/components/GradientButton";
import { Icon } from "@/components/Icon";
import { AppHeader } from "@/components/AppHeader";
import * as Haptics from "expo-haptics";
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system/legacy";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
// expo-speech-recognition: custom native build only (not available in Expo Go).
// Lazily required so the app never crashes when the native module is absent.
let ExpoSpeechRecognitionModule: any = null;
let useSpeechRecognitionEvent: (event: string, callback: (e: any) => void) => void =
  () => {};
let _nativeSpeechAvailable = false;
try {
  const _speech = require("expo-speech-recognition");
  ExpoSpeechRecognitionModule = _speech.ExpoSpeechRecognitionModule;
  useSpeechRecognitionEvent = _speech.useSpeechRecognitionEvent;
  _nativeSpeechAvailable = true;
} catch {
  // Falls back to expo-av recording on mobile, Web Speech API on web
}
// Web Speech API works in all browsers (Expo web preview, Chrome, etc.)
const _webSpeechAvailable =
  Platform.OS === "web" &&
  typeof window !== "undefined" &&
  !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

import { useApp } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";
import { parseRequirementWithAI, transcribeAudio, AIMessage } from "@/services/ai";
import { generateId, generateQuoteNumber, Lead, QuotationItem } from "@/services/storage";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  buttons?: Array<{ label: string; action: string; icon?: string }>;
  isLoading?: boolean;
}

type ButtonStyle = "primary" | "outline" | "whatsapp";

const BUTTON_STYLE_MAP: Record<string, ButtonStyle> = {
  view_preview: "primary",
  edit_quote: "outline",
  new_quote: "outline",
  send_reminder: "whatsapp",
};

function getActionStyleKey(action: string): string {
  if (action.startsWith("add_unknown:")) return "view_preview";
  return action;
}

export default function QuotationWorkspaceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { leads, products, addProduct, saveQuotation, updateLead, getQuotationForLead } = useApp();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const lead = leads.find((l) => l.id === id) as Lead | undefined;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [chatStarted, setChatStarted] = useState(false);
  const [quotationItems, setQuotationItems] = useState<QuotationItem[]>([]);
  const [conversationHistory, setConversationHistory] = useState<AIMessage[]>([]);
  const flatListRef = useRef<FlatList>(null);

  const [addItemModal, setAddItemModal] = useState<{
    visible: boolean;
    itemName: string;
    price: string;
    unit: string;
  }>({ visible: false, itemName: "", price: "", unit: "" });

  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordingSecs, setRecordingSecs] = useState(0);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const webRecognitionRef = useRef<any>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const MAX_RECORD_SECS = 30;

  // Native speech-recognition events (no-op stubs when module is unavailable)
  useSpeechRecognitionEvent("start", () => setIsListening(true));
  useSpeechRecognitionEvent("end", () => setIsListening(false));
  useSpeechRecognitionEvent("result", (event) => {
    const transcript = event.results[0]?.transcript || "";
    if (transcript) setInput(transcript);
  });
  useSpeechRecognitionEvent("error", () => setIsListening(false));

  // Cleanup recording on unmount
  useEffect(() => {
    return () => {
      recordingRef.current?.stopAndUnloadAsync().catch(() => {});
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (isListening) {
      pulseLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.35,
            duration: 600,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 600,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
      pulseLoop.current.start();
    } else {
      pulseLoop.current?.stop();
      pulseAnim.setValue(1);
    }
  }, [isListening]);

  const handleMicPress = async () => {
    if (isTranscribing) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // ── Path 1: Browser / Expo Web — Web Speech API ──────────────────────────
    if (Platform.OS === "web") {
      if (!_webSpeechAvailable) {
        addMessage({ role: "assistant", content: "Voice input is not supported in this browser. Try Chrome." });
        return;
      }
      if (isListening) {
        webRecognitionRef.current?.stop();
        setIsListening(false);
        return;
      }
      const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const recognition = new SR();
      recognition.lang = "en-IN";
      recognition.interimResults = true;
      recognition.continuous = false;
      recognition.onstart = () => setIsListening(true);
      recognition.onend = () => setIsListening(false);
      recognition.onresult = (event: any) => {
        const results = event.results;
        const transcript = results[results.length - 1][0].transcript;
        if (transcript) setInput(transcript);
      };
      recognition.onerror = () => setIsListening(false);
      webRecognitionRef.current = recognition;
      recognition.start();
      return;
    }

    // ── Path 2: Native dev build — expo-speech-recognition ───────────────────
    if (_nativeSpeechAvailable && ExpoSpeechRecognitionModule) {
      if (isListening) {
        ExpoSpeechRecognitionModule.stop();
        return;
      }
      try {
        const { granted } = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
        if (!granted) {
          addMessage({ role: "assistant", content: "Microphone permission is needed for voice input." });
          return;
        }
        ExpoSpeechRecognitionModule.start({ lang: "en-IN", interimResults: true, continuous: false });
      } catch {
        addMessage({ role: "assistant", content: "Voice input is not available on this device." });
      }
      return;
    }

    // ── Path 3: Expo Go Android — expo-av record → Gemini transcription ──────
    if (isListening) {
      // Stop the countdown timer
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
      // Stop recording and send for transcription
      try {
        const recording = recordingRef.current;
        if (!recording) { setIsListening(false); return; }
        setIsListening(false);
        setRecordingSecs(0);
        await recording.stopAndUnloadAsync();
        await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
        const uri = recording.getURI();
        recordingRef.current = null;
        if (!uri) {
          addMessage({ role: "assistant", content: "Could not capture audio. Please try again." });
          return;
        }
        setIsTranscribing(true);
        const base64 = await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        const text = await transcribeAudio(base64, "audio/m4a");
        setIsTranscribing(false);
        if (text) {
          setInput(text);
        } else {
          addMessage({ role: "assistant", content: "Couldn't understand the audio. Please try again or type your requirement." });
        }
      } catch {
        setIsListening(false);
        setIsTranscribing(false);
        setRecordingSecs(0);
        recordingRef.current = null;
        if (recordingTimerRef.current) {
          clearInterval(recordingTimerRef.current);
          recordingTimerRef.current = null;
        }
        addMessage({ role: "assistant", content: "Recording error. Please try again." });
      }
      return;
    }

    // Start recording
    try {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) {
        addMessage({ role: "assistant", content: "Microphone permission is needed for voice input. Please allow it in Settings." });
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await recording.startAsync();
      recordingRef.current = recording;
      setRecordingSecs(0);
      setIsListening(true);

      // Tick counter + auto-stop after MAX_RECORD_SECS
      let secs = 0;
      recordingTimerRef.current = setInterval(() => {
        secs += 1;
        setRecordingSecs(secs);
        if (secs >= MAX_RECORD_SECS) {
          clearInterval(recordingTimerRef.current!);
          recordingTimerRef.current = null;
          handleMicPress(); // trigger stop-and-transcribe
        }
      }, 1000);
    } catch {
      addMessage({ role: "assistant", content: "Could not start recording. Please check microphone permissions." });
    }
  };

  useEffect(() => {
    const existing = lead ? getQuotationForLead(lead.id) : undefined;
    if (existing) {
      setQuotationItems(existing.items);
      const quoteDate = new Date(existing.createdAt).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
      setChatStarted(true);
      setMessages([
        {
          id: generateId(),
          role: "assistant",
          content: `You have an existing quotation (${existing.quoteNumber}) for ${lead?.name} created on ${quoteDate}. What would you like to do?`,
          buttons: [
            { label: "Edit Previous Quote", action: "edit_quote", icon: "edit-2" },
            { label: "Create New Quote", action: "new_quote", icon: "plus-circle" },
            { label: "Send Reminder on WhatsApp", action: "send_reminder", icon: "message-circle" },
          ],
        },
      ]);
    }
    // No existing quote → stay in pre-chat state, show "Create Quotation" button
  }, []);

  const addMessage = useCallback((msg: Omit<ChatMessage, "id">) => {
    const newMsg = { ...msg, id: generateId() };
    setMessages((prev) => [newMsg, ...prev]);
    return newMsg;
  }, []);

  const handleStartChat = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setChatStarted(true);
    setMessages([
      {
        id: generateId(),
        role: "assistant",
        content: `Sure! Tell me what products you want to add to the quotation for ${lead?.name || "this lead"}. You can type or tap the mic to speak.`,
      },
    ]);
  }, [lead]);

  const handleSend = async (text?: string) => {
    const userText = text || input.trim();
    if (!userText || isSending) return;
    // Stop any active voice input before sending
    if (isListening) {
      if (_nativeSpeechAvailable && ExpoSpeechRecognitionModule) {
        ExpoSpeechRecognitionModule.stop();
      } else if (Platform.OS === "web") {
        webRecognitionRef.current?.stop();
      } else {
        // Expo Go: discard the recording, user explicitly typed
        recordingRef.current?.stopAndUnloadAsync().catch(() => {});
        recordingRef.current = null;
      }
      setIsListening(false);
    }

    setInput("");
    setIsSending(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    addMessage({ role: "user", content: userText });
    const loadingMsg = addMessage({ role: "assistant", content: "", isLoading: true });
    const newHistory: AIMessage[] = [...conversationHistory, { role: "user", content: userText }];
    const response = await parseRequirementWithAI(userText, products, conversationHistory);
    setMessages((prev) => prev.filter((m) => m.id !== loadingMsg.id));

    if (response.type === "error") {
      addMessage({ role: "assistant", content: response.message });
    } else if (response.type === "quotation_ready") {
      const newItems = [...quotationItems, ...(response.quotationItems || [])];
      setQuotationItems(newItems);
      setConversationHistory([...newHistory, { role: "assistant", content: "All items added." }]);
      addMessage({
        role: "assistant",
        content: `${newItems.length} item${newItems.length !== 1 ? "s" : ""} added. Ready to preview?`,
        buttons: [{ label: "View Quotation Preview", action: "view_preview", icon: "eye" }],
      });
    } else if (response.type === "needs_action") {
      const matched = response.quotationItems || [];
      const unknown = response.unknownItems || [];
      if (matched.length > 0) setQuotationItems((prev) => [...prev, ...matched]);
      if (matched.length > 0) {
        addMessage({
          role: "assistant",
          content: `Added ${matched.length} item${matched.length !== 1 ? "s" : ""} to the quotation.`,
        });
      }
      for (const itemName of unknown) {
        addMessage({
          role: "assistant",
          content: `There is no item named "${itemName}" in your catalogue.`,
          buttons: [
            { label: "Add to Quotation", action: `add_unknown:${itemName}`, icon: "plus-circle" },
          ],
        });
      }
      const unknownList = unknown.map((u) => `"${u}"`).join(", ");
      setConversationHistory([...newHistory, { role: "assistant", content: `Some items not in catalogue: ${unknownList}` }]);
    }

    setIsSending(false);
  };

  const handleButtonAction = async (action: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (action === "view_preview") {
      handleSaveAndPreview();
    } else if (action === "edit_quote") {
      if (!lead) return;
      router.push(`/lead/${lead.id}/preview`);
    } else if (action === "new_quote") {
      setQuotationItems([]);
      setConversationHistory([]);
      handleStartChat();
    } else if (action === "send_reminder") {
      if (!lead) return;
      const existing = getQuotationForLead(lead.id);
      const dateStr = existing
        ? new Date(existing.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
        : new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
      const cleanNumber = lead.whatsappNumber.replace(/\D/g, "");
      const msg = encodeURIComponent(`Hello ${lead.name}, I have sent you a Quotation on ${dateStr}, kindly respond.`);
      Linking.openURL(`https://wa.me/${cleanNumber}?text=${msg}`).catch(() =>
        addMessage({ role: "assistant", content: "Could not open WhatsApp. Please check if it is installed." })
      );
    } else if (action.startsWith("add_unknown:")) {
      const itemName = action.slice("add_unknown:".length);
      setAddItemModal({ visible: true, itemName, price: "", unit: "" });
    }
  };

  const handleAddItemSubmit = async () => {
    const { itemName, price, unit } = addItemModal;
    const parsedPrice = parseFloat(price) || 0;
    const finalUnit = unit.trim() || "piece";
    await addProduct({ name: itemName, price: parsedPrice, unit: finalUnit });
    const newItem: QuotationItem = {
      id: generateId(),
      name: itemName,
      quantity: 1,
      unit: finalUnit,
      rate: parsedPrice,
    };
    setQuotationItems((prev) => [...prev, newItem]);
    setAddItemModal({ visible: false, itemName: "", price: "", unit: "" });
    addMessage({
      role: "assistant",
      content: `"${itemName}" added to your catalogue and quotation. Anything else to add?`,
    });
  };

  const handleSaveAndPreview = async () => {
    if (!lead) return;
    const existing = getQuotationForLead(lead.id);
    const quotation = existing
      ? { ...existing, items: quotationItems }
      : {
          id: generateId(),
          leadId: lead.id,
          items: quotationItems,
          notes: "",
          createdAt: new Date().toISOString(),
          quoteNumber: generateQuoteNumber(),
        };
    await saveQuotation(quotation);
    await updateLead({ ...lead, status: "Quote Created" });
    router.push(`/lead/${lead.id}/preview`);
  };

  const getButtonStyle = (action: string) => {
    const style = BUTTON_STYLE_MAP[getActionStyleKey(action)] || "outline";
    if (style === "primary") return { bg: colors.primary, textColor: "#fff", border: undefined };
    if (style === "whatsapp") return { bg: colors.whatsapp, textColor: "#fff", border: undefined };
    return { bg: colors.muted, textColor: colors.primary, border: colors.primary };
  };

  const renderItem = ({ item }: { item: ChatMessage }) => (
    <View style={[styles.messageRow, item.role === "user" ? styles.userRow : styles.assistantRow]}>
      {item.role === "assistant" && (
        <View style={[styles.agentAvatar, { backgroundColor: colors.primary }]}>
          <Icon name="zap" size={12} color="#fff" />
        </View>
      )}
      <View
        style={[
          styles.bubble,
          item.role === "user"
            ? [styles.userBubble, { backgroundColor: colors.primary }]
            : [styles.assistantBubble, { backgroundColor: colors.card, borderColor: colors.border }],
        ]}
      >
        {item.isLoading ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <>
            {!!item.content && (
              <Text style={[styles.bubbleText, { color: item.role === "user" ? "#fff" : colors.foreground }]}>
                {item.content}
              </Text>
            )}
            {item.buttons && item.buttons.length > 0 && (
              <View style={styles.buttonGroup}>
                {item.buttons.map((btn) => {
                  const s = getButtonStyle(btn.action);
                  return (
                    <TouchableOpacity
                      key={btn.action}
                      style={[styles.actionButton, { backgroundColor: s.bg, borderColor: s.border, borderWidth: s.border ? 1.5 : 0 }]}
                      onPress={() => handleButtonAction(btn.action)}
                      activeOpacity={0.8}
                    >
                      {btn.icon && <Icon name={btn.icon as any} size={14} color={s.textColor} />}
                      <Text style={[styles.actionButtonText, { color: s.textColor }]}>{btn.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </>
        )}
      </View>
    </View>
  );

  if (!lead) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, justifyContent: "center", alignItems: "center" }]}>
        <Text style={{ color: colors.mutedForeground }}>Lead not found</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AppHeader
        showBack
        onBack={() => router.back()}
        title={lead.name}
        subtitle={lead.whatsappNumber}
        onSubtitlePress={
          lead.whatsappNumber
            ? () => Linking.openURL(`tel:${lead.whatsappNumber}`).catch(() => {})
            : undefined
        }
        rightElement={
          quotationItems.length > 0 ? (
            <TouchableOpacity
              onPress={handleSaveAndPreview}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={["#4F46E5", "#6D28D9"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.previewBtn}
              >
                <Text style={styles.previewBtnText}>Preview</Text>
              </LinearGradient>
            </TouchableOpacity>
          ) : undefined
        }
      />

      {quotationItems.length > 0 && (
        <View style={[styles.itemsSummary, { backgroundColor: colors.primaryLight }]}>
          <Text style={[styles.itemsSummaryText, { color: colors.primary }]}>
            {quotationItems.length} item{quotationItems.length !== 1 ? "s" : ""} — ₹
            {quotationItems.reduce((sum, item) => sum + item.quantity * item.rate, 0).toLocaleString("en-IN")}
          </Text>
        </View>
      )}

      {/* ── Pre-chat state: no existing quotation, user hasn't started yet ── */}
      {!chatStarted && (
        <View style={styles.preChatContainer}>
          <View style={[styles.preChatIconWrap, { backgroundColor: colors.primaryLight }]}>
            <Icon name="file-text" size={38} color={colors.primary} />
          </View>
          <Text style={[styles.preChatTitle, { color: colors.foreground }]}>
            New Quotation
          </Text>
          <Text style={[styles.preChatSubtitle, { color: colors.mutedForeground }]}>
            Create a quotation for {lead.name} and share it directly on WhatsApp as a PDF.
          </Text>
          <GradientButton
            label="Create Quotation"
            onPress={handleStartChat}
            iconName="zap"
            size="lg"
            style={styles.createQuoteBtn}
          />
        </View>
      )}

      <Modal
        visible={addItemModal.visible}
        transparent
        animationType="slide"
        onRequestClose={() => setAddItemModal((s) => ({ ...s, visible: false }))}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>Add to Catalogue</Text>
              <TouchableOpacity onPress={() => setAddItemModal((s) => ({ ...s, visible: false }))} activeOpacity={0.7}>
                <Icon name="x" size={22} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={[styles.modalLabel, { color: colors.mutedForeground }]}>Product Name</Text>
              <TextInput
                style={[styles.modalInput, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.foreground }]}
                value={addItemModal.itemName}
                onChangeText={(v) => setAddItemModal((s) => ({ ...s, itemName: v }))}
                placeholder="Product name"
                placeholderTextColor={colors.mutedForeground}
                autoCapitalize="words"
              />

              <Text style={[styles.modalLabel, { color: colors.mutedForeground }]}>Price (₹)</Text>
              <TextInput
                style={[styles.modalInput, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.foreground }]}
                value={addItemModal.price}
                onChangeText={(v) => setAddItemModal((s) => ({ ...s, price: v }))}
                placeholder="e.g. 120"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="decimal-pad"
              />

              <Text style={[styles.modalLabel, { color: colors.mutedForeground }]}>Unit of Measurement</Text>
              <TextInput
                style={[styles.modalInput, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.foreground }]}
                value={addItemModal.unit}
                onChangeText={(v) => setAddItemModal((s) => ({ ...s, unit: v }))}
                placeholder="e.g. kg, litre, piece"
                placeholderTextColor={colors.mutedForeground}
                autoCapitalize="none"
              />

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.modalCancelBtn, { borderColor: colors.border }]}
                  onPress={() => setAddItemModal((s) => ({ ...s, visible: false }))}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.modalCancelText, { color: colors.mutedForeground }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalSubmitBtn, { backgroundColor: colors.primary }]}
                  onPress={handleAddItemSubmit}
                  activeOpacity={0.85}
                  disabled={!addItemModal.itemName.trim()}
                >
                  <Icon name="plus-circle" size={16} color="#fff" />
                  <Text style={styles.modalSubmitText}>Add to Quotation</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <KeyboardAvoidingView style={chatStarted ? { flex: 1 } : { height: 0, overflow: "hidden" }} behavior="padding" keyboardVerticalOffset={0}>
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          inverted
          contentContainerStyle={[styles.chatContent, { paddingBottom: 8 }]}
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
        />

        {(isListening || isTranscribing) && (
          <View style={[styles.listeningBanner, { backgroundColor: colors.primaryLight }]}>
            {isTranscribing ? (
              <>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={[styles.listeningText, { color: colors.primary }]}>
                  Transcribing… please wait
                </Text>
              </>
            ) : (
              <>
                <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                  <Icon name="mic" size={16} color="#E53935" />
                </Animated.View>
                <Text style={[styles.listeningText, { color: "#E53935" }]}>
                  Recording… {MAX_RECORD_SECS - recordingSecs}s left — tap mic to send
                </Text>
              </>
            )}
          </View>
        )}

        <View
          style={[
            styles.inputBar,
            {
              backgroundColor: colors.card,
              borderTopColor: colors.border,
              paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 8),
            },
          ]}
        >
          <TextInput
            style={[
              styles.chatInput,
              { backgroundColor: colors.muted, borderColor: colors.border, color: colors.foreground },
            ]}
            placeholder={isTranscribing ? "Transcribing…" : isListening ? "Recording… tap mic to stop" : "Type or speak your requirement…"}
            placeholderTextColor={isListening || isTranscribing ? "#E53935" : colors.mutedForeground}
            value={input}
            onChangeText={setInput}
            multiline
            maxLength={500}
            onSubmitEditing={() => handleSend()}
          />

          <TouchableOpacity
            style={[
              styles.iconBtn,
              { backgroundColor: isListening ? "#FFEBEE" : isTranscribing ? colors.primaryLight : colors.muted },
            ]}
            onPress={handleMicPress}
            disabled={isTranscribing}
            activeOpacity={0.8}
          >
            {isTranscribing ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Animated.View style={{ transform: [{ scale: isListening ? pulseAnim : 1 }] }}>
                <Icon
                  name={isListening ? "mic-off" : "mic"}
                  size={20}
                  color={isListening ? "#E53935" : colors.mutedForeground}
                />
              </Animated.View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => handleSend()}
            disabled={!input.trim() || isSending}
            activeOpacity={0.85}
          >
            {input.trim() ? (
              <LinearGradient
                colors={["#4F46E5", "#6D28D9"]}
                style={styles.sendBtn}
              >
                <Icon name="send" size={18} color="#fff" />
              </LinearGradient>
            ) : (
              <View style={[styles.sendBtn, { backgroundColor: colors.muted }]}>
                <Icon name="send" size={18} color={colors.mutedForeground} />
              </View>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  previewBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 12,
    shadowColor: "#4F46E5",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
    overflow: "hidden",
  },
  previewBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#fff" },
  itemsSummary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  itemsSummaryText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  chatContent: { paddingHorizontal: 16, paddingTop: 12, gap: 12, flexDirection: "column" },
  messageRow: { flexDirection: "row", alignItems: "flex-end", gap: 8, marginVertical: 2 },
  userRow: { justifyContent: "flex-end" },
  assistantRow: { justifyContent: "flex-start" },
  agentAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  bubble: { maxWidth: "82%", borderRadius: 18, padding: 12, gap: 10 },
  userBubble: { borderBottomRightRadius: 4 },
  assistantBubble: { borderBottomLeftRadius: 4, borderWidth: 1 },
  bubbleText: { fontSize: 15, fontFamily: "Inter_400Regular", lineHeight: 22 },
  buttonGroup: { gap: 8 },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  actionButtonText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  listeningBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  listeningText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 12,
    paddingTop: 10,
    gap: 8,
    borderTopWidth: 1,
  },
  chatInput: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    maxHeight: 100,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#4F46E5",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 3,
    overflow: "hidden",
  },
  preChatContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 16,
  },
  preChatIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  preChatTitle: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
    letterSpacing: -0.3,
  },
  preChatSubtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 22,
  },
  createQuoteBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 16,
    marginTop: 8,
  },
  createQuoteBtnText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  modalLabel: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    marginBottom: 6,
    marginTop: 14,
  },
  modalInput: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 24,
  },
  modalCancelBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  modalCancelText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  modalSubmitBtn: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderRadius: 12,
    paddingVertical: 13,
  },
  modalSubmitText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
});
