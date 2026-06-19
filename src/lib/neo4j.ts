import neo4j, { Driver, Session } from "neo4j-driver";

export interface GraphRelationship {
  source: string;
  target: string;
  type: string;
  description: string;
  applicable_ay?: string; // e.g. "2024-25", "2025-26", or "all"
}

// Static in-memory representation of the tax knowledge graph for offline/mock mode
const STATIC_GRAPH: GraphRelationship[] = [
  // Regimes and their allowed/disallowed deductions/exemptions
  { source: "Old Regime", target: "Section 80C", type: "ALLOWS", description: "Old Regime allows Chapter VI-A investment deductions up to ₹1,50,000" },
  { source: "Old Regime", target: "Section 80D", type: "ALLOWS", description: "Old Regime allows medical insurance premium deductions (up to ₹25k/₹50k)" },
  { source: "Old Regime", target: "Section 24(b)", type: "ALLOWS", description: "Old Regime allows home loan interest deduction up to ₹2,00,000 for self-occupied properties" },
  { source: "Old Regime", target: "Section 10(13A)", type: "ALLOWS", description: "Old Regime allows House Rent Allowance (HRA) exemption" },
  { source: "Old Regime", target: "Section 87A", type: "ALLOWS", description: "Old Regime allows tax rebate up to ₹12,500 for income up to ₹5,00,000" },

  { source: "New Regime", target: "Section 115BAC", type: "GOVERNED_BY", description: "New Tax Regime is governed as default under Section 115BAC" },
  { source: "New Regime", target: "Section 80C", type: "DISALLOWS", description: "New Regime disallows Section 80C investment deductions" },
  { source: "New Regime", target: "Section 80D", type: "DISALLOWS", description: "New Regime disallows Section 80D health insurance deductions" },
  { source: "New Regime", target: "Section 24(b)", type: "DISALLOWS", description: "New Regime disallows home loan interest deduction for self-occupied properties (allowed only for let-out)" },
  { source: "New Regime", target: "Section 10(13A)", type: "DISALLOWS", description: "New Regime disallows House Rent Allowance (HRA) exemptions" },
  { source: "New Regime", target: "Section 87A", type: "ALLOWS", description: "New Regime allows tax rebate up to ₹25,000 for taxable income up to ₹7,00,000 in AY 2024-25", applicable_ay: "2024-25" },
  { source: "New Regime", target: "Section 87A", type: "ALLOWS", description: "New Regime allows tax rebate up to ₹20,000 for taxable income up to ₹7,00,000 in AY 2025-26", applicable_ay: "2025-26" },
  { source: "New Regime", target: "Standard Deduction", type: "ALLOWS", description: "New Regime allows standard deduction of ₹50,000 in AY 2024-25", applicable_ay: "2024-25" },
  { source: "New Regime", target: "Standard Deduction", type: "ALLOWS", description: "New Regime allows standard deduction of ₹75,000 in AY 2025-26", applicable_ay: "2025-26" },

  // Section 80C eligible investments
  { source: "Section 80C", target: "PPF (Public Provident Fund)", type: "INCLUDES", description: "PPF investments qualify for Section 80C deduction" },
  { source: "Section 80C", target: "ELSS (Equity Linked Savings Scheme)", type: "INCLUDES", description: "ELSS mutual funds qualify for Section 80C deduction" },
  { source: "Section 80C", target: "EPF (Employee Provident Fund)", type: "INCLUDES", description: "EPF contributions qualify for Section 80C deduction" },
  { source: "Section 80C", target: "NSC (National Savings Certificate)", type: "INCLUDES", description: "NSC investment qualifies for Section 80C deduction" },
  { source: "Section 80C", target: "SSY (Sukanya Samriddhi Yojana)", type: "INCLUDES", description: "SSY deposits qualify for Section 80C deduction" },
  { source: "Section 80C", target: "Home Loan Principal", type: "INCLUDES", description: "Home loan principal repayment is deductible under Section 80C" },

  // Presumptive Taxation Schemes
  { source: "Section 44AD", target: "Business Income", type: "APPLIES_TO", description: "Section 44AD offers presumptive taxation for businesses with turnover up to ₹2 Cr (or ₹3 Cr for cash receipts ≤ 5%)" },
  { source: "Section 44ADA", target: "Professional Income", type: "APPLIES_TO", description: "Section 44ADA offers presumptive taxation for specified professionals with gross receipts up to ₹50L (or ₹75L for cash receipts ≤ 5%)" },
  { source: "Section 44AD", target: "Section 44AA", type: "EXEMPTS", description: "Section 44AD exempts business owners from maintaining books of accounts under Section 44AA" },
  { source: "Section 44ADA", target: "Section 44AA", type: "EXEMPTS", description: "Section 44ADA exempts professionals from maintaining books of accounts under Section 44AA" },

  // Capital Gains
  { source: "Section 111A", target: "Short-Term Capital Gains (STCG)", type: "APPLIES_TO", description: "Section 111A taxes STCG on listed equity/equity mutual funds at 20% (w.e.f. July 23, 2024)" },
  { source: "Section 112A", target: "Long-Term Capital Gains (LTCG)", type: "APPLIES_TO", description: "Section 112A taxes LTCG on listed equity/equity mutual funds at 12.5% above ₹1.25L exemption (w.e.f. July 23, 2024)" },

  // TDS and relationships
  { source: "Section 192", target: "Salary Income", type: "APPLIES_TO", description: "TDS under Section 192 applies to salary payments based on individual slab rates" },
  { source: "Section 194C", target: "Contractor Payments", type: "APPLIES_TO", description: "TDS on contractor payments (1% for individuals/HUFs, 2% for others)" },
  { source: "Section 194J", target: "Professional Fees", type: "APPLIES_TO", description: "TDS on professional fees is 10% standard (2% for technical/royalty)" },
  { source: "Section 194I", target: "Rent Payments", type: "APPLIES_TO", description: "TDS on rent is 10% for buildings/land and 2% for machinery (threshold ₹2,40,000/year)" },

  { source: "Section 194C", target: "Section 44AD", type: "RELATED", description: "Presumptive business income (44AD) is often subject to contractor TDS (194C) by payers" },
  { source: "Section 194J", target: "Section 44ADA", type: "RELATED", description: "Presumptive professional income (44ADA) is often subject to professional TDS (194J) at 10% or 2%" },
  { source: "Section 194I", target: "Section 10(13A)", type: "RELATED", description: "TDS on rent (194I) is triggered above ₹2.4L/year, relevant for HRA exemption (10(13A)) claims" },
  { source: "Section 194I", target: "Section 24(b)", type: "RELATED", description: "Rental income triggers TDS (194I), which is related to home loan interest deductions on let-out properties (24(b))" }
];

