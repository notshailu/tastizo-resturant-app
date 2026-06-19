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
import notifee, { AndroidImportance, EventType } from "@notifee/react-native";
import ReactNativeForegroundService from "@supersami/rn-foreground-service";
import * as SplashScreen from "expo-splash-screen";
import * as NavigationBar from "expo-navigation-bar";
import * as Location from "expo-location";
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import { startRingtone } from "./RingtoneManager";

const APP_URL = "https://tastizo.com";
const APP_ROOT_URL = "https://tastizo.com/";
const APP_START_URL = "https://tastizo.com/delivery";
const FCM_SAVE_URL = `${APP_URL}/api/v1/fcm-tokens/save`;
const FCM_PLATFORM = "android";
const AUTH_TOKEN_STORAGE_KEY = "tastizo_delivery_auth_token";
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

const buildOrderUrl = (orderId) =>
  `${APP_URL}/delivery/feed?orderId=${encodeURIComponent(orderId)}`;

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
      parsed.pathname.includes("/delivery/feed") ||
      parsed.pathname.includes("/delivery/orders")
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
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: "AUTH_TOKEN",
          token: token,
          source: source
        }));
      }

      function checkTokens() {
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
        postToken(null, null);
      }

      // Run immediately on page load
      checkTokens();

      // Hook storage methods to detect client-side logout/login instantly without reload
      if (!window.__authHooked) {
        window.__authHooked = true;

        var originalSetItem = window.localStorage.setItem;
        window.localStorage.setItem = function(key, value) {
          originalSetItem.apply(this, arguments);
          if (/token|auth|jwt|bearer/i.test(key) || candidateKeys.indexOf(key) !== -1) {
            setTimeout(checkTokens, 50);
          }
        };

        var originalRemoveItem = window.localStorage.removeItem;
        window.localStorage.removeItem = function(key) {
          originalRemoveItem.apply(this, arguments);
          if (/token|auth|jwt|bearer/i.test(key) || candidateKeys.indexOf(key) !== -1) {
            setTimeout(checkTokens, 50);
          }
        };

        var originalClear = window.localStorage.clear;
        window.localStorage.clear = function() {
          originalClear.apply(this, arguments);
          setTimeout(checkTokens, 50);
        };

        var originalSessionSetItem = window.sessionStorage.setItem;
        window.sessionStorage.setItem = function(key, value) {
          originalSessionSetItem.apply(this, arguments);
          if (/token|auth|jwt|bearer/i.test(key) || candidateKeys.indexOf(key) !== -1) {
            setTimeout(checkTokens, 50);
          }
        };

        var originalSessionRemoveItem = window.sessionStorage.removeItem;
        window.sessionStorage.removeItem = function(key) {
          originalSessionRemoveItem.apply(this, arguments);
          if (/token|auth|jwt|bearer/i.test(key) || candidateKeys.indexOf(key) !== -1) {
            setTimeout(checkTokens, 50);
          }
        };

        var originalSessionClear = window.sessionStorage.clear;
        window.sessionStorage.clear = function() {
          originalSessionClear.apply(this, arguments);
          setTimeout(checkTokens, 50);
        };
      }
    } catch (_error) {}
    true;
  })();
