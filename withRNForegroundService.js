const { withAndroidManifest, AndroidConfig } = require('@expo/config-plugins');

const withRNForegroundService = (config) => {
  return withAndroidManifest(config, async (config) => {
    const androidManifest = config.modResults;

    // Make sure we have the application block
    const mainApplication = AndroidConfig.Manifest.getMainApplicationOrThrow(androidManifest);

    // 1. Add permissions
    AndroidConfig.Permissions.addPermission(androidManifest, 'android.permission.FOREGROUND_SERVICE');
    AndroidConfig.Permissions.addPermission(androidManifest, 'android.permission.WAKE_LOCK');

    // 2. Add meta-data
    AndroidConfig.Manifest.addMetaDataItemToMainApplication(
      mainApplication,
      'com.supersami.foregroundservice.notification_channel_name',
      'Tastizo Delivery'
    );
    AndroidConfig.Manifest.addMetaDataItemToMainApplication(
      mainApplication,
      'com.supersami.foregroundservice.notification_channel_description',
      'Delivery driver is online.'
    );

    // 3. Add ForegroundService
    const hasService = mainApplication.service?.some(
      (s) => s.$['android:name'] === 'com.supersami.foregroundservice.ForegroundService'
    );
    if (!hasService) {
      if (!mainApplication.service) mainApplication.service = [];
      mainApplication.service.push({
        $: {
          'android:name': 'com.supersami.foregroundservice.ForegroundService',
          'android:foregroundServiceType': 'location',
          'android:exported': 'false',
        },
      });
    } else {
      const service = mainApplication.service.find(
        (s) => s.$['android:name'] === 'com.supersami.foregroundservice.ForegroundService'
      );
      service.$['android:foregroundServiceType'] = 'location';
      service.$['android:exported'] = 'false';
    }

    // 4. Add ForegroundServiceTask
    const hasTaskService = mainApplication.service?.some(
      (s) => s.$['android:name'] === 'com.supersami.foregroundservice.ForegroundServiceTask'
    );
    if (!hasTaskService) {
      if (!mainApplication.service) mainApplication.service = [];
      mainApplication.service.push({
        $: {
          'android:name': 'com.supersami.foregroundservice.ForegroundServiceTask',
          'android:foregroundServiceType': 'location',
          'android:exported': 'false',
        },
      });
    } else {
      const serviceTask = mainApplication.service.find(
        (s) => s.$['android:name'] === 'com.supersami.foregroundservice.ForegroundServiceTask'
      );
      serviceTask.$['android:foregroundServiceType'] = 'location';
      serviceTask.$['android:exported'] = 'false';
    }

    return config;
  });
};

module.exports = withRNForegroundService;
