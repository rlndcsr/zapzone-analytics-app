import { Feather } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, TextInputProps } from "react-native";

import { InputField } from "./InputField";

type PasswordInputProps = Omit<TextInputProps, "secureTextEntry"> & {
  label?: string;
  error?: string;
  containerClassName?: string;
};

export function PasswordInput({
  label = "Password",
  error,
  containerClassName,
  ...inputProps
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <InputField
      label={label}
      icon="lock"
      error={error}
      containerClassName={containerClassName}
      secureTextEntry={!visible}
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
