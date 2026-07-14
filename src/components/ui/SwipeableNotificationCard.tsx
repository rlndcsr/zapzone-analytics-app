import React, { useCallback, useRef } from 'react';
import { Dimensions, Text, View } from 'react-native';
// Use gesture-handler's Pressable (not RN's) for the revealed action buttons —
// a plain RN Pressable inside a Swipeable often never receives the tap because
// the pan gesture intercepts it.
import { Pressable } from 'react-native-gesture-handler';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, {
  Extrapolation,
  interpolate,
  SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { runOnJS } from 'react-native-worklets';
import { Eye, Trash2 } from 'lucide-react-native';

const SCREEN_WIDTH = Dimensions.get('window').width;
// Dragging past this distance triggers the action outright (a "full swipe"),
// instead of just snapping the button open for a tap.
const FULL_SWIPE_THRESHOLD = SCREEN_WIDTH * 0.5;
// Width of the revealed action button when the card snaps open on a partial swipe.
const ACTION_WIDTH = 96;

type SwipeableNotificationCardProps = {
  children: React.ReactNode;
  onDelete: () => void;
  onSeeDetails: () => void;
};

// Mirrors ReanimatedSwipeable's imperative handle (not re-exported from its
// subpath), so the ref prop typechecks. We only call close().
type SwipeableHandle = {
  close: () => void;
  openLeft: () => void;
  openRight: () => void;
  reset: () => void;
};

// Right-side action (revealed by swiping the card LEFT): Delete.
function DeleteAction({
  translation,
  onTrigger,
}: {
  translation: SharedValue<number>;
  onTrigger: () => void;
}) {
  const fired = useSharedValue(false);

  useAnimatedReaction(
    () => translation.value,
    (drag) => {
      if (drag < -FULL_SWIPE_THRESHOLD && !fired.value) {
        fired.value = true;
        runOnJS(onTrigger)();
      } else if (drag > -FULL_SWIPE_THRESHOLD * 0.5) {
        fired.value = false;
      }
    },
  );

  const iconStyle = useAnimatedStyle(() => ({
    transform: [
      {
        scale: interpolate(
          translation.value,
          [-FULL_SWIPE_THRESHOLD, -ACTION_WIDTH, 0],
          [1.25, 1, 0.6],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  return (
    <Pressable onPress={onTrigger} className="flex-1 items-center justify-center">
     <View
      style={{
        width: ACTION_WIDTH,
        backgroundColor: '#ef4444',
        borderTopRightRadius: 16,
        height: '100%',
        borderBottomRightRadius: 16,
      }}
     >
      
        <Animated.View style={iconStyle} className="items-center justify-center flex-1 gap-1">
          <Trash2 size={20} color="#ffffff" />
          <Text className="text-[11px] font-semibold text-white">Delete</Text>
        </Animated.View>
      
     </View>
    </Pressable>
  );
}

// Left-side action (revealed by swiping the card RIGHT): See Details.
function DetailsAction({
  translation,
  onTrigger,
}: {
  translation: SharedValue<number>;
  onTrigger: () => void;
}) {
  const fired = useSharedValue(false);

  useAnimatedReaction(
    () => translation.value,
    (drag) => {
      if (drag > FULL_SWIPE_THRESHOLD && !fired.value) {
        fired.value = true;
        runOnJS(onTrigger)();
      } else if (drag < FULL_SWIPE_THRESHOLD * 0.5) {
        fired.value = false;
      }
    },
  );

  const iconStyle = useAnimatedStyle(() => ({
    transform: [
      {
        scale: interpolate(
          translation.value,
          [0, ACTION_WIDTH, FULL_SWIPE_THRESHOLD],
          [0.6, 1, 1.25],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  return (
    <Pressable onPress={onTrigger} className="flex-1 items-center justify-center">
     <View
      style={{
        width: ACTION_WIDTH,
        backgroundColor: '#0644C7',
        borderTopLeftRadius: 16,
        height: '100%',
        borderBottomLeftRadius: 16,
        
      }}
     >
        <Animated.View style={iconStyle} className="items-center justify-center flex-1 gap-1">
          <Eye size={20} color="#ffffff" />
          <Text className="text-[11px] font-semibold text-white">See Details</Text>
        </Animated.View>
     </View>
    </Pressable>
  );
}

export function SwipeableNotificationCard({
  children,
  onDelete,
  onSeeDetails,
}: SwipeableNotificationCardProps) {
  // ReanimatedSwipeable exposes its imperative methods via a ref prop; we only
  // need close() to snap the card shut after an action fires.
  const swipeableRef = useRef<SwipeableHandle | null>(null);

  const handleDelete = useCallback(() => {
    swipeableRef.current?.close();
    onDelete();
  }, [onDelete]);

  const handleSeeDetails = useCallback(() => {
    swipeableRef.current?.close();
    onSeeDetails();
  }, [onSeeDetails]);

  return (
    <ReanimatedSwipeable
      ref={swipeableRef}
      containerStyle={{ marginBottom: 12 }}
      friction={2}
      leftThreshold={40}
      rightThreshold={40}
      overshootLeft={false}
      overshootRight={false}
      renderLeftActions={(_progress, translation) => (
        <DetailsAction translation={translation} onTrigger={handleSeeDetails} />
      )}
      renderRightActions={(_progress, translation) => (
        <DeleteAction translation={translation} onTrigger={handleDelete} />
      )}
    >
      {children}
    </ReanimatedSwipeable>
  );
}
