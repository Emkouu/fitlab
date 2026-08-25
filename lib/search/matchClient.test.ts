import { describe, it, expect } from "vitest";
import { matchesClientQuery } from "./matchClient";

const ivan = {
  name: "Иван Петров",
  phone: "+359888123456",
  email: "ivan@example.com",
};

describe("matchesClientQuery", () => {
  it("matches everything on an empty query", () => {
    expect(matchesClientQuery(ivan, "")).toBe(true);
    expect(matchesClientQuery(ivan, "   ")).toBe(true);
  });

  it("matches a name fragment, case-insensitively", () => {
    expect(matchesClientQuery(ivan, "петр")).toBe(true);
    expect(matchesClientQuery(ivan, "ИВАН")).toBe(true);
    expect(matchesClientQuery(ivan, "георги")).toBe(false);
  });

  it("matches an email fragment", () => {
    expect(matchesClientQuery(ivan, "ivan@")).toBe(true);
    expect(matchesClientQuery(ivan, "EXAMPLE.COM")).toBe(true);
  });

  it("matches a phone typed the local way against E.164", () => {
    expect(matchesClientQuery(ivan, "0888123456")).toBe(true);
    expect(matchesClientQuery(ivan, "0888 12 34 56")).toBe(true);
    expect(matchesClientQuery(ivan, "888123")).toBe(true);
    expect(matchesClientQuery(ivan, "+359888123456")).toBe(true);
    expect(matchesClientQuery(ivan, "123456")).toBe(true);
    expect(matchesClientQuery(ivan, "0777")).toBe(false);
  });

  it("does not treat a digit-bearing name query as a phone", () => {
    const withDigits = { name: "Иван 2", phone: "+359888123456", email: null };
    expect(matchesClientQuery(withDigits, "иван 2")).toBe(true);
  });

  it("survives missing fields", () => {
    expect(matchesClientQuery({ name: null, phone: null, email: null }, "x")).toBe(
      false,
    );
    expect(matchesClientQuery({ phone: "+359888123456" }, "0888")).toBe(true);
    expect(matchesClientQuery({ name: "Мария" }, "0888")).toBe(false);
  });
});
