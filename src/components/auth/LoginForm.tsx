import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";

import { ApiError } from "../../lib/api";
import { setSession } from "../../lib/session";
import { login } from "../../services/auth";
import { InputField } from "../ui/InputField";
import { PasswordInput } from "../ui/PasswordInput";

const LOGIN_BLUE = "#2563EB";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

type FormErrors = {
  email?: string;
  password?: string;
};

export function LoginForm() {
  const router = useRouter();
  const passwordRef = useRef<TextInput>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = email.trim().length > 0 && password.length > 0;

  const validate = (): boolean => {
    const nextErrors: FormErrors = {};

    if (!email.trim()) {
      nextErrors.email = "Email address is required";
    } else if (!EMAIL_REGEX.test(email.trim())) {
      nextErrors.email = "Enter a valid email address";
    }

    if (!password) {
      nextErrors.password = "Password is required";
    } else if (password.length < MIN_PASSWORD_LENGTH) {
      nextErrors.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (submitting) return;

    setFormError(null);
    if (!validate()) return;

    setSubmitting(true);
    try {
      const result = await login({ email: email.trim(), password });
      await setSession(result.token, result.user);
      router.replace("/home");
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.status === 422 &&
        error.fieldErrors
      ) {
        setErrors({
          email: error.fieldErrors.email?.[0],
          password: error.fieldErrors.password?.[0],
        });
      } else if (error instanceof ApiError) {
        setFormError(error.message);
      } else {
        setFormError("Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleEmailChange = (text: string) => {
    setEmail(text);
    if (errors.email) setErrors((prev) => ({ ...prev, email: undefined }));
    if (formError) setFormError(null);
  };

  const handlePasswordChange = (text: string) => {
    setPassword(text);
    if (errors.password)
      setErrors((prev) => ({ ...prev, password: undefined }));
    if (formError) setFormError(null);
  };

  return (
    <View className="mt-7">
      {formError ? (
        <View className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
          <Text className="text-sm text-red-600">{formError}</Text>
        </View>
      ) : null}

      <InputField
        label="Email Address"
        icon="mail"
        pill={false}
        placeholder="Enter your email address"
        value={email}
        onChangeText={handleEmailChange}
        error={errors.email}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => passwordRef.current?.focus()}
        editable={!submitting}
        containerClassName="mb-5"
      />

      <PasswordInput
        ref={passwordRef}
        pill={false}
        placeholder="Enter your password"
        value={password}
        onChangeText={handlePasswordChange}
        error={errors.password}
        autoComplete="password"
        textContentType="password"
        returnKeyType="done"
        onSubmitEditing={handleSubmit}
        editable={!submitting}
        containerClassName="mb-4"
       
      />

      <View className="mb-7 flex-row items-center justify-between">
        <Pressable
          onPress={() => setRememberMe((current) => !current)}
          hitSlop={8}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: rememberMe }}
          className="flex-row items-center"
        >
          <View
            className="h-5 w-5 items-center justify-center rounded border"
            style={{
              borderColor: rememberMe ? LOGIN_BLUE : "#D1D5DB",
              backgroundColor: rememberMe ? LOGIN_BLUE : "transparent",
            }}
          >
            {rememberMe ? (
              <Feather name="check" size={13} color="#FFFFFF" />
            ) : null}
          </View>
          <Text className="ml-2 text-sm text-gray-600 dark:text-gray-300">
            Remember me
          </Text>
        </Pressable>

        <Pressable
          onPress={() => console.log("Forgot password pressed")}
          hitSlop={8}
          accessibilityRole="button"
        >
          <Text
            className="text-sm font-medium"
            style={{ color: LOGIN_BLUE }}
          >
            Forgot your Password?
          </Text>
        </Pressable>
      </View>

      <Pressable
        onPress={handleSubmit}
        disabled={!canSubmit || submitting}
        accessibilityRole="button"
        accessibilityState={{ disabled: !canSubmit || submitting }}
        android_ripple={{ color: "#1E3A8A" }}
        className={`h-14 flex-row items-center justify-center rounded-2xl active:opacity-90 ${
          !canSubmit || submitting ? "opacity-60" : ""
        }`}
        style={{ backgroundColor: LOGIN_BLUE }}
      >
        {submitting ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text className="text-base font-semibold text-white">Login</Text>
        )}
      </Pressable>
    </View>
  );
}
