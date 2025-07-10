import 'package:flutter/material.dart';
import 'package:booksmart/widgets/app_text.dart';

class DateRangePickerWidget extends StatefulWidget {
  final Function(DateTime, DateTime) onDateRangeSelected;
  final String initialText;
  final DateTime? initialStartDate;
  final DateTime? initialEndDate;
  final EdgeInsetsGeometry padding;

  const DateRangePickerWidget({
    super.key,
    required this.onDateRangeSelected,
    this.initialText = "Select Date Range",
    this.initialStartDate,
    this.initialEndDate,
    this.padding = const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
  });

  @override
  State<DateRangePickerWidget> createState() => _DateRangePickerWidgetState();
}

class _DateRangePickerWidgetState extends State<DateRangePickerWidget> {
  DateTime? _startDate;
  DateTime? _endDate;
  String displayText = "Select Date Range";

  @override
  void initState() {
    super.initState();
    _startDate = widget.initialStartDate;
    _endDate = widget.initialEndDate;
    if (_startDate != null && _endDate != null) {
      _updateDisplayText();
    } else {
      displayText = widget.initialText;
    }
  }

  Future<void> _pickDateRange() async {
    final now = DateTime.now();
    final DateTimeRange? pickedRange = await showDateRangePicker(
      context: context,
      firstDate: DateTime(now.year - 2),
      lastDate: DateTime(now.year + 2),
      initialDateRange: _startDate != null && _endDate != null
          ? DateTimeRange(start: _startDate!, end: _endDate!)
          : null,
      builder: (context, child) {
        return Center(
          child: Container(
            margin: EdgeInsets.all(20),
            width: 400,
            decoration: BoxDecoration(
              border: Border.all(color: Colors.grey.shade300, width: 1),
              borderRadius: BorderRadius.circular(16),
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(16),
              child: child,
            ),
          ),
        );
      },
    );

    if (pickedRange != null) {
      setState(() {
        _startDate = pickedRange.start;
        _endDate = pickedRange.end;
        _updateDisplayText();
      });
      widget.onDateRangeSelected(pickedRange.start, pickedRange.end);
    }
  }

  void _updateDisplayText() {
    if (_startDate != null && _endDate != null) {
      final start = "${_startDate!.day} ${_getMonthName(_startDate!.month)}";
      final end =
          "${_endDate!.day} ${_getMonthName(_endDate!.month)} ${_endDate!.year}";
      displayText = "$start - $end";
    }
  }

  String _getMonthName(int month) {
    const months = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    return months[month - 1];
  }

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;

    return ElevatedButton(
      style: ElevatedButton.styleFrom(
        backgroundColor: colorScheme.primary,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(10),
          side: BorderSide(color: colorScheme.secondary),
        ),
        padding: widget.padding,
        elevation: 0,
      ),
      onPressed: _pickDateRange,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Icon(Icons.date_range, size: 20),
          // const SizedBox(width: 8),
          AppText(
            displayText,
            color: Colors.black,
            fontSize: 14,
            fontWeight: FontWeight.bold,
          ),
        ],
      ),
    );
  }
}
