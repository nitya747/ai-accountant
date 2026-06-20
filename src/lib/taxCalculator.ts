export interface IncomeSources {
  salary?: number;
  business?: number;
  professional?: number;
  capitalGainsSTCG?: number; // Listed equity (111A)
  capitalGainsLTCG?: number; // Listed equity (112A)
  rentalIncome?: number;      // Gross rental income/GAV (Section 23)
  municipalTaxes?: number;    // Municipal taxes paid
  other?: number;
}

export interface Deductions {
  section80C?: number;
  section80D?: number; // Self/Family (max 25k/50k)
  section80DParents?: number; // Parents (max 25k/50k)
  section24b?: number; // Home loan interest (max 2L self-occupied)
  hra?: {
    actualReceived: number;
    rentPaid: number;
    basicSalary: number;
    isMetro: boolean;
  };
  hasStandardDeduction?: boolean; // Default true if salary > 0
}

export interface TaxBreakdown {
  grossIncome: number;
  salaryStandardDeduction: number;
  hraExemption: number;
  chapterVIA: number; // 80C + 80D
  homeLoanInterest: number; // 24b
  housePropertyIncome: number; // Income/Loss under the head "Income from House Property" (after standard deduction 24a and interest 24b, and applying set-off cap)
  totalDeductions: number;
  taxableIncome: number;
  ordinaryTaxableIncome: number;
  slabTax: number;
  stcgTax: number;
  ltcgTax: number;
  totalTaxBeforeRebate: number;
  rebate87A: number;
  taxAfterRebate: number;
  cess: number;
  netTax: number;
}

export interface CalculationResult {
  financialYear: string;
  assessmentYear: string;
  income: IncomeSources;
  oldRegime: TaxBreakdown;
  newRegime: TaxBreakdown;
  optimalRegime: "Old" | "New";
  taxSavings: number;
}

// Compute HRA Exemption (only available in Old Regime)
export function calculateHRAExemption(
  actualReceived: number,
  rentPaid: number,
  basicSalary: number,
  isMetro: boolean
): number {
  if (actualReceived <= 0 || basicSalary <= 0) return 0;
  
  // 1. Actual HRA received
  // 2. Rent paid minus 10% of basic salary
  const rentMinusBasic10 = Math.max(0, rentPaid - 0.1 * basicSalary);
  // 3. 40% or 50% of basic salary
  const percentLimit = isMetro ? 0.5 * basicSalary : 0.4 * basicSalary;

  return Math.min(actualReceived, rentMinusBasic10, percentLimit);
}

// Calculate tax based on progressive slabs
function calculateSlabTax(income: number, slabs: { limit: number; rate: number }[]): number {
  let tax = 0;
  let remaining = income;
  let prevLimit = 0;

  for (const slab of slabs) {
    if (remaining <= 0) break;
    
    const slabRange = slab.limit - prevLimit;
    const taxableAmount = Math.min(remaining, slabRange);
    
    tax += taxableAmount * slab.rate;
    remaining -= taxableAmount;
    prevLimit = slab.limit;
  }

  return tax;
}

