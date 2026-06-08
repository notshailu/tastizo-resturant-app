import { registerRootComponent } from "expo";
import messaging from "@react-native-firebase/messaging";
import notifee, { AndroidImportance } from "@notifee/react-native";
import ReactNativeForegroundService from "@supersami/rn-foreground-service";
import { startRingtone, stopRingtone } from "./RingtoneManager";

// Create default notification channel early for FCM background messages
notifee.createChannel({
  id: "default",
  name: "Default Channel",
  importance: AndroidImportance.HIGH,
});

// Register foreground service task
ReactNativeForegroundService.register({ config: { alert: false } });

import App from "./app";

// Register background handler for killed state
messaging().setBackgroundMessageHandler(async remoteMessage => {
  console.log("Message handled in the background!", remoteMessage);

  // Fallback to display a local notification if the payload doesn't automatically trigger one
  // or if it's a data-only message with title/body
  try {
    const title = remoteMessage?.notification?.title || remoteMessage?.data?.title;
    const body = remoteMessage?.notification?.body || remoteMessage?.data?.body;
    
    if (title || body) {
      await notifee.displayNotification({
        title: title || "Tastizo Delivery",
        body: body || "",
        android: {
          channelId: "default",
          importance: AndroidImportance.HIGH,
          pressAction: {
            id: "default",
            launchActivity: "default",
          },
        },
      });
    }
  } catch (error) {
    console.warn("Failed to display background local notification", error);
  }

  if (remoteMessage?.data?.type === "NEW_ORDER") {
    await startRingtone();
    // Keep the headless task alive for 30 seconds so the sound can play
    await new Promise(resolve => setTimeout(resolve, 30000));
    await stopRingtone();
  }
});

registerRootComponent(App);
