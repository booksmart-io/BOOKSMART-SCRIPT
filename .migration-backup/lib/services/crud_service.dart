import 'dart:convert';
import 'dart:developer';

import 'package:booksmart/utils/supabase.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../widgets/loading.dart';

class SupabaseCrudService {
  /// ---------------------------
  /// CREATE (INSERT) - Add alias for create
  /// ---------------------------
  static Future<dynamic> create({
    required String table,
    required Map<String, dynamic> data,
    bool isShowLoading = false,
  }) async {
    if (isShowLoading) {
      showLoading();
    }
    try {
      final res = await supabase.from(table).insert(data).select().whenComplete(
        () {
          log("***/////***???---- Data inserted in $table");
        },
      );
      return res;
    } catch (e) {
      throw Exception("Insert failed: $e");
    } finally {
      if (isShowLoading) {
        dismissLoadingWidget();
      }
    }
  }

  /// ---------------------------
  /// CREATE (INSERT) - Keep original
  /// ---------------------------
  static Future<dynamic> insert({
    required String table,
    required Map<String, dynamic> data,
  }) async {
    try {
      final res = await supabase.from(table).insert(data).select().whenComplete(
        () {
          log("***/////***???---- Data inserted ");
        },
      );
      return res; // returns inserted row(s)
    } catch (e) {
      throw Exception("Insert failed: $e");
    }
  }

  /// ---------------------------
  /// READ (SELECT)
  /// ---------------------------
  static Future<dynamic> read({
    required String table,
    Map<String, dynamic>? filters,
    bool single = false,
  }) async {
    try {
      var query = supabase.from(table).select();

      filters?.forEach((key, value) {
        query = query.eq(key, value);
      });

      final result = single ? await query.maybeSingle() : await query;
      log("$table - ${filters?.toString() ?? ""}\n$result");
      return result;
    } catch (e, st) {
      log(e.toString());
      log(st.toString());
      return null;
    }
  }

  /// ---------------------------
  /// UPDATE - Fix to handle lists properly
  /// ---------------------------
  static Future<dynamic> update({
    required String table,
    required Map<String, dynamic> data,
    required Map<String, dynamic> filters,
    bool isShowLoading = false,
  }) async {
    if (isShowLoading) {
      showLoading();
    }
    try {
      var query = supabase.from(table).update(data);

      filters.forEach((key, value) {
        query = query.eq(key, value);
      });

      final res = await query.select();
      return res;
    } catch (e) {
      throw Exception("Update failed: $e");
    } finally {
      if (isShowLoading) {
        dismissLoadingWidget();
      }
    }
  }

  /// ---------------------------
  /// DELETE
  /// ---------------------------
  static Future<dynamic> delete({
    required String table,
    required Map<String, dynamic> filters,
    bool isShowLoading = false,
  }) async {
    if (isShowLoading) {
      showLoading();
    }
    try {
      var query = supabase.from(table).delete();

      filters.forEach((key, value) {
        query = query.eq(key, value);
      });

      final res = await query;
      return res;
    } catch (e) {
      throw Exception("Delete failed: $e");
    } finally {
      if (isShowLoading) {
        dismissLoadingWidget();
      }
    }
  }

  static Future<dynamic> executeQuery({
    required PostgrestFilterBuilder query,
    bool single = false,
    bool isShowLoading = false,
  }) async {
    if (isShowLoading) {
      showLoading();
    }
    try {
      final result = single ? await query.maybeSingle() : await query;

      log("Query Result:\n${jsonEncode(result)}");
      return result;
    } catch (e, st) {
      log(e.toString());
      log(st.toString());
      return null;
    } finally {
      if (isShowLoading) {
        dismissLoadingWidget();
      }
    }
  }
}