let driver: Driver | null = null;
let isMockMode = false;

// Initialize driver connection
const getDriver = (): Driver | null => {
  if (driver) return driver;

  const uri = process.env.NEO4J_URI;
  const username = process.env.NEO4J_USERNAME;
  const password = process.env.NEO4J_PASSWORD;

  const isMockKey = !uri || uri.includes("mock-neo4j") || password === "mock-neo4j-password" || uri.startsWith("mock://");

  if (isMockKey) {
    isMockMode = true;
    console.log("Neo4j client running in Mock Mode (using in-memory relationship graph).");
    return null;
  }

  try {
    driver = neo4j.driver(uri, neo4j.auth.basic(username || "", password || ""));
    return driver;
  } catch (error) {
    console.warn("Failed to initialize Neo4j driver, falling back to mock mode:", error);
    isMockMode = true;
    return null;
  }
};

// Verify Neo4j connection (called during startup/seeding)
export async function verifyNeo4jConnection(): Promise<boolean> {
  const currentDriver = getDriver();
  if (isMockMode || !currentDriver) {
    return false;
  }

  try {
    await currentDriver.verifyConnectivity();
    console.log("Successfully connected to Neo4j database.");
    return true;
  } catch (error) {
    console.warn("Neo4j connectivity verification failed. Falling back to Mock Mode.", error);
    isMockMode = true;
    return false;
  }
}

// Normalize section strings to search matches (e.g. "Section 80C" -> "80c")
function normalizeKey(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Regex to extract tax sections from queries
// Regex to extract tax sections from queries
export function extractTaxSections(text: string): string[] {
  const patterns = [
    /80C/i, /80D/i, /24\(?b\)?/i, /10\(?13A\)?/i, /44AD/i, /44ADA/i, 
    /111A/i, /112A/i, /192/i, /194C/i, /194J/i, /194I/i, /194DA/i, 
    /87A/i, /115BAC/i
  ];
  
  const matches: string[] = [];
  const normalizedText = normalizeKey(text);

  // Standard terms mapping
  const termsMap: Record<string, string> = {
    "80c": "Section 80C",
    "80d": "Section 80D",
    "24b": "Section 24(b)",
    "1013a": "Section 10(13A)",
    "44ad": "Section 44AD",
    "44ada": "Section 44ADA",
    "111a": "Section 111A",
    "112a": "Section 112A",
    "192": "Section 192",
    "194c": "Section 194C",
    "194j": "Section 194J",
    "194i": "Section 194I",
    "194da": "Section 194DA",
    "87a": "Section 87A",
    "115bac": "Section 115BAC"
  };

  // Additional colloquial matches
  if (text.toLowerCase().includes("ppf") || text.toLowerCase().includes("elss") || text.toLowerCase().includes("lic")) {
    matches.push("Section 80C");
  }
  if (text.toLowerCase().includes("health insurance") || text.toLowerCase().includes("medical")) {
    matches.push("Section 80D");
  }
  
  const lowerText = text.toLowerCase();
  if (
    lowerText.includes("home loan interest") ||
    lowerText.includes("house loan") ||
    lowerText.includes("rented property loan") ||
    lowerText.includes("rental property loan") ||
    lowerText.includes("let-out property loan") ||
    lowerText.includes("loan on rented property") ||
    lowerText.includes("house property") ||
    lowerText.includes("rented property") ||
    lowerText.includes("rental property") ||
    lowerText.includes("income from house property")
  ) {
    matches.push("Section 24(b)");
  }
  if (text.toLowerCase().includes("hra") || text.toLowerCase().includes("house rent allowance")) {
    matches.push("Section 10(13A)");
  }
  if (text.toLowerCase().includes("presumptive business") || text.toLowerCase().includes("business profit")) {
    matches.push("Section 44AD");
  }
  if (text.toLowerCase().includes("presumptive professional") || text.toLowerCase().includes("consultant")) {
    matches.push("Section 44ADA");
  }
  if (text.toLowerCase().includes("capital gains") || text.toLowerCase().includes("stcg") || text.toLowerCase().includes("ltcg")) {
    matches.push("Section 111A");
    matches.push("Section 112A");
  }
  if (text.toLowerCase().includes("contractor")) {
    matches.push("Section 194C");
  }
  if (text.toLowerCase().includes("professional tds") || text.toLowerCase().includes("technical services")) {
    matches.push("Section 194J");
  }
  if (text.toLowerCase().includes("tds on rent") || text.toLowerCase().includes("rent tds") || text.toLowerCase().includes("income from house property")) {
    matches.push("Section 194I");
  }

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const norm = normalizeKey(match[0]);
      if (termsMap[norm]) {
        matches.push(termsMap[norm]);
      }
    }
  }

  return Array.from(new Set(matches));
}

