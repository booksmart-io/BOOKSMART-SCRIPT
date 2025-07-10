import 'dart:developer';

/// Not Valid for List
T? handleResponseFromJson<T>(Map<String, dynamic> json, String key) {
  try {
    if (json.containsKey(key)) {
      return json[key] as T?;
    }
    return null;
  } catch (e) {
    log("handleResponseFromJson <$T> ::: $key ::: ${json[key] ?? '---'}");
    return null;
  }
}

DateTime dateFromJson(Map<String, dynamic> json, String key) {
  final value = handleResponseFromJson<String>(json, key);
  if (value == null || value.isEmpty) return DateTime.now();
  return DateTime.tryParse(value) ?? DateTime.now();
}
