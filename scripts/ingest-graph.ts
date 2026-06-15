import { verifyNeo4jConnection, closeNeo4j } from "../src/lib/neo4j";
import neo4j from "neo4j-driver";

const RELATIONSHIPS = [
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
  { source: "New Regime", target: "Section 87A", type: "ALLOWS", description: "New Regime allows tax rebate up to ₹20,000 for income up to ₹7,00,000" },

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

async function run() {
  console.log("Checking Neo4j connection status...");
  const isConnected = await verifyNeo4jConnection();
  
  if (!isConnected) {
    console.log("\nSkipping live Neo4j database ingestion: running in offline Mock Mode.");
    console.log("The system will use the in-memory relationship graph successfully.");
    return;
  }

  console.log("Initializing Neo4j session...");
  const uri = process.env.NEO4J_URI || "";
  const username = process.env.NEO4J_USERNAME || "";
  const password = process.env.NEO4J_PASSWORD || "";
  
  const driver = neo4j.driver(uri, neo4j.auth.basic(username, password));
  const session = driver.session();

  try {
    console.log("Cleaning up existing nodes and relationships...");
    await session.run("MATCH (n) DETACH DELETE n");
    console.log("Database cleared.");

    console.log(`Ingesting ${RELATIONSHIPS.length} relationships...`);
    for (const rel of RELATIONSHIPS) {
      console.log(`- Creating: (${rel.source}) -[:${rel.type}]-> (${rel.target})`);
      
      // Dynamic query using parameters to prevent injection issues
      await session.run(
        `
        MERGE (s:TaxConcept {name: $source})
        MERGE (t:TaxConcept {name: $target})
        WITH s, t
        CREATE (s)-[r:${rel.type} {description: $description}]->(t)
        `,
        {
          source: rel.source,
          target: rel.target,
          description: rel.description
        }
      );
    }
    
    console.log("\nGraph seeding completed successfully!");
  } catch (err) {
    console.error("An error occurred during Neo4j ingestion:", err);
  } finally {
    await session.close();
    await driver.close();
    await closeNeo4j();
  }
}

run().catch(console.error);
