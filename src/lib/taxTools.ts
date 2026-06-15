import { tool } from "ai";
import { z } from "zod";
import { calculateTax } from "./taxCalculator";

// 1. Tax Slab Calculator Tool
export const tax_slab_calculator = tool({
  description: "Calculate tax liability under both the Old Regime and the New Regime for an individual, comparing them and determining the optimal choice.",
  parameters: z.object({
    assessmentYear: z.enum(["AY 2024-25", "AY 2025-26"]).optional().default("AY 2025-26").describe("Default is AY 2025-26 (FY 2024-25)"),
    salary: z.number().optional().default(0).describe("Salary income (Gross salary before standard deduction)"),
    business: z.number().optional().default(0).describe("Business income (profits)"),
    professional: z.number().optional().default(0).describe("Professional income (consulting fees/receipts)"),
    capitalGainsSTCG: z.number().optional().default(0).describe("Short-Term Capital Gains on listed equity/equity mutual funds (Section 111A)"),
    capitalGainsLTCG: z.number().optional().default(0).describe("Long-Term Capital Gains on listed equity/equity mutual funds (Section 112A)"),
    other: z.number().optional().default(0).describe("Other sources of income (e.g. interest, dividend)"),
    section80C: z.number().optional().default(0).describe("Deductions under Section 80C (PPF, ELSS, EPF, Home Loan Principal, SSY, etc. max 1.5L total)"),
    section80D: z.number().optional().default(0).describe("Deductions under Section 80D for self, spouse, children (medical insurance premiums, max 25k/50k)"),
    section80DParents: z.number().optional().default(0).describe("Deductions under Section 80D for parents (medical insurance premiums, max 25k/50k)"),
    section24b: z.number().optional().default(0).describe("Deductions under Section 24(b) for home loan interest paid on self-occupied house (max 2L)"),
    hraReceived: z.number().optional().default(0).describe("House Rent Allowance (HRA) received from employer"),
    rentPaid: z.number().optional().default(0).describe("Total rent paid in the financial year"),
    basicSalary: z.number().optional().default(0).describe("Basic salary + Dearness Allowance (DA) used for HRA exemption calculation"),
    isMetro: z.boolean().optional().default(false).describe("Whether living in a metro city (Mumbai, Delhi, Kolkata, Chennai) for HRA exemption calculation"),
  }),
  execute: async (args: any) => {
    const deductionsInput = {
      section80C: args.section80C,
      section80D: args.section80D,
      section80DParents: args.section80DParents,
      section24b: args.section24b,
      hra: args.hraReceived > 0 && args.rentPaid > 0 && args.basicSalary > 0
        ? {
            actualReceived: args.hraReceived,
            rentPaid: args.rentPaid,
            basicSalary: args.basicSalary,
            isMetro: args.isMetro,
          }
        : undefined,
    };

    const incomeInput = {
      salary: args.salary,
      business: args.business,
      professional: args.professional,
      capitalGainsSTCG: args.capitalGainsSTCG,
      capitalGainsLTCG: args.capitalGainsLTCG,
      other: args.other,
    };

    try {
      const calculation = calculateTax(incomeInput, deductionsInput, args.assessmentYear);
      return {
        success: true,
        calculation,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || "Failed to perform calculation",
      };
    }
  },
} as any);

