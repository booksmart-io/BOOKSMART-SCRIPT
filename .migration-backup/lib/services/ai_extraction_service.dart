import 'dart:convert';
import 'dart:developer' as dev;
import 'package:booksmart/models/financial_template_models.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:dio/dio.dart' as dio_client;
import 'package:image_picker/image_picker.dart';
import 'package:syncfusion_flutter_pdf/pdf.dart' as pdf_gen;

class AIExtractionService {
  static String get _apiKey => dotenv.env['OPENAI_API_KEY'] ?? '';
  static final dio_client.Dio _dio = dio_client.Dio();

  // Use gpt-4o - gpt-5-nano may not be available or causing hangs
  static const String _model = 'gpt-4o';

  static const String _systemPrompt = '''
You are a financial document parser. Your job is to extract specific financial 
figures from documents such as profit & loss statements, balance sheets, and 
cash flow statements.

Rules:
- Extract only numeric totals/subtotals, not line-item details
- If a value is negative (e.g. net loss, cash outflow), return it as a negative number
- If a field cannot be found, return 0
- Never return null for numeric fields — always return a number
- Return ONLY a raw JSON object. No markdown, no explanation, no backticks
- All values must be plain numbers (no currency symbols, commas, or units)
''';

  static Future<dynamic> extractFinancialData(XFile file, String type) async {
    final normalizedType = _normalizeFinancialType(type);
    dev.log('🚀 [AIExtractionService] Starting extraction for type: $normalizedType');
    if (_apiKey.isEmpty) {
      dev.log('❌ [AIExtractionService] Error: OPENAI_API_KEY is missing');
      return null;
    }

    try {
      final bytes = await file.readAsBytes();
      final mimeType = file.mimeType ?? _guessMimeType(file.name);
      dev.log('ℹ️ [AIExtractionService] File: ${file.name}, Mime: $mimeType, Size: ${bytes.length} bytes');
      final List<Map<String, dynamic>> contentParts = [];

      // Step 1: Prepare content parts based on file type
      if (_isPdf(mimeType, file.name)) {
        dev.log('⏳ [AIExtractionService] Extracting PDF text...');
        final text = extractPdfText(bytes);
        if (text.isEmpty) {
          dev.log('⚠️ [AIExtractionService] PDF extraction returned empty text');
          return null;
        }
        dev.log('✅ [AIExtractionService] PDF text extracted (${text.length} chars)');
        contentParts.add({
          "type": "text",
          "text": "Here is the financial document text:\n\n$text"
        });
      } else if (mimeType.startsWith('image/')) {
        dev.log('⏳ [AIExtractionService] Encoding image...');
        final base64Image = base64.encode(bytes);
        contentParts.add({
          "type": "image_url",
          "image_url": {
            "url": "data:$mimeType;base64,$base64Image",
            "detail": "high"
          }
        });
      } else {
        dev.log('⏳ [AIExtractionService] Reading as plain text...');
        final text = String.fromCharCodes(bytes);
        contentParts.add({
          "type": "text",
          "text": "Here is the financial document text:\n\n$text"
        });
      }

      // Step 2: Add prompt
      contentParts.add({
        "type": "text",
        "text": _getPromptForType(normalizedType),
      });

      // Step 3: Call API
      dev.log('⏳ [AIExtractionService] Calling OpenAI ($_model)...');
      final responseText = await _callOpenAI(contentParts);
      if (responseText == null) {
        dev.log('❌ [AIExtractionService] OpenAI returned null responseText');
        return null;
      }

      // Step 4: Parse
      dev.log('⏳ [AIExtractionService] Parsing OpenAI response...');
      final result = _parseResponse(responseText, normalizedType);
      dev.log('✅ [AIExtractionService] Extraction completed: ${result != null}');
      return result;
    } catch (e, st) {
      dev.log('❌ [AIExtractionService] Error: $e\n$st');
      return null;
    }
  }

  static Future<String?> _callOpenAI(
    List<Map<String, dynamic>> contentParts, {
    int attempt = 1,
  }) async {
    // Production web: OpenAI blocks browser CORS — use Vercel serverless proxy.
    // Local web (localhost): call OpenAI directly with the bundled .env key.
    final host = Uri.base.host;
    final isLocalWeb =
        kIsWeb && (host == 'localhost' || host == '127.0.0.1' || host.endsWith('.localhost'));
    final useProxy = kIsWeb && !isLocalWeb;
    final url = useProxy
        ? Uri.parse(Uri.base.origin).resolve('api/openai-chat').toString()
        : 'https://api.openai.com/v1/chat/completions';

    try {
      final response = await _dio.post(
        url,
        options: dio_client.Options(
          headers: {
            'Content-Type': 'application/json',
            if (!useProxy) 'Authorization': 'Bearer $_apiKey',
          },
          sendTimeout: const Duration(seconds: 45),
          receiveTimeout: const Duration(seconds: 60),
        ),
        data: {
          "model": _model,
          "messages": [
            {
              "role": "system",
              "content": _systemPrompt,
            },
            {
              "role": "user",
              "content": contentParts,
            }
          ],
          "temperature": 0.0,
          "response_format": {"type": "json_object"},
        },
      );

      final text = response.data['choices'][0]['message']['content']?.toString();
      dev.log('✅ OpenAI response (attempt $attempt): $text');
      return text;
    } on dio_client.DioException catch (e) {
      dev.log('❌ OpenAI API error (attempt $attempt): ${e.response?.data ?? e.message}');

      // Retry once on timeout or 5xx errors
      if (attempt == 1 &&
          (e.type == dio_client.DioExceptionType.receiveTimeout ||
           e.type == dio_client.DioExceptionType.sendTimeout ||
           (e.response?.statusCode ?? 0) >= 500)) {
        dev.log('🔄 Retrying...');
        return _callOpenAI(contentParts, attempt: 2);
      }
      return null;
    }
  }

