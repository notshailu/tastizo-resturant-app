module.exports = {
  project: {
    android: {
      sourceDir: "./android",
      packageName: "com.taztizo.deliverypartner",
      applicationId: "com.taztizo.deliverypartner",
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
