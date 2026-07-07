import 'package:dio/dio.dart';

import '../../../core/network/api_client.dart';
import 'models/rating.dart';

class RatingRepository {
  RatingRepository({required ApiClient apiClient}) : _dio = apiClient.dio;

  final Dio _dio;

  Future<RatingPage> listMyRatings() async {
    try {
      final response = await _dio.get<Map<String, dynamic>>('/ratings/me');
      return RatingPage.fromJson(response.data ?? const {});
    } catch (error) {
      throw mapDioException(error);
    }
  }
}
