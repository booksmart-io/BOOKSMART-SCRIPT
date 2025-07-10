import 'package:booksmart/constant/exports.dart';
import 'package:dropdown_search/dropdown_search.dart';

class CustomDropDownWidget<T> extends StatefulWidget {
  const CustomDropDownWidget({
    super.key,
    required this.dropDownKey,
    required this.items,
    this.label,
    this.hint,
    this.selectedItem,
    this.itemAsString,
    this.showSearchBox = false,
    this.onChanged,
  });

  final GlobalKey<DropdownSearchState<T>> dropDownKey;
  final String? label;
  final String? hint;
  final T? selectedItem;
  final List<T> items;
  final String Function(T)? itemAsString;
  final bool showSearchBox;
  final ValueChanged<T?>? onChanged;

  @override
  State<CustomDropDownWidget<T>> createState() =>
      _CustomDropDownWidgetState<T>();
}

class _CustomDropDownWidgetState<T> extends State<CustomDropDownWidget<T>> {
  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = theme.colorScheme;

    return DropdownSearch<T>(
      key: widget.dropDownKey,
      selectedItem: widget.selectedItem,
      itemAsString: widget.itemAsString,
      items: (filter, infiniteScrollProps) => widget.items,
      onChanged: widget.onChanged,

      /// ✅ FIX (REQUIRED FOR ENUM / OBJECT)
      compareFn: (item, selectedItem) => item == selectedItem,

      /// ✅ INPUT FIELD STYLE
      decoratorProps: DropDownDecoratorProps(
        decoration: InputDecoration(
          filled: true,
          fillColor: colors.surface,
          isDense: true,
          label: widget.label == null
              ? null
              : FittedText(
                  widget.label ?? "-",
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: colors.onSurfaceVariant,
                  ),
                ),

          hint: widget.hint == null
              ? null
              : FittedText(
                  widget.hint ?? "-",
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: colors.onSurfaceVariant,
                  ),
                ),

          border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
          contentPadding: const EdgeInsets.symmetric(
            horizontal: 8,
            vertical: 12,
          ),
        ),
      ),

      dropdownBuilder: (context, selectedItem) {
        if (selectedItem == null) {
          return SizedBox();
        }
        return FittedText(
          widget.itemAsString?.call(selectedItem) ?? selectedItem.toString(),
          style: theme.textTheme.bodyMedium?.copyWith(
            color: colors.onSurfaceVariant,
          ),
        );
      },

      /// ✅ POPUP STYLE (Dark/Light Fix)
      popupProps: PopupProps.menu(
        showSearchBox: widget.showSearchBox,
        menuProps: MenuProps(
          backgroundColor: colors.surface,
          elevation: 8,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
          clipBehavior: Clip.hardEdge,
        ),
        constraints: BoxConstraints(
          maxHeight: widget.items.length < 5 ? widget.items.length * 45 : 230,
        ),
        showSelectedItems: true,

        /// ✅ Search box styling
        searchFieldProps: TextFieldProps(
          decoration: InputDecoration(
            filled: true,
            fillColor: colors.surfaceContainerHighest,
            hintText: "Search...",
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
            contentPadding: const EdgeInsets.symmetric(
              horizontal: 12,
              vertical: 10,
            ),
          ),
        ),

        /// ✅ FIXED itemBuilder signature
        itemBuilder: (context, item, isDisabled, isSelected) {
          final text = widget.itemAsString?.call(item) ?? item.toString();
          // Determine divider color based on theme brightness
          final bool isDarkMode = theme.brightness == Brightness.dark;
          final Color dividerColor = isDarkMode
              ? Colors.white.withValues(
                  alpha: 0.1,
                ) // Subtle white for dark mode
              : Colors.grey.shade300;
          final isLast = widget.items.last == item;
          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Material(
                color: isSelected
                    ? colors.primary.withValues(alpha: 0.08)
                    : colors.surface,
                child: Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 12,
                  ),
                  child: FittedText(text),
                ),
              ),
              if (!isLast)
                Divider(height: 1, thickness: 1, color: dividerColor),
            ],
          );
        },
      ),
    );
  }
}
