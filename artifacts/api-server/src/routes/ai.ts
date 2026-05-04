import { GoogleGenerativeAI } from "@google/generative-ai";
import { Router, type IRouter } from "express";
import { Worker } from "worker_threads";
import path from "path";
import { fileURLToPath } from "url";
import { aiRateLimit } from "../lib/rate-limit";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();

router.use(aiRateLimit);
router.use(requireAuth);

const MAX_BASE64_BYTES = 4 * 1024 * 1024;
const MAX_CHAT_MESSAGES = 50;
const MAX_MESSAGE_CHARS = 4000;
const MAX_CATALOGUE_ITEMS = 500;
const XLSX_PARSE_TIMEOUT_MS = 10_000;

function getGeminiClient(): GoogleGenerativeAI | null {
  const apiKey = process.env["GOOGLE_API_KEY"];
  if (!apiKey) return null;
  return new GoogleGenerativeAI(apiKey);
}

function isSpreadsheetMimeType(mimeType: string): boolean {
  const base = (mimeType ?? "").toLowerCase().split(";")[0].trim();
  return (
    base === "text/csv" ||
    base === "text/comma-separated-values" ||
    base === "application/vnd.ms-excel" ||
    base === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
}

function spreadsheetBase64ToPlainText(dataBase64: string): Promise<string> {
  const decoded = Buffer.from(dataBase64, "base64");
  if (decoded.byteLength > MAX_BASE64_BYTES) {
    return Promise.reject(
      new Error(`Spreadsheet exceeds maximum allowed size (${MAX_BASE64_BYTES / 1024 / 1024} MB decoded).`)
    );
  }

  const workerPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "workers",
    "xlsx-parser.mjs"
  );

  return new Promise((resolve, reject) => {
    const worker = new Worker(workerPath, { workerData: { base64Data: dataBase64 } });

    const timer = setTimeout(() => {
      worker.terminate();
      reject(new Error("Spreadsheet parsing timed out."));
    }, XLSX_PARSE_TIMEOUT_MS);

    worker.once("message", (msg: { ok: boolean; text?: string; error?: string }) => {
      clearTimeout(timer);
      if (msg.ok) {
        resolve(msg.text ?? "");
      } else {
        reject(new Error(msg.error ?? "Failed to parse spreadsheet"));
      }
    });

    worker.once("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function tryParseProductsJson(
  text: string
): Array<{ name: string; price: number; unit: string }> | null {
  const cleaned = text
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();

  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) return normaliseProducts(parsed);
  } catch {
    // fall through
  }

  const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    try {
      const parsed = JSON.parse(arrayMatch[0]);
      if (Array.isArray(parsed)) return normaliseProducts(parsed);
    } catch {
      // fall through
    }
  }

  const objectMatches = [...cleaned.matchAll(/\{[^{}]*"name"[^{}]*\}/g)];
  if (objectMatches.length > 0) {
    const products: Array<{ name: string; price: number; unit: string }> = [];
    for (const m of objectMatches) {
      try {
        const obj = JSON.parse(m[0]);
        const normalised = normaliseProduct(obj);
        if (normalised) products.push(normalised);
      } catch {
        // skip malformed objects
      }
    }
    if (products.length > 0) return products;
  }

  return null;
}

function normaliseProducts(
  arr: unknown[]
): Array<{ name: string; price: number; unit: string }> {
  const results: Array<{ name: string; price: number; unit: string }> = [];
  for (const item of arr) {
    const n = normaliseProduct(item);
    if (n) results.push(n);
  }
  return results;
}

function parsePrice(raw: unknown): number {
  if (typeof raw === "number") return raw;
  const s = String(raw ?? "").trim();
  const stripped = s
    .replace(/^(₹|Rs\.?|INR|inr|\$|€|£)\s*/i, "")
    .trim();
  const firstNumberMatch = stripped.match(/(\d[\d,]*(?:\.\d+)?)/);
  if (!firstNumberMatch) return 0;
  return parseFloat(firstNumberMatch[1].replace(/,/g, "")) || 0;
}

function normaliseProduct(
  item: unknown
): { name: string; price: number; unit: string } | null {
  if (!item || typeof item !== "object") return null;
  const obj = item as Record<string, unknown>;
  const rawName =
    obj.name ?? obj.Name ?? obj.product ?? obj.Product ?? obj.item ?? obj.Item ?? "";
  const name = String(rawName).trim();
  if (!name) return null;
  const rawPrice =
    obj.price ?? obj.rate ?? obj.Price ?? obj.Rate ?? obj.cost ?? obj.Cost ?? 0;
  const price = parsePrice(rawPrice);
  const unit =
    String(obj.unit ?? obj.Unit ?? obj.uom ?? obj.UOM ?? "piece").trim() || "piece";
  return { name, price, unit };
}

function truncateForLog(text: string, maxLen = 300): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + `… [${text.length - maxLen} chars truncated]`;
}

