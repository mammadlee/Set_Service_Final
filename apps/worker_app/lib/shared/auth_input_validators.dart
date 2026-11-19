import 'app_strings.dart';

class AuthInputValidators {
  const AuthInputValidators._();

  static final _phoneSeparators = RegExp(r'[\s().-]');
  static final _phonePattern = RegExp(r'^\+[1-9]\d{7,14}$');
  static final _emailPattern = RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$');
  static final _letterPattern = RegExp(r'[A-Za-z]');
  static final _digitPattern = RegExp(r'\d');
  static const _disallowedPasswords = {'admin123!', 'password123!', 'test123!'};

  static String normalizePhone(String value) {
    return value.trim().replaceAll(_phoneSeparators, '');
  }

  static String? phone(String? value) {
    if (!_phonePattern.hasMatch(normalizePhone(value ?? ''))) {
      return AppStrings.phoneValidation;
    }
    return null;
  }

  static bool isValidPhone(String value) => phone(value) == null;

  static String? email(String? value) {
    final normalized = value?.trim() ?? '';
    if (normalized.length > 254 || !_emailPattern.hasMatch(normalized)) {
      return AppStrings.emailValidation;
    }
    return null;
  }

  static bool isValidEmail(String value) => email(value) == null;

  static String? loginPassword(String? value) {
    final password = value ?? '';
    if (password.isEmpty) return AppStrings.passwordRequired;
    if (password.length > 128) return AppStrings.passwordTooLong;
    return null;
  }

  static String? newPassword(String? value) {
    final password = value ?? '';
    if (password.length < 8 ||
        password.length > 128 ||
        !_letterPattern.hasMatch(password) ||
        !_digitPattern.hasMatch(password)) {
      return AppStrings.passwordValidation;
    }
    if (_disallowedPasswords.contains(password.toLowerCase())) {
      return AppStrings.passwordDisallowed;
    }
    return null;
  }
}