`;

const ONLINE_STATUS_PROBE_SCRIPT = `
  (function() {
    try {
      function getOnlineStatus() {
        try {
          var val = window.localStorage.getItem("delivery-v2-online-pref");
          if (val) {
            var parsed = JSON.parse(val);
            if (parsed && parsed.state && typeof parsed.state.isOnline === "boolean") {
              return parsed.state.isOnline;
            }
          }
        } catch (e) {}
        try {
          var val = window.localStorage.getItem("app:isOnline");
          if (val !== null) {
            return val === "true" || val === true;
          }
        } catch (e) {}
        return false;
      }

      function getRiderName() {
        try {
          var userRaw = window.localStorage.getItem("delivery_user") || window.localStorage.getItem("deliveryUser") || window.localStorage.getItem("user");
          if (userRaw) {
            var user = JSON.parse(userRaw);
            var profile = user?.profile || user?.deliveryPartner || user;
            var name = profile?.fullName || profile?.firstName || profile?.name || profile?.displayName || "";
            if (name) return name;
          }
        } catch(e) {}
        return "Delivery Partner";
      }

      function checkAndPostStatus() {
        if (!window.ReactNativeWebView) {
          setTimeout(checkAndPostStatus, 100);
          return;
        }
        var isOnline = getOnlineStatus();
        var riderName = getRiderName();
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: "DELIVERY_STATUS",
          status: isOnline ? "online" : "offline",
          riderName: riderName
        }));
      }

      // 1. Initial status post
      checkAndPostStatus();

      // 2. Intercept future changes via localStorage.setItem
      if (!window.__statusHooked) {
        window.__statusHooked = true;
        var originalSetItem = window.localStorage.setItem;
        window.localStorage.setItem = function(key, value) {
          originalSetItem.apply(this, arguments);
          if (key === "delivery-v2-online-pref" || key === "app:isOnline" || key === "delivery_user") {
            setTimeout(function() {
              checkAndPostStatus();
            }, 50);
          }
        };
      }
    } catch (e) {}
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
  const [canRefresh, setCanRefresh] = useState(true);
  const fcmTokenRef = useRef(null);
  const authTokenRef = useRef(null);
  const pendingFcmTokenRef = useRef(null);
  const lastSavedTokenKeyRef = useRef(null);
  const lastQueuedTokenRef = useRef(null);
  const isSavingFcmTokenRef = useRef(false);
  const loginStyleAppliedRef = useRef(false);
  const touchStartTop15Ref = useRef(false);
  const yOffsetRef = useRef(0);

  const handleTouchStart = (event) => {
    const pageY = event.nativeEvent.pageY;
    const screenHeight = Dimensions.get("window").height;
    const isTop15 = pageY <= screenHeight * 0.15;
    touchStartTop15Ref.current = isTop15;
    setCanRefresh(yOffsetRef.current <= 0 && isTop15);
  };

  const handleTouchEnd = () => {
    touchStartTop15Ref.current = false;
  };

  const webViewSource = useMemo(() => ({ uri: sourceUrl }), [sourceUrl]);
  const activePathname = useMemo(() => normalizePathname(activeUrl), [activeUrl]);
  const isLoginRoute = useMemo(
    () => activePathname === "/delivery/login" || activePathname === "/login",
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
      backgroundColor: "#239858",
      paddingTop: 0,
      paddingBottom: 0,
    }),
    []
  );
 
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

    if (isSavingFcmTokenRef.current) {
      console.log("fcm token save already in progress, skipping duplicate call");
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
      isSavingFcmTokenRef.current = true;
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
    } finally {
      isSavingFcmTokenRef.current = false;
    }
  };

  const requestLocationPermission = async () => {
    if (Platform.OS !== "android") {
      return true;
    }

    try {
      const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();

      if (foregroundStatus !== "granted") {
        return false;
      }

      // Trigger the prompt to ask user to enable high GPS accuracy in device settings
      try {
        await Location.enableNetworkProviderAsync();
      } catch (e) {
        console.log("Could not enable high accuracy network provider", e);
      }

      // Google Play Policy: Show prominent disclosure before requesting background location permission
      const { status: backgroundStatus } = await Location.getBackgroundPermissionsAsync();
      if (backgroundStatus !== "granted") {
        await new Promise((resolve) => {
          Alert.alert(
            "Background Location Access",
            "Tastizo Delivery collects location data to enable real-time order matching and active delivery tracking for customers, even when the app is closed or not in use.",
            [
              {
                text: "Deny",
                style: "cancel",
                onPress: () => resolve(false)
              },
              {
                text: "Agree & Continue",
                onPress: async () => {
                  try {
                    await Location.requestBackgroundPermissionsAsync();
                  } catch (err) {
                    console.log("Background location request error", err);
                  }
                  resolve(true);
                }
              }
            ],
            { cancelable: false }
          );
        });
      }

      return true;
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
      console.log("WebView message received:", parsed);
      if (parsed?.type === "AUTH_TOKEN") {
        if (parsed.token) {
          console.log("auth token received from WebView", parsed.source || "unknown");
          const normalized = await persistAuthToken(parsed.token);
          if (normalized && pendingFcmTokenRef.current) {
            console.log("resyncing FCM token after auth token update");
            await saveFcmTokenToBackend(pendingFcmTokenRef.current);
          } else if (normalized && fcmTokenRef.current) {
            console.log("resyncing FCM token after auth token update");
            await saveFcmTokenToBackend(fcmTokenRef.current);
          }
        } else {
          // If token is null/empty, check if we need to clean up/logout.
          // Check if we are on our app domain to prevent external URLs from triggering logouts.
          const isTastizoDomain = activeUrl && (activeUrl.startsWith("https://tastizo.com") || activeUrl.startsWith("http://localhost"));
          const storedToken = await getStoredAuthToken();
          if (storedToken && isTastizoDomain) {
            console.log("Detecting logout: clearing auth token and FCM token");
            
            // 1. Remove FCM token from backend database for the logged-out user
            if (fcmTokenRef.current) {
              try {
                console.log("Removing FCM token from backend:", fcmTokenRef.current);
                const removeUrl = `${APP_URL}/api/v1/fcm-tokens/remove/${encodeURIComponent(fcmTokenRef.current)}`;
                const response = await fetch(removeUrl, {
                  method: "DELETE",
                  headers: {
                    "Authorization": `Bearer ${storedToken}`,
                    "Content-Type": "application/json",
                  },
                });
                console.log("Backend FCM remove response:", response.status);
              } catch (err) {
                console.warn("Failed to remove FCM token from backend:", err);
              }
            }

            // 2. Clear refs and AsyncStorage
            authTokenRef.current = null;
            await AsyncStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
            lastSavedTokenKeyRef.current = null;
            pendingFcmTokenRef.current = null;
            lastQueuedTokenRef.current = null;
            
            // 3. Delete FCM token on the device (always delete it to ensure invalidation)
            try {
              console.log("Deleting FCM token from device");
              await messaging().deleteToken();
              fcmTokenRef.current = null;
              console.log("FCM token deleted successfully");
            } catch (err) {
              console.warn("Error deleting FCM token on logout", err);
            }
            
            // 3. Wait 1 second to let Firebase finish deletion before setup
            await sleep(1000);
            
            // 4. Register/Get a new FCM token for the device
            try {
              console.log("Re-setting up FCM after logout...");
              await setupFcm();
            } catch (err) {
              console.warn("FCM setup after logout failed", err);
            }
          }
        }
      } else if (parsed?.type === "DELIVERY_STATUS") {
        if (parsed.status === "online") {
          if (Platform.OS === "android") {
            const hasLocation = await requestLocationPermission();
            const hasNotification = await requestNotificationPermission();
            
            if (!hasLocation || !hasNotification) {
               console.log("Missing permissions to start Foreground Service");
               Alert.alert("Permission Required", "Please enable Notification and Location permissions to stay online.");
               return;
            }
            
            const riderDisplayName = parsed.riderName || "Delivery Partner";
            ReactNativeForegroundService.start({
              id: 144,
              title: "Tastizo Delivery",
              message: `${riderDisplayName} is online and ready to receive orders.`,
              icon: "ic_launcher",
              ServiceType: "location",
              button: false,
              button2: false,
              setOnlyAlertOnce: true,
              color: "#000000",
            });
            ReactNativeForegroundService.add_task(() => {}, {
              delay: 1000,
              onLoop: true,
              taskId: "deliveryKeepAliveTask",
              onError: (e) => console.log("Error logging:", e),
            });
          }
        } else {
          if (Platform.OS === "android") {
            ReactNativeForegroundService.stop();
            ReactNativeForegroundService.remove_task("deliveryKeepAliveTask");
          }
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

    const initializePermissions = async () => {
      try {
        await setupFcm();
      } catch (error) {
        if (isMounted) {
          console.warn("FCM setup failed", error);
        }
      }

      try {
        await requestLocationPermission();
      } catch (error) {
        if (isMounted) {
          console.warn("location permission setup failed", error);
        }
      }
    };

    initializePermissions();

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
    const unsubscribeForeground = messaging().onMessage(async (remoteMessage) => {
      console.log("Foreground message received!", remoteMessage);
      
      // Display local system heads-up notification banner if it contains notification details
      try {
        const title = remoteMessage?.notification?.title || remoteMessage?.data?.title;
        const body = remoteMessage?.notification?.body || remoteMessage?.data?.body;

        if (title || body) {
          const channelId = await notifee.createChannel({
            id: "default",
            name: "Default Channel",
            importance: AndroidImportance.HIGH,
          });

          await notifee.displayNotification({
            title: title || "Tastizo Delivery",
            body: body || "",
            data: remoteMessage?.data || {},
            android: {
              channelId,
              importance: AndroidImportance.HIGH,
              pressAction: {
                id: "default",
                launchActivity: "default",
              },
            },
          });
        }
      } catch (error) {
        console.warn("Failed to display foreground local notification", error);
      }

      // Play ringtone if it's a new order
      if (remoteMessage?.data?.type === "NEW_ORDER") {
        await startRingtone();
      }
      
      // Inject JS to notify the WebView of the incoming message in the foreground
      if (webViewRef.current) {
        const payloadStr = JSON.stringify(remoteMessage);
        webViewRef.current.injectJavaScript(`
          try {
            // Dispatch custom events
            window.dispatchEvent(new CustomEvent('native-push-notification', { detail: ${payloadStr} }));
            window.dispatchEvent(new CustomEvent('ForegroundNotification', { detail: ${payloadStr} }));
            
            // Post window message
            window.postMessage({
              type: 'native-push-notification',
              payload: ${payloadStr}
            }, '*');
          } catch(e) {}
          true;
        `);
      }
    });
    
    return unsubscribeForeground;
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

    // Listen for Notifee foreground press events
    const unsubscribeForegroundEvent = notifee.onForegroundEvent(({ type, detail }) => {
      if (type === EventType.PRESS) {
        console.log("Notifee foreground event PRESS received:", detail);
        const notification = detail.notification;
        if (notification && notification.data) {
          const nextUrl = resolveRemoteMessageUrl({ data: notification.data });
          if (nextUrl) {
            setSourceUrl(nextUrl);
            setActiveUrl(nextUrl);
          }
        }
      }
    });

    // Check if app was opened by a Notifee notification press
    notifee.getInitialNotification()
      .then((initialNotification) => {
        if (initialNotification) {
          console.log("Notifee initial notification received:", initialNotification);
          const notification = initialNotification.notification;
          if (notification && notification.data) {
            const nextUrl = resolveRemoteMessageUrl({ data: notification.data });
            if (nextUrl) {
              setSourceUrl(nextUrl);
              setActiveUrl(nextUrl);
            }
          }
        }
      })
      .catch((err) => console.warn("Failed to get Notifee initial notification", err));

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
      unsubscribeNotificationOpen();
      subscription.remove();
      unsubscribeForegroundEvent();
    };
  }, []);

  React.useEffect(() => {
    if (!isFullscreenRoute) {
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
    if (!isWebViewReady && !loadError) {
      return;
    }

    SplashScreen.hideAsync().catch(() => {});
  }, [isWebViewReady, loadError]);

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
    <View style={containerStyle}>
      <StatusBar hidden />
      {loadError ? (
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
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                webViewRef.current?.reload();
              }}
              enabled={canRefresh}
              colors={["#ffffff"]}
              progressBackgroundColor={"#239858"}
            />
          }
        >
          <WebView
            ref={webViewRef}
            source={webViewSource}
            bounces={true}
            onScroll={(event) => {
              const yOffset = event.nativeEvent.contentOffset.y;
              yOffsetRef.current = yOffset;
              setCanRefresh(yOffset <= 0 && touchStartTop15Ref.current);
            }}
            injectedJavaScriptBeforeContentLoaded={loginRouteInjection || undefined}
            style={{ flex: 1, backgroundColor: "#239858" }}
            userAgent={WEBVIEW_USER_AGENT}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
          applicationNameForUserAgent="TastizoDeliveryPartner"
          cacheEnabled={false}
          cacheMode="LOAD_NO_CACHE"
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          onShouldStartLoadWithRequest={(request) => {
            const { url } = request;
            if (url.startsWith('http://') || url.startsWith('https://')) {
              return true;
            }
            if (url.startsWith('tel:') || url.startsWith('mailto:') || url.startsWith('sms:') || url.startsWith('whatsapp:')) {
              Linking.openURL(url).catch(err => console.log('Error opening URL', err));
              return false;
            }
            return true;
          }}
          onNavigationStateChange={(state) => {
            setCanGoBack(state.canGoBack);
            if (state.url) {
              console.log("WebView navigating to:", state.url);
              setActiveUrl(state.url);
              webViewRef.current?.injectJavaScript(ONLINE_STATUS_PROBE_SCRIPT);
            }
          }}
        onLoadEnd={() => {
          setRefreshing(false);
          setIsWebViewReady(true);
          if (webViewRef.current) {
            webViewRef.current.injectJavaScript(HIDE_SCROLLBAR_SCRIPT);
            webViewRef.current.injectJavaScript(AUTH_PROBE_SCRIPT);
            webViewRef.current.injectJavaScript(ONLINE_STATUS_PROBE_SCRIPT);
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
