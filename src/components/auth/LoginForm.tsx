import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { ApiError } from "../../lib/api";
import { setSession } from "../../lib/session";
import { login } from "../../services/auth";
import { InputField } from "../ui/InputField";
import { PasswordInput } from "../ui/PasswordInput";
import { PrimaryButton } from "../ui/PrimaryButton";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

type FormErrors = {
  email?: string;
  password?: string;
};

export function LoginForm() {
  const router = useRouter();

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
    <View className="mt-8">
      {formError ? (
        <View className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
          <Text className="text-sm text-red-600">{formError}</Text>
        </View>
      ) : null}

      <InputField
        label="Email Address"
        icon="mail"
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
        editable={!submitting}
        containerClassName="mb-5"
      />

      <PasswordInput
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

      <View className="mb-8 flex-row items-center justify-between">
        <Pressable
          onPress={() => setRememberMe((current) => !current)}
          hitSlop={8}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: rememberMe }}
          className="flex-row items-center"
        >
          <View
            className={`h-5 w-5 items-center justify-center rounded border ${
              rememberMe
                ? "border-[#0A2472] bg-[#0A2472]"
                : "border-gray-300 bg-white"
            }`}
          >
            {rememberMe ? (
              <Feather name="check" size={13} color="#FFFFFF" />
            ) : null}
          </View>
          <Text className="ml-2 text-sm text-gray-600">Remember me</Text>
        </Pressable>

        <Pressable
          onPress={() => console.log("Forgot password pressed")}
          hitSlop={8}
          accessibilityRole="button"
        >
          <Text className="text-sm font-medium text-gray-700">
            Forgot password?
          </Text>
        </Pressable>
      </View>

      <PrimaryButton
        label="Login"
        onPress={handleSubmit}
        loading={submitting}
        disabled={!canSubmit}
      />
    </View>
  );
}
