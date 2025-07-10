import 'dart:convert';
import 'dart:developer';
import 'package:booksmart/constant/env_data.dart';
import 'package:booksmart/modules/common/controllers/auth_controller.dart';
import 'package:booksmart/supabase/tables.dart';
import 'package:booksmart/utils/supabase.dart';
import 'package:http/http.dart' as http;

import '../../../models/ai_tax_strategy_model.dart';
import '../controllers/organization_controller.dart';

class AIPrompts {
  static String taxStrategyPrompt({
    required Map<String, dynamic> business,
    required List<dynamic> finances,
    required List<AiTaxStrategyModel> existingStrategies,
  }) {
    return """
You are a US-based CPA and tax strategist.

Generate tax-saving strategies based on the data.

IMPORTANT RULES:
- Do NOT repeat existing strategies
- Each strategy must be unique
- Keep strategies practical and IRS-compliant

Return ONLY valid JSON:

{
  "strategies": [
    {
      "title": "",
      "summary": "",
      "category": "",
      "estimated_savings": 0,
      "risk_level": "",
      "audit_risk": "",
      "implementation_steps": [],
      "tags": [],
    }
  ]
}
${existingStrategies.isEmpty ? "" : "Existing Strategies:\n${existingStrategies.map((e) => e.toAiContextJson()).join(",")}\n"}
Business Profile:
${business.toString()}

Financial Data:
${finances.toString()}
""";
  }
}

class OpenAIService {
  static Future<List<AiTaxStrategyModel>> generateStrategies({
    required Map<String, dynamic> business,
    required List<dynamic> finances,
    required List<AiTaxStrategyModel> existingStrategies,
  }) async {
    final prompt = AIPrompts.taxStrategyPrompt(
      business: business,
      finances: finances,
      existingStrategies: existingStrategies,
    );
    log(prompt);

    final response = await http.post(
      Uri.parse("https://openrouter.ai/api/v1/chat/completions"),
      headers: {
        "Authorization": "Bearer $getOpenRouterAiTaxKey",
        "Content-Type": "application/json",
        "X-Title": "BookSmart AI",
      },
      body: jsonEncode({
        "model": "gpt-4.1-mini",
        "messages": [
          {"role": "system", "content": "You are a tax expert."},
          {"role": "user", "content": prompt},
        ],
        "temperature": 0.3,
        "max_tokens": 1200,
      }),
    );
    log("OpenAI Response [${response.statusCode}]: ${response.body}");

    if (response.statusCode != 200) {
      throw Exception("OpenAI error: ${response.body}");
    }

    final data = jsonDecode(response.body);

    final String content = data['choices'][0]['message']['content'];

    final String cleaned = content
        .replaceAll("```json", "")
        .replaceAll("```", "")
        .trim();

    final decoded = jsonDecode(cleaned);

    return (decoded['strategies'] as List)
        .map((e) => AiTaxStrategyModel.fromJson(e))
        .toList();
  }
}

class StrategyRepository {
  Future<void> saveStrategies({
    required List<AiTaxStrategyModel> strategies,
  }) async {
    final rows = strategies.map(
      (s) => s.toInsertJson(
        userId: authPerson!.authId,
        orgId: getCurrentOrganization!.id,
      ),
    );

    log("Rows: $rows");

    await supabase.from(SupabaseTable.aiTaxStrategies).insert(rows.toList());
  }
}

Future<bool> generateAndStoreStrategies({
  required Map<String, dynamic> business,
  required List<dynamic> finances,
  required List<AiTaxStrategyModel> existingStrategies,
}) async {
  return await OpenAIService.generateStrategies(
        business: business,
        finances: finances,
        existingStrategies: existingStrategies,
      )
      .then((strategies) async {
        if (strategies.isEmpty) {
          return false;
        }
        return StrategyRepository()
            .saveStrategies(strategies: strategies)
            .then((_) => true)
            .catchError((e, x) {
              log(e.toString());
              log(x.toString());
              return false;
            });
      })
      .catchError((e, x) {
        log(e.toString());
        log(x.toString());
        return false;
      });
}
