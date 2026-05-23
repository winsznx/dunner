import { useAuth, useClerk, useSignUp } from "@clerk/clerk-expo";
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
import { track } from "@/lib/analytics";
import { ApiError, apiFetch } from "@/lib/api";

type Stage = "details" | "verify";

export default function SignUpScreen() {
  const { signUp, setActive, isLoaded } = useSignUp();
  const { getToken } = useAuth();
  const { signOut } = useClerk();
  const router = useRouter();

  const [stage, setStage] = useState<Stage>("details");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const accessCodeOk = /^[A-Z0-9]{6}$/.test(accessCode.trim().toUpperCase());

  async function handleStart() {
    if (!isLoaded || submitting) return;
    // Validate in order so the user sees one actionable error at a time.
    if (!email.trim()) {
      setError("Enter your email.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (!accessCodeOk) {
      setError(
        "Enter the 6-character access code from your invite email. " +
          "Don't have one? Sign up at dunner.xyz/#early-access.",
      );
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await signUp.create({
        emailAddress: email.trim(),
        password,
      });
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setStage("verify");
    } catch (err: unknown) {
      setError(extractClerkError(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerify() {
    if (!isLoaded || submitting) return;
    if (code.trim().length < 4) {
      setError("Enter the verification code from your email.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const attempt = await signUp.attemptEmailAddressVerification({
        code: code.trim(),
      });
      if (attempt.status === "complete") {
        await setActive({ session: attempt.createdSessionId });
        // Redeem the access code against the backend. If invalid/used/revoked,
        // tear down the just-created Clerk session so the user can retry with
        // a different code — no orphaned merchant rows.
        try {
          const token = await getToken();
          await apiFetch("/auth/redeem-code", {
            token,
            init: {
              method: "POST",
              body: JSON.stringify({
                code: accessCode.trim().toUpperCase(),
              }),
            },
            silent: true,
          });
        } catch (err) {
          await signOut();
          const msg =
            err instanceof ApiError
              ? err.status === 404
                ? "Access code is invalid."
                : err.status === 409
                  ? "That code has already been used."
                  : err.status === 410
                    ? "That code has been revoked."
                    : `Could not validate code (${err.status}).`
              : err instanceof Error
                ? err.message
                : "Could not validate access code.";
          setError(msg);
          setStage("details");
          setCode("");
          return;
        }
        track("merchant_signed_up");
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
          <View className="gap-2">
            <Text className="text-ink-primary text-3xl font-sans-semibold">
              {stage === "details" ? "Create your account" : "Check your email"}
            </Text>
            <Text className="text-ink-secondary text-base">
              {stage === "details"
                ? "Dunner recovers failed payments in your own voice."
                : `We sent a code to ${email}.`}
            </Text>
          </View>

          {stage === "details" ? (
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
                  textContentType="newPassword"
                  placeholder="at least 8 chars"
                  placeholderTextColor="#6C6C74"
                  value={password}
                  onChangeText={setPassword}
                  editable={!submitting}
                />
              </View>

              <View className="gap-1.5">
                <Text className="text-ink-secondary text-sm">
                  Access code
                </Text>
                <TextInput
                  className="bg-bg-surface text-ink-primary px-4 py-3.5 rounded-md text-xl font-mono tracking-[6px]"
                  autoCapitalize="characters"
                  autoCorrect={false}
                  placeholder="ABCD12"
                  placeholderTextColor="#6C6C74"
                  value={accessCode}
                  onChangeText={(t) => setAccessCode(t.toUpperCase())}
                  editable={!submitting}
                  maxLength={6}
                />
                <Text className="text-ink-muted text-xs">
                  From your waitlist invite email.
                </Text>
              </View>

              {error ? (
                <Text className="text-accent-failure text-sm">{error}</Text>
              ) : null}

              <Pressable
                onPress={handleStart}
                disabled={submitting}
                className="bg-ink-primary py-3.5 rounded-md items-center active:opacity-80 disabled:opacity-40"
              >
                {submitting ? (
                  <ActivityIndicator color="#0F0F11" />
                ) : (
                  <Text className="text-bg-base font-sans-semibold text-base">
                    Continue
                  </Text>
                )}
              </Pressable>
            </View>
          ) : (
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
                onPress={handleVerify}
                disabled={submitting}
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
                  setStage("details");
                  setCode("");
                  setError(null);
                }}
                disabled={submitting}
              >
                <Text className="text-ink-secondary text-sm text-center">
                  Use a different email
                </Text>
              </Pressable>
            </View>
          )}

          <View className="flex-row justify-center gap-1">
            <Text className="text-ink-secondary text-sm">
              Already have an account?
            </Text>
            <Link href="/(auth)/sign-in" asChild>
              <Pressable>
                <Text className="text-accent-neutral text-sm font-sans-semibold">
                  Sign in
                </Text>
              </Pressable>
            </Link>
          </View>
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
