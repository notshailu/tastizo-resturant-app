module.exports = {
  project: {
    android: {
      sourceDir: "./android",
      packageName: "com.tastizo.app",
      applicationId: "com.tastizo.app",
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
