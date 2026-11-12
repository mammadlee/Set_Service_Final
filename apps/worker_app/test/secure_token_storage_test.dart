import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:worker_app/core/storage/secure_token_storage.dart';
import 'package:worker_app/core/storage/token_storage.dart';

void main() {
  group('secure token pair codec', () {
    test('stores access and refresh tokens in one versioned value', () {
      const pair = StoredTokens(
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      );

      final encoded = encodeStoredTokenPair(pair);
      final payload = jsonDecode(encoded) as Map<String, dynamic>;
      final decoded = decodeStoredTokenPair(encoded);

      expect(payload['version'], 1);
      expect(decoded?.accessToken, pair.accessToken);
      expect(decoded?.refreshToken, pair.refreshToken);
    });

    test('rejects partial, malformed, and unknown-version values', () {
      expect(decodeStoredTokenPair(null), isNull);
      expect(decodeStoredTokenPair('{invalid'), isNull);
      expect(
        decodeStoredTokenPair(
          jsonEncode({'version': 1, 'access_token': 'access-token'}),
        ),
        isNull,
      );
      expect(
        decodeStoredTokenPair(
          jsonEncode({
            'version': 2,
            'access_token': 'access-token',
            'refresh_token': 'refresh-token',
          }),
        ),
        isNull,
      );
    });

    test('save commits the canonical pair before updating memory', () {
      final source = File(
        'lib/core/storage/secure_token_storage.dart',
      ).readAsStringSync();
      final saveMethod = source.substring(
        source.indexOf('Future<void> saveTokens'),
        source.indexOf('Future<void> clear'),
      );

      expect(RegExp(r'_storage\.write\(').allMatches(saveMethod), hasLength(1));
      expect(saveMethod, contains('key: _tokenPairKey'));
      expect(saveMethod, isNot(contains('key: _accessTokenKey')));
      expect(saveMethod, isNot(contains('key: _refreshTokenKey')));
      expect(
        saveMethod.indexOf('await _storage.write'),
        lessThan(saveMethod.indexOf('_cache(pair)')),
      );
    });
  });
}
