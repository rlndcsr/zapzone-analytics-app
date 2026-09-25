import * as Updates from "expo-updates";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { DevSettings, Pressable, Text, View } from "react-native";

import { reportClientError } from "../lib/errorReporting";

type Props = { children: ReactNode };
type State = { crashed: boolean };

/**
 * The root of the app (web parity: components/ErrorBoundary.tsx). A render
 * error is reported with its component stack, and the person sees what
 * happened and a way out — instead of a blank screen.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { crashed: false };

  static getDerivedStateFromError(): State {
    return { crashed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    reportClientError({
      kind: "render",
      message: error?.message || "Render error",
      stack: `${error?.stack ?? ""}\n${info?.componentStack ?? ""}`,
    });
  }

  private reload = async (): Promise<void> => {
    try {
      // A release build restarts its JavaScript cleanly.
      await Updates.reloadAsync();
      return;
    } catch {
      // Not available in development or Expo Go.
    }
    if (__DEV__) {
      DevSettings.reload();
      return;
    }
    // Last resort: render the tree again from scratch.
    this.setState({ crashed: false });
  };

  render(): ReactNode {
    if (!this.state.crashed) return this.props.children;

    return (
      <View className="flex-1 items-center justify-center bg-gray-50 px-6 dark:bg-black">
        <View className="w-full max-w-md items-center rounded-2xl border border-gray-200 bg-white p-8 dark:border-neutral-800 dark:bg-neutral-900">
          <Text className="mb-2 text-center text-xl font-semibold text-gray-900 dark:text-white">
            This page stopped working
          </Text>
          <Text className="mb-6 text-center text-sm text-gray-600 dark:text-gray-400">
            The problem has been reported to the team. Reloading usually gets
            you moving again.
          </Text>
          <Pressable
            onPress={() => void this.reload()}
            className="rounded-lg bg-gray-900 px-4 py-2.5 active:opacity-80 dark:bg-white"
            accessibilityRole="button"
          >
            <Text className="text-sm font-medium text-white dark:text-gray-900">
              Reload the app
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }
}

export default ErrorBoundary;
