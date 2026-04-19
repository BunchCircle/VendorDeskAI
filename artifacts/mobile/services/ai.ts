import type { Product, QuotationItem } from "./storage";
import { generateId } from "./storage";

export interface AIMessage {
  role: "user" | "assistant";
  content: string;
}

export type AIResponse =
  | { type: "quotation_ready"; quotationItems: QuotationItem[] }
  | {
      type: "needs_action";
      quotationItems: QuotationItem[];
      unknownItems: string[];
    }
  | { type: "error"; message: string };

function getApiBaseUrl(): string {
  const devDomain = process.env.EXPO_PUBLIC_DOMAIN;
  if (devDomain) return `https://${devDomain}`;
  return "";
}

export async function parseRequirementWithAI(
  userInput: string,
  catalogue: Product[],
  conversationHistory: AIMessage[]
): Promise<AIResponse> {
  try {
    const baseUrl = getApiBaseUrl();
    const response = await fetch(`${baseUrl}/api/ai/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          ...conversationHistory,
          { role: "user", content: userInput },
        ],
        catalogue: catalogue.map((p) => ({
          name: p.name,
          price: p.price,
          unit: p.unit,
        })),
      }),
    });

    if (!response.ok) {
      return {
        type: "error",
        message: "Could not connect to AI. Please try again.",
      };
    }

    const data = await response.json();
    const content: string = data.content ?? "";

    const cleaned = content
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();

    let parsed: {
      matched: Array<{ name: string; quantity: number; unit: string; rate: number }>;
      unmatched: string[];
    };

    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return {
        type: "error",
        message:
          "I had trouble understanding that. Could you describe the products more clearly?",
      };
    }

    const quotationItems: QuotationItem[] = (parsed.matched || []).map(
      (item) => {
        const itemNameLower = item.name.toLowerCase().trim();
        const matchedProduct =
          catalogue.find(
            (p) => p.name.toLowerCase().trim() === itemNameLower
          ) ||
          catalogue.find(
            (p) =>
              p.name.toLowerCase().trim().includes(itemNameLower) ||
              itemNameLower.includes(p.name.toLowerCase().trim())
          ) ||
          catalogue.find((p) =>
            p.name
              .toLowerCase()
              .trim()
              .startsWith(itemNameLower.slice(0, Math.max(4, itemNameLower.length - 3)))
          );
        return {
          id: generateId(),
          name: item.name,
          quantity: item.quantity || 1,
          unit: item.unit || "piece",
          rate: item.rate || 0,
          hsnCode: matchedProduct?.hsnCode,
          taxRate: matchedProduct?.taxRate,
        };
      }
    );

    if ((parsed.unmatched || []).length > 0) {
      return {
        type: "needs_action",
        quotationItems,
        unknownItems: parsed.unmatched || [],
      };
    }

    return { type: "quotation_ready", quotationItems };
  } catch {
    return {
      type: "error",
      message: "Network error. Please check your connection and try again.",
    };
  }
}

export async function transcribeAudio(audioBase64: string, mimeType: string): Promise<string> {
  try {
    const baseUrl = getApiBaseUrl();
    const response = await fetch(`${baseUrl}/api/ai/transcribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audioBase64, mimeType }),
    });
    if (!response.ok) return "";
    const data = await response.json();
    return (data.text as string) || "";
  } catch {
    return "";
  }
}

export async function extractCatalogueFromFile(
  dataBase64: string,
  mimeType: string
): Promise<Array<{ name: string; price: number; unit: string }>> {
  try {
    const baseUrl = getApiBaseUrl();
    const response = await fetch(`${baseUrl}/api/ai/extract-catalogue`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataBase64, mimeType }),
    });
    if (!response.ok) return [];
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export async function extractProductsFromText(
  text: string
): Promise<Array<{ name: string; price: number; unit: string }>> {
  try {
    const baseUrl = getApiBaseUrl();
    const response = await fetch(`${baseUrl}/api/ai/extract-products`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) return [];
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}
