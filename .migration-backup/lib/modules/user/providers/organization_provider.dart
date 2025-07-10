import 'package:booksmart/modules/common/controllers/auth_controller.dart';
import 'package:booksmart/models/organization_model.dart';

import '../../../services/crud_service.dart';
import '../../../supabase/tables.dart';

Future<List<OrganizationModel>> getOrganizations({int? userId}) async {
  final int? id = userId ?? authPerson?.id;
  if (id == null) {
    return [];
  }

  return SupabaseCrudService.read(
    table: SupabaseTable.organization,
    filters: {'owner_id': id},
  ).then((res) {
    return (res as List).map((e) => OrganizationModel.fromJson(e)).toList();
  });
}
