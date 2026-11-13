#!/usr/bin/env bun
import { createOmoJsonSchema } from "./build-omc-schema-document"

const SCHEMA_OUTPUT_PATH = "assets/omc.schema.json"

async function main() {
  console.log("Generating omc JSON Schema...")

  const finalSchema = createOmoJsonSchema()
  await Bun.write(SCHEMA_OUTPUT_PATH, JSON.stringify(finalSchema, null, 2))

  console.log(`✓ omc JSON Schema generated: ${SCHEMA_OUTPUT_PATH}`)
}

main()
