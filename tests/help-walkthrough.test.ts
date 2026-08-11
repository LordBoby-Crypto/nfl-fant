import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  GLOSSARY,
  HELP_TABS,
  LIVE_DRAFT_CHECKLIST,
  searchGlossary,
  WALKTHROUGH_STEPS,
} from "../src/features/help/model.ts";

test("the glossary defines every required beginner term and searches aliases", () => {
  const terms = new Set(GLOSSARY.map((entry) => entry.term));
  for (const term of [
    "Rank",
    "ADP",
    "Tier",
    "VOR",
    "Scarcity",
    "Fit",
    "Floor",
    "Ceiling",
  ]) {
    assert.equal(terms.has(term), true, `${term} must be defined`);
  }
  assert.deepEqual(searchGlossary("average draft position").map((item) => item.term), ["ADP"]);
  assert.equal(searchGlossary("roster-specific value")[0]?.term, "Fit");
  assert.equal(searchGlossary("no such fantasy term").length, 0);
});

test("Help explains every permanent left-side tab", () => {
  assert.deepEqual(
    HELP_TABS.map((tab) => tab.name),
    [
      "Overview",
      "Draft Room",
      "Draft Rankings",
      "Players",
      "My Team",
      "Waivers",
      "Trades",
      "Matchups",
      "Safety",
      "Help",
    ],
  );
  assert.equal(HELP_TABS.every((tab) => tab.purpose && tab.useWhen), true);
});

test("the first-time walkthrough covers sync, rankings, proof, wait advice and recovery", () => {
  const copy = WALKTHROUGH_STEPS.flatMap((step) => [
    step.title,
    step.description,
    ...step.points,
    step.example?.title ?? "",
    step.example?.detail ?? "",
  ]).join(" ");
  for (const phrase of [
    "Sleeper",
    "every five seconds",
    "complete available-player list",
    "Overall rank",
    "Why this pick",
    "Draft now",
    "Wait",
    "phone",
    "reconnects",
    "last successful league, picks and rankings snapshots",
  ]) {
    assert.match(copy, new RegExp(phrase, "i"));
  }
  assert.equal(
    WALKTHROUGH_STEPS.filter((step) => step.example).length >= 3,
    true,
    "the walkthrough must teach with multiple simulated draft situations",
  );
});

test("the Help surface keeps every required permanent support tool", () => {
  const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const helpSource = readFileSync(
    new URL("../src/features/help/HelpPage.tsx", import.meta.url),
    "utf8",
  );

  assert.match(appSource, /war-room\.walkthrough\.m24\.complete/);
  assert.match(appSource, /useState\(\s*shouldLaunchWalkthrough/);
  assert.match(appSource, /name: "Help", icon: CircleHelp/);
  assert.match(appSource, /view === "Help"/);

  for (const label of [
    "Searchable glossary",
    "League settings currently modeled",
    "Partially supported data and scoring categories",
    "Live-draft checklist",
    "Emergency offline instructions",
    "Why this pick",
    "Draft now versus Wait",
    "Complete rankings",
    "After another team picks",
    "Phone use",
    "Refresh all live data",
  ]) {
    assert.match(helpSource, new RegExp(label, "i"));
  }
  assert.equal(LIVE_DRAFT_CHECKLIST.length >= 6, true);
});
