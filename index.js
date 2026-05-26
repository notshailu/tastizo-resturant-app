import { registerRootComponent } from "expo";
import messaging from "@react-native-firebase/messaging";

import App from "./app";

// Register background handler for killed state
messaging().setBackgroundMessageHandler(async remoteMessage => {
  console.log("Message handled in the background!", remoteMessage);
});

registerRootComponent(App);
