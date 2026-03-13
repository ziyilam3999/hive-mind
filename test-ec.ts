import { toCase } from "./src/convert.ts";

// Test results
const results: { ec: string; status: string }[] = [];

// EC-01: toCase is exported as a function
try {
  if (typeof toCase !== "function") {
    results.push({ ec: "EC-01", status: "FAIL" });
  } else {
    results.push({ ec: "EC-01", status: "PASS" });
  }
} catch (e) {
  results.push({ ec: "EC-01", status: "FAIL" });
}

// EC-02: camelCase → snake_case
try {
  const r = toCase("helloWorld", "snake");
  results.push({ ec: "EC-02", status: r === "hello_world" ? "PASS" : "FAIL" });
} catch (e) {
  results.push({ ec: "EC-02", status: "FAIL" });
}

// EC-03: snake_case → camelCase
try {
  const r = toCase("hello_world", "camel");
  results.push({ ec: "EC-03", status: r === "helloWorld" ? "PASS" : "FAIL" });
} catch (e) {
  results.push({ ec: "EC-03", status: "FAIL" });
}

// EC-04: kebab-case → snake_case
try {
  const r = toCase("hello-world", "snake");
  results.push({ ec: "EC-04", status: r === "hello_world" ? "PASS" : "FAIL" });
} catch (e) {
  results.push({ ec: "EC-04", status: "FAIL" });
}

// EC-05: preserveConsecutiveUppercase false
try {
  const r = toCase("HTMLParser", "snake", { preserveConsecutiveUppercase: false });
  results.push({ ec: "EC-05", status: r === "h_t_m_l_parser" ? "PASS" : "FAIL" });
} catch (e) {
  results.push({ ec: "EC-05", status: "FAIL" });
}

// EC-06: preserveConsecutiveUppercase true (snake)
try {
  const r = toCase("HTMLParser", "snake", { preserveConsecutiveUppercase: true });
  results.push({ ec: "EC-06", status: r === "html_parser" ? "PASS" : "FAIL" });
} catch (e) {
  results.push({ ec: "EC-06", status: "FAIL" });
}

// EC-07: preserveConsecutiveUppercase true (kebab)
try {
  const r = toCase("HTMLParser", "kebab", { preserveConsecutiveUppercase: true });
  results.push({ ec: "EC-07", status: r === "html-parser" ? "PASS" : "FAIL" });
} catch (e) {
  results.push({ ec: "EC-07", status: "FAIL" });
}

// EC-08: preserveConsecutiveUppercase true (camel)
try {
  const r = toCase("HTMLParser", "camel", { preserveConsecutiveUppercase: true });
  results.push({ ec: "EC-08", status: r === "htmlParser" ? "PASS" : "FAIL" });
} catch (e) {
  results.push({ ec: "EC-08", status: "FAIL" });
}

// EC-09: Empty string input returns empty string
try {
  const r = toCase("", "snake");
  results.push({ ec: "EC-09", status: r === "" ? "PASS" : "FAIL" });
} catch (e) {
  results.push({ ec: "EC-09", status: "FAIL" });
}

// EC-10: Delimiter-only kebab input returns empty string
try {
  const r = toCase("---", "camel");
  results.push({ ec: "EC-10", status: r === "" ? "PASS" : "FAIL" });
} catch (e) {
  results.push({ ec: "EC-10", status: "FAIL" });
}

// EC-11: Delimiter-only snake input returns empty string
try {
  const r = toCase("___", "kebab");
  results.push({ ec: "EC-11", status: r === "" ? "PASS" : "FAIL" });
} catch (e) {
  results.push({ ec: "EC-11", status: "FAIL" });
}

// EC-12: Phase 1 boundary split — 'arser' must remain intact
try {
  const r = toCase("HTMLParser", "snake", { preserveConsecutiveUppercase: false });
  if (r === "h_t_m_l_p_arser") {
    results.push({ ec: "EC-12", status: "FAIL" });
  } else if (r !== "h_t_m_l_parser") {
    results.push({ ec: "EC-12", status: "FAIL" });
  } else {
    results.push({ ec: "EC-12", status: "PASS" });
  }
} catch (e) {
  results.push({ ec: "EC-12", status: "FAIL" });
}

// EC-13: Options parameter is optional
try {
  const r = toCase("HTMLParser", "snake");
  results.push({ ec: "EC-13", status: r === "h_t_m_l_parser" ? "PASS" : "FAIL" });
} catch (e) {
  results.push({ ec: "EC-13", status: "FAIL" });
}

// EC-14: Multi-segment snake → camel
try {
  const r = toCase("foo_bar_baz", "camel");
  results.push({ ec: "EC-14", status: r === "fooBarBaz" ? "PASS" : "FAIL" });
} catch (e) {
  results.push({ ec: "EC-14", status: "FAIL" });
}

// EC-15: Multi-segment camel → kebab
try {
  const r = toCase("fooBarBaz", "kebab");
  results.push({ ec: "EC-15", status: r === "foo-bar-baz" ? "PASS" : "FAIL" });
} catch (e) {
  results.push({ ec: "EC-15", status: "FAIL" });
}

// EC-16: Typed parameters accepted
try {
  const t = "snake";
  const opts = { preserveConsecutiveUppercase: true };
  const r = toCase("helloWorld", t, opts);
  results.push({ ec: "EC-16", status: r === "hello_world" ? "PASS" : "FAIL" });
} catch (e) {
  results.push({ ec: "EC-16", status: "FAIL" });
}

// Output results as JSON for parsing
console.log(JSON.stringify(results, null, 2));
