import { calculateTax } from "./taxCalculator";
import { itr_form_selector, tds_lookup, deduction_lookup } from "./taxTools";

export interface Condition {
  fact: string;
  operator: "contains" | "equal" | "greaterThan" | "lessThan" | "in" | "matches";
  value: any;
}

export interface Rule {
  conditions: {
    any?: Condition[];
    all?: Condition[];
  };
  event: {
    type: string;
    params?: any;
  };
}

export function evaluateRule(rule: Rule, facts: Record<string, any>): boolean {
  const checkCondition = (cond: Condition): boolean => {
    const factVal = facts[cond.fact];
    if (factVal === undefined) return false;

    switch (cond.operator) {
      case "equal":
        return factVal === cond.value;
      case "contains":
        return typeof factVal === "string" && factVal.toLowerCase().includes(String(cond.value).toLowerCase());
      case "greaterThan":
        return factVal > cond.value;
      case "lessThan":
        return factVal < cond.value;
      case "in":
        return Array.isArray(cond.value) && cond.value.includes(factVal);
      case "matches":
        if (cond.value instanceof RegExp) {
          return cond.value.test(String(factVal));
        }
        return new RegExp(cond.value, "i").test(String(factVal));
      default:
        return false;
    }
  };

  if (rule.conditions.all) {
    return rule.conditions.all.every(checkCondition);
  }
  if (rule.conditions.any) {
    return rule.conditions.any.some(checkCondition);
  }
  return false;
}

const RULES: Rule[] = [
  {
    conditions: {
      any: [
        { fact: "queryText", operator: "contains", value: "calculate" },
        { fact: "queryText", operator: "contains", value: "tax on" },
        { fact: "queryText", operator: "contains", value: "salary of" },
        { fact: "queryText", operator: "contains", value: "earning" },
        { fact: "queryText", operator: "contains", value: "lakh" },
        { fact: "queryText", operator: "matches", value: "\\d+" },
      ],
    },
    event: { type: "TAX_CALCULATION" },
  },
  {
    conditions: {
      any: [
        { fact: "queryText", operator: "contains", value: "itr" },
        { fact: "queryText", operator: "contains", value: "form" },
        { fact: "queryText", operator: "contains", value: "return" },
      ],
    },
    event: { type: "ITR_SELECTION" },
  },
  {
    conditions: {
      any: [
        { fact: "queryText", operator: "contains", value: "tds" },
        { fact: "queryText", operator: "contains", value: "tax deducted" },
        { fact: "queryText", operator: "contains", value: "withholding" },
      ],
    },
    event: { type: "TDS_LOOKUP" },
  },
  {
    conditions: {
      any: [
        { fact: "queryText", operator: "contains", value: "deduction" },
        { fact: "queryText", operator: "contains", value: "80c" },
        { fact: "queryText", operator: "contains", value: "80d" },
        { fact: "queryText", operator: "contains", value: "saving" },
        { fact: "queryText", operator: "contains", value: "exemption" },
      ],
    },
    event: { type: "DEDUCTION_LOOKUP" },
  },
];

