import 'package:flutter_test/flutter_test.dart';
import 'package:worker_app/core/config/app_config.dart';

void main() {
  test('default API base URL includes v1 prefix', () {
    expect(AppConfig.apiBaseUrl, 'http://localhost:3000/v1');
  });
}
