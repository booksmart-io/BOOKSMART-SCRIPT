class ResponseModel {
  final dynamic data;
  final int? statusCode;

  final bool isOk;
  final String errorMessage;

  bool get isError => !isOk;

  ResponseModel({
    required this.data,
    required this.statusCode,
    required this.isOk,
    required this.errorMessage,
  });

  factory ResponseModel.value(dynamic data, int? statusCode) {
    return ResponseModel(
      data: data,
      statusCode: statusCode,
      isOk: true,
      errorMessage: "",
    );
  }

  factory ResponseModel.error({
    String? error,
    dynamic data,
    required int? statusCode,
  }) {
    return ResponseModel(
      data: data,
      statusCode: statusCode,
      isOk: false,
      errorMessage: error ?? "Something went wrong",
    );
  }

  @override
  String toString() {
    if (isOk) {
      return "$statusCode -> ${data.runtimeType}";
    } else {
      return "$statusCode -> $errorMessage";
    }
  }
}