export async function generateOfflineReport(query: string, assessmentYear: string = "AY 2025-26"): Promise<{ text: string, toolResults: any[] }> {
  const facts = { queryText: query };
  let matchedEvent = "GENERAL_QUERY";

  for (const rule of RULES) {
    if (evaluateRule(rule, facts)) {
      matchedEvent = rule.event.type;
      break;
    }
  }

  const lowerQuery = query.toLowerCase();
  let reportText = `## 📋 Offline Financial Report\n\n`;
  reportText += `> [!IMPORTANT]\n`;
  reportText += `> **Deterministic Local Fallback Mode Active**\n`;
  reportText += `> The AI accountant has generated this report using our local rule-engine because the live AI generation endpoint is currently offline. All figures below are computed programmatically.\n\n`;
  reportText += `### 🔍 Analysis Metadata\n`;
  reportText += `- **Identified Intent**: ${matchedEvent.replace("_", " ")}\n`;
  reportText += `- **Query**: "${query}"\n`;
  reportText += `- **Assessment Year (AY)**: ${assessmentYear}\n\n`;

  let toolResults: any[] = [];

  if (matchedEvent === "TAX_CALCULATION") {
    // Extract a number from the query
    const matches = lowerQuery.replace(/,/g, "").match(/\d+/g);
    const amount = matches ? parseInt(matches[0], 10) : 800000; // default to 8 Lakhs
    
    // Parse deductions if present
    let sec80C = 0;
    if (lowerQuery.includes("80c")) {
      const match80c = lowerQuery.match(/80c[^\d]*(\d+)/);
      if (match80c) sec80C = parseInt(match80c[1], 10);
    }
    let sec80D = 0;
    if (lowerQuery.includes("80d")) {
      const match80d = lowerQuery.match(/80d[^\d]*(\d+)/);
      if (match80d) sec80D = parseInt(match80d[1], 10);
    }
    let sec24b = 0;
    if (lowerQuery.includes("24b") || lowerQuery.includes("home loan") || lowerQuery.includes("interest")) {
      const match24b = lowerQuery.match(/(?:24b|interest|loan)[^\d]*(\d+)/);
      if (match24b) sec24b = parseInt(match24b[1], 10);
    }
    
    const calcRes = calculateTax(
      { salary: amount },
      { section80C: sec80C, section80D: sec80D, section24b: sec24b },
      assessmentYear
    );

    toolResults.push({
      toolCallId: "offline-slab-call",
      toolName: "tax_slab_calculator",
      args: { salary: amount, section80C: sec80C, section80D: sec80D, section24b: sec24b, assessmentYear },
      result: { success: true, calculation: calcRes }
    });

    reportText += `### 💵 Tax Calculation Breakdown\n`;
    reportText += `For a salary of **₹${amount.toLocaleString("en-IN")}**:\n\n`;
    reportText += `| Item | Old Regime | New Regime |\n`;
    reportText += `| :--- | :--- | :--- |\n`;
    reportText += `| **Gross Salary** | ₹${amount.toLocaleString("en-IN")} | ₹${amount.toLocaleString("en-IN")} |\n`;
    reportText += `| **Standard Deduction** | ₹${calcRes.oldRegime.salaryStandardDeduction.toLocaleString("en-IN")} | ₹${calcRes.newRegime.salaryStandardDeduction.toLocaleString("en-IN")} |\n`;
    if (sec80C > 0) reportText += `| **Deduction (Sec 80C)** | ₹${calcRes.oldRegime.chapterVIA.toLocaleString("en-IN")} | Not Allowed |\n`;
    if (sec80D > 0) reportText += `| **Deduction (Sec 80D)** | ₹${calcRes.oldRegime.chapterVIA.toLocaleString("en-IN")} | Not Allowed |\n`;
    if (sec24b > 0) reportText += `| **Home Loan Interest (Sec 24b)** | ₹${calcRes.oldRegime.homeLoanInterest.toLocaleString("en-IN")} | Not Allowed |\n`;
    reportText += `| **Taxable Income** | ₹${calcRes.oldRegime.taxableIncome.toLocaleString("en-IN")} | ₹${calcRes.newRegime.taxableIncome.toLocaleString("en-IN")} |\n`;
    reportText += `| **Slab Tax** | ₹${calcRes.oldRegime.slabTax.toLocaleString("en-IN")} | ₹${calcRes.newRegime.slabTax.toLocaleString("en-IN")} |\n`;
    reportText += `| **Rebate (Sec 87A)** | ₹${calcRes.oldRegime.rebate87A.toLocaleString("en-IN")} | ₹${calcRes.newRegime.rebate87A.toLocaleString("en-IN")} |\n`;
    reportText += `| **Health & Education Cess (4%)** | ₹${calcRes.oldRegime.cess.toLocaleString("en-IN")} | ₹${calcRes.newRegime.cess.toLocaleString("en-IN")} |\n`;
    reportText += `| **Net Tax Liability** | **₹${calcRes.oldRegime.netTax.toLocaleString("en-IN")}** | **₹${calcRes.newRegime.netTax.toLocaleString("en-IN")}** |\n\n`;
    reportText += `**Recommendation:** The **${calcRes.optimalRegime} Regime** is better for you. `;
    if (calcRes.taxSavings > 0) {
      reportText += `You will save **₹${calcRes.taxSavings.toLocaleString("en-IN")}** under this regime.\n`;
    } else {
      reportText += `Both regimes result in the same tax liability.\n`;
    }
  } else if (matchedEvent === "ITR_SELECTION") {
    const hasSalary = lowerQuery.includes("salary") || lowerQuery.includes("job") || lowerQuery.includes("salaried");
    const hasCapitalGains = lowerQuery.includes("capital") || lowerQuery.includes("gain") || lowerQuery.includes("share") || lowerQuery.includes("stock");
    const hasPresumptive = lowerQuery.includes("presumptive") || lowerQuery.includes("freelance") || lowerQuery.includes("44ad");
    const hasRegularBusiness = lowerQuery.includes("business") && !hasPresumptive;

    const itrRes = (await itr_form_selector.execute!(
      {
        hasSalary,
        hasCapitalGains,
        hasPresumptiveBusiness: hasPresumptive,
        hasPresumptiveProfessional: hasPresumptive,
        hasRegularBusinessOrProfessional: hasRegularBusiness,
      },
      { toolCallId: "offline-itr-call", messages: [] }
    )) as any;

    toolResults.push({
      toolCallId: "offline-itr-call",
      toolName: "itr_form_selector",
      args: { hasSalary, hasCapitalGains, hasPresumptiveBusiness: hasPresumptive, hasPresumptiveProfessional: hasPresumptive, hasRegularBusinessOrProfessional: hasRegularBusiness },
      result: itrRes
    });

    reportText += `### 📂 Recommended ITR Form: **${itrRes.selectedForm}**\n\n`;
    reportText += `**Filing Logic Reasons:**\n`;
    itrRes.reasons.forEach((r: string) => {
      reportText += `- ${r}\n`;
    });
  } else if (matchedEvent === "TDS_LOOKUP") {
    let lookupType = "rent";
    if (lowerQuery.includes("salary")) lookupType = "salary";
    else if (lowerQuery.includes("contractor") || lowerQuery.includes("194c")) lookupType = "contractor";
    else if (lowerQuery.includes("professional") || lowerQuery.includes("194j")) lookupType = "professional";
    else if (lowerQuery.includes("life insurance") || lowerQuery.includes("194da")) lookupType = "life insurance";
    else if (lowerQuery.includes("interest") || lowerQuery.includes("194a")) lookupType = "interest";

    const tdsRes = (await tds_lookup.execute!(
      { sectionOrType: lookupType },
      { toolCallId: "offline-tds-call", messages: [] }
    )) as any;

    toolResults.push({
      toolCallId: "offline-tds-call",
      toolName: "tds_lookup",
      args: { sectionOrType: lookupType },
      result: tdsRes
    });

    reportText += `### 📝 Tax Deducted at Source (TDS) Rates\n\n`;
    tdsRes.results.forEach((item: any) => {
      reportText += `- **Section ${item.section}** (${item.type}): **${item.rate}**\n`;
      reportText += `  * **Threshold Limit**: ${item.threshold}\n`;
      reportText += `  * **Applicability Details**: ${item.notes}\n\n`;
    });
  } else if (matchedEvent === "DEDUCTION_LOOKUP") {
    let profile: "salaried" | "senior_citizen" | "business_owner" | "professional" | "general" = "salaried";
    if (lowerQuery.includes("senior") || lowerQuery.includes("citizen") || lowerQuery.includes("age")) profile = "senior_citizen";
    else if (lowerQuery.includes("business") || lowerQuery.includes("owner")) profile = "business_owner";
    else if (lowerQuery.includes("professional") || lowerQuery.includes("consultant")) profile = "professional";

    const dedRes = (await deduction_lookup.execute!(
      { profile },
      { toolCallId: "offline-deduction-call", messages: [] }
    )) as any;

    toolResults.push({
      toolCallId: "offline-deduction-call",
      toolName: "deduction_lookup",
      args: { profile },
      result: dedRes
    });

    reportText += `### 🛡️ Recommended Tax Deductions & Exemptions\n`;
    reportText += `Optimized profile category: **${profile.replace("_", " ")}**\n\n`;
    reportText += `| Section | Old Regime | New Regime | Provision Description |\n`;
    reportText += `| :--- | :--- | :--- | :--- |\n`;
    dedRes.deductions.forEach((d: any) => {
      reportText += `| **${d.section}** | ${d.oldRegime} | ${d.newRegime} | ${d.description} |\n`;
    });
  } else {
    reportText += `No matching tax calculations or guidelines could be resolved deterministically for your query.\n\n`;
    reportText += `Please check your connection and try again, or rephrase your query to ask about standard tax calculators, deductions (like 80C/80D), ITR selection, or TDS rates.`;
  }

  reportText += `\n\n---\n*Disclaimer: This is a deterministic report generated offline. Please consult a qualified Chartered Accountant (CA) before filing final returns.*`;

  return {
    text: reportText,
    toolResults
  };
}