  static dynamic _parseResponse(String responseText, String type) {
    try {
      // Strip any accidental markdown fences (safety net even with json_object mode)
      final cleaned = responseText
          .replaceAll(RegExp(r'```json\s*'), '')
          .replaceAll(RegExp(r'```\s*'), '')
          .trim();

      // Find outermost JSON object
      final start = cleaned.indexOf('{');
      final end = cleaned.lastIndexOf('}');
      if (start == -1 || end == -1 || end <= start) {
        dev.log('❌ No valid JSON object found in response');
        return null;
      }

      final jsonStr = cleaned.substring(start, end + 1);
      final data = json.decode(jsonStr) as Map<String, dynamic>;
      final normalized = _normalizeResponsePayload(data, type);

      // Validate required fields are present
      if (!_validateFields(normalized, type)) {
        dev.log(
          '❌ Response missing required fields for type: $type. Got: ${normalized.keys}',
        );
        return null;
      }

      switch (type) {
        case 'pnl':
          return ProfitAndLossTemplate.fromJson(normalized);
        case 'bs':
          return BalanceSheetTemplate.fromJson(normalized);
        case 'cf':
          return CashFlowTemplate.fromJson(normalized);
        default:
          dev.log('❌ Unknown extraction type: $type');
          return null;
      }
    } catch (e, st) {
      dev.log('❌ JSON parse error: $e\n$st\nRaw: $responseText');
      return null;
    }
  }

  static bool _validateFields(Map<String, dynamic> data, String type) {
    final requiredFields = {
      'pnl': ['revenue', 'cost_of_goods_sold', 'gross_profit', 'operating_expenses', 'net_income'],
      'bs': ['assets', 'liabilities', 'equity'],
      'cf': ['operating_activities', 'investing_activities', 'financing_activities'],
    };

    final fields = requiredFields[type] ?? [];
    return fields.every((field) => data.containsKey(field));
  }

  static Map<String, dynamic> _normalizeResponsePayload(
    Map<String, dynamic> data,
    String type,
  ) {
    if (type == 'pnl') {
      return _normalizePnlPayload(data);
    }
    return data;
  }

  static Map<String, dynamic> _normalizePnlPayload(Map<String, dynamic> data) {
    final source = _extractNestedPnlSource(data);

    double? pickNum(List<String> keys) {
      for (final key in keys) {
        final value = source[key];
        final parsed = _toDouble(value);
        if (parsed != null) return parsed;
      }
      return null;
    }

    final revenue = pickNum([
          'revenue',
          'total_revenue',
          'sales',
          'total_sales',
          'total_income',
          'income',
          'net_sales',
          'turnover',
        ]) ??
        0.0;

    final cogs = pickNum([
          'cost_of_goods_sold',
          'cogs',
          'cost_of_sales',
          'cost_of_revenue',
          'direct_costs',
        ]) ??
        0.0;

    final operatingExpenses = pickNum([
          'operating_expenses',
          'opex',
          'total_operating_expenses',
          'operating_costs',
          'indirect_costs',
          'sg_and_a',
          'sga',
        ]) ??
        0.0;

    final grossProfit = pickNum([
          'gross_profit',
          'gross_margin',
        ]) ??
        (revenue - cogs);

    final netIncome = pickNum([
          'net_income',
          'net_profit',
          'profit_after_tax',
          'bottom_line',
          'net_earnings',
          'profit_loss',
        ]) ??
        (grossProfit - operatingExpenses);

    return {
      'revenue': revenue,
      'cost_of_goods_sold': cogs,
      'gross_profit': grossProfit,
      'operating_expenses': operatingExpenses,
      'net_income': netIncome,
    };
  }

  static double? _toDouble(dynamic value) {
    if (value == null) return null;
    if (value is num) return value.toDouble();
    if (value is String) {
      final raw = value.trim();
      final isParenNegative = raw.startsWith('(') && raw.endsWith(')');
      final cleaned = raw.replaceAll(RegExp(r'[^0-9\.\-]'), '');
      if (cleaned.isEmpty || cleaned == '-' || cleaned == '.') return null;
      final parsed = double.tryParse(cleaned);
      if (parsed == null) return null;
      return isParenNegative ? -parsed.abs() : parsed;
    }
    return null;
  }

