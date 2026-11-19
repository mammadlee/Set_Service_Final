import 'package:flutter_secure_storage/flutter_secure_storage.dart';

abstract final class SecureStorageConfig {
  static const androidEncryptedSharedPreferences = true;
  static const appleAccessibility =
      KeychainAccessibility.first_unlock_this_device;

  static const androidOptions = AndroidOptions(
    encryptedSharedPreferences: androidEncryptedSharedPreferences,
  );
  static const iosOptions = IOSOptions(accessibility: appleAccessibility);

  static const storage = FlutterSecureStorage(
    aOptions: androidOptions,
    iOptions: iosOptions,
  );
}
