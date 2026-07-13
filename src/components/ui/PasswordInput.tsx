import { Feather } from "@expo/vector-icons";
import { Ref, useState } from "react";
import { Pressable, TextInput, TextInputProps } from "react-native";

import { InputField } from "./InputField";

type PasswordInputProps = Omit<TextInputProps, "secureTextEntry"> & {
  label?: string;
  error?: string;
  containerClassName?: string;
  pill?: boolean;
  ref?: Ref<TextInput>;
};

export function PasswordInput({
  label = "Password",
  error,
  containerClassName,
  pill = true,
  value,
  onChangeText,
  ...inputProps
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <InputField
      label={label}
      icon="lock"
      error={error}
      containerClassName={containerClassName}
      pill={pill}
      // Native masking via secureTextEntry — the value is passed straight
      // through (no custom bullet reconstruction), so autofill and toggling the
      // eye can't duplicate characters.
      value={value}
      onChangeText={onChangeText}
      secureTextEntry={!visible}
      autoCapitalize="none"
      autoCorrect={false}
      spellCheck={false}
      importantForAutofill="no"
      rightAccessory={
        <Pressable
          onPress={() => setVisible((current) => !current)}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={visible ? "Hide password" : "Show password"}
          className="pl-2"
        >
          <Feather name={visible ? "eye" : "eye-off"} size={18} color="#9CA3AF" />
        </Pressable>
      }
      {...inputProps}
    />
  );
}
