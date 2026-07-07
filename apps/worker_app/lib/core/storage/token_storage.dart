class StoredTokens {
  const StoredTokens({required this.accessToken, required this.refreshToken});

  final String accessToken;
  final String refreshToken;
}

abstract class TokenStorage {
  bool get isLoaded;

  String? get cachedAccessToken;

  String? get cachedRefreshToken;

  Future<void> warmUp();

  Future<StoredTokens?> readTokens();

  Future<String?> readAccessToken();

  Future<String?> readRefreshToken();

  Future<void> saveTokens({
    required String accessToken,
    required String refreshToken,
  });

  Future<void> clear();
}
