import { describe, expect, it } from "vitest";

import { collapseWhitespace } from "./limits.js";
import { runResumeChecks } from "./resumeChecks.js";

const CHECK_IDS = ["length", "quantified-results", "email", "phone", "profile-link", "sections"];

/** Runs the checks the way the app does: on whitespace-collapsed text. */
const runChecks = (text) => runResumeChecks(collapseWhitespace(text));
const checkOf = (text, id) => runChecks(text).checks.find((check) => check.id === id);
const byId = (result) => Object.fromEntries(result.checks.map((check) => [check.id, check]));

// Flat text, as pdf.js extraction plus collapseWhitespace produce it.
const BULLETS = [
  "Led the migration of 40 services from a monolith to Kubernetes, cutting deploy time by 65% and on-call pages by half.",
  "Built a real-time fraud scoring pipeline in Go and Kafka that saved $2.4M a year in chargebacks.",
  "Grew checkout conversion 12% by redesigning the payment retry flow with the product and design teams.",
  "Mentored 6 engineers, two of whom were promoted to senior within eighteen months of joining the team.",
  "Reduced p99 API latency from 900 ms to 180 ms with connection pooling, query tuning and a read-through cache.",
  "Designed the idempotency layer used by every payment service, processing 3M requests per day without double charges.",
  "Introduced contract testing across 15 teams, which removed most integration-environment breakages before release.",
  "Owned the incident review process and published guides that the wider engineering organisation adopted as standard.",
  "Partnered with finance to automate monthly reconciliation, replacing a spreadsheet process that took several days.",
  "Wrote and maintained internal documentation on service ownership, alerting standards and runbook structure.",
  "Interviewed more than 80 candidates and helped redesign the backend interview loop to focus on practical work.",
  "Shipped a self-serve rate limiting dashboard that let product teams tune limits without filing infrastructure tickets.",
  "Migrated the billing database to PostgreSQL 15 with zero downtime using logical replication and dual writes.",
  "Ran quarterly architecture reviews and kept a public decision log so that new engineers could follow past choices.",
  "Built an internal CLI for local environment setup, cutting new hire onboarding from a week to a single afternoon.",
];
const CONTACT_LINE = "(415) 555-2671 jane.doe@gmail.com linkedin.com/in/janedoe github.com/janedoe";
const STRONG_RESUME = [
  `Jane Doe Senior Backend Engineer San Francisco, CA 94107 ${CONTACT_LINE}`,
  "SUMMARY Backend engineer with eight years of experience building payment systems, reliability tooling and developer platforms at high-growth companies.",
  "EXPERIENCE Senior Software Engineer, Stripe Jan 2020 – Present",
  ...BULLETS.slice(0, 8).map((bullet) => `• ${bullet}`),
  "Software Engineer, Square 2016 – 2019",
  ...BULLETS.slice(8).map((bullet) => `• ${bullet}`),
  "EDUCATION B.S. Computer Science, University of California, Berkeley 2012 – 2016",
  "SKILLS Go, Python, TypeScript, Kafka, PostgreSQL, Kubernetes, Terraform, AWS, GCP, gRPC, Prometheus, Grafana, Datadog, Redis.",
  "Projects Open-source maintainer of a small Go library for idempotent HTTP handlers used by several fintech startups in production today.",
  "Volunteer Taught weekend coding classes at a local community centre for adults changing careers into software development roles.",
].join(" ");
const WEAK_RESUME =
  "John Smith Looking for a job where I can grow. I am a hard worker and a team player who is always learning. Experience: Worked at a store helping customers and stocking shelves. Education: High school diploma.";
const NO_CONTACT_RESUME = STRONG_RESUME.replace(CONTACT_LINE, "");
const DATES_AND_NUMBERS_ONLY =
  "Alex Kim Experience Acme Corp 2015 - 2019 2019 - 2021 2018-2020 2020-2023 Jan 2019 - Dec 2021 06/2019 - 08/2021 2021-03-15 Office in San Francisco, CA 94107 Certified ISO 27001 2022 Education State University 2010 - 2014 Skills Go Java 17 and Windows 10 and Python 3.11 with Django";

const words = (count) => Array.from({ length: count }, (_, index) => `word${index % 7}`).join(" ");

