// Adopts the UIScene life cycle, which the iOS 27 SDK requires before an app may launch
// ("UIScene life cycle is required for apps built with this SDK"). Expo SDK 57 ships the
// scene delegate (ExpoAppSceneDelegate) but its prebuild template never wires it in; the
// SDK 58 template does, with exactly these changes. Delete this plugin when moving to SDK 58.
const fs = require('fs');
const path = require('path');
const {
  IOSConfig,
  withAppDelegate,
  withInfoPlist,
  withXcodeProject,
} = require('expo/config-plugins');

const SCENE_DELEGATE_SWIFT = `internal import Expo

@objc(SceneDelegate)
class SceneDelegate: ExpoAppSceneDelegate {
  // Extension point for config plugins.
}
`;

// The template's own window creation; under scenes, SceneDelegate creates the window.
const WINDOW_START =
  /#if os\(iOS\) \|\| os\(tvOS\)\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\s*factory\.startReactNative\([^)]*\)\s*#endif\n/;

const withSceneManifest = (config) =>
  withInfoPlist(config, (mod) => {
    mod.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: 'Default Configuration',
            UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).SceneDelegate',
          },
        ],
      },
    };
    return mod;
  });

const withSceneAppDelegate = (config) =>
  withAppDelegate(config, (mod) => {
    let source = mod.modResults.contents;
    if (source.includes('ExpoReactNativeFactoryProvider')) return mod;

    // Fail the prebuild rather than ship an app that asserts at launch.
    if (!source.includes('class AppDelegate: ExpoAppDelegate {') || !WINDOW_START.test(source)) {
      throw new Error(
        'with-scene-lifecycle: AppDelegate.swift no longer matches the SDK 57 template; ' +
          'compare it with the plugin before building.',
      );
    }
    source = source.replace(
      'class AppDelegate: ExpoAppDelegate {',
      'class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {',
    );
    source = source.replace(
      WINDOW_START,
      '    // The window is created and React Native is started by `SceneDelegate`.\n',
    );
    mod.modResults.contents = source;
    return mod;
  });

const withSceneDelegateFile = (config) =>
  withXcodeProject(config, (mod) => {
    const { platformProjectRoot, projectRoot } = mod.modRequest;
    const projectName = IOSConfig.XcodeUtils.getProjectName(projectRoot);
    const filepath = path.join(projectName, 'SceneDelegate.swift');

    fs.writeFileSync(path.join(platformProjectRoot, filepath), SCENE_DELEGATE_SWIFT);
    if (!mod.modResults.hasFile(filepath)) {
      IOSConfig.XcodeUtils.addBuildSourceFileToGroup({
        filepath,
        groupName: projectName,
        project: mod.modResults,
      });
    }
    return mod;
  });

const withSceneLifecycle = (config) =>
  withSceneDelegateFile(withSceneAppDelegate(withSceneManifest(config)));

module.exports = withSceneLifecycle;
