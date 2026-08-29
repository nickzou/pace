import { describe, expect, it } from "vitest"
import { isPasswordValid, PASSWORD_MIN_LENGTH, passwordChecks } from "./password"

const ok = (key: string, pw: string) => passwordChecks(pw).find((c) => c.key === key)?.ok

describe("password policy", () => {
  it("accepts a password meeting all rules", () => {
    expect(isPasswordValid("Supersecret123!")).toBe(true)
  })

  it("requires the minimum length", () => {
    expect(PASSWORD_MIN_LENGTH).toBe(10)
    expect(isPasswordValid("Ab1!aB2@")).toBe(false) // 8 chars — has all classes but too short
    expect(ok("length", "Ab1!aB2@")).toBe(false)
    expect(ok("length", "Abcdefg1!X")).toBe(true) // 10 chars
  })

  it("requires each character class", () => {
    expect(isPasswordValid("supersecret123!")).toBe(false) // no uppercase
    expect(isPasswordValid("SUPERSECRET123!")).toBe(false) // no lowercase
    expect(isPasswordValid("Supersecret!!!!")).toBe(false) // no number
    expect(isPasswordValid("Supersecret1234")).toBe(false) // no symbol
  })

  it("reports per-rule results for the checklist", () => {
    const checks = passwordChecks("supersecret")
    expect(checks.map((c) => c.key)).toEqual(["length", "upper", "lower", "number", "symbol"])
    expect(ok("lower", "supersecret")).toBe(true)
    expect(ok("upper", "supersecret")).toBe(false)
    expect(ok("number", "supersecret")).toBe(false)
    expect(ok("symbol", "supersecret")).toBe(false)
  })
})
