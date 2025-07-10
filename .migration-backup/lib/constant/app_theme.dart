import 'package:booksmart/constant/exports.dart';

class AppTheme {
  // 🌤️ LIGHT THEME
  static ThemeData lightTheme() {
    return ThemeData(
      brightness: Brightness.light,
      fontFamily: 'centurygothic',
      scaffoldBackgroundColor: Colors.white,
      primaryColor: AppColorsLight.primary,
      colorScheme: const ColorScheme.light(
        surface: AppColorsLight.surface,
        primary: AppColorsLight.primary,
        secondary: AppColorsLight.secondary,
        onPrimary: Colors.white,
        onSecondary: Colors.black,
      ),

      textTheme: TextTheme(
        displayLarge: TextStyle(
          fontSize: 24,
          fontFamily: 'centurygothic',
          fontWeight: FontWeight.bold,
          color: AppColorsLight.textPrimary,
        ),
        displayMedium: TextStyle(
          fontSize: 22,
          fontFamily: 'centurygothic',
          fontWeight: FontWeight.bold,
          color: AppColorsLight.textPrimary,
        ),
        displaySmall: TextStyle(
          fontSize: 20,
          fontFamily: 'centurygothic',
          fontWeight: FontWeight.bold,
          color: AppColorsLight.textPrimary,
        ),
        bodyLarge: TextStyle(
          fontSize: 16,
          color: AppColorsLight.textPrimary,
          fontFamily: "centurygothic",
        ),
        bodyMedium: TextStyle(
          fontSize: 14,
          color: AppColorsLight.textPrimary,
          fontFamily: "centurygothic",
        ),
        bodySmall: TextStyle(
          fontSize: 12,
          color: AppColorsLight.textSecondary,
          fontFamily: "centurygothic",
        ),
      ),

      // Buttons
      buttonTheme: const ButtonThemeData(
        buttonColor: AppColorsLight.secondary,
        textTheme: ButtonTextTheme.primary,
      ),

      // Inputs
      // 🌤️ LIGHT THEME
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: Colors.white, // Light background for fields
        hintStyle: const TextStyle(
          color: AppColorsLight.textSecondary,
          fontSize: 14,
        ),
        labelStyle: const TextStyle(
          color: AppColorsLight.textSecondary,
          fontSize: 14,
        ),
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 12,
          vertical: 10,
        ),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8.0),
          borderSide: const BorderSide(color: AppColorsLight.divider, width: 1),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8.0),
          borderSide: const BorderSide(color: AppColorsLight.divider, width: 1),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8.0),
          borderSide: const BorderSide(
            color: AppColorsLight.primary, // match theme color
            width: 1.3,
          ),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8.0),
          borderSide: const BorderSide(color: Colors.redAccent, width: 1),
        ),
        focusedErrorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8.0),
          borderSide: const BorderSide(color: Colors.redAccent, width: 1.2),
        ),
      ),

      appBarTheme: const AppBarTheme(
        backgroundColor: Colors.white,
        elevation: 0,
        centerTitle: false,
        titleTextStyle: TextStyle(
          color: AppColorsLight.textPrimary,
          fontSize: 20,
          fontWeight: FontWeight.bold,
        ),
        iconTheme: IconThemeData(color: AppColorsLight.textPrimary),
      ),

      // Dialog
      dialogTheme: const DialogThemeData(
        backgroundColor: AppColorsLight.surface,
        titleTextStyle: TextStyle(
          color: AppColorsLight.textPrimary,
          fontSize: 18,
          fontWeight: FontWeight.bold,
        ),
        contentTextStyle: TextStyle(
          color: AppColorsLight.textSecondary,
          fontSize: 16,
        ),
      ),

      // Bottom Sheet
      bottomSheetTheme: const BottomSheetThemeData(
        backgroundColor: AppColorsLight.surface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
        ),
      ),

      // Cards
      cardTheme: const CardThemeData(
        color: Colors.white70,
        elevation: 2,
        margin: EdgeInsets.all(8),
      ),

      // FAB
      floatingActionButtonTheme: const FloatingActionButtonThemeData(
        backgroundColor: AppColorsLight.secondary,
        foregroundColor: Colors.white,
      ),

      // Elevated Buttons
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColorsLight.secondary,
          foregroundColor: Colors.black,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(8.0),
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(8.0),
          ),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(8.0),
          ),
        ),
      ),
      listTileTheme: const ListTileThemeData(
        // tileColor: Color.fromARGB(66, 187, 187, 187),
        textColor: Colors.black,
        iconColor: Colors.black,
        selectedColor: AppColorsDark.primary,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.all(Radius.circular(8.0)),
        ),
        contentPadding: EdgeInsets.symmetric(horizontal: 12),
      ),

      dividerColor: AppColorsLight.divider,
      splashColor: AppColorsLight.secondary.withValues(alpha: 0.2),
      highlightColor: AppColorsLight.secondary.withValues(alpha: 0.1),
      hoverColor: AppColorsLight.secondary.withValues(alpha: 0.04),
    );
  }

  static ThemeData darkTheme() {
    return ThemeData.dark().copyWith(
      brightness: Brightness.dark,
      scaffoldBackgroundColor: AppColorsDark.background,
      primaryColor: AppColorsDark.primary,
      colorScheme: const ColorScheme.dark(
        surface: AppColorsDark.surface,
        primary: AppColorsDark.primary,
        secondary: AppColorsDark.secondary,
        onPrimary: Colors.white,
        onSecondary: Colors.black,
      ),

      textTheme: TextTheme(
        displayLarge: TextStyle(
          fontSize: 24,
          fontFamily: 'centurygothic',
          fontWeight: FontWeight.bold,
          color: AppColorsDark.textPrimary,
        ),
        displayMedium: TextStyle(
          fontSize: 22,
          fontFamily: 'centurygothic',
          fontWeight: FontWeight.bold,
          color: AppColorsDark.textPrimary,
        ),
        displaySmall: TextStyle(
          fontSize: 20,
          fontFamily: 'centurygothic',
          fontWeight: FontWeight.bold,
          color: AppColorsDark.textPrimary,
        ),
        bodyLarge: TextStyle(
          fontSize: 16,
          color: AppColorsDark.textPrimary,
          fontFamily: "centurygothic",
        ),
        bodyMedium: TextStyle(
          fontSize: 14,
          color: AppColorsDark.textPrimary,
          fontFamily: "centurygothic",
        ),
        bodySmall: TextStyle(
          fontSize: 12,
          color: AppColorsDark.textSecondary,
          fontFamily: "centurygothic",
        ),
      ),

      buttonTheme: const ButtonThemeData(
        buttonColor: AppColorsDark.secondary,
        textTheme: ButtonTextTheme.primary,
      ),
      listTileTheme: const ListTileThemeData(
        // tileColor: AppColorsDark.surface, // background for list tiles
        textColor: Color(0xFFE8F0FE),
        iconColor: Color(0xFFE8F0FE),
        selectedColor: AppColorsLight.primary,
        selectedTileColor: Color(0xFFE8F0FE), // subtle primary tint

        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.all(Radius.circular(8.0)),
        ),
        contentPadding: EdgeInsets.symmetric(horizontal: 12),
      ),
      // 🌙 DARK THEME
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: AppColorsDark.surface, // Match your dark surface tone
        hintStyle: const TextStyle(
          color: AppColorsDark.textSecondary,
          fontSize: 14,
        ),
        labelStyle: const TextStyle(
          color: AppColorsDark.textSecondary,
          fontSize: 14,
        ),
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 12,
          vertical: 10,
        ),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8.0),
          borderSide: const BorderSide(color: AppColorsDark.divider, width: 1),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8.0),
          borderSide: const BorderSide(color: AppColorsDark.divider, width: 1),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8.0),
          borderSide: const BorderSide(
            color: AppColorsDark.primary, // match theme color
            width: 1.3,
          ),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8.0),
          borderSide: const BorderSide(color: Colors.redAccent, width: 1),
        ),
        focusedErrorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8.0),
          borderSide: const BorderSide(color: Colors.redAccent, width: 1.2),
        ),
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: AppColorsDark.background,
        elevation: 0,
        titleTextStyle: TextStyle(
          color: AppColorsDark.textPrimary,
          fontSize: 20,
          fontWeight: FontWeight.bold,
        ),
        centerTitle: false,
        iconTheme: IconThemeData(color: Colors.white),
      ),

      dialogTheme: const DialogThemeData(
        backgroundColor: AppColorsDark.surface,
        titleTextStyle: TextStyle(
          color: AppColorsDark.textPrimary,
          fontSize: 18,
          fontWeight: FontWeight.bold,
        ),
        contentTextStyle: TextStyle(
          color: AppColorsDark.textSecondary,
          fontSize: 16,
        ),
      ),

      bottomSheetTheme: const BottomSheetThemeData(
        backgroundColor: AppColorsDark.surface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
        ),
      ),

      cardTheme: const CardThemeData(
        color: AppColorsDark.surface,
        elevation: 2,
        margin: EdgeInsets.all(8),
      ),

      floatingActionButtonTheme: const FloatingActionButtonThemeData(
        backgroundColor: AppColorsDark.secondary,
        foregroundColor: Colors.white,
      ),

      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColorsDark.secondary,
          foregroundColor: Colors.black,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(8.0),
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(8.0),
          ),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(8.0),
          ),
        ),
      ),

      dividerColor: AppColorsDark.divider,
      splashColor: AppColorsDark.secondary.withValues(alpha: 0.2),
      highlightColor: AppColorsDark.secondary.withValues(alpha: 0.1),
      hoverColor: AppColorsDark.secondary.withValues(alpha: 0.04),
    );
  }
}
