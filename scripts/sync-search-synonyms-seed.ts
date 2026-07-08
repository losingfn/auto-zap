import { writeFileSync } from "node:fs";
import path from "node:path";
import { defaultSearchSynonyms } from "../src/config/search-synonyms";

const outputPath = path.resolve("db/seeds/003_search_synonyms.sql");

const values = defaultSearchSynonyms.map((synonym) =>
  tuple([
    synonym.source,
    synonym.targetTerms,
    synonym.isBidirectional ?? true
  ])
);

const contents = `WITH synonym_seed(source_term, target_terms, is_bidirectional) AS (
  VALUES
${values.join(",\n")}
)
INSERT INTO synonyms (source_term, target_terms, is_bidirectional, is_active)
SELECT source_term, target_terms, is_bidirectional, true
FROM synonym_seed
ON CONFLICT (source_term) DO UPDATE
SET
  target_terms = EXCLUDED.target_terms,
  is_bidirectional = EXCLUDED.is_bidirectional,
  is_active = true,
  updated_at = now();
`;

writeFileSync(outputPath, contents);
console.log(`Updated ${path.relative(process.cwd(), outputPath)}`);

function tuple(values: [string, string[], boolean]) {
  const [sourceTerm, targetTerms, isBidirectional] = values;
  return `    (${sqlString(sourceTerm)}, ARRAY[${targetTerms.map(sqlString).join(", ")}]::text[], ${isBidirectional})`;
}

function sqlString(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}
