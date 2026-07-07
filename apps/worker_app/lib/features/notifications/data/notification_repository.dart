import 'package:dio/dio.dart';

import '../../../core/network/api_client.dart';
import 'models/notification_item.dart';

class NotificationRepository {
  NotificationRepository({required ApiClient apiClient}) : _dio = apiClient.dio;

  final Dio _dio;

  Future<NotificationPage> listNotifications({bool unreadOnly = false}) async {
    try {
      final response = await _dio.get<Map<String, dynamic>>(
        '/notifications',
        queryParameters: {'limit': 50, if (unreadOnly) 'unread_only': true},
      );
      return NotificationPage.fromJson(response.data ?? const {});
    } catch (error) {
      throw mapDioException(error);
    }
  }

  Future<NotificationItem> markRead(String id) async {
    try {
      final response = await _dio.patch<Map<String, dynamic>>(
        '/notifications/$id/read',
      );
      return NotificationItem.fromJson(response.data ?? const {});
    } catch (error) {
      throw mapDioException(error);
    }
  }

  Future<int> markAllRead() async {
    try {
      final response = await _dio.patch<Map<String, dynamic>>(
        '/notifications/read-all',
      );
      final updated = response.data?['updated'];
      return updated is int ? updated : 0;
    } catch (error) {
      throw mapDioException(error);
    }
  }
}
