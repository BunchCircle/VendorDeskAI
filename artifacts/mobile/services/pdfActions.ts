import * as Sharing from "expo-sharing";
import * as Clipboard from "expo-clipboard";

export async function downloadPDFWeb(html: string, filename: string): Promise<void> {
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "none";
  document.body.appendChild(iframe);

  try {
    const doc = iframe.contentWindow?.document;
    if (!doc) throw new Error("Could not access iframe document");

    doc.open();
    doc.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${filename}</title>
  <style>
    @media print {
      @page { margin: 0; size: A4; }
      body { margin: 0; }
    }
  </style>
</head>
<body>${html}</body>
</html>`);
    doc.close();

    await new Promise<void>((resolve) => {
      iframe.onload = () => resolve();
      setTimeout(resolve, 800);
    });

    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
  } finally {
    setTimeout(() => {
      if (document.body.contains(iframe)) {
        document.body.removeChild(iframe);
      }
    }, 2000);
  }
}

export async function savePDFToDevice(
  tempUri: string,
  filename: string
): Promise<void> {
  const isAvailable = await Sharing.isAvailableAsync();
  if (!isAvailable) {
    throw new Error("Sharing is not available on this device.");
  }
  await Sharing.shareAsync(tempUri, {
    mimeType: "application/pdf",
    UTI: "com.adobe.pdf",
    dialogTitle: filename,
  });
}

export async function shareViaWhatsApp(
  pdfUri: string,
  _phoneNumber: string,
  message: string
): Promise<void> {
  await Clipboard.setStringAsync(message);

  const isAvailable = await Sharing.isAvailableAsync();
  if (!isAvailable) {
    throw new Error("Sharing is not available on this device.");
  }
  await Sharing.shareAsync(pdfUri, {
    mimeType: "application/pdf",
    UTI: "com.adobe.pdf",
    dialogTitle: message,
  });
}
