import { Alert, Linking, Platform } from "react-native";
import * as FileSystemLegacy from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as IntentLauncher from "expo-intent-launcher";

export async function savePDFToDevice(
  tempUri: string,
  filename: string
): Promise<void> {
  if (Platform.OS === "android") {
    try {
      const downloadsUri =
        FileSystemLegacy.StorageAccessFramework.getUriForDirectoryInRoot(
          "Download"
        );
      const permissions =
        await FileSystemLegacy.StorageAccessFramework.requestDirectoryPermissionsAsync(
          downloadsUri
        );
      if (permissions.granted) {
        const base64Content = await FileSystemLegacy.readAsStringAsync(
          tempUri,
          { encoding: FileSystemLegacy.EncodingType.Base64 }
        );
        const destUri =
          await FileSystemLegacy.StorageAccessFramework.createFileAsync(
            permissions.directoryUri,
            filename,
            "application/pdf"
          );
        await FileSystemLegacy.writeAsStringAsync(destUri, base64Content, {
          encoding: FileSystemLegacy.EncodingType.Base64,
        });
        Alert.alert("Saved", `${filename} has been saved to Downloads.`);
        return;
      }
    } catch (e) {
      console.warn("[pdfActions] Android SAF Downloads save failed, falling back to document directory:", e);
    }
  }

  const destPath = `${FileSystemLegacy.documentDirectory}${filename}`;
  await FileSystemLegacy.copyAsync({ from: tempUri, to: destPath });
  Alert.alert("Saved", `${filename} has been saved to your device.`);
}

async function fallbackToNativeShare(pdfUri: string): Promise<void> {
  Alert.alert(
    "WhatsApp Not Found",
    "WhatsApp does not appear to be installed. Would you like to share via another app?",
    [
      { text: "Cancel", style: "cancel" },
      {
        text: "Share",
        onPress: async () => {
          const isAvailable = await Sharing.isAvailableAsync();
          if (isAvailable) {
            await Sharing.shareAsync(pdfUri, {
              mimeType: "application/pdf",
              UTI: "com.adobe.pdf",
            });
          }
        },
      },
    ]
  );
}

export async function shareViaWhatsApp(
  pdfUri: string,
  phoneNumber: string,
  message: string
): Promise<void> {
  const cleanPhone = phoneNumber.replace(/\D/g, "");

  if (Platform.OS === "android") {
    try {
      const contentUri = await FileSystemLegacy.getContentUriAsync(pdfUri);
      await IntentLauncher.startActivityAsync("android.intent.action.SEND", {
        type: "application/pdf",
        extra: {
          "android.intent.extra.STREAM": contentUri,
          "android.intent.extra.TEXT": message,
          jid: `${cleanPhone}@s.whatsapp.net`,
        },
        packageName: "com.whatsapp",
      });
    } catch {
      await fallbackToNativeShare(pdfUri);
    }
    return;
  }

  const whatsappUrl = `whatsapp://send?phone=${cleanPhone}&text=${encodeURIComponent(message)}`;
  const canOpen = await Linking.canOpenURL(whatsappUrl);

  if (!canOpen) {
    await fallbackToNativeShare(pdfUri);
    return;
  }

  await Linking.openURL(whatsappUrl);

  const isAvailable = await Sharing.isAvailableAsync();
  if (isAvailable) {
    await Sharing.shareAsync(pdfUri, {
      mimeType: "application/pdf",
      UTI: "com.adobe.pdf",
    });
  }
}