// 2. ITR Form Selector Tool
export const itr_form_selector = tool({
  description: "Determine the correct Income Tax Return (ITR) form (ITR-1, ITR-2, ITR-3, or ITR-4) to file based on income types and financial profile.",
  parameters: z.object({
    hasSalary: z.boolean().optional().default(false).describe("Does the user have salary or pension income?"),
    hasHouseProperty: z.boolean().optional().default(false).describe("Does the user have house property income? (rental income/home loan)"),
    hasMultipleHouseProperties: z.boolean().optional().default(false).describe("Does the user have more than one house property?"),
    hasCapitalGains: z.boolean().optional().default(false).describe("Does the user have capital gains (shares, mutual funds, gold, property)?"),
    hasPresumptiveBusiness: z.boolean().optional().default(false).describe("Does the user have business income filed under presumptive scheme Section 44AD?"),
    hasPresumptiveProfessional: z.boolean().optional().default(false).describe("Does the user have professional income filed under presumptive scheme Section 44ADA?"),
    hasRegularBusinessOrProfessional: z.boolean().optional().default(false).describe("Does the user have regular business/professional income (maintaining books of accounts)?"),
    hasForeignAssetsOrIncome: z.boolean().optional().default(false).describe("Does the user have any foreign assets, foreign bank account, or foreign income?"),
    totalIncome: z.number().optional().default(0).describe("Total gross income in Rupees"),
    isResident: z.boolean().optional().default(true).describe("Is the user a resident individual?"),
  }),
  execute: async (args: any) => {
    const isResident = args.isResident ?? true;
    const hasForeignAssetsOrIncome = args.hasForeignAssetsOrIncome ?? false;
    const totalIncome = args.totalIncome ?? 0;
    const hasMultipleHouseProperties = args.hasMultipleHouseProperties ?? false;
    const hasCapitalGains = args.hasCapitalGains ?? false;
    const hasPresumptiveBusiness = args.hasPresumptiveBusiness ?? false;
    const hasPresumptiveProfessional = args.hasPresumptiveProfessional ?? false;
    const hasRegularBusinessOrProfessional = args.hasRegularBusinessOrProfessional ?? false;
    const hasSalary = args.hasSalary ?? false;
    const hasHouseProperty = args.hasHouseProperty ?? false;

    const reasons: string[] = [];
    let selectedForm = "ITR-1";

    if (!isResident) {
      selectedForm = "ITR-2";
      reasons.push("Non-resident individuals are not eligible to file ITR-1 or ITR-4.");
    }

    if (hasForeignAssetsOrIncome) {
      selectedForm = "ITR-2";
      reasons.push("You hold foreign assets or earned foreign income, which requires ITR-2 or ITR-3.");
    }

    if (totalIncome > 5000000) {
      selectedForm = "ITR-2";
      reasons.push("Total income exceeds ₹50 Lakhs, which makes you ineligible for ITR-1 or ITR-4.");
    }

    if (hasMultipleHouseProperties) {
      selectedForm = "ITR-2";
      reasons.push("Income from more than one house property requires ITR-2 or ITR-3.");
    }

    if (hasCapitalGains) {
      selectedForm = "ITR-2";
      reasons.push("You have capital gains from shares, mutual funds, property, or other assets, which requires ITR-2 or ITR-3.");
    }

    if (hasPresumptiveBusiness || hasPresumptiveProfessional) {
      if (selectedForm === "ITR-1") {
        selectedForm = "ITR-4";
        reasons.push("You have presumptive business (Sec 44AD) or professional (Sec 44ADA) income, which is eligible for ITR-4 (Sugam).");
      } else if (selectedForm === "ITR-2") {
        selectedForm = "ITR-3";
        reasons.push("You have business/professional income under presumptive schemes and also have capital gains or income > 50L, which requires ITR-3.");
      }
    }

    if (hasRegularBusinessOrProfessional) {
      selectedForm = "ITR-3";
      reasons.push("You have regular business or professional income (requiring audit or books of accounts under Sec 44AA), which requires ITR-3.");
    }

    // Edge-case corrections
    if (selectedForm === "ITR-1" && hasHouseProperty && !hasMultipleHouseProperties) {
      reasons.push("ITR-1 allows up to one house property.");
    }

    if (selectedForm === "ITR-1" && reasons.length === 0) {
      reasons.push("You are a resident individual with salary, one house property, and/or other source income (interest, dividend) under ₹50 Lakhs.");
    }

    return {
      success: true,
      selectedForm,
      reasons,
      note: "ITR-1 (Sahaj) is for salaried individuals with one property and income < 50L. ITR-2 is for salary + capital gains or multiple properties. ITR-4 (Sugam) is for presumptive business/professional income < 50L. ITR-3 is for regular business/profession or complex cases."
    };
  },
} as any);

