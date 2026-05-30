import { Audio } from "expo-av";

let ringtoneSound = null;

export const startRingtone = async () => {
  try {
    if (ringtoneSound) {
      await ringtoneSound.stopAsync();
      await ringtoneSound.unloadAsync();
      ringtoneSound = null;
    }
    
    await Audio.setAudioModeAsync({
      staysActiveInBackground: true,
      playsInSilentModeIOS: true,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });

    const { sound } = await Audio.Sound.createAsync(
      require('./assets/zomato_sms.mp3'),
      { shouldPlay: true, isLooping: true }
    );
    ringtoneSound = sound;
  } catch (error) {
    console.error("Failed to play ringtone", error);
  }
};

export const stopRingtone = async () => {
  try {
    if (ringtoneSound) {
      await ringtoneSound.stopAsync();
      await ringtoneSound.unloadAsync();
      ringtoneSound = null;
    }
  } catch (error) {
    console.log("Failed to stop ringtone", error);
  }
};