// Fetch related tax relationships from Neo4j (or mock in-memory database)
export async function getRelatedTaxRelationships(queryText: string, assessmentYear: string = "AY 2025-26"): Promise<GraphRelationship[]> {
  const detectedSections = extractTaxSections(queryText);
  if (detectedSections.length === 0) {
    return [];
  }

  const aySuffix = assessmentYear.replace("AY ", ""); // "2025-26" or "2024-25"

  const currentDriver = getDriver();
  if (isMockMode || !currentDriver) {
    // Mock Retrieval: Filter mock graph relationships matching detected sections and AY
    const normalizedDetected = detectedSections.map(s => normalizeKey(s));
    return STATIC_GRAPH.filter(rel => {
      const normSource = normalizeKey(rel.source);
      const normTarget = normalizeKey(rel.target);
      const matchesSections = (
        normalizedDetected.some(d => normSource.includes(d) || d.includes(normSource)) ||
        normalizedDetected.some(d => normTarget.includes(d) || d.includes(normTarget))
      );
      const matchesAY = !rel.applicable_ay || rel.applicable_ay === "all" || rel.applicable_ay === aySuffix;
      return matchesSections && matchesAY;
    });
  }

  // Real Neo4j database retrieval
  const session: Session = currentDriver.session();
  try {
    const result = await session.run(
      `
      MATCH (n)-[r:ALLOWS|DISALLOWS|INCLUDES|APPLIES_TO|RELATED|GOVERNED_BY|EXEMPTS]-(m)
      WHERE (n.name IN $sectionNames OR m.name IN $sectionNames)
        AND (r.applicable_ay IS NULL OR r.applicable_ay = $aySuffix OR r.applicable_ay = 'all')
      RETURN n.name AS source, m.name AS target, type(r) AS type, r.description AS description, r.applicable_ay AS applicable_ay
      LIMIT 15
      `,
      { sectionNames: detectedSections, aySuffix }
    );

    return result.records.map(record => ({
      source: record.get("source"),
      target: record.get("target"),
      type: record.get("type"),
      description: record.get("description"),
      applicable_ay: record.get("applicable_ay"),
    }));
  } catch (err) {
    console.error("Failed to query Neo4j relationships, falling back to mock:", err);
    isMockMode = true;
    // Fallback on query failure
    const normalizedDetected = detectedSections.map(s => normalizeKey(s));
    return STATIC_GRAPH.filter(rel => {
      const normSource = normalizeKey(rel.source);
      const normTarget = normalizeKey(rel.target);
      const matchesSections = (
        normalizedDetected.some(d => normSource.includes(d) || d.includes(normSource)) ||
        normalizedDetected.some(d => normTarget.includes(d) || d.includes(normTarget))
      );
      const matchesAY = !rel.applicable_ay || rel.applicable_ay === "all" || rel.applicable_ay === aySuffix;
      return matchesSections && matchesAY;
    });
  } finally {
    await session.close();
  }
}

// Formats graph relationships into descriptive text to inject into LLM system context
export function formatGraphRelationships(relationships: GraphRelationship[]): string {
  if (relationships.length === 0) return "";
  
  const bulletPoints = relationships.map(
    (rel) => `- **${rel.source}** -[${rel.type}]-> **${rel.target}**: ${rel.description}`
  );
  
  return `### Tax Knowledge Graph Relationships:\n${bulletPoints.join("\n")}`;
}

// Close Neo4j driver connection
export async function closeNeo4j() {
  if (driver) {
    await driver.close();
    driver = null;
  }
}