export function calculateTax(
  income: IncomeSources,
  deductions: Deductions = {},
  assessmentYear: string = "AY 2025-26"
): CalculationResult {
  const fyMap: Record<string, string> = {
    "AY 2025-26": "FY 2024-25",
    "AY 2024-25": "FY 2023-24",
  };
  const ay = assessmentYear === "AY 2024-25" ? "AY 2024-25" : "AY 2025-26";
  const fy = fyMap[ay];

  const salary = income.salary || 0;
  const business = income.business || 0;
  const professional = income.professional || 0;
  const stcg = income.capitalGainsSTCG || 0;
  const ltcg = income.capitalGainsLTCG || 0;
  const rentalIncome = income.rentalIncome || 0;
  const municipalTaxes = income.municipalTaxes || 0;
  const other = income.other || 0;

  const grossTotalIncome = salary + business + professional + stcg + ltcg + rentalIncome + other;

  // --- HOUSE PROPERTY INCOME CALCULATION (Section 24) ---
  const hpNAV = Math.max(0, rentalIncome - municipalTaxes);
  const hpSec24a = rentalIncome > 0 ? hpNAV * 0.3 : 0; // 30% Standard Deduction under Sec 24(a)
  
  // Old Regime House Property Calculation
  const oldInterest = rentalIncome > 0 
    ? (deductions.section24b || 0)
    : Math.min(200000, deductions.section24b || 0); // Self-occupied capped at 2L
  const oldHPIncomeBeforeSetOff = rentalIncome > 0 
    ? (hpNAV - hpSec24a - oldInterest)
    : -oldInterest;
  const oldHPSetOff = oldHPIncomeBeforeSetOff < 0 
    ? Math.max(-200000, oldHPIncomeBeforeSetOff) // Set-off cap of 2L against other heads
    : oldHPIncomeBeforeSetOff;

  // New Regime House Property Calculation
  const newInterest = rentalIncome > 0 
    ? (deductions.section24b || 0)
    : 0; // Self-occupied interest is not allowed in New Regime
  const newHPIncomeBeforeSetOff = rentalIncome > 0 
    ? (hpNAV - hpSec24a - newInterest)
    : 0;
  const newHPSetOff = newHPIncomeBeforeSetOff < 0 
    ? 0 // Set-off cap is 0 in New Regime (loss cannot set off other heads)
    : newHPIncomeBeforeSetOff;

  // --- REGIME SLABS ---
  // Old Regime Slabs (identical for both years)
  const oldSlabs = [
    { limit: 250000, rate: 0.05 },
    { limit: 500000, rate: 0.20 },
    { limit: 1000000, rate: 0.30 },
  ];

  // Old regime helper for slabs:
  // 0 - 2.5L: 0%
  // 2.5L - 5L: 5%
  // 5L - 10L: 20%
  // > 10L: 30%
  const calculateOldSlabTax = (ordinaryIncome: number): number => {
    let tax = 0;
    if (ordinaryIncome > 1000000) {
      tax += (ordinaryIncome - 1000000) * 0.30;
      tax += 500000 * 0.20;
      tax += 250000 * 0.05;
    } else if (ordinaryIncome > 500000) {
      tax += (ordinaryIncome - 500000) * 0.20;
      tax += 250000 * 0.05;
    } else if (ordinaryIncome > 250000) {
      tax += (ordinaryIncome - 250000) * 0.05;
    }
    return tax;
  };

  // New Regime Slabs
  let newStdDeduction = 0;
  let newSlabTax = 0;
  
  if (ay === "AY 2025-26") {
    newStdDeduction = salary > 0 ? Math.min(salary, 75000) : 0;
  } else {
    // AY 2024-25 (FY 2023-24)
    newStdDeduction = salary > 0 ? Math.min(salary, 50000) : 0;
  }

  const newOrdinaryTaxable = Math.max(0, Math.max(0, salary - newStdDeduction) + business + professional + newHPSetOff + other);

  if (ay === "AY 2025-26") {
    // New Slabs AY 2025-26:
    // 0 - 3L: 0%
    // 3 - 7L: 5%
    // 7 - 10L: 10%
    // 10 - 12L: 15%
    // 12 - 15L: 20%
    // > 15L: 30%
    const incomeForSlabs = newOrdinaryTaxable;
    if (incomeForSlabs > 1500000) {
      newSlabTax += (incomeForSlabs - 1500000) * 0.30;
      newSlabTax += 300000 * 0.20; // 12-15L
      newSlabTax += 200000 * 0.15; // 10-12L
      newSlabTax += 300000 * 0.10; // 7-10L
      newSlabTax += 400000 * 0.05; // 3-7L
    } else if (incomeForSlabs > 1200000) {
      newSlabTax += (incomeForSlabs - 1200000) * 0.20;
      newSlabTax += 200000 * 0.15;
      newSlabTax += 300000 * 0.10;
      newSlabTax += 400000 * 0.05;
    } else if (incomeForSlabs > 1000000) {
      newSlabTax += (incomeForSlabs - 1000000) * 0.15;
      newSlabTax += 300000 * 0.10;
      newSlabTax += 400000 * 0.05;
    } else if (incomeForSlabs > 700000) {
      newSlabTax += (incomeForSlabs - 700000) * 0.10;
      newSlabTax += 400000 * 0.05;
    } else if (incomeForSlabs > 300000) {
      newSlabTax += (incomeForSlabs - 300000) * 0.05;
    }
  } else {
    // New Slabs AY 2024-25:
    // 0 - 3L: 0%
    // 3 - 6L: 5%
    // 6 - 9L: 10%
    // 9 - 12L: 15%
    // 12 - 15L: 20%
    // > 15L: 30%
    const incomeForSlabs = newOrdinaryTaxable;
    if (incomeForSlabs > 1500000) {
      newSlabTax += (incomeForSlabs - 1500000) * 0.30;
      newSlabTax += 300000 * 0.20; // 12-15L
      newSlabTax += 300000 * 0.15; // 9-12L
      newSlabTax += 300000 * 0.10; // 6-9L
      newSlabTax += 300000 * 0.05; // 3-6L
    } else if (incomeForSlabs > 1200000) {
      newSlabTax += (incomeForSlabs - 1200000) * 0.20;
      newSlabTax += 300000 * 0.15;
      newSlabTax += 300000 * 0.10;
      newSlabTax += 300000 * 0.05;
    } else if (incomeForSlabs > 900000) {
      newSlabTax += (incomeForSlabs - 900000) * 0.15;
      newSlabTax += 300000 * 0.10;
      newSlabTax += 300000 * 0.05;
    } else if (incomeForSlabs > 600000) {
      newSlabTax += (incomeForSlabs - 600000) * 0.10;
      newSlabTax += 300000 * 0.05;
    } else if (incomeForSlabs > 300000) {
      newSlabTax += (incomeForSlabs - 300000) * 0.05;
    }
  }

  // Capital Gains Rates
  const stcgRate = ay === "AY 2025-26" ? 0.20 : 0.15;
  const ltcgRate = ay === "AY 2025-26" ? 0.125 : 0.10;
  const ltcgExemption = ay === "AY 2025-26" ? 125000 : 100000;

  // ==========================================
  // OLD REGIME CALCULATION
  // ==========================================
  const oldStdDeduction = salary > 0 && deductions.hasStandardDeduction !== false ? Math.min(salary, 50000) : 0;
  
  // Calculate HRA
  let oldHraExemption = 0;
  if (deductions.hra && salary > 0) {
    oldHraExemption = calculateHRAExemption(
      deductions.hra.actualReceived,
      deductions.hra.rentPaid,
      deductions.hra.basicSalary,
      deductions.hra.isMetro
    );
  }

  // Chapter VI-A deductions
  const d80C = Math.min(150000, deductions.section80C || 0);
  const d80D = Math.min(100000, (deductions.section80D || 0) + (deductions.section80DParents || 0));

  const oldOrdinaryGross = Math.max(0, salary - oldStdDeduction - oldHraExemption) + business + professional + oldHPSetOff + other;
  const oldOrdinaryTaxable = Math.max(0, oldOrdinaryGross - d80C - d80D);
  const oldTaxableIncome = oldOrdinaryTaxable + stcg + ltcg;

  const oldSlabTax = calculateOldSlabTax(oldOrdinaryTaxable);
  const oldStcgTax = stcg * stcgRate;
  const oldLtcgTax = Math.max(0, ltcg - ltcgExemption) * ltcgRate;
  const oldTaxBeforeRebate = oldSlabTax + oldStcgTax + oldLtcgTax;

  // Section 87A rebate (Old Regime: taxable income <= 5L, rebate up to ₹12,500)
  let oldRebate = 0;
  if (oldTaxableIncome <= 500000) {
    oldRebate = Math.min(oldTaxBeforeRebate, 12500);
  }

  const oldTaxAfterRebate = oldTaxBeforeRebate - oldRebate;
  const oldCess = oldTaxAfterRebate * 0.04;
  const oldNetTax = oldTaxAfterRebate + oldCess;

  const oldTotalDeductions = oldStdDeduction + oldHraExemption + d80C + d80D + oldInterest + hpSec24a + municipalTaxes;

  const oldBreakdown: TaxBreakdown = {
    grossIncome: grossTotalIncome,
    salaryStandardDeduction: oldStdDeduction,
    hraExemption: oldHraExemption,
    chapterVIA: d80C + d80D,
    homeLoanInterest: oldInterest,
    housePropertyIncome: oldHPSetOff,
    totalDeductions: oldTotalDeductions,
    taxableIncome: oldTaxableIncome,
    ordinaryTaxableIncome: oldOrdinaryTaxable,
    slabTax: oldSlabTax,
    stcgTax: oldStcgTax,
    ltcgTax: oldLtcgTax,
    totalTaxBeforeRebate: oldTaxBeforeRebate,
    rebate87A: oldRebate,
    taxAfterRebate: oldTaxAfterRebate,
    cess: oldCess,
    netTax: oldNetTax,
  };

  // ==========================================
  // NEW REGIME CALCULATION
  // ==========================================
  const newTotalDeductions = newStdDeduction + newInterest + hpSec24a + municipalTaxes;
  const newTaxableIncome = newOrdinaryTaxable + stcg + ltcg;

  const newStcgTax = stcg * stcgRate;
  const newLtcgTax = Math.max(0, ltcg - ltcgExemption) * ltcgRate;
  const newTaxBeforeRebate = newSlabTax + newStcgTax + newLtcgTax;

  // Section 87A rebate (New Regime)
  let newRebate = 0;
  const rebateThreshold = 700000;
  const maxNewRebate = ay === "AY 2025-26" ? 20000 : 25000;

  if (newTaxableIncome <= rebateThreshold) {
    newRebate = Math.min(newTaxBeforeRebate, maxNewRebate);
  } else {
    // Marginal Relief under Section 87A (New Regime)
    const excessIncome = newTaxableIncome - rebateThreshold;
    if (newTaxBeforeRebate > excessIncome) {
      newRebate = newTaxBeforeRebate - excessIncome;
    }
  }

  const newTaxAfterRebate = Math.max(0, newTaxBeforeRebate - newRebate);
  const newCess = newTaxAfterRebate * 0.04;
  const newNetTax = newTaxAfterRebate + newCess;

  const newBreakdown: TaxBreakdown = {
    grossIncome: grossTotalIncome,
    salaryStandardDeduction: newStdDeduction,
    hraExemption: 0,
    chapterVIA: 0,
    homeLoanInterest: newInterest,
    housePropertyIncome: newHPSetOff,
    totalDeductions: newTotalDeductions,
    taxableIncome: newTaxableIncome,
    ordinaryTaxableIncome: newOrdinaryTaxable,
    slabTax: newSlabTax,
    stcgTax: newStcgTax,
    ltcgTax: newLtcgTax,
    totalTaxBeforeRebate: newTaxBeforeRebate,
    rebate87A: newRebate,
    taxAfterRebate: newTaxAfterRebate,
    cess: newCess,
    netTax: newNetTax,
  };

  // ==========================================
  // RECOMMENDATION COMPARISON
  // ==========================================
  const optimalRegime = newNetTax <= oldNetTax ? "New" : "Old";
  const taxSavings = Math.abs(oldNetTax - newNetTax);

  return {
    financialYear: fy,
    assessmentYear: ay,
    income,
    oldRegime: oldBreakdown,
    newRegime: newBreakdown,
    optimalRegime,
    taxSavings,
  };
}
