import 'package:flutter/services.dart';

List<TextInputFormatter> acceptOnlyInteger() {
  return [FilteringTextInputFormatter.digitsOnly];
}

List<TextInputFormatter> acceptDecimalValues() {
  return [FilteringTextInputFormatter.allow(RegExp(r"[0-9.]"))];
}

List<TextInputFormatter> acceptAlphaNumeric() {
  return [FilteringTextInputFormatter.allow(RegExp(r"[a-zA-Z0-9]"))];
}

List<TextInputFormatter> acceptCapitalAlphaNumeric() {
  return [FilteringTextInputFormatter.allow(RegExp(r"[A-Z0-9]"))];
}

List<TextInputFormatter> acceptAlphaNumericWithSpace() {
  return [FilteringTextInputFormatter.allow(RegExp(r"[a-zA-Z0-9 ]"))];
}

List<TextInputFormatter> acceptAlphaNumericWithHyphen() {
  return [FilteringTextInputFormatter.allow(RegExp(r"[a-zA-Z0-9-]"))];
}

List<TextInputFormatter> acceptAlphaWithSpace() {
  return [FilteringTextInputFormatter.allow(RegExp(r"[a-zA-Z ]"))];
}

List<TextInputFormatter> acceptPhoneNumberCharacters() {
  return [FilteringTextInputFormatter.allow(RegExp(r"[0-9+]"))];
}
