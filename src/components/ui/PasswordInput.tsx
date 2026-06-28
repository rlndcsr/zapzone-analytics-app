import { Feather } from "@expo/vector-icons";
import { Ref, useEffect, useRef, useState } from "react";
import { Pressable, TextInput, TextInputProps } from "react-native";

import { InputField } from "./InputField";

type PasswordInputProps = Omit<TextInputProps, "secureTextEntry"> & {
  label?: string;
  error?: string;
  containerClassName?: string;
  ref?: Ref<TextInput>;
  /** How long (ms) the most recently typed character stays visible. */
  peekDuration?: number;
};

const BULLET = "•";

const maskValue = (value: string, revealLast: boolean) => {
  if (value.length === 0) return "";
  if (revealLast) return BULLET.repeat(value.length - 1) + value.slice(-1);
  return BULLET.repeat(value.length);
};

export function PasswordInput({
  label = "Password",
  error,
  containerClassName,
  value = "",
  onChangeText,
  peekDuration = 800,
  ...inputProps
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  const [peeking, setPeeking] = useState(false);
  // Reconstruction baseline kept in a ref so fast typing isn't tripped up by a
  // stale `value` prop between renders.
  const valueRef = useRef(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stay in sync when the form resets the field externally.
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  // Clear the pending reveal timer on unmount.
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const handleChangeText = (displayed: string) => {
    // The input renders a masked string, so the real value has to be rebuilt
    // from the edit. While typing, characters are added or removed at the end.
    const prev = valueRef.current;
    let next: string;
    if (displayed.length > prev.length) {
      next = prev + displayed.slice(prev.length);
    } else if (displayed.length < prev.length) {
      next = prev.slice(0, displayed.length);
    } else {
      next = prev.slice(0, -1) + displayed.slice(-1);
    }
    valueRef.current = next;
    onChangeText?.(next);

    if (timerRef.current) clearTimeout(timerRef.current);
    if (next.length > prev.length && !visible) {
      setPeeking(true);
      timerRef.current = setTimeout(() => setPeeking(false), peekDuration);
    } else {
      setPeeking(false);
    }
  };

  const displayValue = visible ? value : maskValue(value, peeking);

  return (
    <InputField
      label={label}
      icon="lock"
      error={error}
      containerClassName={containerClassName}
      value={displayValue}
      onChangeText={handleChangeText}
      autoCapitalize="none"
      autoCorrect={false}
      rightAccessory={
        <Pressable
          onPress={() => setVisible((current) => !current)}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={visible ? "Hide password" : "Show password"}
          className="pl-2"
        >
          <Feather
            name={visible ? "eye" : "eye-off"}
            size={18}
            color="#9CA3AF"
          />
        </Pressable>
      }
      {...inputProps}
    />
  );
}