describe("runResumeChecks: realistic resumes", () => {
  it("passes every check for a strong resume, with the found values as details", () => {
    const result = runChecks(STRONG_RESUME);
    expect(result.score).toBe(100);
    expect(result.checks.map((check) => `${check.id}:${check.passed}:${check.detail}`)).toEqual([
      "length:true:359 words",
      "quantified-results:true:9 measurable results found",
      "email:true:jane.doe@gmail.com",
      "phone:true:(415) 555-2671",
      "profile-link:true:linkedin.com/in/janedoe",
      "sections:true:Experience, Education and Skills found",
    ]);
  });

  it("returns six checks in a stable order, each with id, label, passed and detail", () => {
    const { checks } = runChecks(STRONG_RESUME);
    expect(checks.map((check) => check.id)).toEqual(CHECK_IDS);
    expect(checks.map((check) => check.label)).toEqual([
      "Resume length",
      "Measurable results",
      "Email address",
      "Phone number",
      "LinkedIn or portfolio link",
      "Standard sections",
    ]);
    for (const check of checks) {
      expect(Object.keys(check)).toEqual(["id", "label", "passed", "detail"]);
      expect(check.passed).toBeTypeOf("boolean");
      expect(check.detail).toBeTypeOf("string");
    }
  });

  it("fails every check for a short, vague resume and says what to aim for", () => {
    const result = runChecks(WEAK_RESUME);
    expect(result.score).toBe(0);
    expect(result.checks.map((check) => check.detail)).toEqual([
      "37 words — aim for 300–1,000",
      "No measurable results found — aim for at least 3",
      "No email address found",
      "No phone number found",
      "No LinkedIn, GitHub or portfolio link found",
      "Missing: Skills",
    ]);
  });

  it("fails the three contact checks when contact details are missing, scoring 50", () => {
    const result = runChecks(NO_CONTACT_RESUME);
    const checks = byId(result);
    expect(result.score).toBe(50);
    expect(checks.email).toMatchObject({ passed: false, detail: "No email address found" });
    expect(checks.phone).toMatchObject({ passed: false, detail: "No phone number found" });
    expect(checks["profile-link"]).toMatchObject({
      passed: false,
      detail: "No LinkedIn, GitHub or portfolio link found",
    });
    expect(checks.length.passed && checks["quantified-results"].passed && checks.sections.passed).toBe(true);
  });

  it("does not read years, date ranges, ZIP codes, ISO numbers or versions as a phone or results", () => {
    const checks = byId(runChecks(DATES_AND_NUMBERS_ONLY));
    expect(checks.phone.passed).toBe(false);
    expect(checks["quantified-results"].detail).toBe("No measurable results found — aim for at least 3");
    expect(checks.sections.passed).toBe(true);
  });

  it.each([
    [1, "Jane Doe jane@x.com", 17],
    [2, "Jane Doe jane@x.com (415) 555-2671", 33],
    [4, "Experience Education Skills jane@x.com (415) 555-2671 github.com/jane", 67],
    [5, "Experience Education Skills jane@x.com (415) 555-2671 github.com/jane Cut costs 40%, saved $2M, 3x faster.", 83],
  ])("scores %i passed check(s) as the rounded percentage", (passedCount, text, score) => {
    const result = runChecks(text);
    expect(result.checks.filter((check) => check.passed)).toHaveLength(passedCount);
    expect(result.score).toBe(score);
  });
});

describe("runResumeChecks: empty and invalid input", () => {
  const EMPTY_DETAILS = [
    "0 words — aim for 300–1,000",
    "No measurable results found — aim for at least 3",
    "No email address found",
    "No phone number found",
    "No LinkedIn, GitHub or portfolio link found",
    "Missing: Experience, Education, Skills",
  ];

  it.each([
    ["an empty string", ""],
    ["whitespace", "   \n\t  "],
    ["null", null],
    ["undefined", undefined],
    ["a number", 42],
    ["an object", { text: "Experience" }],
  ])("%s -> score 0 and six failed checks, without throwing", (_label, input) => {
    const result = runResumeChecks(input);
    expect(result.score).toBe(0);
    expect(result.checks.map((check) => check.id)).toEqual(CHECK_IDS);
    expect(result.checks.every((check) => check.passed === false)).toBe(true);
    expect(result.checks.map((check) => check.detail)).toEqual(EMPTY_DETAILS);
  });
});

