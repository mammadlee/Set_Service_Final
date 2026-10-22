import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:worker_app/core/theme/app_theme.dart';
import 'package:worker_app/shared/app_strings.dart';

void main() {
  test('platform identifiers use the production application id', () {
    final gradle = File('android/app/build.gradle.kts').readAsStringSync();
    final activity = File(
      'android/app/src/main/kotlin/az/setservice/app/MainActivity.kt',
    ).readAsStringSync();
    final xcodeProject = File(
      'ios/Runner.xcodeproj/project.pbxproj',
    ).readAsStringSync();

    expect(gradle, contains('namespace = "az.setservice.app"'));
    expect(gradle, contains('applicationId = "az.setservice.app"'));
    expect(activity, contains('package az.setservice.app'));
    expect(
      xcodeProject,
      contains('PRODUCT_BUNDLE_IDENTIFIER = az.setservice.app;'),
    );
    expect(xcodeProject, isNot(contains('az.setservice.workerApp')));
  });

  test('launch surfaces use the same brand metadata and background', () {
    final webIndex = File('web/index.html').readAsStringSync();
    final webManifest = File('web/manifest.json').readAsStringSync();
    final androidColors = File(
      'android/app/src/main/res/values/colors.xml',
    ).readAsStringSync();
    final iosLaunch = File(
      'ios/Runner/Base.lproj/LaunchScreen.storyboard',
    ).readAsStringSync();

    expect(BrandColors.creamBackground, const Color(0xFFF7F1EA));
    expect(androidColors, contains('#F7F1EA'));
    expect(webManifest, contains('"background_color": "#F7F1EA"'));
    expect(webIndex, contains('<title>${AppStrings.appTitle}</title>'));
    expect(
      webIndex,
      contains('apple-mobile-web-app-title" content="${AppStrings.appTitle}"'),
    );
    expect(iosLaunch, contains(AppStrings.splashSubtitle));
  });

  test('SET launcher artwork is wired for Android, iOS, and web', () {
    final adaptiveIcon = File(
      'android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml',
    ).readAsStringSync();
    final adaptiveRoundIcon = File(
      'android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml',
    ).readAsStringSync();

    expect(adaptiveIcon, contains('@drawable/ic_launcher_foreground'));
    expect(adaptiveRoundIcon, contains('@drawable/ic_launcher_foreground'));

    const expectedSizes = <String, Size>{
      'assets/brand/set_launcher_icon.png': Size(1254, 1254),
      'android/app/src/main/res/mipmap-mdpi/ic_launcher.png': Size(48, 48),
      'android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png': Size(192, 192),
      'android/app/src/main/res/drawable-nodpi/ic_launcher_foreground.png':
          Size(432, 432),
      'ios/Runner/Assets.xcassets/AppIcon.appiconset/'
          'Icon-App-1024x1024@1x.png': Size(
        1024,
        1024,
      ),
      'web/favicon.png': Size(32, 32),
      'web/icons/Icon-192.png': Size(192, 192),
      'web/icons/Icon-512.png': Size(512, 512),
      'web/icons/Icon-maskable-512.png': Size(512, 512),
    };

    for (final entry in expectedSizes.entries) {
      expect(_pngSize(entry.key), entry.value, reason: entry.key);
    }
  });
}

Size _pngSize(String path) {
  final bytes = File(path).readAsBytesSync();
  expect(bytes.length, greaterThan(24), reason: path);
  expect(bytes.sublist(1, 4), <int>[80, 78, 71], reason: path);
  return Size(
    _readUint32(bytes, 16).toDouble(),
    _readUint32(bytes, 20).toDouble(),
  );
}

int _readUint32(List<int> bytes, int offset) {
  return bytes[offset] << 24 |
      bytes[offset + 1] << 16 |
      bytes[offset + 2] << 8 |
      bytes[offset + 3];
}
