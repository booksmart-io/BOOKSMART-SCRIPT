import { scenario as healthyHvac, answerKey as healthyHvacAnswerKey } from "./01_healthy_hvac/scenario";
import { scenario as busyButBrokePlumbing, answerKey as busyButBrokePlumbingAnswerKey } from "./02_busy_but_broke_plumbing/scenario";
import { scenario as marginLeakElectric, answerKey as marginLeakElectricAnswerKey } from "./03_margin_leak_electric/scenario";
import { scenario as unbilledLandscaping, answerKey as unbilledLandscapingAnswerKey } from "./04_unbilled_landscaping/scenario";
import { scenario as homeDepotHeavyContractor, answerKey as homeDepotHeavyContractorAnswerKey } from "./06_home_depot_heavy_contractor/scenario";
import { scenario as collectionsProblemRoofing, answerKey as collectionsProblemRoofingAnswerKey } from "./05_collections_problem_roofing/scenario";
import { scenario as noQuickBooksContractor, answerKey as noQuickBooksContractorAnswerKey } from "./08_no_quickbooks_contractor/scenario";
import { scenario as ownerSpendingMess, answerKey as ownerSpendingMessAnswerKey } from "./07_owner_spending_mess/scenario";
import { scenario as quickBooksOnlyBusiness, answerKey as quickBooksOnlyBusinessAnswerKey } from "./09_quickbooks_only_business/scenario";
import { scenario as seasonalCashPressure, answerKey as seasonalCashPressureAnswerKey } from "./10_seasonal_cash_pressure/scenario";
import { scenario as customerConcentration, answerKey as customerConcentrationAnswerKey } from "./11_customer_concentration/scenario";
import { scenario as dataIntegrationProblem, answerKey as dataIntegrationProblemAnswerKey } from "./12_data_integration_problem/scenario";
import { scenario as upcomingCashShortfall, answerKey as upcomingCashShortfallAnswerKey } from "./13_upcoming_cash_shortfall/scenario";

export const scenarios = [
  { fixture: healthyHvac, answerKey: healthyHvacAnswerKey },
  { fixture: busyButBrokePlumbing, answerKey: busyButBrokePlumbingAnswerKey },
  { fixture: marginLeakElectric, answerKey: marginLeakElectricAnswerKey },
  { fixture: unbilledLandscaping, answerKey: unbilledLandscapingAnswerKey },
  { fixture: collectionsProblemRoofing, answerKey: collectionsProblemRoofingAnswerKey },
  { fixture: homeDepotHeavyContractor, answerKey: homeDepotHeavyContractorAnswerKey },
  { fixture: ownerSpendingMess, answerKey: ownerSpendingMessAnswerKey },
  { fixture: noQuickBooksContractor, answerKey: noQuickBooksContractorAnswerKey },
  { fixture: quickBooksOnlyBusiness, answerKey: quickBooksOnlyBusinessAnswerKey },
  { fixture: seasonalCashPressure, answerKey: seasonalCashPressureAnswerKey },
  { fixture: customerConcentration, answerKey: customerConcentrationAnswerKey },
  { fixture: dataIntegrationProblem, answerKey: dataIntegrationProblemAnswerKey },
  { fixture: upcomingCashShortfall, answerKey: upcomingCashShortfallAnswerKey },
] as const;

export function scenarioById(scenarioId: string) {
  return scenarios.find(entry => entry.fixture.manifest.scenarioId === scenarioId);
}
