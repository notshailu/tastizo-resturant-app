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
  ScrollView,
  RefreshControl,
  Dimensions,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import messaging from "@react-native-firebase/messaging";
import NetInfo from "@react-native-community/netinfo";
import * as SplashScreen from "expo-splash-screen";
import * as NavigationBar from "expo-navigation-bar";
import * as Notifications from "expo-notifications";
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { WebView } from "react-native-webview";

const APP_URL = "https://tastizo.com";
const APP_ROOT_URL = "https://tastizo.com/";
const APP_START_URL = "https://tastizo.com/restaurant";
const FCM_SAVE_URL = `${APP_URL}/api/v1/fcm-tokens/save`;
const FCM_PLATFORM = "android";
const AUTH_TOKEN_STORAGE_KEY = "tastizo_restaurant_auth_token";
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
const FULLSCREEN_ROUTES = ["/login", "/otp", "/splash"];

void SplashScreen.preventAutoHideAsync();
LogBox.ignoreLogs(["A component is changing an uncontrolled input"]);

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

messaging().setBackgroundMessageHandler(async (remoteMessage) => {
  console.log("Message handled in the background!", remoteMessage);
});

const buildOrderUrl = (orderId) =>
  `${APP_URL}/food/resturant/feed?orderId=${encodeURIComponent(orderId)}`;

