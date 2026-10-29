import 'package:flutter_test/flutter_test.dart';
import 'package:worker_app/shared/app_strings.dart';
import 'package:worker_app/shared/auth_input_validators.dart';

void main() {
  group('phone validation', () {
    test('matches backend normalization and E.164 policy', () {
      expect(
        AuthInputValidators.normalizePhone('+994 (50) 123-45-67'),
        '+994501234567',
      );
      expect(AuthInputValidators.phone('+994 (50) 123-45-67'), isNull);
      expect(
        AuthInputValidators.phone('0501234567'),
        AppStrings.phoneValidation,
      );
    });
  });

  group('email validation', () {
    test('accepts a normal address and enforces the backend length limit', () {
      expect(AuthInputValidators.email(' user@example.az '), isNull);
      expect(
        AuthInputValidators.email('${'a' * 245}@example.az'),
        AppStrings.emailValidation,
      );
    });
  });

  group('password validation', () {
    test('login accepts every non-empty backend-compatible password', () {
      expect(AuthInputValidators.loginPassword('x'), isNull);
      expect(
        AuthInputValidators.loginPassword(''),
        AppStrings.passwordRequired,
      );
      expect(
        AuthInputValidators.loginPassword('x' * 129),
        AppStrings.passwordTooLong,
      );
    });

    test('new passwords enforce the creation policy', () {
      expect(AuthInputValidators.newPassword('Secure123'), isNull);
      expect(
        AuthInputValidators.newPassword('onlyletters'),
        AppStrings.passwordValidation,
      );
      expect(
        AuthInputValidators.newPassword('12345678'),
        AppStrings.passwordValidation,
      );
      expect(
        AuthInputValidators.newPassword('A1${'x' * 127}'),
        AppStrings.passwordValidation,
      );
      expect(
        AuthInputValidators.newPassword('Admin123!'),
        AppStrings.passwordDisallowed,
      );
    });
  });
}
