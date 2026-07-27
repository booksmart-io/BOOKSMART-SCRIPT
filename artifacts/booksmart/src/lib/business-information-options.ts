export const BUSINESS_ENTITY_TYPES = [
  "Sole Proprietorship", "Single Member LLC", "Multi Member LLC", "Partnership",
  "Limited Partnership (LP)", "Limited Liability Partnership (LLP)", "S Corporation",
  "C Corporation", "Professional Corporation (PC)", "Professional LLC (PLLC)",
  "Nonprofit", "Independent Contractor / Freelancer", "Trust", "Estate", "Other",
];

export const BUSINESS_INDUSTRIES = [
  "Accounting", "Agriculture", "Architecture", "Barber Shop", "Beauty Salon", "Childcare",
  "Cleaning Services", "Construction", "Consulting", "Dental", "E Commerce", "Education",
  "Electrical", "Engineering", "Financial Services", "Fitness", "HVAC", "Insurance",
  "Landscaping", "Legal", "Logistics", "Manufacturing", "Marketing", "Medical", "Nonprofit",
  "Online Business", "Other", "Photography", "Plumbing", "Real Estate", "Restaurant", "Retail",
  "Roofing", "Technology", "Transportation", "Trucking",
];

export const NAICS_BY_INDUSTRY: Record<string, string> = {
  Construction: "23", "Real Estate": "531", Restaurant: "722511", Retail: "44-45",
  Medical: "621", Dental: "621210", Legal: "541110", Accounting: "541211",
  Technology: "5415", Consulting: "541611", Transportation: "48-49", Trucking: "484",
  Manufacturing: "31-33", Nonprofit: "813",
};
