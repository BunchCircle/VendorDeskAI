import * as Sharing from "expo-sharing";
import * as Clipboard from "expo-clipboard";

export async function savePDFToDevice(
  tempUri: string,
  _filename: string
): Promise<void> {
  const isAvailable = await Sharing.isAvailableAsync();
  if (!isAvailable) {
    throw new Error("Sharing is not available on this device.");
  }
  await Sharing.shareAsync(tempUri, {
    mimeType: "application/pdf",
    UTI: "com.adobe.pdf",
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
