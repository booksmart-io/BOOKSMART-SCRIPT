import 'dart:typed_data';
import 'package:booksmart/helpers/name_initial_helper.dart';
import 'package:flutter/material.dart';
import 'package:cached_network_image/cached_network_image.dart';

class CustomCircleAvatar extends StatelessWidget {
  final String? imgUrl;
  final Uint8List? memoryImageBytes;
  final String? alternateText;
  final double radius;
  final VoidCallback? onTap;
  final Color? backgroundColor;
  final Color textColor;
  final double? fontSize;

  const CustomCircleAvatar({
    super.key,
    this.imgUrl,
    this.memoryImageBytes,
    this.alternateText,
    this.radius = 50,
    this.onTap,
    this.backgroundColor,
    this.textColor = Colors.white,
    this.fontSize,
  });

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;

    Widget avatar;

    /// Priority 1 → Local preview image
    if (memoryImageBytes != null) {
      avatar = CircleAvatar(
        radius: radius,
        backgroundImage: MemoryImage(memoryImageBytes!),
      );
    }
    /// Priority 2 → Cached network image
    else if (imgUrl != null && imgUrl!.isNotEmpty) {
      avatar = CircleAvatar(
        radius: radius,
        backgroundColor: backgroundColor,
        child: ClipOval(
          child: CachedNetworkImage(
            imageUrl: imgUrl!,
            width: radius * 2,
            height: radius * 2,
            fit: BoxFit.fill,
            placeholder: (context, url) => Center(
              child: SizedBox(
                width: radius * 0.4,
                height: radius * 0.4,
                child: const CircularProgressIndicator(strokeWidth: 2),
              ),
            ),
            errorWidget: (context, url, error) =>
                _buildAlternateAvatar(context, colorScheme),
          ),
        ),
      );
    }
    /// Priority 3 → Alternate initials avatar
    else {
      avatar = _buildAlternateAvatar(context, colorScheme);
    }

    return GestureDetector(onTap: onTap, child: avatar);
  }

  Widget _buildAlternateAvatar(BuildContext context, ColorScheme colorScheme) {
    return CircleAvatar(
      radius: radius,
      backgroundColor: backgroundColor ?? colorScheme.primary,
      child: Text(
        getNameInitials(alternateText!, alternateText!),
        style: TextStyle(
          color: textColor,
          fontSize: fontSize ?? radius * 0.5,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}
