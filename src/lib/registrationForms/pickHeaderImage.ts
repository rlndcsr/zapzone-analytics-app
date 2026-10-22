import { Alert } from "react-native";

import type { RegistrationFormImage } from "../../services/registrationFormsService";
import { headerImageProblem } from "./registrationForms";

export async function pickHeaderImage(): Promise<
  { image: RegistrationFormImage } | { problem: string } | null
> {
  const ImagePicker = await import("expo-image-picker");
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    Alert.alert(
      "Permission needed",
      "Allow photo library access to choose a header image.",
    );
    return null;
  }
  const picked = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsMultipleSelection: false,
    quality: 0.7,
  });
  const asset = picked.canceled ? null : picked.assets[0];
  if (!asset?.uri) return null;
  const type = asset.mimeType ?? "image/jpeg";
  const problem = headerImageProblem(type, asset.fileSize);
  if (problem) return { problem };
  return {
    image: { uri: asset.uri, name: asset.fileName ?? "header.jpg", type },
  };
}
