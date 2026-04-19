/**
 * SVG-based icon wrapper (lucide-react-native).
 * Identical props interface to <Feather> — drop-in replacement.
 * Works reliably on Android without any font loading.
 */
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Bell,
  BookOpen,
  Building2,
  Calendar,
  Camera,
  Check,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  CreditCard,
  Download,
  Edit2,
  Edit3,
  Eye,
  FileText,
  Filter,
  Grid,
  HelpCircle,
  Image,
  Info,
  List,
  LogOut,
  MessageCircle,
  Mic,
  MicOff,
  Package,
  Paperclip,
  Percent,
  Phone,
  Plus,
  PlusCircle,
  RefreshCw,
  Save,
  Search,
  Send,
  Settings,
  Share2,
  Shield,
  Sparkles,
  Star,
  Tag,
  Trash2,
  TrendingUp,
  Upload,
  User,
  Users,
  Wifi,
  WifiOff,
  X,
  Zap,
} from "lucide-react-native";
import React from "react";
import type { ColorValue } from "react-native";

const ICON_MAP = {
  "alert-circle": AlertCircle,
  "alert-triangle": AlertTriangle,
  "arrow-left": ArrowLeft,
  "arrow-right": ArrowRight,
  bell: Bell,
  "book-open": BookOpen,
  "building-2": Building2,
  calendar: Calendar,
  camera: Camera,
  check: Check,
  "check-circle": CheckCircle,
  "chevron-down": ChevronDown,
  "chevron-right": ChevronRight,
  "chevron-up": ChevronUp,
  clock: Clock,
  "credit-card": CreditCard,
  download: Download,
  "edit-2": Edit2,
  "edit-3": Edit3,
  eye: Eye,
  filter: Filter,
  "file-text": FileText,
  grid: Grid,
  "help-circle": HelpCircle,
  image: Image,
  info: Info,
  list: List,
  "log-out": LogOut,
  "message-circle": MessageCircle,
  mic: Mic,
  "mic-off": MicOff,
  package: Package,
  percent: Percent,
  phone: Phone,
  paperclip: Paperclip,
  plus: Plus,
  "plus-circle": PlusCircle,
  "refresh-cw": RefreshCw,
  save: Save,
  search: Search,
  send: Send,
  settings: Settings,
  "share-2": Share2,
  shield: Shield,
  sparkles: Sparkles,
  star: Star,
  tag: Tag,
  "trash-2": Trash2,
  "trending-up": TrendingUp,
  upload: Upload,
  user: User,
  users: Users,
  wifi: Wifi,
  "wifi-off": WifiOff,
  x: X,
  zap: Zap,
} as const;

export type IconName = keyof typeof ICON_MAP;

interface IconProps {
  name: IconName;
  size?: number;
  color?: ColorValue | string;
  strokeWidth?: number;
}

export function Icon({ name, size = 24, color = "#000", strokeWidth = 2 }: IconProps) {
  const LucideIcon = ICON_MAP[name];
  if (!LucideIcon) return null;
  return <LucideIcon size={size} color={color as string} strokeWidth={strokeWidth} />;
}
