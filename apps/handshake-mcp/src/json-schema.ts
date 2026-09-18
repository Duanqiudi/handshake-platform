export interface JsonSchema {
  readonly type?: "object" | "array" | "string" | "boolean" | "integer";
  readonly description?: string;
  readonly properties?: Readonly<Record<string, JsonSchema>>;
  readonly required?: readonly string[];
  readonly additionalProperties?: boolean;
  readonly items?: JsonSchema;
  readonly minItems?: number;
  readonly maxItems?: number;
  readonly uniqueItems?: boolean;
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly pattern?: string;
  readonly format?: "date" | "date-time";
  readonly enum?: readonly (string | boolean)[];
  readonly const?: string | boolean;
  readonly minimum?: number;
  readonly maximum?: number;
}

export class ToolInputError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "ToolInputError";
  }
}

export function validateToolInput(
  schema: JsonSchema,
  value: unknown,
): asserts value is Record<string, unknown> {
  const errors: string[] = [];
  validate(schema, value, "$", errors);
  if (errors.length > 0) {
    throw new ToolInputError(`Invalid tool input: ${errors.slice(0, 5).join("; ")}`);
  }
}

function validate(schema: JsonSchema, value: unknown, path: string, errors: string[]): void {
  if (errors.length >= 5) return;
  if (schema.type === "object") {
    validateObject(schema, value, path, errors);
    return;
  }
  if (schema.type === "array") {
    validateArray(schema, value, path, errors);
    return;
  }
  if (schema.type === "string") {
    validateString(schema, value, path, errors);
    return;
  }
  if (schema.type === "boolean") {
    if (typeof value !== "boolean") errors.push(`${path} must be a boolean`);
    else validateConstOrEnum(schema, value, path, errors);
    return;
  }
  if (schema.type === "integer") {
    if (!Number.isSafeInteger(value)) {
      errors.push(`${path} must be an integer`);
      return;
    }
    const integer = value as number;
    if (schema.minimum !== undefined && integer < schema.minimum)
      errors.push(`${path} is too small`);
    if (schema.maximum !== undefined && integer > schema.maximum)
      errors.push(`${path} is too large`);
  }
}

function validateObject(schema: JsonSchema, value: unknown, path: string, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object`);
    return;
  }
  const properties = schema.properties ?? {};
  for (const required of schema.required ?? []) {
    if (!Object.hasOwn(value, required)) errors.push(`${path}.${required} is required`);
  }
  if (schema.additionalProperties === false) {
    for (const key of Object.keys(value)) {
      if (!Object.hasOwn(properties, key)) errors.push(`${path}.${key} is not allowed`);
    }
  }
  for (const [key, childSchema] of Object.entries(properties)) {
    if (Object.hasOwn(value, key)) validate(childSchema, value[key], `${path}.${key}`, errors);
  }
}

function validateArray(schema: JsonSchema, value: unknown, path: string, errors: string[]): void {
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array`);
    return;
  }
  if (schema.minItems !== undefined && value.length < schema.minItems)
    errors.push(`${path} has too few items`);
  if (schema.maxItems !== undefined && value.length > schema.maxItems)
    errors.push(`${path} has too many items`);
  if (schema.uniqueItems === true && new Set(value.map(stableValue)).size !== value.length) {
    errors.push(`${path} must contain unique items`);
  }
  if (schema.items !== undefined) {
    value.forEach((item, index) => {
      validate(schema.items as JsonSchema, item, `${path}[${index}]`, errors);
    });
  }
}

function validateString(schema: JsonSchema, value: unknown, path: string, errors: string[]): void {
  if (typeof value !== "string") {
    errors.push(`${path} must be a string`);
    return;
  }
  if (schema.minLength !== undefined && value.trim().length < schema.minLength)
    errors.push(`${path} is too short`);
  if (schema.maxLength !== undefined && value.length > schema.maxLength)
    errors.push(`${path} is too long`);
  if (schema.pattern !== undefined && !new RegExp(schema.pattern, "u").test(value))
    errors.push(`${path} has an invalid format`);
  if (schema.format === "date" && !isIsoDate(value))
    errors.push(`${path} must be an ISO date (YYYY-MM-DD)`);
  if (schema.format === "date-time" && !isIsoDateTime(value))
    errors.push(`${path} must be an ISO date-time`);
  validateConstOrEnum(schema, value, path, errors);
}

function validateConstOrEnum(
  schema: JsonSchema,
  value: string | boolean,
  path: string,
  errors: string[],
): void {
  if (schema.const !== undefined && value !== schema.const)
    errors.push(`${path} must equal ${String(schema.const)}`);
  if (schema.enum !== undefined && !schema.enum.includes(value))
    errors.push(`${path} has an unsupported value`);
}

function stableValue(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().startsWith(value);
}

function isIsoDateTime(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value))
    return false;
  return !Number.isNaN(Date.parse(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
