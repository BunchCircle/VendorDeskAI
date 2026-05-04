import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
  TextInputProps,
  TouchableOpacity,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { GradientButton } from "@/components/GradientButton";
import { Icon } from "@/components/Icon";
import { AppHeader } from "@/components/AppHeader";
import * as Haptics from "expo-haptics";
import { useAudioRecorder, AudioModule, RecordingPresets } from "expo-audio";
import * as FileSystem from "expo-file-system/legacy";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
}
const _webSpeechAvailable =
  Platform.OS === "web" &&
  typeof window !== "undefined" &&
  !!((window as Window & typeof globalThis & { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }).SpeechRecognition ||
    (window as Window & typeof globalThis & { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }).webkitSpeechRecognition);

import { useApp } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";
import { parseRequirementWithAI, transcribeAudio, AIMessage } from "@/services/ai";
import {
  generateId,
  generateQuoteNumber,
  generateInvoiceNumber,
  Lead,
  QuotationItem,
  Invoice,
  InvoiceStatus,
  QuotationStatus,
  computeTaxSplit,
  computeTaxSplitFromAmount,
  computePerItemTaxData,
  sanitizeQuotation,
  getVendorStateCode,
} from "@/services/storage";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  buttons?: Array<{ label: string; action: string; icon?: string }>;
  isLoading?: boolean;
}

type ButtonStyleKey = "primary" | "outline" | "whatsapp" | "invoice";

const BUTTON_STYLE_MAP: Record<string, ButtonStyleKey> = {
  view_preview: "primary",
  view_invoice_preview: "invoice",
  edit_quote: "outline",
  new_quote: "outline",
  start_quote: "outline",
  send_reminder: "whatsapp",
  create_invoice: "invoice",
  start_invoice_chat: "invoice",
  convert_to_invoice: "invoice",
  new_invoice: "invoice",
  view_invoice: "primary",
  view_quotation: "primary",
};

const INVOICE_INTENTS = [
  "invoice", "bill", "billing", "create invoice", "make invoice",
  "generate invoice", "send invoice", "invoice banao", "invoice chahiye",
];

function hasInvoiceIntent(text: string): boolean {
  const lower = text.toLowerCase();
  return INVOICE_INTENTS.some((kw) => lower.includes(kw));
}

function getActionStyleKey(action: string): string {
  if (action.startsWith("add_unknown:")) return "view_preview";
  return action;
}

const INVOICE_STATUS_CONFIG: Record<InvoiceStatus, { bg: string; text: string; dot: string; label: string }> = {
  draft: { bg: "#FEF3C7", text: "#92400E", dot: "#D97706", label: "Draft" },
  sent: { bg: "#DBEAFE", text: "#1E40AF", dot: "#2563EB", label: "Sent" },
  paid: { bg: "#D1FAE5", text: "#065F46", dot: "#059669", label: "Paid" },
};

const INVOICE_STATUS_ORDER: InvoiceStatus[] = ["draft", "sent", "paid"];

const QUOTATION_STATUS_CONFIG: Record<QuotationStatus, { bg: string; text: string; dot: string; label: string }> = {
  draft: { bg: "#FEF3C7", text: "#92400E", dot: "#D97706", label: "Draft" },
  sent: { bg: "#DBEAFE", text: "#1E40AF", dot: "#2563EB", label: "Sent" },
  approved: { bg: "#D1FAE5", text: "#065F46", dot: "#059669", label: "Approved" },
};

const QUOTATION_STATUS_ORDER: QuotationStatus[] = ["draft", "sent", "approved"];