describe("length check", () => {
  it.each([
    [299, false, "299 words — aim for 300–1,000"],
    [300, true, "300 words"],
    [1000, true, "1,000 words"],
    [1001, false, "1,001 words — aim for 300–1,000"],
    [1450, false, "1,450 words — aim for 300–1,000"],
  ])("%i words -> passed %s", (count, passed, detail) => {
    expect(checkOf(words(count), "length")).toMatchObject({ passed, detail });
  });

  it("says '1 word' in the singular", () => {
    expect(checkOf("word", "length").detail).toBe("1 word — aim for 300–1,000");
  });

  it("does not count bullet glyphs and dashes as words", () => {
    expect(checkOf("• – • word1 word2 — •", "length").detail).toMatch(/^2 words/);
    expect(checkOf(`${words(300)}${" •".repeat(100)}${" —".repeat(50)}`, "length").detail).toBe("300 words");
  });
});

describe("measurable results check", () => {
  it.each([
    ["Cut costs 40% and saved $1.2M; served 1,200 users and 50k sessions; 10+ teams; 3x faster", 6],
    ["grew revenue 30 percent, managed 12 engineers, reduced 300 ms", 3],
    ["€40k budget, £1,200 grant, ₹5 lakh", 3],
    ["Saved ₹50 lakh, 30 percent faster, 3x throughput", 3],
    ["Cut costs 40%. Saved $2.4M. Grew to 1,200 users.", 3],
    ["Saved $2.4M a year", 1],
    ["(415) 555-2671 cut 40% and saved $3M", 2],
    ["Java 17 and Windows 10 and Python 3.11 with Django from 2019 to 2021", 0],
    ["Python 3.11 and Java 17 and Windows 10", 0],
    ["jane@x.com (415) 555-2671 2019 - 2021 06/2019 CA 94107 Experience", 0],
    ["Jane (415) 555-2671 jane99@x.com CA 94107 2015 - 2019 Jan 2020 - Present 03/2021 linkedin.com/in/jane123", 0],
  ])("%j -> %i", (text, count) => {
    const check = checkOf(text, "quantified-results");
    const found =
      count === 0
        ? "No measurable results found"
        : `${count} measurable ${count === 1 ? "result" : "results"} found`;
    expect(check.passed).toBe(count >= 3);
    expect(check.detail).toBe(count >= 3 ? found : `${found} — aim for at least 3`);
  });
});

describe("email check", () => {
  it.each([
    ["jane.doe+jobs@mail.example.co.uk", "jane.doe+jobs@mail.example.co.uk"],
    ["jane@eng.corp.example.com", "jane@eng.corp.example.com"],
    ["Jane.Doe@Example.COM", "Jane.Doe@Example.COM"],
    ["j_doe99@gmail.com", "j_doe99@gmail.com"],
    ["mailto:jane@x.io", "jane@x.io"],
  ])("finds %s", (text, detail) => {
    expect(checkOf(`Jane ${text} Skills`, "email")).toMatchObject({ passed: true, detail });
  });

  it.each([
    "jane@ gmail.com",
    "jane [at] gmail [dot] com",
    "@janedoe",
    "react@18.2.0",
    "jane@localhost",
    "jane@example.c",
    "josé@example.com",
  ])("does not find %s", (text) => {
    expect(checkOf(`Jane ${text} Skills`, "email")).toMatchObject({
      passed: false,
      detail: "No email address found",
    });
  });

  it("shortens a long email in the detail to 60 characters", () => {
    const detail = checkOf(`x ${"a".repeat(55)}@example.com y`, "email").detail;
    expect(detail).toHaveLength(60);
    expect(detail).toBe(`${"a".repeat(55)}@exa…`);
  });
});

