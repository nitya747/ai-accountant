import { calculateTax, calculateHRAExemption } from "../src/lib/taxCalculator";
import { itr_form_selector, deduction_lookup, tds_lookup } from "../src/lib/taxTools";

async function testTaxCalculator() {
  console.log("=== Testing Tax Calculator ===");

  // Test Case 1: Salary under 7 Lakhs (should have zero tax in New Regime due to rebate)
  const res1 = calculateTax({ salary: 650000 });
  console.log("\nTest Case 1: Salary ₹6,50,000 (AY 2025-26)");
  console.log(`- Old Regime Net Tax: ₹${res1.oldRegime.netTax.toFixed(2)} (Taxable: ₹${res1.oldRegime.taxableIncome})`);
  console.log(`- New Regime Net Tax: ₹${res1.newRegime.netTax.toFixed(2)} (Taxable: ₹${res1.newRegime.taxableIncome})`);
  console.log(`- Recommended Regime: ${res1.optimalRegime}`);
  console.log(`- Expected New Regime Tax: ₹0.00`);

  // Test Case 2: Salary ₹8,00,000
  const res2 = calculateTax({ salary: 800000 });
  console.log("\nTest Case 2: Salary ₹8,00,000 (AY 2025-26)");
  console.log(`- Old Regime Net Tax: ₹${res2.oldRegime.netTax.toFixed(2)} (Taxable: ₹${res2.oldRegime.taxableIncome})`);
  console.log(`- New Regime Net Tax: ₹${res2.newRegime.netTax.toFixed(2)} (Taxable: ₹${res2.newRegime.taxableIncome})`);
  console.log(`- Recommended Regime: ${res2.optimalRegime}`);
  console.log(`- Expected New Regime Ordinary Taxable: ₹7,25,000 (after 75k std deduction)`);
  console.log(`- Expected New Regime Slab Tax: ₹20,000 (Nil up to 3L, 5% on 3-7L, 10% on 7-7.25L = 20,000 + 2,500 = 22,500)`);
  // Wait! Let's check rebate for 7,25,000:
  // Tax = 22,500. Excess income over 7L = 25,000. Capped tax = 25,000. So no rebate as tax 22,500 < 25,000 excess.
  
  // Test Case 3: Complex income (Salary + STCG + LTCG + 80C)
  const res3 = calculateTax(
    { salary: 1200000, capitalGainsSTCG: 100000, capitalGainsLTCG: 200000 },
    { section80C: 150000, section80D: 25000 }
  );
  console.log("\nTest Case 3: Salary ₹12L + STCG ₹1L + LTCG ₹2L + Deductions (80C ₹1.5L, 80D ₹25k)");
  console.log(`- Old Regime Net Tax: ₹${res3.oldRegime.netTax.toFixed(2)} (Taxable Ordinary: ₹${res3.oldRegime.ordinaryTaxableIncome})`);
  console.log(`- New Regime Net Tax: ₹${res3.newRegime.netTax.toFixed(2)} (Taxable Ordinary: ₹${res3.newRegime.ordinaryTaxableIncome})`);
  console.log(`- Recommended Regime: ${res3.optimalRegime}`);
  console.log(`- Tax Savings: ₹${res3.taxSavings.toFixed(2)}`);

  // Test Case 4: House Property Let-Out (Rental Income + standard deduction 24a + interest 24b)
  const res4 = calculateTax(
    { salary: 1200000, rentalIncome: 400000, municipalTaxes: 20000 }, // Rent 4L, Muni 20k, NAV = 3.8L, 24a = 1.14L
    { section24b: 150000 } // interest 1.5L. HP Income = 3.8L - 1.14L - 1.5L = +1.16L
  );
  console.log("\nTest Case 4: Salary ₹12L + Rental Income ₹4L + Municipal Taxes ₹20k + Interest ₹1.5L");
  console.log(`- Old Regime HP Income (Expected +116,000): ₹${res4.oldRegime.housePropertyIncome.toFixed(2)}`);
  console.log(`- New Regime HP Income (Expected +116,000): ₹${res4.newRegime.housePropertyIncome.toFixed(2)}`);
  console.log(`- Old Regime Ordinary Taxable: ₹${res4.oldRegime.ordinaryTaxableIncome.toFixed(2)}`);
  console.log(`- New Regime Ordinary Taxable: ₹${res4.newRegime.ordinaryTaxableIncome.toFixed(2)}`);

  // Test Case 5: House Property Loss Set-off (Self-Occupied vs Let-out loss limits)
  const res5 = calculateTax(
    { salary: 1200000 },
    { section24b: 250000 } // Self-occupied. Old Regime cap 2L, New Regime cap 0.
  );
  console.log("\nTest Case 5: Salary ₹12L + SOP Interest ₹2.5L (Old regime cap 2L loss, New regime cap 0)");
  console.log(`- Old Regime HP Income (Expected -200,000): ₹${res5.oldRegime.housePropertyIncome.toFixed(2)}`);
  console.log(`- New Regime HP Income (Expected 0): ₹${res5.newRegime.housePropertyIncome.toFixed(2)}`);
  console.log(`- Old Regime Ordinary Taxable (12L - 50k std - 200k interest = 9.5L): ₹${res5.oldRegime.ordinaryTaxableIncome.toFixed(2)}`);
  console.log(`- New Regime Ordinary Taxable (12L - 75k std - 0 interest = 11.25L): ₹${res5.newRegime.ordinaryTaxableIncome.toFixed(2)}`);
}