const EXTRACTION_PROMPT = `You are an expert at reading Indian vendor price lists and catalogues — printed, handwritten, images, or plain text tables.

Your task: extract every product with its price and unit of measure.

Rules:
- "name": product name in readable English. If the name is in Hindi or a regional language (Devanagari, Tamil, Telugu, etc.), transliterate it to English (e.g. "चावल" → "Chawal", "आटा" → "Aata").
- "price": a single positive number with no currency symbols. Handle all formats: ₹100, Rs.100, Rs 100, 100.00, "100 per kg", INR 100. If a range is given (e.g. 80–100), use the lower value.
- "unit": unit of measure (kg, g, litre, ml, piece, box, dozen, pack, quintal, ton, bundle, bag, etc.). Infer from context if not stated. Default to "piece".
- Skip rows that are headers, totals, subtitles, blank lines, or notes.
- Columns may be in any order (name may come after price, unit may be implicit in the name, etc.).
- Return ONLY a valid JSON array — no markdown fences, no explanations, nothing else.
- If no products are found, return an empty array: []

Output format:
[{"name": "Product Name", "price": 100, "unit": "kg"}, ...]`;

const FALLBACK_RAW_TEXT_PROMPT = `Look at this content carefully. Ignore any structure or formatting — just scan for any lines or entries that look like a product name associated with a price or cost.

For each such entry, output one JSON object. Be liberal: if something looks like a product and has any numeric value nearby, include it.

Return ONLY a valid JSON array (no markdown):
[{"name": "...", "price": number, "unit": "..."}]

If you find nothing at all, return: []`;

type Part = { text: string } | { inlineData: { mimeType: string; data: string } };

async function generateWithModelFallback(
  genAI: GoogleGenerativeAI,
  primaryModel: string,
  fallbackModel: string,
  parts: Part[],
  log: { warn: (obj: object, msg: string) => void }
): Promise<string> {
  try {
    const model = genAI.getGenerativeModel({ model: primaryModel });
    const result = await model.generateContent(parts);
    return result.response.text().trim();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("503") || msg.includes("500") || msg.includes("Service Unavailable")) {
      log.warn({ primaryModel, fallbackModel }, "Primary model unavailable — retrying with fallback model");
      const model = genAI.getGenerativeModel({ model: fallbackModel });
      const result = await model.generateContent(parts);
      return result.response.text().trim();
    }
    throw err;
  }
}

async function runExtractionWithFallback(
  genAI: GoogleGenerativeAI,
  primaryModelName: string,
  fallbackModelName: string,
  primaryParts: Part[],
  fallbackContext: string,
  log: { warn: (obj: object, msg: string) => void; error: (obj: object, msg: string) => void }
): Promise<Array<{ name: string; price: number; unit: string }>> {
  const rawText = await generateWithModelFallback(genAI, primaryModelName, fallbackModelName, primaryParts, log);

  let products = tryParseProductsJson(rawText);

  const sourceSeemsNonEmpty = fallbackContext.trim().length > 50;
  const lowConfidence = products === null || (products.length === 0 && sourceSeemsNonEmpty);

  if (lowConfidence) {
    log.warn(
      { rawText: truncateForLog(rawText) },
      "Low-confidence extraction — attempting raw text fallback pass"
    );
    try {
      const fallbackParts: Part[] = [
        ...primaryParts.filter((p): p is { inlineData: { mimeType: string; data: string } } => "inlineData" in p),
        { text: `${FALLBACK_RAW_TEXT_PROMPT}\n\nContent:\n${fallbackContext}` },
      ];
      const fallbackText = await generateWithModelFallback(genAI, primaryModelName, fallbackModelName, fallbackParts, log);
      const fallbackProducts = tryParseProductsJson(fallbackText);
      if (fallbackProducts !== null && fallbackProducts.length > 0) {
        return fallbackProducts;
      }
    } catch {
      log.error({}, "Fallback extraction pass failed");
    }
  }

  return products ?? [];
}