describe("phone check", () => {
  it.each([
    "(415) 555-2671",
    "+1 415 555 2671",
    "+1 (415) 555-2671",
    "+1-415-555-2671",
    "(415)555-2671",
    "415.555.2671",
    "4155552671",
    "9876543210",
    "+44 20 7946 0958",
    "+44 (0) 20 7946 0958",
    "07700 900123",
    "+91 98765 43210",
    "+919876543210",
    "+91-9876543210",
    "+49 30 901820",
    "+33 1 23 45 67 89",
    "+61 2 9876 5432",
    "0412 345 678",
    "+86 138 0013 8000",
    "+81 3-1234-5678",
    "+55 (11) 91234-5678",
  ])("finds %s and echoes it", (phone) => {
    expect(checkOf(`Name Here | Phone: ${phone} | Email`, "phone")).toMatchObject({
      passed: true,
      detail: phone,
    });
  });

  it.each([
    ["French with dots", "Tel 01.23.45.67.89", "01.23.45.67.89"],
    ["French with spaces", "Tel 01 23 45 67 89", "01 23 45 67 89"],
    ["French mobile", "Tel 06 12 34 56 78", "06 12 34 56 78"],
    ["French +33 with year-like groups", "+33 1 20 19 20 19", "+33 1 20 19 20 19"],
    ["French with year-like groups", "Tel 06.12.20.19.55", "06.12.20.19.55"],
    ["US ending in a year-like group", "1-800-555-2019", "1-800-555-2019"],
    ["US dots ending in a year-like group", "415.555.2019", "415.555.2019"],
    ["non-breaking spaces", "415\u00A0555\u00A02671", "415 555 2671"],
    ["glued to a label with a colon", "Phone:4155552671", "4155552671"],
    ["followed by an extension", "(415) 555-2671 ext. 23", "(415) 555-2671"],
    ["after a ZIP code", "CA 94107 (415) 555-2671 jane@x.com", "(415) 555-2671"],
    ["before a year range", "(415) 555-2671 2019 - 2021 Acme", "(415) 555-2671"],
    ["followed by a year", "(415) 555-2671 2019", "(415) 555-2671"],
    ["after a year", "2019 (415) 555-2671", "(415) 555-2671"],
    ["ending in a year-like group", "+1 415 555 2020 Experience", "+1 415 555 2020"],
    ["with the country code in parentheses", "(+1) 415-555-2671", "415-555-2671"],
    ["before a European date range", "(415) 555-2671 15.03.2021 - 30.06.2023", "(415) 555-2671"],
    ["before a European date", "(415) 555-2671 15.03.2021", "(415) 555-2671"],
    ["before a year and a date", "(415) 555-2671 2019 15.03.2021", "(415) 555-2671"],
    ["after a European date", "15.03.2021 (415) 555-2671", "(415) 555-2671"],
    ["German, before a date range", "Tel. 030 1234567 01.04.2018 - 31.03.2021", "030 1234567"],
    ["glued to a date with a dash", "4155552671-15.03.2021", "4155552671"],
  ])("finds a phone number: %s", (_label, text, detail) => {
    expect(checkOf(`Name ${text} Experience`, "phone")).toMatchObject({ passed: true, detail });
  });

  it.each([
    ["a year range", "2015 - 2019"],
    ["two year ranges", "2015 - 2019 2019 - 2021"],
    ["a year list", "2015 2016 2017 2018"],
    ["year ranges and a year", "2018-2020 2020-2023 2021"],
    ["month ranges", "Jan 2019 - Dec 2021 2022 - 2023"],
    ["MM/YYYY ranges", "06/2019 - 08/2021 12/2021 - 01/2023"],
    ["MM.YYYY range", "03.2019 - 04.2021"],
    ["European date range", "15.03.2021 - 30.06.2023"],
    ["European range with a 2-digit end year", "15.03.2021 - 30.06.23"],
    ["European range 01.04.2018 - 31.03.2021", "01.04.2018 - 31.03.2021"],
    ["ISO date range", "2021-03-15 - 2023-06-30"],
    ["ISO range 2018-04-01 - 2021-03-31", "2018-04-01 - 2021-03-31"],
    ["US date range", "03/15/2021 - 06/30/2023"],
    ["a single European date", "seit 01.04.2018"],
    ["a ZIP+4 code", "CA 94107-1234"],
    ["a ZIP code before a year range", "San Francisco, CA 94107 2015 - 2019"],
    ["a ZIP code before a date range", "80331 01.04.2018 - 31.03.2021"],
    ["years before a date", "2019 2020 2021 2022 15.03.2023"],
    ["a 7-digit local number", "Phone 555-0100"],
    ["a 7-digit local number with a dash", "555-2671"],
    ["a 16-digit card number", "Card 1234567890123456"],
    ["a spaced card number", "4111 1111 1111 1111"],
    ["an SSN-shaped number", "123-45-6789"],
    ["ISO27001 and years", "ISO27001 2019 2020"],
    ["versions", "Python 3.11.4 2.7.18"],
    ["digits glued to a word", "Tel4155552671"],
    ["en dashes as separators", "415–555–2671"],
    ["a slash as separator", "030/9018201"],
    ["Arabic-Indic digits", "٤١٥٥٥٥٢٦٧١"],
    ["a date then a number without parentheses", "01.04.2018 0176 12345678"],
  ])("finds no phone number in %s", (_label, text) => {
    expect(checkOf(`Name ${text} Experience`, "phone")).toMatchObject({
      passed: false,
      detail: "No phone number found",
    });
  });
});

