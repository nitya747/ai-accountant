export function formatINR(val: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(val);
}

export function formatINRNumber(val: number): string {
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 0,
  }).format(val);
}

/**
 * Normalizes labels to standard keys
 */
export function getLabelKey(label: string): string | null {
  const clean = label.replace(/[*_~\s]/g, "").toLowerCase();
  
  if (clean.includes("grosssalary") || clean.includes("grossincome") || clean.includes("grosstotalincome")) {
    return "grossIncome";
  }
  if (clean.includes("standarddeduction")) {
    return "salaryStandardDeduction";
  }
  if (clean.includes("hraexemption") || clean.includes("housepropertyexemption") || clean.includes("hraexempt")) {
    return "hraExemption";
  }
  if (clean.includes("chaptervia") || clean.includes("80c") || clean.includes("80d") || clean.includes("deductionunderchaptervia")) {
    return "chapterVIA";
  }
  if (clean.includes("homeloaninterest") || clean.includes("section24b") || clean.includes("interestonhomeloan")) {
    return "homeLoanInterest";
  }
  if (clean.includes("housepropertyincome") || clean.includes("incomefromhouseproperty") || clean.includes("netrentalincome") || clean.includes("housepropertyloss")) {
    return "housePropertyIncome";
  }
  if (clean.includes("totaldeduction") || clean.includes("totaldeductions")) {
    return "totalDeductions";
  }
  if (clean.includes("taxableincome") || clean.includes("nettaxableincome") || clean.includes("ordinarytaxableincome")) {
    return "taxableIncome";
  }
  if (clean.includes("slabtax") || clean.includes("taxonslab") || clean.includes("incometax") || clean.includes("taxatslabrates")) {
    return "slabTax";
  }
  if (clean.includes("stcgtax") || clean.includes("shorttermcapitalgainstax")) {
    return "stcgTax";
  }
  if (clean.includes("ltcgtax") || clean.includes("longtermcapitalgainstax")) {
    return "ltcgTax";
  }
  if (clean.includes("rebate") || clean.includes("sec87a") || clean.includes("section87a")) {
    return "rebate87A";
  }
  if (clean.includes("cess") || clean.includes("healthandeducationcess") || clean.includes("cess(4%)")) {
    return "cess";
  }
  if (clean.includes("nettax") || clean.includes("nettaxliability") || clean.includes("taxliability") || clean.includes("nettaxpayable") || clean.includes("totaltaxliability")) {
    return "netTax";
  }
  if (clean.includes("taxsavings") || clean.includes("savings") || clean.includes("netsavings")) {
    return "taxSavings";
  }
  if (clean.includes("carryforwardallowed")) {
    return "carryForwardAllowed";
  }
  if (clean.includes("lossbeforesetoff") || clean.includes("housepropertylossbeforesetoff")) {
    return "housePropertyLossBeforeSetOff";
  }
  if (clean.includes("losssetoff") || clean.includes("housepropertylosssetoff")) {
    return "housePropertyLossSetOff";
  }
  if (clean.includes("losscarryforward") || clean.includes("housepropertylosscarryforward") || clean.includes("carryforwardhousepropertyloss")) {
    return "housePropertyLossCarryForward";
  }
  if (clean.includes("losslapsed") || clean.includes("housepropertylosslapsed") || clean.includes("lapsedhousepropertyloss")) {
    return "housePropertyLossLapsed";
  }
  
  return null;
}