async function testHRA() {
  console.log("\n=== Testing HRA Exemption ===");
  // Basic: 30,000/mo, Rent: 15,000/mo, HRA: 12,000/mo, Non-metro
  const annualBasic = 30000 * 12;
  const annualRent = 15000 * 12;
  const annualHRA = 12000 * 12;
  const exemption = calculateHRAExemption(annualHRA, annualRent, annualBasic, false);
  console.log(`Basic: ₹3.6L, Rent: ₹1.8L, HRA: ₹1.44L (Non-metro)`);
  console.log(`- Calculated HRA Exemption: ₹${exemption.toLocaleString("en-IN")}`);
  
  // Limits:
  // 1. Actual HRA = 1.44L
  // 2. Rent - 10% Basic = 1.8L - 36k = 1.44L
  // 3. 40% of Basic = 1.44L
  // Min is 1.44L, which is correct!
}

async function testITRFormSelector() {
  console.log("\n=== Testing ITR Form Selector ===");
  
  const test1 = (await itr_form_selector.execute!({
    hasSalary: true,
    totalIncome: 1200000,
    isResident: true,
  }, { toolCallId: "test", messages: [] })) as any;
  console.log(`\nSalary ₹12L -> Recommended: ${test1.selectedForm}`);
  console.log(`Reasons:`, test1.reasons);

  const test2 = (await itr_form_selector.execute!({
    hasSalary: true,
    hasCapitalGains: true,
    totalIncome: 1200000,
  }, { toolCallId: "test", messages: [] })) as any;
  console.log(`\nSalary + Capital Gains -> Recommended: ${test2.selectedForm}`);
  console.log(`Reasons:`, test2.reasons);

  const test3 = (await itr_form_selector.execute!({
    hasSalary: true,
    hasPresumptiveBusiness: true,
    totalIncome: 4500000,
  }, { toolCallId: "test", messages: [] })) as any;
  console.log(`\nSalary + Presumptive Business (Sec 44AD) -> Recommended: ${test3.selectedForm}`);
  console.log(`Reasons:`, test3.reasons);

  const test4 = (await itr_form_selector.execute!({
    hasRegularBusinessOrProfessional: true,
    totalIncome: 6000000,
  }, { toolCallId: "test", messages: [] })) as any;
  console.log(`\nBusiness Income > 50L (Books Kept) -> Recommended: ${test4.selectedForm}`);
  console.log(`Reasons:`, test4.reasons);
}

async function testLookups() {
  console.log("\n=== Testing Deductions Lookup ===");
  const dRes = (await deduction_lookup.execute!({ profile: "salaried" }, { toolCallId: "test", messages: [] })) as any;
  console.log(`Salaried profile deductions count: ${dRes.deductions.length}`);
  console.log(`Sample: ${dRes.deductions[0].section} - Old: ${dRes.deductions[0].oldRegime} | New: ${dRes.deductions[0].newRegime}`);

  console.log("\n=== Testing TDS Lookup ===");
  const tRes1 = (await tds_lookup.execute!({ sectionOrType: "194J" }, { toolCallId: "test", messages: [] })) as any;
  console.log(`TDS 194J Match Count: ${tRes1.results.length}`);
  console.log(`TDS 194J Rate: ${tRes1.results[0].rate} | Threshold: ${tRes1.results[0].threshold}`);

  const tRes2 = (await tds_lookup.execute!({ sectionOrType: "rent" }, { toolCallId: "test", messages: [] })) as any;
  console.log(`TDS Rent Match Count: ${tRes2.results.length}`);
  console.log(`TDS Rent Rate: ${tRes2.results[0].rate} | Section: ${tRes2.results[0].section}`);
}

async function main() {
  await testTaxCalculator();
  await testHRA();
  await testITRFormSelector();
  await testLookups();
  console.log("\n=== All Tests Completed Successfully ===");
}

main().catch(console.error);