// 3. Deduction Lookup Tool
export const deduction_lookup = tool({
  description: "Retrieve a list of eligible tax deductions and exemptions under the Old vs New Regime for a given taxpayer profile.",
  parameters: z.object({
    profile: z.enum(["salaried", "senior_citizen", "business_owner", "professional", "general"]).describe("Taxpayer category"),
  }),
  execute: async (args: any) => {
    const deductionsDatabase: Record<string, any[]> = {
      salaried: [
        { section: "Standard Deduction", oldRegime: "₹50,000", newRegime: "₹75,000", description: "Flat deduction from salary income." },
        { section: "Section 80C", oldRegime: "Up to ₹1,50,000", newRegime: "Not Allowed", description: "PPF, ELSS, EPF, Home Loan Principal, Tuition Fees, etc." },
        { section: "Section 80D", oldRegime: "Up to ₹25,000 (Self) + ₹25,000 (Parents)", newRegime: "Not Allowed", description: "Medical insurance premiums. Rises to ₹50,000 if premium is for a senior citizen." },
        { section: "Section 10(13A) HRA", oldRegime: "Exempt based on formula", newRegime: "Not Allowed", description: "Exemption for rent paid. Requires actual rent receipts." },
        { section: "Section 24(b)", oldRegime: "Up to ₹2,000,000", newRegime: "Not Allowed", description: "Home loan interest on self-occupied property." },
        { section: "Section 80CCD(1B)", oldRegime: "Up to ₹50,000", newRegime: "Not Allowed", description: "Additional National Pension System (NPS) contribution." },
      ],
      senior_citizen: [
        { section: "Section 80TTB", oldRegime: "Up to ₹50,000", newRegime: "Not Allowed", description: "Interest deduction on bank, co-op society, and post office deposits." },
        { section: "Section 80D", oldRegime: "Up to ₹50,000 (Self) + ₹50,000 (Parents)", newRegime: "Not Allowed", description: "Higher health insurance premium limit for senior citizens." },
        { section: "Section 80DDB", oldRegime: "Up to ₹1,00,000", newRegime: "Not Allowed", description: "Medical treatment of specified diseases (senior limit)." },
        { section: "Standard Deduction (Pension)", oldRegime: "₹50,000", newRegime: "₹75,000", description: "Available for pensioners receiving salary/pension income." },
      ],
      business_owner: [
        { section: "Section 44AD", oldRegime: "Presumptive tax 6% / 8%", newRegime: "Presumptive tax 6% / 8%", description: "Presumptive business scheme for turnover up to ₹2 Cr (or ₹3 Cr for cash receipts ≤ 5%). No books required." },
        { section: "Business Expenses", oldRegime: "100% of business expenses", newRegime: "100% of business expenses", description: "Deduct salary, rent, marketing, utilities, and depreciation from gross revenues (under regular tax audit/books)." },
        { section: "Section 80C", oldRegime: "Up to ₹1,50,000", newRegime: "Not Allowed", description: "PPF, LIC, NSC, SSY contributions are allowed in Old Regime." },
      ],
      professional: [
        { section: "Section 44ADA", oldRegime: "50% presumptive profit", newRegime: "50% presumptive profit", description: "Presumptive scheme for specified professionals (receipts up to ₹50L or ₹75L if cash ≤ 5%). No books required." },
        { section: "Professional Expenses", oldRegime: "100% of professional expenses", newRegime: "100% of professional expenses", description: "Deduct expenses from receipts if choosing to file regular ITR-3 with books of accounts." },
        { section: "Section 80C / 80D", oldRegime: "Allowed", newRegime: "Not Allowed", description: "Available in Old Regime only." },
      ],
      general: [
        { section: "Section 80TTA", oldRegime: "Up to ₹10,000", newRegime: "Not Allowed", description: "Interest deduction on savings account deposits for non-senior individuals." },
        { section: "Section 80G", oldRegime: "50% or 100% of donation", newRegime: "Not Allowed", description: "Exemption for donations to specified charitable institutions." },
        { section: "Section 80GG", oldRegime: "Up to ₹60,000/year", newRegime: "Not Allowed", description: "Exemption for rent paid when HRA is not received (e.g. self-employed/non-salaried)." },
      ],
    };

    return {
      success: true,
      profile: args.profile,
      deductions: deductionsDatabase[args.profile] || deductionsDatabase.general,
    };
  },
} as any);

// 4. TDS Lookup Tool
export const tds_lookup = tool({
  description: "Retrieve the TDS (Tax Deducted at Source) rates, section numbers, and threshold limits under the Income Tax Act.",
  parameters: z.object({
    sectionOrType: z.string().describe("TDS Section (e.g., '192', '194C', '194J', '194I') or payment type (e.g., 'salary', 'contractor', 'professional', 'rent')"),
  }),
  execute: async (args: any) => {
    const tdsDatabase = [
      { section: "Section 192", type: "Salary", rate: "Applicable Slab Rates", threshold: "Basic exemption limit (₹2.5L / ₹3L)", notes: "Computed on estimated annual income using slabs after standard deduction." },
      { section: "Section 194C", type: "Contractor Payments", rate: "1% for Individuals/HUFs, 2% for others", threshold: "₹30,000 single payout or ₹1,00,000 aggregate/year", notes: "Applies to advertisements, work contracts, carriage of goods/passengers, etc." },
      { section: "Section 194J", type: "Professional Fees / Technical Services", rate: "10% standard, 2% for technical/royalty/call centers", threshold: "₹30,000/year per category", notes: "Applies to doctors, engineers, lawyers, CAs, design consultancy, etc." },
      { section: "Section 194I", type: "Rent", rate: "10% for land/building/furniture, 2% for machinery/plant/equipment", threshold: "₹2,40,000/year", notes: "Applies when lessee/tenant is a business/individual subject to tax audit." },
      { section: "Section 194DA", type: "Life Insurance Policy Payouts", rate: "5%", threshold: "₹1,00,000/year", notes: "Applied on the taxable income portion (payout minus premiums paid) if payout is not exempt under 10(10D)." },
      { section: "Section 194A", type: "Interest (other than securities)", rate: "10%", threshold: "₹40,000/year (₹50,000 for senior citizens)", notes: "Applied by banks or financial institutions on fixed deposits/recurring deposits." },
      { section: "Section 194H", type: "Commission / Brokerage", rate: "5%", threshold: "₹15,000/year", notes: "Applies to insurance commission, real estate brokerage, etc." }
    ];

    const input = args.sectionOrType.toLowerCase();

    // Try exact section match
    let matches = tdsDatabase.filter(
      (item) => item.section.toLowerCase().includes(input) || input.includes(item.section.toLowerCase().replace("section ", ""))
    );

    // Try type/keyword match if no section match
    if (matches.length === 0) {
      matches = tdsDatabase.filter(
        (item) => item.type.toLowerCase().includes(input) || input.includes(item.type.toLowerCase())
      );
    }

    // Return everything if still empty
    if (matches.length === 0) {
      return {
        success: true,
        query: args.sectionOrType,
        message: "No specific match found. Showing common TDS provisions:",
        results: tdsDatabase,
      };
    }

    return {
      success: true,
      query: args.sectionOrType,
      results: matches,
    };
  },
} as any);