describe("profile link check", () => {
  it.each([
    ["linkedin.com/in/jane-doe", "linkedin.com/in/jane-doe"],
    ["https://www.linkedin.com/in/janedoe/", "https://www.linkedin.com/in/janedoe"],
    ["uk.linkedin.com/in/jane-doe", "uk.linkedin.com/in/jane-doe"],
    ["linkedin.com/in/jane.", "linkedin.com/in/jane"],
    ["github.com/jane", "github.com/jane"],
    ["jane.github.io", "jane.github.io"],
    ["https://janedoe.dev/work", "https://janedoe.dev/work"],
    ["www.janedoe.com.", "www.janedoe.com"],
    ["janedoe.dev", "janedoe.dev"],
    ["behance.net/janedoe", "behance.net/janedoe"],
    ["dribbble.com/jane", "dribbble.com/jane"],
  ])("finds %s", (text, detail) => {
    expect(checkOf(`Profile ${text} Skills`, "profile-link")).toMatchObject({ passed: true, detail });
  });

  it.each([
    ["employer domains", "Worked at Booking.com and Amazon.com on retail"],
    ["library names", "Built apps with Node.js, Socket.io, ASP.NET, Vue.js and Next.js"],
    ["an email domain", "jane@janedoe.dev"],
    ["link labels whose targets were not extracted", "LinkedIn | GitHub | Portfolio"],
    ["a sentence glued to a capitalised word", "Led the team.Site reliability work"],
  ])("does not count %s as a link", (_label, text) => {
    expect(checkOf(`Jane ${text} Skills`, "profile-link")).toMatchObject({
      passed: false,
      detail: "No LinkedIn, GitHub or portfolio link found",
    });
  });
});

describe("sections check", () => {
  it.each([
    ["capitals", "EXPERIENCE Acme EDUCATION MIT SKILLS Go"],
    ["Title Case", "Experience Acme Education MIT Skills Go"],
    ["Work History and Technical Skills", "Work History Acme Education MIT Technical Skills Go"],
    ["sentence-case Professional experience", "Professional experience Acme Education MIT Skills Go"],
    ["EMPLOYMENT", "EMPLOYMENT Acme EDUCATION MIT SKILLS Go"],
  ])("finds all three headings in %s", (_label, text) => {
    expect(checkOf(text, "sections")).toMatchObject({
      passed: true,
      detail: "Experience, Education and Skills found",
    });
  });

  it.each([
    ["lower-case headings", "experience acme education mit skills go", "Missing: Experience, Education, Skills"],
    ["prose words", "I have 8 years of experience and strong communication skills and continuing education", "Missing: Experience, Education, Skills"],
    ["'8 years of experience' only", "I have 8 years of experience. Education MIT Skills Go", "Missing: Experience"],
    ["letter-spaced headings", "E X P E R I E N C E Acme E D U C A T I O N MIT S K I L L S Go", "Missing: Experience, Education, Skills"],
    ["a glued WORKEXPERIENCE", "WORKEXPERIENCE Acme EDUCATION MIT SKILLS Go", "Missing: Experience"],
    ["Core Competencies instead of Skills", "Experience Acme Education MIT Core Competencies Go", "Missing: Skills"],
  ])("lists what is missing for %s", (_label, text, detail) => {
    expect(checkOf(text, "sections")).toMatchObject({ passed: false, detail });
  });
});