  static Map<String, dynamic> _extractNestedPnlSource(Map<String, dynamic> data) {
    const nestedCandidates = [
      'profit_and_loss',
      'pnl',
      'profit_loss',
      'profitAndLoss',
      'statement',
      'data',
    ];

    for (final key in nestedCandidates) {
      final candidate = data[key];
      if (candidate is Map<String, dynamic>) {
        return candidate;
      }
    }
    return data;
  }

  static String extractPdfText(List<int> bytes) {
    try {
      final document = pdf_gen.PdfDocument(inputBytes: bytes);
      final text = pdf_gen.PdfTextExtractor(document).extractText();
      document.dispose();
      return text.trim();
    } catch (e) {
      dev.log('❌ PDF text extraction failed: $e');
      return '';
    }
  }

  static bool _isPdf(String mimeType, String fileName) {
    return mimeType == 'application/pdf' ||
        fileName.toLowerCase().endsWith('.pdf');
  }

  static String _getPromptForType(String type) {
    switch (type) {
      case 'pnl':
        return '''
Extract the Profit & Loss summary totals from this document.

Look for these values (they may appear under different names):
- revenue: Total Revenue, Total Sales, Total Income, Net Sales, Turnover
- cost_of_goods_sold: COGS, Cost of Sales, Direct Costs, Cost of Revenue
- gross_profit: Gross Profit, Gross Margin (revenue minus COGS)
- operating_expenses: Total Operating Expenses, OpEx, Indirect Costs, SG&A + Other
- net_income: Net Income, Net Profit/Loss, Profit After Tax, Bottom Line
  → If this is a net loss, return a negative number

If gross_profit is not explicitly stated, calculate it as: revenue - cost_of_goods_sold.
If net_income is not explicitly stated, calculate it as: gross_profit - operating_expenses.
Prefer decimal numbers. Return negative values for losses/expenses where applicable.

Return this exact JSON structure:
{
  "revenue": 0.0,
  "cost_of_goods_sold": 0.0,
  "gross_profit": 0.0,
  "operating_expenses": 0.0,
  "net_income": 0.0
}
''';

      case 'bs':
        return '''
Extract the Balance Sheet totals from this document.

Look for these values:
- assets.current: Total Current Assets (cash, receivables, inventory, prepaid)
- assets.non_current: Total Non-Current / Fixed Assets (property, equipment, intangibles)
- liabilities.current: Total Current Liabilities (payables, short-term debt, accruals)
- liabilities.long_term: Total Long-Term / Non-Current Liabilities (long-term loans, deferred tax)
- equity: Total Equity, Shareholders' Equity, Net Assets, Owner's Equity

Important: Total Assets should equal Total Liabilities + Equity. If you see a single 
"Total Assets" figure, split it based on what's listed. Liabilities are always positive numbers.

Return this exact JSON structure:
{
  "assets": {
    "current": 0.0,
    "non_current": 0.0
  },
  "liabilities": {
    "current": 0.0,
    "long_term": 0.0
  },
  "equity": 0.0
}
''';

      case 'cf':
        return '''
Extract the Cash Flow statement totals from this document.

- operating_activities: Net Cash from Operating Activities
- operating_adjustments: Non-cash adjustments to net income (Depreciation, Amortization)
- working_capital_changes: Changes in AR, Inventory, AP, and other current assets/liabilities
- asset_purchases: Cash spent on purchasing fixed assets (Property, Plant, Equipment)
- investment_activities: Other investing cash flows (Sales/Purchases of investments)
- loan_activities: Net cash from loans and debt (Proceeds/Repayments)
- owner_contributions: Cash received from owner/shareholder investments
- distributions: Cash paid as dividends or owner distributions
- investing_activities: TOTAL Net Cash from Investing Activities
- financing_activities: TOTAL Net Cash from Financing Activities

Return this exact JSON structure:
{
  "operating_activities": 0.0,
  "operating_adjustments": 0.0,
  "working_capital_changes": 0.0,
  "asset_purchases": 0.0,
  "investment_activities": 0.0,
  "loan_activities": 0.0,
  "owner_contributions": 0.0,
  "distributions": 0.0,
  "investing_activities": 0.0,
  "financing_activities": 0.0
}
''';

      default:
        return '';
    }
  }

  static String _guessMimeType(String fileName) {
    final ext = fileName.split('.').last.toLowerCase();
    switch (ext) {
      case 'pdf': return 'application/pdf';
      case 'jpg':
      case 'jpeg': return 'image/jpeg';
      case 'png': return 'image/png';
      case 'csv': return 'text/csv';
      case 'txt': return 'text/plain';
      case 'docx': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      case 'xlsx': return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      default: return 'application/octet-stream';
    }
  }

  static String _normalizeFinancialType(String type) {
    final t = type.trim().toLowerCase();
    if (t == 'pl' || t == 'p&l' || t == 'profit_loss' || t == 'profitloss') {
      return 'pnl';
    }
    return t;
  }
}