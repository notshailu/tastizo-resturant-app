import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  BackHandler,
  Linking,
  PermissionsAndroid,
  Platform,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
  LogBox,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import messaging from "@react-native-firebase/messaging";
import * as SplashScreen from "expo-splash-screen";
import * as NavigationBar from "expo-navigation-bar";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";

const APP_URL = "https://tastizo.com";
const APP_ROOT_URL = "https://tastizo.com/";
const APP_START_URL = "https://tastizo.com/restaurant";
const FCM_SAVE_URL = `${APP_URL}/api/v1/fcm-tokens/save`;
const FCM_PLATFORM = "android";
const AUTH_TOKEN_STORAGE_KEY = "tastizo_auth_token";
const AUTH_TOKEN_CANDIDATE_KEYS = [
  "authToken",
  "accessToken",
  "access_token",
  "token",
  "jwt",
  "bearerToken",
  "auth_token",
  "userToken",
];
const WEBVIEW_USER_AGENT =
  "Mozilla/5.0 (Linux; Android 14; Pixel 6 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36";

void SplashScreen.preventAutoHideAsync();
LogBox.ignoreLogs(["A component is changing an uncontrolled input"]);

const buildOrderUrl = (orderId) =>
  `${APP_URL}/restaurant/orders?orderId=${encodeURIComponent(orderId)}`;

const resolveNotificationUrl = (rawUrl) => {
  if (!rawUrl) {
    return null;
  }

  try {
    const parsed = new URL(rawUrl);
    const orderId = parsed.searchParams.get("orderId");

    if (orderId) {
      return buildOrderUrl(orderId);
    }

    if (parsed.pathname.includes("/restaurant/orders")) {
      return `${APP_URL}${parsed.pathname}${parsed.search}`;
    }
  } catch (_error) {
    const match = String(rawUrl).match(/[?&]orderId=([^&]+)/i);
    if (match && match[1]) {
      return buildOrderUrl(decodeURIComponent(match[1]));
    }
  }

  return null;
};

const AUTH_PROBE_SCRIPT = `
  (function() {
    try {
      var candidateKeys = ${JSON.stringify(AUTH_TOKEN_CANDIDATE_KEYS)};
      var storageSources = [window.localStorage, window.sessionStorage];

      function extractToken(raw) {
        if (!raw) return null;

        if (typeof raw === "string") {
          try {
            var parsed = JSON.parse(raw);
            if (parsed && typeof parsed === "object") {
              return parsed.accessToken || parsed.access_token || parsed.token || parsed.jwt || parsed.bearerToken || parsed.authToken || null;
            }
          } catch (_error) {}
          return raw;
        }

        return null;
      }

      function postToken(token, source) {
        if (!token) return;
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: "AUTH_TOKEN",
          token: token,
          source: source
        }));
      }

      for (var s = 0; s < storageSources.length; s++) {
        var storage = storageSources[s];
        if (!storage) continue;

        for (var i = 0; i < candidateKeys.length; i++) {
          var key = candidateKeys[i];
          var value = extractToken(storage.getItem(key));
          if (value) {
            postToken(value, key);
            return;
          }
        }

        for (var j = 0; j < storage.length; j++) {
          var storageKey = storage.key(j);
          if (!storageKey) continue;
          if (/token|auth|jwt|bearer/i.test(storageKey)) {
            var storageValue = extractToken(storage.getItem(storageKey));
            if (storageValue) {
              postToken(storageValue, storageKey);
              return;
            }
          }
        }
      }
    } catch (_error) {}
    true;
  })();
`;

const normalizeAuthToken = (value) => {
  if (!value || typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object") {
      return (
        parsed.accessToken ||
        parsed.access_token ||
        parsed.token ||
        parsed.jwt ||
        parsed.bearerToken ||
        parsed.authToken ||
        trimmed
      );
    }
  } catch (_error) {}

  return trimmed;
};

