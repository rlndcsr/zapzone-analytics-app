export async function shareCsvFile(
  filename: string,
  csv: string,
  dialogTitle: string,
): Promise<boolean> {
  const FileSystem = await import("expo-file-system/legacy");
  const Sharing = await import("expo-sharing");
  const uri = `${FileSystem.cacheDirectory}${filename}`;
  await FileSystem.writeAsStringAsync(uri, csv, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  if (!(await Sharing.isAvailableAsync())) return false;
  await Sharing.shareAsync(uri, {
    mimeType: "text/csv",
    dialogTitle,
    UTI: "public.comma-separated-values-text",
  });
  return true;
}
