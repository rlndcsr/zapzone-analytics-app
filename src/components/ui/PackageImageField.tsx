import { Feather } from "@expo/vector-icons";
import { Image, Pressable, Text, View } from "react-native";

const PRIMARY = "#0644C7";

/**
 * The Package Image control shared by Create and Edit Package: the picker, the
 * sizing guidance the web shows, and a preview framed the way the storefront
 * will crop it.
 *
 * The 16:9 frame is the point of the preview — package images are cropped to
 * that ratio on the customer site, so showing them any other way here would
 * mislead about what actually gets published.
 */
export function PackageImageField({
  uri,
  isNew,
  onPick,
  onUndo,
  onRemove,
}: {
  /** Resolved image to preview — a stored URL or a freshly picked data URI. */
  uri: string | null;
  /** True when `uri` is an unsaved pick, which enables Undo. */
  isNew?: boolean;
  onPick: () => void;
  /** Revert to the saved image. Omit where there is nothing to revert to. */
  onUndo?: () => void;
  /** Clear the image entirely. Omit where removal is not offered. */
  onRemove?: () => void;
}) {
  return (
    <View>
      <Pressable
        onPress={onPick}
        className="flex-row items-center gap-2 self-start rounded-lg border border-gray-300 px-4 py-2.5 active:opacity-80 dark:border-neutral-700"
        accessibilityRole="button"
      >
        <Feather name="upload" size={15} color={PRIMARY} />
        <Text className="text-sm font-semibold text-[#0644C7]">
          Choose File
        </Text>
        <Text className="text-sm text-gray-500 dark:text-gray-400">
          {uri ? "Image selected" : "No file chosen"}
        </Text>
      </Pressable>

      <View className="mt-3 rounded-xl border border-blue-200 bg-blue-50 p-3 dark:border-blue-900/40 dark:bg-blue-900/20">
        <Text className="text-xs font-medium text-blue-800 dark:text-blue-300">
          Recommended: 16:9 aspect ratio (1280×720 or 1920×1080 pixels)
        </Text>
        <Text className="mt-1 text-xs text-blue-700/90 dark:text-blue-300/80">
          Images will be cropped to fit the display area. Center your subject
          for best results.
        </Text>
      </View>

      <Text className="mt-2 text-xs text-gray-500 dark:text-gray-400">
        Max file size: 20MB. Use optimized images for faster loading.
      </Text>

      {uri ? (
        <View className="mt-3">
          <Text className="mb-2 text-xs text-gray-500 dark:text-gray-400">
            Preview (as customers will see it):
          </Text>
          <View className="w-full overflow-hidden rounded-xl bg-gray-100 dark:bg-neutral-800">
            <Image
              source={{ uri }}
              // 16:9, matching the storefront crop.
              style={{ width: "100%", aspectRatio: 16 / 9 }}
              resizeMode="cover"
            />
          </View>
          <View className="mt-2 flex-row gap-4">
            <Pressable onPress={onPick} accessibilityRole="button">
              <Text className="text-xs font-semibold text-[#0644C7]">
                Replace image
              </Text>
            </Pressable>
            {isNew && onUndo && (
              <Pressable onPress={onUndo} accessibilityRole="button">
                <Text className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                  Undo change
                </Text>
              </Pressable>
            )}
            {onRemove && (
              <Pressable onPress={onRemove} accessibilityRole="button">
                <Text className="text-xs font-semibold text-red-600">
                  Remove image
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      ) : null}
    </View>
  );
}