export default function App() {
  const webViewRef = useRef(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [sourceUrl, setSourceUrl] = useState(APP_START_URL);
  const [activeUrl, setActiveUrl] = useState(APP_START_URL);
  const [isWebViewReady, setIsWebViewReady] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const fcmTokenRef = useRef(null);
  const authTokenRef = useRef(null);
  const pendingFcmTokenRef = useRef(null);
  const lastSavedTokenKeyRef = useRef(null);
  const lastQueuedTokenRef = useRef(null);
  const webViewSource = useMemo(() => ({ uri: sourceUrl }), [sourceUrl]);

  const persistAuthToken = async (token) => {
    const normalized = normalizeAuthToken(token);
    if (!normalized) {
      return null;
    }

    authTokenRef.current = normalized;
    await AsyncStorage.setItem(AUTH_TOKEN_STORAGE_KEY, normalized);
    console.log("auth token stored in AsyncStorage", AUTH_TOKEN_STORAGE_KEY);
    return normalized;
  };

  const getStoredAuthToken = async () => {
    if (authTokenRef.current) {
      return authTokenRef.current;
    }

    const stored = await AsyncStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
    const normalized = normalizeAuthToken(stored);
    if (normalized) {
      authTokenRef.current = normalized;
      return normalized;
    }

    return null;
  };

  const saveFcmTokenToBackend = async (token) => {
    if (!token) {
      return;
    }

    const payload = {
      token,
      platform: FCM_PLATFORM,
    };

    const authToken = await getStoredAuthToken();
    if (!authToken) {
      pendingFcmTokenRef.current = token;
      if (lastQueuedTokenRef.current !== token) {
        console.log("fcm token queued until auth token is available");
        lastQueuedTokenRef.current = token;
      }
      return;
    }

    const saveKey = `${token}:${authToken}`;
    if (lastSavedTokenKeyRef.current === saveKey) {
      console.log("fcm token already saved for current auth token");
      return;
    }

    const headers = {
      Accept: "application/json",
      "Content-Type": "application/json",
    };

    if (authToken) {
      headers.Authorization = `Bearer ${authToken}`;
      console.log("authorization header attached");
    }

    console.log("FCM token", token);
    console.log("FCM save payload", payload);

    try {
      const response = await fetch(FCM_SAVE_URL, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });

      const responseText = await response.text();
      console.log("backend save response", response.status, responseText);

      if (response.status === 401) {
        console.error("User not logged in, token not saved");
        pendingFcmTokenRef.current = token;
        lastQueuedTokenRef.current = token;
        return;
      }

      if (!response.ok) {
        console.warn("FCM token save failed", response.status, responseText);
        pendingFcmTokenRef.current = token;
        lastQueuedTokenRef.current = token;
        return;
      }

      lastSavedTokenKeyRef.current = saveKey;
      pendingFcmTokenRef.current = null;
      lastQueuedTokenRef.current = null;
    } catch (error) {
      console.warn("FCM token save failed", error);
    }
  };

  const requestNotificationPermission = async () => {
    let notificationPermissionGranted = true;

    if (Platform.OS === "android" && Platform.Version >= 33) {
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
      );
      notificationPermissionGranted = result === PermissionsAndroid.RESULTS.GRANTED;
    }

    try {
      const permissionStatus = await messaging().requestPermission();
      console.log("permission status", permissionStatus);
    } catch (error) {
      console.warn("permission request failed", error);
    }

    console.log(
      "permission status",
      notificationPermissionGranted ? "granted" : "denied"
    );

    return notificationPermissionGranted;
  };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const setupFcm = async () => {
    const hasPermission = await requestNotificationPermission();

    if (!hasPermission) {
      return;
    }

    let lastError = null;

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      try {
        await messaging().registerDeviceForRemoteMessages();
        console.log("registered device for remote messages");
        const token = await messaging().getToken();
        fcmTokenRef.current = token;
        console.log("fcm token fetched", token);
        pendingFcmTokenRef.current = token;
        await saveFcmTokenToBackend(token);
        return;
      } catch (error) {
        lastError = error;
        console.warn("FCM token fetch failed", error);
        await sleep(attempt * 1500);
      }
    }

    throw lastError;
  };

  const handleWebViewMessage = async (event) => {
    const raw = event?.nativeEvent?.data;
    if (!raw) {
      return;
    }

    try {
      const parsed = JSON.parse(raw);
      if (parsed?.type === "AUTH_TOKEN" && parsed.token) {
        console.log("auth token received from WebView", parsed.source || "unknown");
        const normalized = await persistAuthToken(parsed.token);
        if (normalized && pendingFcmTokenRef.current) {
          console.log("resyncing FCM token after auth token update");
          await saveFcmTokenToBackend(pendingFcmTokenRef.current);
        } else if (normalized && fcmTokenRef.current) {
          console.log("resyncing FCM token after auth token update");
          await saveFcmTokenToBackend(fcmTokenRef.current);
        }
      }
    } catch (_error) {}
  };

  const onBackPress = () => {
    if (webViewRef.current && canGoBack) {
      webViewRef.current.goBack();
      return true;
    }

    if (activeUrl !== APP_START_URL) {
      setSourceUrl(APP_START_URL);
      setActiveUrl(APP_START_URL);
      return true;
    }

    Alert.alert("Exit App", "Do you want to exit?", [
      { text: "Cancel", style: "cancel" },
      { text: "Exit", onPress: () => BackHandler.exitApp() },
    ]);

    return true;
  };

  React.useEffect(() => {
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      onBackPress
    );

    return () => {
      subscription.remove();
    };
  }, [canGoBack, activeUrl]);

  React.useEffect(() => {
    let isMounted = true;

    setupFcm().catch((error) => {
      if (isMounted) {
        console.warn("FCM setup failed", error);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  React.useEffect(() => {
    const unsubscribe = messaging().onTokenRefresh(async (token) => {
      console.log("token refresh", token);
      fcmTokenRef.current = token;
      pendingFcmTokenRef.current = token;
      await saveFcmTokenToBackend(token);
    });

    return unsubscribe;
  }, []);

  React.useEffect(() => {
    const handleUrl = ({ url }) => {
      const nextUrl = resolveNotificationUrl(url);
      if (nextUrl) {
        setSourceUrl(nextUrl);
        setActiveUrl(nextUrl);
      }
    };

    Linking.getInitialURL()
      .then((initialUrl) => {
        const nextUrl = resolveNotificationUrl(initialUrl);
        if (nextUrl) {
          setSourceUrl(nextUrl);
          setActiveUrl(nextUrl);
        }
      })
      .catch(() => {});

    const subscription = Linking.addEventListener("url", handleUrl);

    return () => {
      subscription.remove();
    };
  }, []);

  React.useEffect(() => {
    if (!isWebViewReady) {
      return;
    }

    SplashScreen.hideAsync().catch(() => {});
  }, [isWebViewReady]);

  const retryLoad = () => {
    setLoadError(null);
    setIsWebViewReady(false);
    webViewRef.current?.reload?.();
  };

  useEffect(() => {
    if (Platform.OS !== "android") {
      return;
    }

    NavigationBar.setButtonStyleAsync("light").catch(() => {});
    NavigationBar.setVisibilityAsync("hidden").catch(() => {});

    return () => {
      NavigationBar.setVisibilityAsync("visible").catch(() => {});
    };
  }, []);

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: "#ffffff" }}
      edges={["top"]}
    >
      <StatusBar hidden />
      {loadError ? (
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 24,
            backgroundColor: "#ffffff",
          }}
        >
          <Text style={{ fontSize: 18, fontWeight: "600", marginBottom: 8, color: "#111827" }}>
            Page load failed
          </Text>
          <Text style={{ fontSize: 14, textAlign: "center", color: "#6b7280", marginBottom: 16 }}>
            {loadError}
          </Text>
          <TouchableOpacity
            onPress={retryLoad}
            style={{
              paddingHorizontal: 20,
              paddingVertical: 12,
              borderRadius: 12,
              backgroundColor: "#239858",
            }}
          >
            <Text style={{ color: "#ffffff", fontWeight: "600" }}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
      <WebView
        ref={webViewRef}
        source={webViewSource}
        style={{ flex: 1, backgroundColor: "#ffffff" }}
        userAgent={WEBVIEW_USER_AGENT}
          applicationNameForUserAgent="TastizoApp"
          cacheEnabled
          cacheMode="LOAD_CACHE_ELSE_NETWORK"
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          onNavigationStateChange={(state) => {
            setCanGoBack(state.canGoBack);
            if (state.url) {
              setActiveUrl(state.url);
            }
          }}
        onLoadEnd={() => {
          setIsWebViewReady(true);
          if (webViewRef.current) {
            webViewRef.current.injectJavaScript(AUTH_PROBE_SCRIPT);
          }
        }}
        onMessage={handleWebViewMessage}
        onError={(event) => {
          const message = event?.nativeEvent?.description || "Unable to load page";
          setLoadError(message);
        }}
          javaScriptEnabled
          javaScriptCanOpenWindowsAutomatically
          domStorageEnabled
          allowFileAccess
          allowUniversalAccessFromFileURLs
          geolocationEnabled
          mediaPlaybackRequiresUserAction={false}
          allowsInlineMediaPlayback
          mixedContentMode="always"
          originWhitelist={["*"]}
          startInLoadingState
          setSupportMultipleWindows
          androidLayerType="hardware"
        />
      )}
    </SafeAreaView>
  );
}
