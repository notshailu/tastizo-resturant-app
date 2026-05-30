import { registerRootComponent } from "expo";
import messaging from "@react-native-firebase/messaging";
import ReactNativeForegroundService from "@supersami/rn-foreground-service";
import { startRingtone } from "./RingtoneManager";

// Register foreground service task
ReactNativeForegroundService.register({ config: { alert: false } });

import App from "./app";

// Register background handler for killed state
messaging().setBackgroundMessageHandler(async remoteMessage => {
  console.log("Message handled in the background!", remoteMessage);

  if (remoteMessage?.data?.type === "NEW_ORDER") {
    await startRingtone();
  }
});

registerRootComponent(App);