router.post("/chat", async (req, res) => {
  const { messages, catalogue } = req.body as {
    messages: Array<{ role: string; content: string }>;
    catalogue: Array<{ name: string; price: number; unit: string }>;
  };

  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "messages array is required" });
    return;
  }

  if (messages.length > MAX_CHAT_MESSAGES) {
    res.status(400).json({ error: `Too many messages — maximum is ${MAX_CHAT_MESSAGES}.` });
    return;
  }

  const sanitisedMessages = messages.map((m) => ({
    role: String(m.role ?? "").slice(0, 20),
    content: String(m.content ?? "").slice(0, MAX_MESSAGE_CHARS),
  }));

  const sanitisedCatalogue = Array.isArray(catalogue)
    ? catalogue.slice(0, MAX_CATALOGUE_ITEMS)
    : [];

  const genAI = getGeminiClient();
  if (!genAI) {
    res.status(503).json({ error: "AI service not configured" });
    return;
  }

  const catalogueText =
    sanitisedCatalogue.length > 0
      ? sanitisedCatalogue.map((p) => `- ${p.name}: ₹${p.price}/${p.unit}`).join("\n")
      : "No products in catalogue.";

  const systemInstruction = `You are a quotation assistant for an Indian small business vendor. Your job is to help create quotations.

The vendor's catalogue is:
${catalogueText}

When the vendor describes what products to include in a quotation:
1. Match products from their catalogue (case-insensitive, partial matches OK)
2. For matched products, use the catalogue price and unit
3. For unmatched products, flag them separately
4. Extract quantity from the input (e.g., "5 kg rice" → quantity: 5)

Respond ONLY with a valid JSON object (no markdown, no code blocks) in this format:
{
  "matched": [{"name": "...", "quantity": number, "unit": "...", "rate": number}],
  "unmatched": ["product1", "product2"]
}`;

  try {
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash-lite",
      systemInstruction,
    });

    const history = sanitisedMessages.slice(0, -1).map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const lastMessage = sanitisedMessages[sanitisedMessages.length - 1]?.content ?? "";

    const chat = model.startChat({ history });
    const result = await chat.sendMessage(lastMessage);
    const text = result.response.text();

    res.json({ content: text });
  } catch (error) {
    req.log.error({ error }, "Failed to call Gemini chat");
    res.status(500).json({ error: "AI service unavailable" });
  }
});

router.post("/transcribe", async (req, res) => {
  const { audioBase64, mimeType } = req.body as {
    audioBase64: string;
    mimeType: string;
  };

  const genAI = getGeminiClient();
  if (!genAI) {
    res.status(503).json({ error: "AI service not configured" });
    return;
  }

  if (!audioBase64) {
    res.status(400).json({ error: "audioBase64 is required" });
    return;
  }

  if (audioBase64.length > MAX_BASE64_BYTES * (4 / 3)) {
    res.status(400).json({ error: "Audio payload exceeds maximum allowed size." });
    return;
  }

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const result = await model.generateContent([
      {
        inlineData: {
          mimeType: mimeType || "audio/m4a",
          data: audioBase64,
        },
      },
      {
        text: "Transcribe this audio recording exactly as spoken. Return ONLY the transcribed text — no punctuation changes, no commentary, no explanations.",
      },
    ]);

    const text = result.response.text();
    res.json({ text: text.trim() });
  } catch (error) {
    req.log.error({ error }, "Failed to transcribe audio");
    res.status(500).json({ error: "Transcription failed" });
  }
});

router.post("/extract-catalogue", async (req, res) => {
  const { dataBase64, mimeType } = req.body as {
    dataBase64: string;
    mimeType: string;
  };

  const genAI = getGeminiClient();
  if (!genAI) {
    res.status(503).json({ error: "AI service not configured" });
    return;
  }

  if (!dataBase64) {
    res.status(400).json({ error: "dataBase64 is required" });
    return;
  }

  if (dataBase64.length > MAX_BASE64_BYTES * (4 / 3)) {
    res.status(400).json({ error: "Payload exceeds maximum allowed size." });
    return;
  }

  const PRIMARY_MODEL = "gemini-2.5-flash";
  const FALLBACK_MODEL = "gemini-2.5-flash-lite";

  try {
    if (isSpreadsheetMimeType(mimeType)) {
      let plainText: string;
      try {
        plainText = await spreadsheetBase64ToPlainText(dataBase64);
      } catch (parseErr) {
        req.log.error({ parseErr }, "Failed to parse spreadsheet");
        res.status(400).json({
          error:
            "Could not read spreadsheet. Please check the file is a valid CSV or Excel file.",
        });
        return;
      }

      if (!plainText.trim()) {
        res.json([]);
        return;
      }

      const contentParts: Part[] = [
        {
          text: `${EXTRACTION_PROMPT}\n\nHere is the spreadsheet data as a tab-separated table:\n\n${plainText}`,
        },
      ];

      const products = await runExtractionWithFallback(
        genAI,
        PRIMARY_MODEL,
        FALLBACK_MODEL,
        contentParts,
        plainText,
        req.log
      );
      res.json(products);
    } else {
      const inlinePart: Part = {
        inlineData: {
          mimeType: mimeType || "image/jpeg",
          data: dataBase64,
        },
      };
      const contentParts: Part[] = [inlinePart, { text: EXTRACTION_PROMPT }];

      const products = await runExtractionWithFallback(
        genAI,
        PRIMARY_MODEL,
        FALLBACK_MODEL,
        contentParts,
        "[IMAGE_INPUT] A non-empty image has been provided for catalogue extraction.",
        req.log
      );
      res.json(products);
    }
  } catch (error) {
    req.log.error({ error }, "Failed to extract catalogue");
    res.status(500).json({ error: "Extraction failed" });
  }
});

export default router;