describe("long unbroken tokens", () => {
  const PARAGRAPH =
    "Led the migration of 40 services from a monolith to Kubernetes, cutting deploy time by 65% and on-call pages by half. Built a real-time fraud scoring pipeline in Go and Kafka that saved $2.4M a year. ";
  const gluedText = (length) =>
    PARAGRAPH.replace(/\s+/g, "").repeat(Math.ceil(length / 150)).slice(0, length);

  // Without the \S{200,} guard, some of these took over a minute; with it,
  // each takes about 1 ms locally. The bound is generous for slow CI machines.
  it.each([
    ["99k 'aa-aa-…'", "aa-".repeat(33000)],
    ["100k digits", "1".repeat(100000)],
    ["40k 'a.a.a…'", `${"a.".repeat(20000)}1`],
    ["20k 'aaaa…'", "a".repeat(20000)],
    ["100k '1,000…'", "1,000".repeat(20000)],
    ["40k 'a@a.…'", "a@a.".repeat(10000)],
    ["40k of text with its spaces removed", gluedText(40000)],
  ])("checks %s in under a second", (_label, text) => {
    const startedAt = performance.now();
    const result = runResumeChecks(text);
    const elapsedMs = performance.now() - startedAt;
    expect(elapsedMs).toBeLessThan(1000);
    expect(result.score).toBe(0);
  });

  // About 60 ms locally; the bound only catches a slowdown by orders of magnitude.
  it("still checks a long realistic text (about 360k characters) in under 5 seconds", () => {
    const vocabulary =
      "Led migration of 40 services to Kubernetes cutting deploy time by 65% and saved $2.4M with jane.doe@gmail.com (415) 555-2671 2015 - 2019 linkedin.com/in/jane Experience Education Skills".split(" ");
    const text = Array.from({ length: 50000 }, (_, index) => vocabulary[index % vocabulary.length]).join(" ");
    const startedAt = performance.now();
    runResumeChecks(text);
    expect(performance.now() - startedAt).toBeLessThan(5000);
  });

  it("ignores tokens of 200 or more characters but still reads one of 199", () => {
    const linkOf = (length) => `https://example.com/${"a".repeat(length - "https://example.com/".length)}`;
    const found = checkOf(`Profile ${linkOf(199)} Skills`, "profile-link");
    expect(found.passed).toBe(true);
    expect(found.detail).toBe(`${linkOf(199).slice(0, 59)}…`);
    expect(checkOf(`Profile ${linkOf(200)} Skills`, "profile-link").passed).toBe(false);
    expect(checkOf(`Profile ${linkOf(270)} Skills`, "profile-link").passed).toBe(false);
  });
});

// Accepted limitations of the heuristics. These pin today's behaviour so a
// change to it is deliberate; flip the expectation when a heuristic improves.
describe("known limitations (current behaviour)", () => {
  it.each([
    ["a 10-digit employee ID", "Employee ID 1234567890", "1234567890"],
    ["an ISBN", "ISBN 978-3-16-148410-0", "978-3-16-148410-0"],
    ["a certification ID", "AWS-1234567890", "1234567890"],
    ["an 11-digit count", "processed 10000000000 events", "10000000000"],
    ["room numbers before a date", "Rooms 101 102 103 104 01.09.2020", "101 102 103 104"],
    ["4-4-4 digit groups before a date", "1234 5678 9012 15.03.2021", "1234 5678 9012"],
    ["an ID before a date", "ID 12345 67890 01.01.2020", "12345 67890"],
    ["a European range with 2-digit years", "15.03.21 - 30.06.23", "15.03.21 - 30.06.23"],
  ])("reads %s as a phone number", (_label, text, detail) => {
    expect(checkOf(`Name ${text} Experience`, "phone")).toMatchObject({ passed: true, detail });
  });

  it("counts versions followed by a noun and 'N years' as results", () => {
    expect(checkOf("Java 17 developer. Windows 10 servers. Python 3.11 runtime.", "quantified-results").detail).toBe(
      "3 measurable results found",
    );
    expect(
      checkOf("10 years of experience. 12 years in fintech. 15 years leading teams.", "quantified-results").detail,
    ).toBe("3 measurable results found");
  });

  it("lets a job title satisfy the Experience heading", () => {
    expect(checkOf("Customer Experience Manager at Zendesk. Education MIT. Skills Go", "sections").passed).toBe(true);
    expect(checkOf("User Experience Designer. Education MIT. Skills Go", "sections").passed).toBe(true);
  });

  it("counts any *.dev domain as a portfolio link", () => {
    expect(checkOf("Jane improved web.dev scores Skills", "profile-link").detail).toBe("web.dev");
  });

  it("counts any link with a scheme, even an employer's site, as a portfolio link", () => {
    expect(checkOf("Profile https://stripe.com Skills", "profile-link")).toMatchObject({
      passed: true,
      detail: "https://stripe.com",
    });
  });

  it("counts a ZIP code followed by a word as a measurable result", () => {
    expect(checkOf("CA 94107 open to relocation", "quantified-results").detail).toBe(
      "1 measurable result found — aim for at least 3",
    );
  });

  it("counts CJK text without spaces as no words (it is one long token)", () => {
    expect(checkOf("我".repeat(2000), "length").detail).toBe("0 words — aim for 300–1,000");
  });
});