const resolveRemoteMessageUrl = (remoteMessage) => {
  if (!remoteMessage) {
    return null;
  }

  const candidates = [
    remoteMessage?.data?.url,
    remoteMessage?.data?.deepLink,
    remoteMessage?.notification?.android?.link,
  ];

  for (const candidate of candidates) {
    const resolved = resolveNotificationUrl(candidate);
    if (resolved) {
      return resolved;
    }
  }

  const orderId = remoteMessage?.data?.orderId;
  if (orderId) {
    return buildOrderUrl(orderId);
  }

  return null;
};

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

    if (
      parsed.pathname.includes("/restaurant/feed") ||
      parsed.pathname.includes("/food/resturant/feed") ||
      parsed.pathname.includes("/restaurant/orders")
    ) {
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

const HIDE_SCROLLBAR_SCRIPT = `
  (function() {
    try {
      var style = document.getElementById("tastizo-hide-scrollbar-style");
      if (!style) {
        style = document.createElement("style");
        style.id = "tastizo-hide-scrollbar-style";
        style.innerHTML = [
          "html, body { scrollbar-width: none !important; -ms-overflow-style: none !important; }",
          "html::-webkit-scrollbar, body::-webkit-scrollbar, *::-webkit-scrollbar { width: 0 !important; height: 0 !important; display: none !important; background: transparent !important; }"
        ].join(" ");
        (document.head || document.documentElement).appendChild(style);
      }
    } catch (_error) {}
    true;
  })();
`;

const FULLSCREEN_ROUTE_STYLE_SCRIPT = `
  (function() {
    try {
      function findPrimaryContainer() {
        var selectors = [
          "[data-testid='login-screen']",
          "[data-testid='otp-screen']",
          "#root",
          "#__next",
          "main",
          "body > div",
          "body > main"
        ];

        for (var i = 0; i < selectors.length; i++) {
          var match = document.querySelector(selectors[i]);
          if (match) return match;
        }

        return document.body && document.body.firstElementChild;
      }

      function collapseTopGap() {
        var primary = findPrimaryContainer();
        if (!primary || !document.body) return;

        var rect = primary.getBoundingClientRect();
        if (rect.top > 0) {
          primary.style.marginTop = (-rect.top) + "px";
        }

        primary.style.paddingTop = "0";
        primary.style.minHeight = "100vh";
        document.body.style.paddingTop = "0";
        document.body.style.marginTop = "0";
      }

      var style = document.getElementById("tastizo-fullscreen-route-style");
      if (!style) {
        style = document.createElement("style");
        style.id = "tastizo-fullscreen-route-style";
        style.innerHTML = [
          "html, body { margin: 0 !important; padding: 0 !important; min-height: 100vh !important; overflow-x: hidden !important; }",
          "body { overscroll-behavior-y: none !important; }",
          "html { background: #ffffff !important; }",
          "#root, #__next, main, body > div, body > main { margin-top: 0 !important; padding-top: 0 !important; min-height: 100vh !important; }",
          "body > *:first-child, body > div:first-child, body > main:first-child { margin-top: 0 !important; padding-top: 0 !important; }",
          "* { --sat: 0px !important; --safe-area-inset-top: 0px !important; }"
        ].join(" ");
        (document.head || document.documentElement).appendChild(style);
      }

      var candidates = [
        document.getElementById("root"),
        document.getElementById("__next"),
        document.querySelector("main"),
        document.body && document.body.firstElementChild
      ].filter(Boolean);

      candidates.forEach(function(node) {
        node.style.marginTop = "0";
        node.style.paddingTop = "0";
        node.style.minHeight = "100vh";
      });

      collapseTopGap();
      requestAnimationFrame(collapseTopGap);
      setTimeout(collapseTopGap, 150);
      setTimeout(collapseTopGap, 500);
    } catch (_error) {}
    true;
  })();
`;

const REMOVE_FULLSCREEN_ROUTE_STYLE_SCRIPT = `
  (function() {
    try {
      var style = document.getElementById("tastizo-fullscreen-route-style");
      if (style && style.parentNode) {
        style.parentNode.removeChild(style);
      }

      var candidates = [
        document.getElementById("root"),
        document.getElementById("__next"),
        document.querySelector("main"),
        document.body && document.body.firstElementChild
      ].filter(Boolean);

      candidates.forEach(function(node) {
        node.style.marginTop = "";
        node.style.paddingTop = "";
        node.style.minHeight = "";
      });

      if (document.body) {
        document.body.style.paddingTop = "";
        document.body.style.marginTop = "";
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

const normalizePathname = (url) => {
  try {
    const pathname = new URL(url).pathname.replace(/\/+$/, "");
    return pathname || "/";
  } catch (_error) {
    return "";
  }
};

function AppContent() {
  const insets = useSafeAreaInsets();
  const webViewRef = useRef(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [sourceUrl, setSourceUrl] = useState(APP_START_URL);
  const [activeUrl, setActiveUrl] = useState(APP_START_URL);
  const [isWebViewReady, setIsWebViewReady] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [isConnected, setIsConnected] = useState(true);
  const fcmTokenRef = useRef(null);
  const authTokenRef = useRef(null);
  const pendingFcmTokenRef = useRef(null);
  const lastSavedTokenKeyRef = useRef(null);
  const lastQueuedTokenRef = useRef(null);
  const loginStyleAppliedRef = useRef(false);
  const webViewSource = useMemo(() => ({ uri: sourceUrl }), [sourceUrl]);
  const activePathname = useMemo(() => normalizePathname(activeUrl), [activeUrl]);
  const isLoginRoute = useMemo(
    () => activePathname === "/restaurant/login" || activePathname === "/login",
    [activePathname]
  );
  const isFullscreenRoute = useMemo(
    () => FULLSCREEN_ROUTES.some((route) => activePathname.includes(route)),
    [activePathname]
  );
  const loginRouteInjection = useMemo(
    () => (isFullscreenRoute ? FULLSCREEN_ROUTE_STYLE_SCRIPT : null),
    [isFullscreenRoute]
  );
  const containerStyle = useMemo(
    () => ({
      flex: 1,
      backgroundColor: isWebViewReady ? "#ffffff" : "#299861",
      paddingTop: isWebViewReady ? insets.top : 0,
      paddingBottom: 0,
    }),
    [isWebViewReady, insets.top]
  );

  const [isRefreshEnabled, setIsRefreshEnabled] = useState(false);

  const handleTouchStart = (e) => {
    const pageY = e.nativeEvent.pageY;
    const { height } = Dimensions.get("window");
    if (pageY <= height * 0.15) {
      setIsRefreshEnabled(true);
    } else {
      setIsRefreshEnabled(false);
    }
  };

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

  const requestLocationPermission = async () => {
    if (Platform.OS !== "android") {
      return true;
    }

    try {
      const fineLocationGranted = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
      );
      const coarseLocationGranted = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION
      );

      if (fineLocationGranted || coarseLocationGranted) {
        return true;
      }

      const result = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
      ]);

      return (
        result[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] ===
          PermissionsAndroid.RESULTS.GRANTED ||
        result[PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION] ===
          PermissionsAndroid.RESULTS.GRANTED
      );
    } catch (error) {
      console.warn("location permission request failed", error);
      return false;
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

    requestLocationPermission().catch((error) => {
      if (isMounted) {
        console.warn("location permission setup failed", error);
      }
    });

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
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsConnected(state.isConnected !== false);
    });

    return () => {
      unsubscribe();
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
    const unsubscribeNotificationOpen = messaging().onNotificationOpenedApp(
      (remoteMessage) => {
        const nextUrl = resolveRemoteMessageUrl(remoteMessage);
        if (nextUrl) {
          setSourceUrl(nextUrl);
          setActiveUrl(nextUrl);
        }
      }
    );

    messaging()
      .getInitialNotification()
      .then((remoteMessage) => {
        const nextUrl = resolveRemoteMessageUrl(remoteMessage);
        if (nextUrl) {
          setSourceUrl(nextUrl);
          setActiveUrl(nextUrl);
        }
      })
      .catch(() => {});

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

    const unsubscribeOnMessage = messaging().onMessage(async (remoteMessage) => {
      console.log("Foreground message received:", remoteMessage);
      const title = remoteMessage?.notification?.title || remoteMessage?.data?.title || "New Notification";
      const body = remoteMessage?.notification?.body || remoteMessage?.data?.body || "You have a new message";
      
      await Notifications.scheduleNotificationAsync({
        content: {
          title: title,
          body: body,
          data: { url: resolveRemoteMessageUrl(remoteMessage) },
        },
        trigger: null,
      });
    });

    const notificationResponseSubscription = Notifications.addNotificationResponseReceivedListener(response => {
      const url = response.notification.request.content.data?.url;
      if (url) {
        setSourceUrl(url);
        setActiveUrl(url);
      }
    });

    return () => {
      unsubscribeNotificationOpen();
      subscription.remove();
      unsubscribeOnMessage();
      notificationResponseSubscription.remove();
    };
  }, []);

  React.useEffect(() => {
    if (!isFullscreenRoute) {
      if (loginStyleAppliedRef.current && webViewRef.current) {
        webViewRef.current.injectJavaScript(REMOVE_FULLSCREEN_ROUTE_STYLE_SCRIPT);
      }
      loginStyleAppliedRef.current = false;
      return;
    }

    if (!isWebViewReady || loginStyleAppliedRef.current) {
      return;
    }

    webViewRef.current?.injectJavaScript?.(FULLSCREEN_ROUTE_STYLE_SCRIPT);
    loginStyleAppliedRef.current = true;
  }, [isFullscreenRoute, isWebViewReady]);

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

  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    if (webViewRef.current) {
      webViewRef.current.reload();
    }
    setTimeout(() => {
      setRefreshing(false);
    }, 2000);
  }, []);

  return (
    <View style={containerStyle} onTouchStart={handleTouchStart}>
      <StatusBar 
        hidden={false} 
        translucent={true} 
        backgroundColor="transparent" 
        barStyle={isWebViewReady ? "dark-content" : "light-content"} 
      />
      {!isConnected ? (
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 24,
            backgroundColor: "#299861",
          }}
        >
          <Text style={{ fontSize: 24, fontWeight: "bold", marginBottom: 12, color: "#ffffff" }}>
            No Connection
          </Text>
          <Text style={{ fontSize: 16, textAlign: "center", color: "#e6f5ec", marginBottom: 24 }}>
            Please check your internet connection and try again.
          </Text>
          <TouchableOpacity
            onPress={() => {
              NetInfo.fetch().then(state => {
                setIsConnected(state.isConnected !== false);
                if (state.isConnected !== false) {
                  retryLoad();
                }
              });
            }}
            style={{
              paddingHorizontal: 24,
              paddingVertical: 14,
              borderRadius: 12,
              backgroundColor: "#ffffff",
              elevation: 2,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.1,
              shadowRadius: 4,
            }}
          >
            <Text style={{ color: "#299861", fontWeight: "bold", fontSize: 16 }}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : loadError ? (
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 24,
            backgroundColor: "#239858",
          }}
        >
          <Text style={{ fontSize: 18, fontWeight: "600", marginBottom: 8, color: "#ffffff" }}>
            Page load failed
          </Text>
          <Text style={{ fontSize: 14, textAlign: "center", color: "#d1fae5", marginBottom: 16 }}>
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
        <ScrollView
          contentContainerStyle={{ flex: 1 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={["#299861"]}
              enabled={isRefreshEnabled}
            />
          }
        >
          <WebView
            ref={webViewRef}
        source={webViewSource}
        injectedJavaScriptBeforeContentLoaded={loginRouteInjection || undefined}
        style={{ flex: 1, backgroundColor: "#ffffff" }}
        userAgent={WEBVIEW_USER_AGENT}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
          applicationNameForUserAgent="TastizoRestaurantPartner"
          cacheEnabled={false}
          cacheMode="LOAD_NO_CACHE"
          incognito={false}
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
            webViewRef.current.injectJavaScript(HIDE_SCROLLBAR_SCRIPT);
            webViewRef.current.injectJavaScript(AUTH_PROBE_SCRIPT);
            if (isFullscreenRoute) {
              webViewRef.current.injectJavaScript(FULLSCREEN_ROUTE_STYLE_SCRIPT);
            }
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
          pullToRefreshEnabled={false}
          nestedScrollEnabled={true}
          bounces={true}
        />
        </ScrollView>
      )}
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}
