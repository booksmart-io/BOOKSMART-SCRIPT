import 'package:booksmart/constant/exports.dart';
import 'package:flutter/foundation.dart';

//
// Keep it empty for now
//
class AdminDashboardScreen extends StatelessWidget {
  const AdminDashboardScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: kIsWeb ? null : AppBar(title: const Text("Dashboard")),
      body: Center(child: AppText("Admin dashbord")),
    );
  }
}