export function validateAndCorrectText(text: string, toolResults: any[]): string {
  if (!toolResults || !Array.isArray(toolResults) || toolResults.length === 0) {
    return text;
  }

  // Find tax calculator result (either nested in execution or raw result)
  const calcTool = toolResults.find(
    (r: any) => r.toolName === "tax_slab_calculator"
  );
  
  const calcResult = calcTool?.result;

  if (!calcResult || !calcResult.success || !calcResult.calculation) {
    return text;
  }

  const calc = calcResult.calculation;
  const oldRegime = calc.oldRegime;
  const newRegime = calc.newRegime;

  let lines = text.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Identify markdown table rows
    if (line.startsWith("|") && line.endsWith("|")) {
      const cells = line.split("|").map(c => c.trim());
      // Skip header divider like |:---|:---| or header columns
      if (line.includes("---") || line.includes(":-") || cells[1].toLowerCase().includes("item") || cells[1].toLowerCase().includes("particulars")) {
        continue;
      }
      
      // If we have at least 4 items (empty, label, old, new, empty)
      if (cells.length >= 4) {
        const label = cells[1];
        const key = getLabelKey(label);

        if (key) {
          if (key === "taxSavings") {
            const correctVal = formatINR(calc.taxSavings);
            for (let j = 2; j < cells.length - 1; j++) {
              if (/\d+/.test(cells[j])) {
                cells[j] = cells[j].replace(/₹?\s*[\d,]+/g, correctVal);
              }
            }
          } else {
            let correctOld = "";
            let correctNew = "";

            if (key === "carryForwardAllowed") {
              correctOld = oldRegime.carryForwardAllowed ? "Yes" : "No";
              correctNew = newRegime.carryForwardAllowed ? "Yes" : "No";
            } else {
              correctOld = formatINR(oldRegime[key] ?? 0);
              correctNew = formatINR(newRegime[key] ?? 0);
            }

            // Replace old regime cell (index 2)
            if (key === "carryForwardAllowed") {
              cells[2] = correctOld;
            } else if (/\d+/.test(cells[2])) {
              cells[2] = cells[2].replace(/₹?\s*[\d,]+/g, correctOld);
            } else if (cells[2] === "" || cells[2] === "-" || cells[2] === "N/A" || cells[2] === "Not Allowed") {
              // Leave as is
            } else {
              cells[2] = correctOld;
            }

            // Replace new regime cell (index 3)
            if (key === "carryForwardAllowed") {
              cells[3] = correctNew;
            } else if (/\d+/.test(cells[3])) {
              cells[3] = cells[3].replace(/₹?\s*[\d,]+/g, correctNew);
            } else if (cells[3] === "" || cells[3] === "-" || cells[3] === "N/A" || cells[3] === "Not Allowed") {
              // Leave as is
            } else {
              cells[3] = correctNew;
            }
          }

          // Reconstruct line
          lines[i] = cells.join(" | ").trim();
        }
      }
    }
  }

  let correctedText = lines.join("\n");

  // --- Prose Correction ---
  // 1. Correct Tax Savings in prose (e.g. "savings of ₹46,800")
  const savingsRegex = /(savings|save|saved|tax savings)[^\d\n]*₹?\s*[\d,]+/gi;
  correctedText = correctedText.replace(savingsRegex, (match) => {
    const prefix = match.match(/^(savings|save|saved|tax savings)[^\d\n]*/i)?.[0] || "";
    return prefix + formatINR(calc.taxSavings);
  });

  // 2. Correct Old Regime Net Tax in prose
  const oldNetTaxRegex = /(old regime|old tax regime)[^\n]*?(net tax|tax liability|tax payable)[^\n]*?₹?\s*[\d,]+/gi;
  correctedText = correctedText.replace(oldNetTaxRegex, (match) => {
    const prefix = match.match(/^(old regime|old tax regime)[^\n]*?(net tax|tax liability|tax payable)[^\n]*?₹?\s*/i)?.[0] || "";
    return prefix + formatINR(oldRegime.netTax);
  });

  // 3. Correct New Regime Net Tax in prose
  const newNetTaxRegex = /(new regime|new tax regime)[^\n]*?(net tax|tax liability|tax payable)[^\n]*?₹?\s*[\d,]+/gi;
  correctedText = correctedText.replace(newNetTaxRegex, (match) => {
    const prefix = match.match(/^(new regime|new tax regime)[^\n]*?(net tax|tax liability|tax payable)[^\n]*?₹?\s*/i)?.[0] || "";
    return prefix + formatINR(newRegime.netTax);
  });

  return correctedText;
}

export function checkDiscrepancies(
  text: string,
  toolResults: any[]
): { isValid: boolean; errorFeedback: string | null; correctedText: string } {
  if (!toolResults || !Array.isArray(toolResults) || toolResults.length === 0) {
    return { isValid: true, errorFeedback: null, correctedText: text };
  }

  // Strict Policy Check for New Regime House Property Loss
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const calcTool = toolResults.find((r: any) => r.toolName === "tax_slab_calculator");
  const calcResult = calcTool?.result;
  if (calcResult?.success && calcResult?.calculation) {
    const newRegime = calcResult.calculation.newRegime;
    if (newRegime.housePropertyLossBeforeSetOff > 0) {
      const lowerText = text.toLowerCase();
      const canCarryForwardRegex = /(?:can|allows?|allowed|may|is possible)\s+(?:be\s+)?(?:carry|carried)\s+forward/i;
      const isNewRegimeContext = lowerText.includes("new regime") || lowerText.includes("new tax regime") || lowerText.includes("115bac");
      const isCarryForwardMentioned = lowerText.includes("carry forward") || lowerText.includes("carried forward");
      const claimsCarryForwardNewRegime = isNewRegimeContext && isCarryForwardMentioned && canCarryForwardRegex.test(text);

      if (claimsCarryForwardNewRegime) {
        return {
          isValid: false,
          errorFeedback: `Policy Violation: Under the New Tax Regime (Section 115BAC), any loss under the head 'Income from House Property' lapses entirely and cannot be carried forward. Your response suggests that carrying forward the loss is allowed under the New Regime. Please correct this and state clearly that the house property loss lapses entirely.`,
          correctedText: text
        };
      }
    }
  }

  const correctedText = validateAndCorrectText(text, toolResults);
  if (correctedText.trim() === text.trim()) {
    return { isValid: true, errorFeedback: null, correctedText };
  }

  // Find exact lines where they differ
  const originalLines = text.split("\n");
  const correctedLines = correctedText.split("\n");
  const diffs: string[] = [];

  for (let i = 0; i < Math.min(originalLines.length, correctedLines.length); i++) {
    if (originalLines[i].trim() !== correctedLines[i].trim()) {
      diffs.push(`- Expected line: "${correctedLines[i].trim()}"\n  But your generated response wrote: "${originalLines[i].trim()}"`);
    }
  }

  const feedback = `Error: Your generated response has tax calculations or formatting that deviates from the calculator tool's official results.
Please review the discrepancies below, correct your prose and tables, and regenerate the entire response matching the expected values exactly.

Discrepancies found:
${diffs.slice(0, 5).join("\n")}

Please ensure standard deductions, HRA exemptions, tax rebates, cess, and net tax liabilities match the calculator outputs exactly.`;

  return {
    isValid: false,
    errorFeedback: feedback,
    correctedText
  };
}
