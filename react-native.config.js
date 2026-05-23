module.exports = {
  project: {
    android: {
      sourceDir: "./android",
      packageName: "com.tastizo.deliverypartner",
      applicationId: "com.tastizo.deliverypartner",
    },
  },
  dependencies: {
    "react-native-reanimated": {
      platforms: {
        android: null,
      },
    },
    "react-native-worklets": {
      platforms: {
        android: null,
      },
    },
  },
};
