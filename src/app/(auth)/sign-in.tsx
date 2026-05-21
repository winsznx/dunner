import { useSignIn } from "@clerk/clerk-expo";
import { Link, useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type Stage =
  | { kind: "credentials" }
  | {
      kind: "second-factor";
      strategy: "email_code" | "phone_code";
      destination: string;
    };

export default function SignInScreen() {
  const { signIn, setActive, isLoaded } = useSignIn();
  const router = useRouter();

  const [stage, setStage] = useState<Stage>({ kind: "credentials" });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmitCredentials() {
    if (!isLoaded || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const attempt = await signIn.create({
        identifier: email.trim(),
        password,
      });

      if (attempt.status === "complete") {
        await setActive({ session: attempt.createdSessionId });
        router.replace("/");
        return;
      }

      if (attempt.status === "needs_second_factor") {
        const factor =
          attempt.supportedSecondFactors?.find(
            (f) => f.strategy === "email_code",
          ) ??
          attempt.supportedSecondFactors?.find(
            (f) => f.strategy === "phone_code",
          );

        if (!factor) {
          setError(
            "Your account requires a second factor we don't support yet.",
          );
          return;
        }

        if (factor.strategy === "email_code") {
          await signIn.prepareSecondFactor({
            strategy: "email_code",
            emailAddressId: factor.emailAddressId,
          });
          setStage({
            kind: "second-factor",
            strategy: "email_code",
            destination: factor.safeIdentifier ?? email,
          });
        } else {
          await signIn.prepareSecondFactor({
            strategy: "phone_code",
            phoneNumberId: factor.phoneNumberId,
          });
          setStage({
            kind: "second-factor",
            strategy: "phone_code",
            destination: factor.safeIdentifier ?? "your phone",
          });
        }
        return;
      }

      setError(`Unexpected status: ${attempt.status}`);
    } catch (err: unknown) {
      setError(extractClerkError(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerifySecondFactor() {
    if (!isLoaded || submitting || stage.kind !== "second-factor") return;
    setError(null);
    setSubmitting(true);
    try {
      const attempt = await signIn.attemptSecondFactor({
        strategy: stage.strategy,
        code: code.trim(),
      });
      if (attempt.status === "complete") {
        await setActive({ session: attempt.createdSessionId });
        router.replace("/");
      } else {
        setError(`Unexpected status: ${attempt.status}`);
      }
    } catch (err: unknown) {
      setError(extractClerkError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-bg-base">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View className="flex-1 justify-center px-6 gap-6">
          {stage.kind === "credentials" ? (
            <>
              <View className="gap-2">
                <Text className="text-ink-primary text-3xl font-sans-semibold">
                  Welcome back
                </Text>
                <Text className="text-ink-secondary text-base">
                  Sign in to your Dunner workspace.
                </Text>
              </View>

              <View className="gap-3">
                <View className="gap-1.5">
                  <Text className="text-ink-secondary text-sm">Email</Text>
                  <TextInput
                    className="bg-bg-surface text-ink-primary px-4 py-3.5 rounded-md text-base"
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    textContentType="emailAddress"
                    placeholder="you@company.com"
                    placeholderTextColor="#6C6C74"
                    value={email}
                    onChangeText={setEmail}
                    editable={!submitting}
                  />
                </View>

                <View className="gap-1.5">
                  <Text className="text-ink-secondary text-sm">Password</Text>
                  <TextInput
                    className="bg-bg-surface text-ink-primary px-4 py-3.5 rounded-md text-base"
                    secureTextEntry
                    textContentType="password"
                    placeholder="••••••••"
                    placeholderTextColor="#6C6C74"
                    value={password}
                    onChangeText={setPassword}
                    editable={!submitting}
                  />
                </View>

                {error ? (
                  <Text className="text-accent-failure text-sm">{error}</Text>
                ) : null}

                <Pressable
                  onPress={handleSubmitCredentials}
                  disabled={submitting || !email || !password}
                  className="bg-ink-primary py-3.5 rounded-md items-center active:opacity-80 disabled:opacity-40"
                >
                  {submitting ? (
                    <ActivityIndicator color="#0F0F11" />
                  ) : (
                    <Text className="text-bg-base font-sans-semibold text-base">
                      Sign in
                    </Text>
                  )}
                </Pressable>
              </View>

              <View className="flex-row justify-center gap-1">
                <Text className="text-ink-secondary text-sm">
                  No account yet?
                </Text>
                <Link href="/(auth)/sign-up" asChild>
                  <Pressable>
                    <Text className="text-accent-neutral text-sm font-sans-semibold">
                      Sign up
                    </Text>
                  </Pressable>
                </Link>
              </View>
            </>
          ) : (
            <>
              <View className="gap-2">
                <Text className="text-ink-primary text-3xl font-sans-semibold">
                  Verify it's you
                </Text>
                <Text className="text-ink-secondary text-base">
                  We sent a code to {stage.destination}.
                </Text>
              </View>

              <View className="gap-3">
                <View className="gap-1.5">
                  <Text className="text-ink-secondary text-sm">
                    Verification code
                  </Text>
                  <TextInput
                    className="bg-bg-surface text-ink-primary px-4 py-3.5 rounded-md text-xl font-mono tracking-widest"
                    keyboardType="number-pad"
                    textContentType="oneTimeCode"
                    placeholder="123456"
                    placeholderTextColor="#6C6C74"
                    value={code}
                    onChangeText={setCode}
                    editable={!submitting}
                    maxLength={8}
                  />
                </View>

                {error ? (
                  <Text className="text-accent-failure text-sm">{error}</Text>
                ) : null}

                <Pressable
                  onPress={handleVerifySecondFactor}
                  disabled={submitting || code.length < 4}
                  className="bg-ink-primary py-3.5 rounded-md items-center active:opacity-80 disabled:opacity-40"
                >
                  {submitting ? (
                    <ActivityIndicator color="#0F0F11" />
                  ) : (
                    <Text className="text-bg-base font-sans-semibold text-base">
                      Verify & continue
                    </Text>
                  )}
                </Pressable>

                <Pressable
                  onPress={() => {
                    setStage({ kind: "credentials" });
                    setCode("");
                    setError(null);
                  }}
                  disabled={submitting}
                >
                  <Text className="text-ink-secondary text-sm text-center">
                    Use a different account
                  </Text>
                </Pressable>
              </View>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function extractClerkError(err: unknown): string {
  if (err && typeof err === "object" && "errors" in err) {
    const errors = (err as { errors?: Array<{ message?: string }> }).errors;
    if (errors && errors[0]?.message) return errors[0].message;
  }
  if (err instanceof Error) return err.message;
  return "Something went wrong.";
}
