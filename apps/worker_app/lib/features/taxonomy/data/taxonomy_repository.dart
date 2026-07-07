import 'package:dio/dio.dart';

import '../../../core/network/api_client.dart';

class TaxonomyRepository {
  TaxonomyRepository({required ApiClient apiClient}) : _dio = apiClient.dio;

  final Dio _dio;

  Future<List<TaxonomyDepartment>> list() async {
    try {
      final response = await _dio.get<Map<String, dynamic>>('/taxonomy');
      final data = response.data?['data'];
      if (data is! List) return const [];
      return data
          .whereType<Map<String, dynamic>>()
          .map(TaxonomyDepartment.fromJson)
          .toList(growable: false);
    } catch (error) {
      throw mapDioException(error);
    }
  }
}

class TaxonomyDepartment {
  const TaxonomyDepartment({
    required this.id,
    required this.nameAz,
    required this.subdepartments,
  });

  final String id;
  final String nameAz;
  final List<TaxonomySubdepartment> subdepartments;

  factory TaxonomyDepartment.fromJson(Map<String, dynamic> json) {
    return TaxonomyDepartment(
      id: json['id'] as String? ?? '',
      nameAz: json['name_az'] as String? ?? '',
      subdepartments: _list(
        json['subdepartments'],
        TaxonomySubdepartment.fromJson,
      ),
    );
  }
}

class TaxonomySubdepartment {
  const TaxonomySubdepartment({
    required this.id,
    required this.departmentId,
    required this.nameAz,
    required this.positions,
  });

  final String id;
  final String departmentId;
  final String nameAz;
  final List<TaxonomyPosition> positions;

  factory TaxonomySubdepartment.fromJson(Map<String, dynamic> json) {
    return TaxonomySubdepartment(
      id: json['id'] as String? ?? '',
      departmentId: json['department_id'] as String? ?? '',
      nameAz: json['name_az'] as String? ?? '',
      positions: _list(json['positions'], TaxonomyPosition.fromJson),
    );
  }
}

class TaxonomyPosition {
  const TaxonomyPosition({
    required this.id,
    required this.subdepartmentId,
    required this.nameAz,
  });

  final String id;
  final String subdepartmentId;
  final String nameAz;

  factory TaxonomyPosition.fromJson(Map<String, dynamic> json) {
    return TaxonomyPosition(
      id: json['id'] as String? ?? '',
      subdepartmentId: json['subdepartment_id'] as String? ?? '',
      nameAz: json['name_az'] as String? ?? '',
    );
  }
}

List<T> _list<T>(Object? value, T Function(Map<String, dynamic>) parser) {
  if (value is! List) return const [];
  return value
      .whereType<Map<String, dynamic>>()
      .map(parser)
      .toList(growable: false);
}
