import { GoogleGenerativeAI } from "@google/generative-ai";
import { Router, type IRouter } from "express";
import * as XLSX from "xlsx";

const router: IRouter = Router();

function getGeminiClient(): GoogleGenerativeAI | null {
  const apiKey = process.env["GOOGLE_API_KEY"];
  if (!apiKey) return null;
  return new GoogleGenerativeAI(apiKey);
}

function isSpreadsheetMimeType(mimeType: string): boolean {
  // Normalise: lowercase and strip any ";charset=..." or similar parameters
  const base = (mimeType ?? "").toLowerCase().split(";")[0].trim();
  return (
    base === "text/csv" ||
    base === "text/comma-separated-values" ||
    base === "application/vnd.ms-excel" ||
    base === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
}

function spreadsheetBase64ToPlainText(dataBase64: string): string {
  const buffer = Buffer.from(dataBase64, "base64");
  const workbook = XLSX.read(buffer, { type: "buffer" });

  const lines: string[] = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const rows: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as string[][];
    if (rows.length === 0) continue;
    if (workbook.SheetNames.length > 1) {
      lines.push(`--- Sheet: ${sheetName} ---`);
    }
    for (const row of rows) {
      const cells = row.map((c) => String(c ?? "").trim());
      if (cells.some((c) => c !== "")) {
        lines.push(cells.join("\t"));
      }
    }
  }
  return lines.join("\n");
}

function tryParseProductsJson(
  text: string
): Array<{ name: string; price: number; unit: string }> | null {
  const cleaned = text
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();

  // First attempt: direct parse
  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) return normaliseProducts(parsed);
  } catch {
    // fall through
  }

  // Second attempt: extract the first JSON array from anywhere in the text
  const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    try {
      const parsed = JSON.parse(arrayMatch[0]);
      if (Array.isArray(parsed)) return normaliseProducts(parsed);
    } catch {
      // fall through
    }
  }

  // Third attempt: extract individual JSON objects and assemble into array
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
  // Strip currency prefixes (₹, Rs., Rs , INR, $, etc.) and surrounding whitespace
  const stripped = s
    .replace(/^(₹|Rs\.?|INR|inr|\$|€|£)\s*/i, "")
    .trim();
  // For ranges like "80-100" or "80–100", extract the first (lower) number
  const firstNumberMatch = stripped.match(/(\d[\d,]*(?:\.\d+)?)/);
  if (!firstNumberMatch) return 0;
  // Remove thousands-separator commas, then parse
  return parseFloat(firstNumberMatch[1].replace(/,/g, "")) || 0;
}

function normaliseProduct(
  item: unknown
): { name: string; price: number; unit: string } | null {
  if (!item || typeof item !== "object") return null;
  const obj = item as Record<string, unknown>;
  // Accept common name field aliases used by AI in different response styles
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
    // Fall back on 503 (high demand) or 500 (server error) from the primary model
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

  // Confidence gate: if parse succeeded but yielded nothing from a non-empty source,
  // or if parse completely failed, try the fallback extraction pass.
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

  const genAI = getGeminiClient();
  if (!genAI) {
    res.status(503).json({ error: "AI service not configured" });
    return;
  }

  const catalogueText =
    catalogue && catalogue.length > 0
      ? catalogue.map((p) => `- ${p.name}: ₹${p.price}/${p.unit}`).join("\n")
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

    // Map conversation history: skip last message (sent as prompt), convert roles
    const history = (messages || []).slice(0, -1).map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const lastMessage = messages?.[messages.length - 1]?.content ?? "";

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

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

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

  // Primary: gemini-2.5-flash (best vision); fallback: gemini-2.5-flash-lite
  // (always available). generateWithModelFallback auto-retries on 503.
  const PRIMARY_MODEL = "gemini-2.5-flash";
  const FALLBACK_MODEL = "gemini-2.5-flash-lite";

  try {
    if (isSpreadsheetMimeType(mimeType)) {
      // Parse spreadsheet server-side — send clean text to the AI, not raw binary
      let plainText: string;
      try {
        plainText = spreadsheetBase64ToPlainText(dataBase64);
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
      // Image (or unrecognised type) — send as inline data for vision analysis
      const inlinePart: Part = {
        inlineData: {
          mimeType: mimeType || "image/jpeg",
          data: dataBase64,
        },
      };
      const contentParts: Part[] = [inlinePart, { text: EXTRACTION_PROMPT }];

      // For images we cannot measure content size from text, so we use a sentinel
      // that is always >50 chars — the gate will fire whenever 0 products are returned.
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
