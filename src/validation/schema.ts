import AjvModule from "ajv"
import type { ValidateFunction } from "ajv"
import type { ResolvedConfig } from "../config/types.js"

const Ajv = AjvModule.default ?? AjvModule

const BASE_SCHEMA: Record<string, unknown> = {
  type: "object",
  required: [],
  additionalProperties: true,
}

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

export class SchemaValidator {
  private ajv: InstanceType<typeof Ajv>
  private validators: Map<string, ValidateFunction> = new Map()

  constructor(private config: ResolvedConfig) {
    this.ajv = new Ajv({ allErrors: true, strict: false })
    this.compile()
  }

  private compile(): void {
    for (const [name, resolved] of this.config.sections) {
      const schema = resolved.config.schema ?? BASE_SCHEMA
      try {
        const validate = this.ajv.compile(schema)
        this.validators.set(name, validate)
      } catch (e) {
        throw new Error(`Invalid schema for section '${name}': ${(e as Error).message}`)
      }
    }
  }

  validate(sectionName: string, data: unknown): ValidationResult {
    const validate = this.validators.get(sectionName)
    if (!validate) return { valid: true, errors: [] }

    const valid = validate(data) as boolean

    if (!valid) {
      const errors = (validate.errors ?? []).map((e) => {
        const field = e.instancePath ? e.instancePath.replace(/^\//, "") : "root"
        return `${field}: ${e.message}`
      })
      return { valid: false, errors }
    }

    return { valid: true, errors: [] }
  }

  hasSchema(sectionName: string): boolean {
    const resolved = this.config.sections.get(sectionName)
    return !!resolved?.config.schema
  }
}