export default function QuotationWorkspaceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const {
    leads, products, addProduct, saveQuotation, updateLead,
    vendorProfile, invoices, saveInvoice,
    updateInvoiceStatus, deleteInvoice, quotations,
    updateQuotationStatus, deleteQuotation,
  } = useApp();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const lead = leads.find((l) => l.id === id) as Lead | undefined;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [chatStarted, setChatStarted] = useState(false);
  const [chatMode, setChatMode] = useState<"quotation" | "invoice">("quotation");
  const [quotationItems, setQuotationItems] = useState<QuotationItem[]>([]);
  const [invoiceItems, setInvoiceItems] = useState<QuotationItem[]>([]);
  const [conversationHistory, setConversationHistory] = useState<AIMessage[]>([]);
  const flatListRef = useRef<FlatList>(null);
  const [actionMenuVisible, setActionMenuVisible] = useState(false);
  const [statusMenuFor, setStatusMenuFor] = useState<string | null>(null);
  const [quotationStatusMenuFor, setQuotationStatusMenuFor] = useState<string | null>(null);

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
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const webRecognitionRef = useRef<{ stop(): void } | null>(null);
  const webTranscriptRef = useRef<string>("");
  const nativeSpeechSentRef = useRef(false);
  const nativeSpeechErrorRef = useRef(false);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const MAX_RECORD_SECS = 30;

  useSpeechRecognitionEvent("start", () => {
    nativeSpeechSentRef.current = false;
    nativeSpeechErrorRef.current = false;
    setIsListening(true);
  });
  useSpeechRecognitionEvent("end", () => {
    setIsListening(false);
    if (!nativeSpeechSentRef.current && !nativeSpeechErrorRef.current) {
      addMessage({ role: "assistant", content: "Couldn't understand. Please try again or type your requirement." });
    }
  });
  useSpeechRecognitionEvent("result", (event) => {
    const result = event.results[0];
    const transcript = result?.[0]?.transcript || "";
    if (transcript) {
      if (result?.isFinal) {
        nativeSpeechSentRef.current = true;
        handleSend(transcript);
      } else {
        setInput(transcript);
      }
    }
  });
  useSpeechRecognitionEvent("error", () => {
    nativeSpeechErrorRef.current = true;
    setIsListening(false);
  });

  useEffect(() => {
    return () => {
      audioRecorder.stop().catch(() => {});
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (isListening) {
      pulseLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.35, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
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
      type WebSpeechWindow = Window & typeof globalThis & {
        SpeechRecognition?: new () => {
          lang: string; interimResults: boolean; continuous: boolean;
          onstart: (() => void) | null; onend: (() => void) | null;
          onresult: ((e: { results: { length: number; [n: number]: { [n: number]: { transcript: string } } } }) => void) | null;
          onerror: (() => void) | null;
          start(): void; stop(): void;
        };
        webkitSpeechRecognition?: new () => {
          lang: string; interimResults: boolean; continuous: boolean;
          onstart: (() => void) | null; onend: (() => void) | null;
          onresult: ((e: { results: { length: number; [n: number]: { [n: number]: { transcript: string } } } }) => void) | null;
          onerror: (() => void) | null;
          start(): void; stop(): void;
        };
      };
      const SRCtor = (window as WebSpeechWindow).SpeechRecognition
        || (window as WebSpeechWindow).webkitSpeechRecognition;
      if (!SRCtor) return;
      const recognition = new SRCtor();
      recognition.lang = "en-IN";
      recognition.interimResults = true;
      recognition.continuous = false;
      let webSpeechError = false;
      recognition.onstart = () => setIsListening(true);
      recognition.onend = () => {
        setIsListening(false);
        const transcript = webTranscriptRef.current;
        webTranscriptRef.current = "";
        if (transcript) {
          handleSend(transcript);
        } else if (!webSpeechError) {
          addMessage({ role: "assistant", content: "Couldn't understand. Please try again or type your requirement." });
        }
      };
      recognition.onresult = (event) => {
        const results = event.results;
        const transcript = results[results.length - 1][0].transcript;
        if (transcript) {
          webTranscriptRef.current = transcript;
          setInput(transcript);
        }
      };
      recognition.onerror = () => {
        webSpeechError = true;
        webTranscriptRef.current = "";
        setIsListening(false);
      };
      webRecognitionRef.current = recognition;
      recognition.start();
      return;
    }

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

    if (isListening) {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
      try {
        setIsListening(false);
        setRecordingSecs(0);
        await audioRecorder.stop();
        await AudioModule.setAudioModeAsync({ allowsRecording: false });
        const uri = audioRecorder.uri;
        if (!uri) {
          addMessage({ role: "assistant", content: "Could not capture audio. Please try again." });
          return;
        }
        setIsTranscribing(true);
        const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
        const text = await transcribeAudio(base64, "audio/m4a");
        setIsTranscribing(false);
        if (text) {
          handleSend(text);
        } else {
          addMessage({ role: "assistant", content: "Couldn't understand the audio. Please try again or type your requirement." });
        }
      } catch {
        setIsListening(false);
        setIsTranscribing(false);
        setRecordingSecs(0);
        if (recordingTimerRef.current) {
          clearInterval(recordingTimerRef.current);
          recordingTimerRef.current = null;
        }
        addMessage({ role: "assistant", content: "Recording error. Please try again." });
      }
      return;
    }

    try {
      const { granted } = await AudioModule.requestRecordingPermissionsAsync();
      if (!granted) {
        addMessage({ role: "assistant", content: "Microphone permission is needed for voice input. Please allow it in Settings." });
        return;
      }
      await AudioModule.setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
      setRecordingSecs(0);
      setIsListening(true);

      let secs = 0;
      recordingTimerRef.current = setInterval(() => {
        secs += 1;
        setRecordingSecs(secs);
        if (secs >= MAX_RECORD_SECS) {
          clearInterval(recordingTimerRef.current!);
          recordingTimerRef.current = null;
          handleMicPress();
        }
      }, 1000);
    } catch {
      addMessage({ role: "assistant", content: "Could not start recording. Please check microphone permissions." });
    }
  };

  // Build event cards from quotation/invoice context data.
  // NOTE: pipe `|` is used as delimiter (not colon) to avoid colliding with ISO date colons.
  const eventItems = useMemo((): ChatMessage[] => {
    if (!lead) return [];
    const leadQuotations = quotations.filter((q) => q.leadId === lead.id);
    const leadInvoices = invoices.filter((inv) => inv.leadId === lead.id);
    const events: ChatMessage[] = [];

    for (const q of leadQuotations) {
      const sub = q.items.reduce((s, i) => s + i.quantity * i.rate, 0);
      const d = q.discount;
      const discAmt = d?.enabled ? (d.type === "percent" ? (sub * d.value) / 100 : Math.min(d.value, sub)) : 0;
      const afterDisc = sub - discAmt;
      const perItemTax = computePerItemTaxData(q.items);
      const taxAmt = perItemTax.totalTax;
      const total = afterDisc + taxAmt;
      events.push({
        id: `quote-event-${q.id}`,
        role: "assistant",
        content: `__EVENT_QUOTATION__|${q.id}|${q.quoteNumber}|${total}|${q.createdAt}|${q.status ?? "draft"}`,
        timestamp: new Date(q.createdAt).getTime(),
      });
    }

    for (const inv of leadInvoices) {
      const sub = inv.items.reduce((s, i) => s + i.quantity * i.rate, 0);
      const d = inv.discount;
      const discAmt = d?.enabled ? (d.type === "percent" ? (sub * d.value) / 100 : Math.min(d.value, sub)) : 0;
      const afterDisc = sub - discAmt;
      const t = inv.tax;
      const taxAmt = t?.enabled ? (afterDisc * t.rate) / 100 : 0;
      const total = afterDisc + taxAmt;
      events.push({
        id: `inv-event-${inv.id}`,
        role: "assistant",
        content: `__EVENT_INVOICE__|${inv.id}|${inv.invoiceNumber}|${total}|${inv.createdAt}|${inv.status}`,
        timestamp: new Date(inv.createdAt).getTime(),
      });
    }
    return events;
  }, [lead?.id, quotations, invoices]);

  // Unified sorted timeline (newest-first for inverted FlatList)
  const timeline = useMemo((): ChatMessage[] => {
    const combined = [...messages, ...eventItems];
    combined.sort((a, b) => b.timestamp - a.timestamp);
    return combined;
  }, [messages, eventItems]);

  // On mount: set chatStarted and populate welcome message if quotation/invoices exist
  useEffect(() => {
    if (!lead) return;
    // Get latest quotation by createdAt (most recent)
    const leadQuotationsSorted = quotations
      .filter((q) => q.leadId === lead.id)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const existing = leadQuotationsSorted[0];
    const leadInvoices = invoices.filter((inv) => inv.leadId === lead.id);

    if (existing) {
      setQuotationItems(existing.items);
      setChatStarted(true);
      const quoteDate = new Date(existing.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
      const hasInvoices = leadInvoices.length > 0;
      const buttons: ChatMessage["buttons"] = [
        { label: "Edit Quotation", action: "edit_quote", icon: "edit-2" },
        { label: "Create New Quote", action: "new_quote", icon: "plus-circle" },
        { label: "Send Reminder on WhatsApp", action: "send_reminder", icon: "message-circle" },
      ];
      if (!hasInvoices) {
        buttons.splice(2, 0, { label: "Convert to Invoice", action: "convert_to_invoice", icon: "file-text" });
      }
      const now = Date.now();
      setMessages([{
        id: generateId(),
        role: "assistant",
        content: `You have an existing quotation for ${lead.name} (${existing.quoteNumber}) created on ${quoteDate}. What would you like to do?`,
        buttons,
        timestamp: now,
      }]);
    } else if (leadInvoices.length > 0) {
      setChatStarted(true);
      setMessages([{
        id: generateId(),
        role: "assistant",
        content: `${leadInvoices.length} invoice${leadInvoices.length !== 1 ? "s" : ""} found for ${lead.name}. You can create a quotation or a new invoice.`,
        buttons: [
          { label: "Create Quotation", action: "start_quote", icon: "file-text" },
          { label: "Create Invoice", action: "create_invoice", icon: "credit-card" },
        ],
        timestamp: Date.now(),
      }]);
    }
  }, []);

  const addMessage = useCallback((msg: Omit<ChatMessage, "id" | "timestamp">) => {
    const newMsg: ChatMessage = { ...msg, id: generateId(), timestamp: Date.now() };
    setMessages((prev) => [newMsg, ...prev]);
    return newMsg;
  }, []);

  const handleStartChat = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setChatStarted(true);
    setMessages([{
      id: generateId(),
      role: "assistant",
      content: `Sure! Tell me what products you want to add to the quotation for ${lead?.name || "this lead"}. You can type or tap the mic to speak.`,
      timestamp: Date.now(),
    }]);
  }, [lead]);

  const getLatestQuotation = useCallback(() => {
    if (!lead) return undefined;
    return quotations
      .filter((q) => q.leadId === lead.id)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  }, [lead, quotations]);

  const handleStartInvoiceChat = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setChatMode("invoice");
    setInvoiceItems([]);
    setConversationHistory([]);
    setChatStarted(true);
    setMessages([{
      id: generateId(),
      role: "assistant",
      content: `Sure! Tell me what items you want on the invoice for ${lead?.name || "this lead"}. I'll match them with your product catalogue — even if the spelling is a bit off!`,
      timestamp: Date.now(),
    }]);
  }, [lead]);

  const handleStartInvoice = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setChatStarted(true);
    const existing = getLatestQuotation();
    const buttons: ChatMessage["buttons"] = [
      { label: "Add Items via AI Chat", action: "start_invoice_chat", icon: "zap" },
    ];
    if (existing) {
      buttons.unshift({ label: "Convert Last Quotation to Invoice", action: "convert_to_invoice", icon: "file-text" });
    }
    setMessages([{
      id: generateId(),
      role: "assistant",
      content: existing
        ? `I can create a GST invoice for ${lead?.name}. Convert the last quotation (${existing.quoteNumber}), or describe items in chat and I'll match them with your catalogue.`
        : `I can create a GST invoice for ${lead?.name}. Just tell me what to add — I'll match items with your catalogue using AI!`,
      buttons,
      timestamp: Date.now(),
    }]);
  }, [lead, getLatestQuotation]);

  const handleSend = async (text?: string) => {
    const userText = text || input.trim();
    if (!userText || isSending) return;
    if (isListening) {
      if (_nativeSpeechAvailable && ExpoSpeechRecognitionModule) ExpoSpeechRecognitionModule.stop();
      else if (Platform.OS === "web") webRecognitionRef.current?.stop();
      else audioRecorder.stop().catch(() => {});
      setIsListening(false);
    }

    setInput("");
    setIsSending(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    addMessage({ role: "user", content: userText });

    // Only offer invoice intent redirect when in quotation mode; invoice mode handles all text as item input
    if (chatMode === "quotation" && hasInvoiceIntent(userText)) {
      const existing = getLatestQuotation();
      const buttons: ChatMessage["buttons"] = [
        { label: "Add Items via AI Chat", action: "start_invoice_chat", icon: "zap" },
      ];
      if (existing) {
        buttons.unshift({ label: "Convert Last Quotation to Invoice", action: "convert_to_invoice", icon: "file-text" });
      }
      addMessage({
        role: "assistant",
        content: existing
          ? `I can create a GST invoice for ${lead?.name}. Convert the last quotation (${existing.quoteNumber}) or describe items in chat?`
          : `I can create a new GST invoice for ${lead?.name}. Describe the items and I'll match them with your catalogue!`,
        buttons,
      });
      setIsSending(false);
      return;
    }

    const isInvoiceMode = chatMode === "invoice";
    const loadingMsg = addMessage({ role: "assistant", content: "", isLoading: true });
    const newHistory: AIMessage[] = [...conversationHistory, { role: "user", content: userText }];
    const response = await parseRequirementWithAI(userText, products, conversationHistory);
    setMessages((prev) => prev.filter((m) => m.id !== loadingMsg.id));

    if (response.type === "error") {
      addMessage({ role: "assistant", content: response.message });
    } else if (response.type === "quotation_ready") {
      const added = response.quotationItems || [];
      if (isInvoiceMode) {
        const newItems = [...invoiceItems, ...added];
        setInvoiceItems(newItems);
        setConversationHistory([...newHistory, { role: "assistant", content: "All items added." }]);
        addMessage({
          role: "assistant",
          content: `${newItems.length} item${newItems.length !== 1 ? "s" : ""} added to invoice. Ready to preview?`,
          buttons: [{ label: "Preview Invoice", action: "view_invoice_preview", icon: "eye" }],
        });
      } else {
        const newItems = [...quotationItems, ...added];
        setQuotationItems(newItems);
        setConversationHistory([...newHistory, { role: "assistant", content: "All items added." }]);
        addMessage({
          role: "assistant",
          content: `${newItems.length} item${newItems.length !== 1 ? "s" : ""} added. Ready to preview?`,
          buttons: [{ label: "View Quotation Preview", action: "view_preview", icon: "eye" }],
        });
      }
    } else if (response.type === "needs_action") {
      const matched = response.quotationItems || [];
      const unknown = response.unknownItems || [];
      if (isInvoiceMode) {
        if (matched.length > 0) setInvoiceItems((prev) => [...prev, ...matched]);
        if (matched.length > 0) {
          addMessage({ role: "assistant", content: `Added ${matched.length} item${matched.length !== 1 ? "s" : ""} to the invoice.` });
        }
        for (const itemName of unknown) {
          addMessage({
            role: "assistant",
            content: `"${itemName}" is not in your catalogue yet.`,
            buttons: [{ label: "Add to Catalogue & Invoice", action: `add_unknown:${itemName}`, icon: "plus-circle" }],
          });
        }
      } else {
        if (matched.length > 0) setQuotationItems((prev) => [...prev, ...matched]);
        if (matched.length > 0) {
          addMessage({ role: "assistant", content: `Added ${matched.length} item${matched.length !== 1 ? "s" : ""} to the quotation.` });
        }
        for (const itemName of unknown) {
          addMessage({
            role: "assistant",
            content: `There is no item named "${itemName}" in your catalogue.`,
            buttons: [{ label: "Add to Catalogue & Quotation", action: `add_unknown:${itemName}`, icon: "plus-circle" }],
          });
        }
      }
      const unknownList = unknown.map((u: string) => `"${u}"`).join(", ");
      setConversationHistory([...newHistory, { role: "assistant", content: `Some items not in catalogue: ${unknownList}` }]);
    }

    setIsSending(false);
  };

  const handleSaveInvoiceAndPreview = async () => {
    if (!lead || invoiceItems.length === 0) return;
    const num = await generateInvoiceNumber();
    const vendorStateCode = getVendorStateCode(vendorProfile?.gstNumber);
    const defaultPlaceOfSupply = "";
    const subtotal = invoiceItems.reduce((s, i) => s + i.quantity * i.rate, 0);
    const taxSplit = computeTaxSplit(0, subtotal, vendorStateCode, defaultPlaceOfSupply);
    const invoice: Invoice = {
      id: generateId(),
      leadId: lead.id,
      invoiceNumber: num,
      invoiceDate: new Date().toISOString().split("T")[0],
      items: invoiceItems.map((item) => ({ ...item, id: generateId() })),
      placeOfSupply: defaultPlaceOfSupply,
      taxSplit,
      status: "draft",
      createdAt: new Date().toISOString(),
    };
    await saveInvoice(invoice);
    router.push(`/lead/${lead.id}/invoice-preview?invoiceId=${invoice.id}`);
  };

  const handleButtonAction = async (action: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (action === "view_preview") {
      handleSaveAndPreview();
    } else if (action === "view_invoice_preview") {
      handleSaveInvoiceAndPreview();
    } else if (action === "edit_quote") {
      if (!lead) return;
      router.push(`/lead/${lead.id}/preview`);
    } else if (action === "new_quote" || action === "start_quote") {
      setQuotationItems([]);
      setConversationHistory([]);
      handleStartChat();
    } else if (action === "send_reminder") {
      if (!lead) return;
      const existing = getLatestQuotation();
      const dateStr = existing
        ? new Date(existing.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
        : new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
      const cleanNumber = lead.whatsappNumber.replace(/\D/g, "");
      const msg = encodeURIComponent(`Hello ${lead.name}, I have sent you a Quotation on ${dateStr}, kindly respond.`);
      Linking.openURL(`https://wa.me/${cleanNumber}?text=${msg}`).catch(() =>
        addMessage({ role: "assistant", content: "Could not open WhatsApp. Please check if it is installed." })
      );
    } else if (action === "create_invoice") {
      handleStartInvoice();
    } else if (action === "start_invoice_chat") {
      handleStartInvoiceChat();
    } else if (action === "convert_to_invoice") {
      if (!lead) return;
      const existing = getLatestQuotation();
      if (!existing) {
        router.push(`/lead/${lead.id}/invoice-preview`);
        return;
      }
      const num = await generateInvoiceNumber();
      const vendorStateCode = getVendorStateCode(vendorProfile?.gstNumber);
      const defaultPlaceOfSupply = "";
      const subtotal = existing.items.reduce((s, i) => s + i.quantity * i.rate, 0);
      const d = existing.discount;
      const discAmt = d?.enabled ? (d.type === "percent" ? (subtotal * d.value) / 100 : Math.min(d.value, subtotal)) : 0;
      const afterDisc = subtotal - discAmt;
      const perItemTaxData = computePerItemTaxData(existing.items);
      const hasPerItemTaxes = perItemTaxData.slabs.length > 0;
      const taxSplit = hasPerItemTaxes
        ? computeTaxSplitFromAmount(perItemTaxData.totalTax, vendorStateCode, defaultPlaceOfSupply)
        : computeTaxSplit(0, afterDisc, vendorStateCode, defaultPlaceOfSupply);
      const invoice: Invoice = {
        id: generateId(),
        leadId: lead.id,
        invoiceNumber: num,
        invoiceDate: new Date().toISOString().split("T")[0],
        items: existing.items.map((item) => ({ ...item, id: generateId() })),
        notes: existing.notes,
        discount: existing.discount,
        tax: hasPerItemTaxes ? { enabled: true, label: "GST", rate: 0 } : undefined,
        placeOfSupply: defaultPlaceOfSupply,
        taxSplit,
        status: "draft",
        createdAt: new Date().toISOString(),
      };
      // Save first, then navigate so invoice-preview can read from context
      await saveInvoice(invoice);
      router.push(`/lead/${lead.id}/invoice-preview?invoiceId=${invoice.id}`);
    } else if (action === "new_invoice") {
      handleStartInvoiceChat();
    } else if (action === "view_quotation") {
      if (!lead) return;
      router.push(`/lead/${lead.id}/preview`);
    } else if (action.startsWith("view_invoice:")) {
      const invId = action.slice("view_invoice:".length);
      if (!lead) return;
      router.push(`/lead/${lead.id}/invoice-pdf?invoiceId=${invId}`);
    } else if (action.startsWith("add_unknown:")) {
      const itemName = action.slice("add_unknown:".length);
      setAddItemModal({ visible: true, itemName, price: "", unit: "" });
    }
  };

  const handleInvoiceStatusChange = async (invoiceId: string, status: InvoiceStatus) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await updateInvoiceStatus(invoiceId, status);
    setStatusMenuFor(null);
  };

  const handleQuotationStatusChange = async (quotationId: string, status: QuotationStatus) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await updateQuotationStatus(quotationId, status);
    setQuotationStatusMenuFor(null);
  };

  const handleDeleteDraftCard = (type: "quotation" | "invoice", recordId: string, messageId: string) => {
    const label = type === "quotation" ? "quotation" : "invoice";
    Alert.alert(
      "Delete Draft",
      `Delete this draft ${label}? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            if (type === "quotation") {
              await deleteQuotation(recordId);
            } else {
              await deleteInvoice(recordId);
            }
            setMessages((prev) => prev.filter((m) => m.id !== messageId));
          },
        },
      ]
    );
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
    if (chatMode === "invoice") {
      setInvoiceItems((prev) => [...prev, newItem]);
      setAddItemModal({ visible: false, itemName: "", price: "", unit: "" });
      addMessage({ role: "assistant", content: `"${itemName}" added to your catalogue and invoice. Anything else?` });
    } else {
      setQuotationItems((prev) => [...prev, newItem]);
      setAddItemModal({ visible: false, itemName: "", price: "", unit: "" });
      addMessage({ role: "assistant", content: `"${itemName}" added to your catalogue and quotation. Anything else to add?` });
    }
  };

  const handleSaveAndPreview = async () => {
    if (!lead) return;
    const existing = getLatestQuotation();
    const quotation = existing
      ? sanitizeQuotation({ ...existing, items: quotationItems })
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
    const styleKey = getActionStyleKey(action);
    const style = BUTTON_STYLE_MAP[styleKey] || "outline";
    if (style === "primary") return { bg: colors.primary, textColor: "#fff", border: undefined };
    if (style === "whatsapp") return { bg: colors.whatsapp, textColor: "#fff", border: undefined };
    if (style === "invoice") return { bg: "#1e1b4b", textColor: "#fff", border: undefined };
    return { bg: colors.muted, textColor: colors.primary, border: colors.primary };
  };

  const parseEventContent = (content: string) => {
    if (content.startsWith("__EVENT_QUOTATION__|")) {
      const [, id, number, total, date, status] = content.split("|");
      return { type: "quotation" as const, id, number, total: parseFloat(total), date, status: (status ?? "draft") as QuotationStatus };
    }
    if (content.startsWith("__EVENT_INVOICE__|")) {
      const [, id, number, total, date, status] = content.split("|");
      return { type: "invoice" as const, id, number, total: parseFloat(total), date, status: status as InvoiceStatus };
    }
    return null;
  };

  const renderEventCard = (item: ChatMessage) => {
    const ev = parseEventContent(item.content);
    if (!ev) return null;

    if (ev.type === "quotation") {
      const dateStr = new Date(ev.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
      const qStatusCfg = QUOTATION_STATUS_CONFIG[ev.status] || QUOTATION_STATUS_CONFIG.draft;
      const sendQuoteReminder = () => {
        if (!lead) return;
        const cleanNumber = lead.whatsappNumber.replace(/\D/g, "");
        const msg = encodeURIComponent(`Hello ${lead.name}, I have sent you a Quotation on ${dateStr}, waiting for your response.`);
        Linking.openURL(`https://wa.me/${cleanNumber}?text=${msg}`).catch(() =>
          addMessage({ role: "assistant", content: "Could not open WhatsApp. Please check if it is installed." })
        );
      };
      return (
        <View style={[styles.eventCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.eventCardAccent, { backgroundColor: colors.primary }]} />
          <View style={styles.eventCardBody}>
            <View style={styles.eventCardRow}>
              <Icon name="file-text" size={14} color={colors.primary} />
              <Text style={[styles.eventCardNumber, { color: colors.primary }]}>{ev.number}</Text>
              <View style={[styles.eventTypeBadge, { backgroundColor: colors.primaryLight }]}>
                <Text style={[styles.eventTypeText, { color: colors.primary }]}>Quotation</Text>
              </View>
              <TouchableOpacity
                style={[styles.statusBadge, { backgroundColor: qStatusCfg.bg }]}
                onPress={() => setQuotationStatusMenuFor(ev.id)}
                activeOpacity={0.8}
              >
                <View style={[styles.statusDot, { backgroundColor: qStatusCfg.dot }]} />
                <Text style={[styles.statusText, { color: qStatusCfg.text }]}>{qStatusCfg.label}</Text>
                <Icon name="chevron-down" size={10} color={qStatusCfg.text} />
              </TouchableOpacity>
              {ev.status === "draft" && (
                <TouchableOpacity
                  style={styles.deleteCardBtn}
                  onPress={() => handleDeleteDraftCard("quotation", ev.id, item.id)}
                  activeOpacity={0.7}
                >
                  <Icon name="trash-2" size={14} color="#DC2626" />
                </TouchableOpacity>
              )}
            </View>
            <View style={styles.eventCardRow}>
              <Text style={[styles.eventCardDate, { color: colors.mutedForeground }]}>{dateStr}</Text>
              <Text style={[styles.eventCardTotal, { color: colors.foreground }]}>₹{ev.total.toLocaleString("en-IN")}</Text>
            </View>
            <View style={styles.eventCardRow}>
              <TouchableOpacity
                style={[styles.eventCardBtn, { backgroundColor: colors.primary, flex: 1 }]}
                onPress={() => handleButtonAction("view_quotation")}
                activeOpacity={0.8}
              >
                <Icon name="eye" size={13} color="#fff" />
                <Text style={styles.eventCardBtnText}>View Quotation</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.reminderBtn, { borderColor: "#25D366" }]}
                onPress={sendQuoteReminder}
                activeOpacity={0.8}
              >
                <Icon name="message-circle" size={12} color="#25D366" />
                <Text style={[styles.reminderBtnText, { color: "#25D366" }]}>Remind</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      );
    }

    if (ev.type === "invoice") {
      const dateStr = new Date(ev.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
      const statusCfg = INVOICE_STATUS_CONFIG[ev.status] || INVOICE_STATUS_CONFIG.draft;
      const sendInvoiceReminder = () => {
        if (!lead) return;
        const cleanNumber = lead.whatsappNumber.replace(/\D/g, "");
        const msg = encodeURIComponent(`Hello ${lead.name}, I have sent you an Invoice on ${dateStr}, waiting for your response.`);
        Linking.openURL(`https://wa.me/${cleanNumber}?text=${msg}`).catch(() =>
          addMessage({ role: "assistant", content: "Could not open WhatsApp. Please check if it is installed." })
        );
      };
      return (
        <View style={[styles.eventCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.eventCardAccent, { backgroundColor: "#4338CA" }]} />
          <View style={styles.eventCardBody}>
            <View style={styles.eventCardRow}>
              <Icon name="credit-card" size={14} color="#4338CA" />
              <Text style={[styles.eventCardNumber, { color: "#4338CA" }]}>{ev.number}</Text>
              <View style={[styles.eventTypeBadge, { backgroundColor: "#EEF2FF" }]}>
                <Text style={[styles.eventTypeText, { color: "#4338CA" }]}>Invoice</Text>
              </View>
              <TouchableOpacity
                style={[styles.statusBadge, { backgroundColor: statusCfg.bg }]}
                onPress={() => setStatusMenuFor(ev.id)}
                activeOpacity={0.8}
              >
                <View style={[styles.statusDot, { backgroundColor: statusCfg.dot }]} />
                <Text style={[styles.statusText, { color: statusCfg.text }]}>{statusCfg.label}</Text>
                <Icon name="chevron-down" size={10} color={statusCfg.text} />
              </TouchableOpacity>
              {ev.status === "draft" && (
                <TouchableOpacity
                  style={styles.deleteCardBtn}
                  onPress={() => handleDeleteDraftCard("invoice", ev.id, item.id)}
                  activeOpacity={0.7}
                >
                  <Icon name="trash-2" size={14} color="#DC2626" />
                </TouchableOpacity>
              )}
            </View>
            <View style={styles.eventCardRow}>
              <Text style={[styles.eventCardDate, { color: colors.mutedForeground }]}>{dateStr}</Text>
              <Text style={[styles.eventCardTotal, { color: colors.foreground }]}>₹{ev.total.toLocaleString("en-IN")}</Text>
            </View>
            <View style={styles.eventCardRow}>
              <TouchableOpacity
                style={[styles.eventCardBtn, { backgroundColor: "#4338CA", flex: 1 }]}
                onPress={() => handleButtonAction(`view_invoice:${ev.id}`)}
                activeOpacity={0.8}
              >
                <Icon name="eye" size={13} color="#fff" />
                <Text style={styles.eventCardBtnText}>View Invoice</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.reminderBtn, { borderColor: "#25D366" }]}
                onPress={sendInvoiceReminder}
                activeOpacity={0.8}
              >
                <Icon name="message-circle" size={12} color="#25D366" />
                <Text style={[styles.reminderBtnText, { color: "#25D366" }]}>Remind</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      );
    }
    return null;
  };

  const renderItem = ({ item }: { item: ChatMessage }) => {
    if (item.content.startsWith("__EVENT_")) {
      const card = renderEventCard(item);
      return card ? <View style={{ marginVertical: 4 }}>{card}</View> : null;
    }
    return (
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
  };

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
        emphasizedTitle
        subtitle={lead.whatsappNumber}
        onSubtitlePress={
          lead.whatsappNumber
            ? () => Linking.openURL(`tel:${lead.whatsappNumber}`).catch(() => {})
            : undefined
        }
        rightElement={
          quotationItems.length > 0 ? (
            <TouchableOpacity onPress={handleSaveAndPreview} activeOpacity={0.85}>
              <LinearGradient colors={["#4F46E5", "#6D28D9"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.previewBtn}>
                <Text style={styles.previewBtnText}>Preview</Text>
              </LinearGradient>
            </TouchableOpacity>
          ) : invoiceItems.length > 0 ? (
            <TouchableOpacity onPress={handleSaveInvoiceAndPreview} activeOpacity={0.85}>
              <LinearGradient colors={["#1e1b4b", "#4338CA"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.previewBtn}>
                <Text style={styles.previewBtnText}>Invoice</Text>
              </LinearGradient>
            </TouchableOpacity>
          ) : undefined
        }
      />

      {quotationItems.length > 0 && (
        <View style={[styles.itemsSummary, { backgroundColor: colors.primaryLight }]}>
          <Icon name="file-text" size={13} color={colors.primary} />
          <Text style={[styles.itemsSummaryText, { color: colors.primary }]}>
            {quotationItems.length} item{quotationItems.length !== 1 ? "s" : ""} — ₹
            {quotationItems.reduce((sum, item) => sum + item.quantity * item.rate, 0).toLocaleString("en-IN")}
          </Text>
        </View>
      )}
      {invoiceItems.length > 0 && (
        <View style={[styles.itemsSummary, { backgroundColor: "#EEF2FF" }]}>
          <Icon name="credit-card" size={13} color="#4338CA" />
          <Text style={[styles.itemsSummaryText, { color: "#4338CA" }]}>
            {invoiceItems.length} item{invoiceItems.length !== 1 ? "s" : ""} — ₹
            {invoiceItems.reduce((sum, item) => sum + item.quantity * item.rate, 0).toLocaleString("en-IN")}
          </Text>
        </View>
      )}

      {!chatStarted && (
        <View style={styles.preChatContainer}>
          <View style={[styles.preChatIconWrap, { backgroundColor: colors.primaryLight }]}>
            <Icon name="file-text" size={38} color={colors.primary} />
          </View>
          <Text style={[styles.preChatTitle, { color: colors.foreground }]}>New Quotation or Invoice</Text>
          <Text style={[styles.preChatSubtitle, { color: colors.mutedForeground }]}>
            Create a quotation or GST invoice for {lead.name} and share it on WhatsApp.
          </Text>
          <GradientButton
            label="Create Quotation"
            onPress={handleStartChat}
            iconName="zap"
            size="lg"
            style={styles.createQuoteBtn}
          />
          <TouchableOpacity
            style={[styles.createInvoiceBtn, { borderColor: colors.primary, backgroundColor: colors.primaryLight }]}
            onPress={handleStartInvoice}
            activeOpacity={0.8}
          >
            <Icon name="credit-card" size={16} color={colors.primary} />
            <Text style={[styles.createInvoiceBtnText, { color: colors.primary }]}>Create Invoice</Text>
          </TouchableOpacity>
        </View>
      )}

      <Modal visible={addItemModal.visible} transparent animationType="slide" onRequestClose={() => setAddItemModal((s) => ({ ...s, visible: false }))}>
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

      <Modal visible={actionMenuVisible} transparent animationType="fade">
        <TouchableOpacity style={styles.actionMenuOverlay} activeOpacity={1} onPress={() => setActionMenuVisible(false)}>
          <View style={[styles.actionMenuSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <TouchableOpacity
              style={[styles.actionMenuItem, { borderBottomColor: colors.border }]}
              onPress={() => {
                setActionMenuVisible(false);
                setQuotationItems([]);
                setConversationHistory([]);
                handleStartChat();
              }}
              activeOpacity={0.7}
            >
              <View style={[styles.actionMenuIcon, { backgroundColor: colors.primaryLight }]}>
                <Icon name="file-text" size={16} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.actionMenuLabel, { color: colors.foreground }]}>New Quotation</Text>
                <Text style={[styles.actionMenuSub, { color: colors.mutedForeground }]}>Create via AI chat</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionMenuItem}
              onPress={() => {
                setActionMenuVisible(false);
                handleStartInvoice();
              }}
              activeOpacity={0.7}
            >
              <View style={[styles.actionMenuIcon, { backgroundColor: "#EEF2FF" }]}>
                <Icon name="credit-card" size={16} color="#4338CA" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.actionMenuLabel, { color: colors.foreground }]}>New Invoice</Text>
                <Text style={[styles.actionMenuSub, { color: colors.mutedForeground }]}>GST-compliant tax invoice</Text>
              </View>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Quotation status menu (on-card) */}
      <Modal visible={!!quotationStatusMenuFor} transparent animationType="fade">
        <TouchableOpacity style={styles.statusMenuOverlay} activeOpacity={1} onPress={() => setQuotationStatusMenuFor(null)}>
          <View style={[styles.statusMenu, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.statusMenuTitle, { color: colors.mutedForeground }]}>Update Status</Text>
            {QUOTATION_STATUS_ORDER.map((s) => {
              const cfg = QUOTATION_STATUS_CONFIG[s];
              return (
                <TouchableOpacity
                  key={s}
                  style={[styles.statusMenuItem]}
                  onPress={() => quotationStatusMenuFor ? handleQuotationStatusChange(quotationStatusMenuFor, s) : null}
                  activeOpacity={0.7}
                >
                  <View style={[styles.statusDot, { backgroundColor: cfg.dot, width: 8, height: 8, borderRadius: 4 }]} />
                  <Text style={[styles.statusMenuLabel, { color: colors.foreground }]}>{cfg.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={!!statusMenuFor} transparent animationType="fade">
        <TouchableOpacity style={styles.statusMenuOverlay} activeOpacity={1} onPress={() => setStatusMenuFor(null)}>
          <View style={[styles.statusMenu, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.statusMenuTitle, { color: colors.mutedForeground }]}>Update Status</Text>
            {INVOICE_STATUS_ORDER.map((s) => {
              const cfg = INVOICE_STATUS_CONFIG[s];
              return (
                <TouchableOpacity
                  key={s}
                  style={[styles.statusMenuItem]}
                  onPress={() => statusMenuFor ? handleInvoiceStatusChange(statusMenuFor, s) : null}
                  activeOpacity={0.7}
                >
                  <View style={[styles.statusDot, { backgroundColor: cfg.dot, width: 8, height: 8, borderRadius: 4 }]} />
                  <Text style={[styles.statusMenuLabel, { color: colors.foreground }]}>{cfg.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>

      <KeyboardAvoidingView style={chatStarted ? { flex: 1 } : { height: 0, overflow: "hidden" }} behavior="padding" keyboardVerticalOffset={0}>
        <FlatList
          ref={flatListRef}
          data={timeline}
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
                <Text style={[styles.listeningText, { color: colors.primary }]}>Transcribing… please wait</Text>
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
          <TouchableOpacity
            style={[styles.iconBtn, { backgroundColor: colors.muted }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setActionMenuVisible(true);
            }}
            activeOpacity={0.8}
          >
            <Icon name="plus" size={20} color={colors.mutedForeground} />
          </TouchableOpacity>

          <TextInput
            style={[styles.chatInput, { backgroundColor: colors.muted, borderColor: colors.border, color: colors.foreground }]}
            placeholder={isTranscribing ? "Transcribing…" : isListening ? "Recording… tap mic to stop" : "Type your requirement…"}
            placeholderTextColor={isListening || isTranscribing ? "#E53935" : colors.mutedForeground}
            value={input}
            onChangeText={setInput}
            multiline
            maxLength={500}
            onSubmitEditing={() => handleSend()}
          />

          <TouchableOpacity
            style={[styles.iconBtn, { backgroundColor: isListening ? "#FFEBEE" : isTranscribing ? colors.primaryLight : colors.muted }, { display: 'none' }]}
            onPress={handleMicPress}
            disabled={isTranscribing}
            activeOpacity={0.8}
          >
            {isTranscribing ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Animated.View style={{ transform: [{ scale: isListening ? pulseAnim : 1 }] }}>
                <Icon name={isListening ? "mic-off" : "mic"} size={20} color={isListening ? "#E53935" : colors.mutedForeground} />
              </Animated.View>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => handleSend()} disabled={!input.trim() || isSending} activeOpacity={0.85}>
            {input.trim() ? (
              <LinearGradient colors={["#4F46E5", "#6D28D9"]} style={styles.sendBtn}>
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
    boxShadow: "0px 3px 8px rgba(79, 70, 229, 0.25)",
    elevation: 3,
    overflow: "hidden",
  },
  previewBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#fff" },
  itemsSummary: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 16, paddingVertical: 8 },
  itemsSummaryText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  chatContent: { paddingHorizontal: 16, paddingTop: 12, gap: 12, flexDirection: "column" },
  messageRow: { flexDirection: "row", alignItems: "flex-end", gap: 8, marginVertical: 2 },
  userRow: { justifyContent: "flex-end" },
  assistantRow: { justifyContent: "flex-start" },
  agentAvatar: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", flexShrink: 0 },
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
  eventCard: { borderRadius: 14, borderWidth: 1, flexDirection: "row", overflow: "hidden", marginHorizontal: 4 },
  eventCardAccent: { width: 4 },
  eventCardBody: { flex: 1, padding: 12, gap: 8 },
  eventCardRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  eventCardNumber: { fontSize: 14, fontFamily: "Inter_700Bold" },
  eventTypeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  eventTypeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 },
  statusDot: { width: 5, height: 5, borderRadius: 3 },
  statusText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  deleteCardBtn: { padding: 4 },
  eventCardDate: { fontSize: 12, fontFamily: "Inter_400Regular", flex: 1 },
  eventCardTotal: { fontSize: 15, fontFamily: "Inter_700Bold" },
  eventCardBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 8, borderRadius: 8 },
  eventCardBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#fff" },
  reminderBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, borderWidth: 1.5 },
  reminderBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  listeningBanner: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
  listeningText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  inputBar: { flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 12, paddingTop: 10, gap: 8, borderTopWidth: 1 },
  chatInput: { flex: 1, borderWidth: 1.5, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 12, fontSize: 15, fontFamily: "Inter_400Regular", maxHeight: 100 },
  iconBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0px 2px 8px rgba(79, 70, 229, 0.3)",
    elevation: 3,
    overflow: "hidden",
  },
  preChatContainer: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32, gap: 14 },
  preChatIconWrap: { width: 88, height: 88, borderRadius: 44, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  preChatTitle: { fontSize: 22, fontFamily: "Inter_700Bold", textAlign: "center", letterSpacing: -0.3 },
  preChatSubtitle: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 22 },
  createQuoteBtn: { flexDirection: "row", gap: 10, borderRadius: 16, marginTop: 8, width: "100%" },
  createInvoiceBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 32, paddingVertical: 14, borderRadius: 16, borderWidth: 1.5, width: "100%" },
  createInvoiceBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  modalSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, boxShadow: "0px -4px 16px rgba(0, 0, 0, 0.12)", elevation: 8 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  modalLabel: { fontSize: 13, fontFamily: "Inter_500Medium", marginBottom: 6, marginTop: 14 },
  modalInput: { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, fontFamily: "Inter_400Regular" },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 24 },
  modalCancelBtn: { flex: 1, borderWidth: 1.5, borderRadius: 12, paddingVertical: 13, alignItems: "center", justifyContent: "center" },
  modalCancelText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  modalSubmitBtn: { flex: 2, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderRadius: 12, paddingVertical: 13 },
  modalSubmitText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#fff" },
  actionMenuOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  actionMenuSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 1, paddingBottom: 32, overflow: "hidden" },
  actionMenuItem: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16, borderBottomWidth: 1 },
  actionMenuIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  actionMenuLabel: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  actionMenuSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  statusMenuOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", alignItems: "center" },
  statusMenu: { borderRadius: 16, borderWidth: 1, padding: 8, width: 200, gap: 2 },
  statusMenuTitle: { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.8, paddingHorizontal: 10, paddingVertical: 6 },
  statusMenuItem: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 10, paddingVertical: 12, borderRadius: 10 },
  statusMenuLabel: { fontSize: 15, fontFamily: "Inter_500Medium" },
});
