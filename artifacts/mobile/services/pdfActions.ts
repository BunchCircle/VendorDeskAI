import * as Sharing from "expo-sharing";
import * as Clipboard from "expo-clipboard";
import * as FileSystem from "expo-file-system/legacy";

function escHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function downloadPDFWeb(html: string, filename: string): Promise<void> {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("sandbox", "allow-modals");
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
  <title>${escHtml(filename)}</title>
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
): Promise<string> {
  const destDir = FileSystem.documentDirectory;
  if (!destDir) {
    throw new Error("Document directory is not available on this device.");
  }
  const destUri = destDir + filename;
  await FileSystem.copyAsync({ from: tempUri, to: destUri });

  const isAvailable = await Sharing.isAvailableAsync();
  if (isAvailable) {
    await Sharing.shareAsync(destUri, {
      mimeType: "application/pdf",
      UTI: "com.adobe.pdf",
      dialogTitle: filename,
    });
  } else {
    const { Alert } = await import("react-native");
    Alert.alert(
      "PDF Saved",
      `${filename} was saved to your device. Sharing is not available on this device.`
    );
  }

  return destUri;
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
