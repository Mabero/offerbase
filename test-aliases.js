// Test script to verify alias generation quality
// Run with: node test-aliases.js

const { generateSmartAliases } = require('./lib/alias-generator.ts');

const testCases = [
  // E-commerce products
  "IVISKIN G4 IPL Hair-Removal Device - Professional Grade",
  "IVISKIN G3 Laser Treatment System",
  "iPhone 15 Pro Max - 256GB (Space Gray)",
  "Samsung Galaxy S24 Ultra 5G - Titanium Black",
  "Sony WH-1000XM5 Wireless Noise-Canceling Headphones",
  
  // Medical/Health services
  "Deep Tissue Massage (60 min) - Therapeutic",
  "Chiropractic Adjustment - Full Spine",
  "Acupuncture Session - 45 minutes",
  "Physical Therapy Evaluation (Initial Visit)",
  "CBD Oil 1000mg - Full Spectrum",
  
  // Professional services
  "Tax Consultation - Small Business (1hr Session)",
  "WordPress Website Development (5 Pages)",
  "SEO Audit & Strategy Session - 2 Hours",
  "Logo Design Package - 3 Concepts",
  
  // Courses/Education
  "JavaScript Masterclass 2024: From Zero to Hero",
  "Python for Data Science - Complete Bootcamp",
  "Digital Marketing Course (Beginner-Friendly)",
  "Photography Workshop: Portrait Lighting Techniques",
  
  // Gaming/Entertainment
  "PlayStation 5 - Digital Edition Bundle",
  "Xbox Series-X Gaming Console Bundle",
  "Nintendo Switch OLED - Pokemon Edition",
  "Steam Deck 512GB - Valve Handheld",
  
  // Fitness/Wellness
  "Yoga Class - Beginners (90 minutes)",
  "CrossFit Training Session - Group Class",
  "Personal Training Package - 10 Sessions",
  "Nutrition Consultation & Meal Plan",
  
  // Complex titles with various separators
  "Product-Name | Feature: Description (Version 2.0) - Premium",
  "Service/Package - Type, Duration & Benefits [2024 Edition]",
  "Item-With-Hyphens_And_Underscores - Rev-B (Mark-II)",
];

console.log("=" . repeat(80));
console.log("ALIAS GENERATION TEST RESULTS");
console.log("=" . repeat(80));

testCases.forEach((title, index) => {
  const aliases = generateSmartAliases(title);
  
  console.log(`\n[${index + 1}] Original: "${title}"`);
  console.log(`    Generated ${aliases.length} aliases:`);
  
  aliases.forEach((alias, i) => {
    console.log(`    ${i + 1}. "${alias}"`);
  });
  
  if (aliases.length === 0) {
    console.log(`    ⚠️  WARNING: No aliases generated!`);
  }
});

// Special test for G3 vs G4 differentiation
console.log("\n" + "=" . repeat(80));
console.log("CRITICAL TEST: G3 vs G4 Product Differentiation");
console.log("=" . repeat(80));

const g3Product = "IVISKIN G3 IPL Hair Removal Device";
const g4Product = "IVISKIN G4 IPL Hair Removal Device";

const g3Aliases = generateSmartAliases(g3Product);
const g4Aliases = generateSmartAliases(g4Product);

console.log(`\nG3 Product: "${g3Product}"`);
console.log("Aliases:", g3Aliases);

console.log(`\nG4 Product: "${g4Product}"`);
console.log("Aliases:", g4Aliases);

// Check if G3 and G4 are properly differentiated
const g3HasG3 = g3Aliases.some(a => a.includes('G3'));
const g3HasG4 = g3Aliases.some(a => a.includes('G4'));
const g4HasG4 = g4Aliases.some(a => a.includes('G4'));
const g4HasG3 = g4Aliases.some(a => a.includes('G3'));

console.log("\nValidation:");
console.log(`✅ G3 product has G3 alias: ${g3HasG3}`);
console.log(`✅ G3 product does NOT have G4 alias: ${!g3HasG4}`);
console.log(`✅ G4 product has G4 alias: ${g4HasG4}`);
console.log(`✅ G4 product does NOT have G3 alias: ${!g4HasG3}`);

if (g3HasG3 && !g3HasG4 && g4HasG4 && !g4HasG3) {
  console.log("\n🎉 SUCCESS: G3 and G4 products are properly differentiated!");
} else {
  console.log("\n❌ FAILURE: G3 and G4 products are NOT properly differentiated!");
}