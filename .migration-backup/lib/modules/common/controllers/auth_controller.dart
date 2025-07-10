import 'package:get/get.dart';

import '../../../models/user_base_model.dart';
import '../providers/user_profile_provider.dart';

PersonModel? get authPerson {
  try {
    return Get.find<AuthController>().rxPersonModel.value;
  } catch (_) {
    return null;
  }
}

UserModel? get authUser {
  try {
    return Get.find<AuthController>().user;
  } catch (_) {
    return null;
  }
}

CpaModel? get authCpa {
  try {
    return Get.find<AuthController>().cpa;
  } catch (_) {
    return null;
  }
}

AdminModel? get authAdmin {
  try {
    return Get.find<AuthController>().admin;
  } catch (_) {
    return null;
  }
}

AuthController get authController => Get.find<AuthController>();

class AuthController extends GetxController {
  /// either UserModel/CpaModel/AdminModel
  Rx<dynamic> rxUser = Rx<dynamic>(null);

  Rx<PersonModel?> rxPersonModel = Rx<PersonModel?>(null);
  PersonModel? get person => rxPersonModel.value;

  UserModel get user => rxUser.value as UserModel;
  CpaModel get cpa => rxUser.value as CpaModel;
  AdminModel get admin => rxUser.value as AdminModel;

  AuthController({required Map<String, dynamic> userJson}) {
    _initilizeUser(userJson, shouldUpdate: false);
  }

  void _initilizeUser(
    Map<String, dynamic> userJson, {
    bool shouldUpdate = true,
  }) {
    rxPersonModel.value = PersonModel.fromJson(userJson);

    if (person?.role == UserRole.user) {
      rxUser.value = UserModel.fromJson(userJson);
    } else if (person?.role == UserRole.cpa) {
      rxUser.value = CpaModel.fromJson(userJson);
    } else if (person?.role == UserRole.admin) {
      rxUser.value = AdminModel.fromJson(userJson);
    }
    if (shouldUpdate) {
      update();
    }
  }

  Future<bool> refereshUser() async {
    return getUserProfile().then((json) {
      if (json == null) {
        return false;
      } else {
        _initilizeUser(json);
        return true;
      }
    });
  }
}
