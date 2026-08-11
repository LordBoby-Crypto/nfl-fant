export interface GlossaryEntry {
  term: string;
  shortDefinition: string;
  example: string;
  aliases?: string[];
}

export interface ProductTabHelp {
  name: string;
  purpose: string;
  useWhen: string;
}

export interface WalkthroughStep {
  id: string;
  title: string;
  description: string;
  points: string[];
  example?: {
    title: string;
    detail: string;
  };
}

export const HELP_TABS: ProductTabHelp[] = [
  {
    name: "Overview",
    purpose: "Checks your league, draft schedule, settings and readiness.",
    useWhen: "Use it before draft day or after the draft for the final report.",
  },
  {
    name: "Draft Room",
    purpose: "Runs the live draft board, next-pick advice and Simple Draft Mode.",
    useWhen: "Keep it open during the real Sleeper draft.",
  },
  {
    name: "Draft Rankings",
    purpose: "Shows the complete list of available players in draft order.",
    useWhen: "Use it to search every available player or compare possible picks.",
  },
  {
    name: "Players",
    purpose: "Provides detailed player research, projections, injuries and news.",
    useWhen: "Use it when you want to investigate one player more deeply.",
  },
  {
    name: "My Team",
    purpose: "Shows your roster, lineup coverage, depth and concentration risks.",
    useWhen: "Use it to see what your team still needs.",
  },
  {
    name: "Waivers",
    purpose: "Ranks available additions and explains possible drops.",
    useWhen: "Use it after the draft and throughout the season.",
  },
  {
    name: "Trades",
    purpose: "Compares trade packages using both teams' real roster needs.",
    useWhen: "Use it before proposing or accepting a trade.",
  },
  {
    name: "Matchups",
    purpose: "Helps with weekly start/sit and opponent decisions.",
    useWhen: "Use it once weekly NFL matchups begin.",
  },
  {
    name: "Safety",
    purpose: "Manages backups, secure synchronization and recovery tools.",
    useWhen: "Use it before the draft and whenever you need recovery options.",
  },
  {
    name: "Help",
    purpose: "Keeps this walkthrough, glossary, checklist and emergency guide.",
    useWhen: "Return here whenever a term or workflow is unclear.",
  },
];

export const GLOSSARY: GlossaryEntry[] = [
  {
    term: "Rank",
    shortDefinition:
      "A player's ordered place on a list. Rank #1 is the first player on that list.",
    example:
      "A player can be overall Rank #8 but recommendation #1 for your current roster.",
    aliases: ["overall rank", "position rank", "ranking"],
  },
  {
    term: "ADP",
    shortDefinition:
      "Average Draft Position: the average pick where other fantasy managers select a player.",
    example:
      "ADP 36 means the player usually goes around the third round in a 12-team draft.",
    aliases: ["average draft position"],
  },
  {
    term: "Tier",
    shortDefinition:
      "A group of players with similar expected value. A tier drop means the next group is meaningfully weaker.",
    example:
      "If only one Tier 2 running back remains, waiting may force you into Tier 3.",
  },
  {
    term: "VOR",
    shortDefinition:
      "Value Over Replacement: how much better a player projects than the likely fallback at the same position.",
    example:
      "A tight end with +42 VOR offers 42 more projected points than the replacement-level tight end.",
    aliases: ["value over replacement", "replacement value"],
  },
  {
    term: "Scarcity",
    shortDefinition:
      "How quickly useful options at a position are disappearing compared with other positions.",
    example:
      "Quarterback scarcity rises when several opponents need one and the current tier has only two left.",
    aliases: ["tier scarcity", "position scarcity"],
  },
  {
    term: "Fit",
    shortDefinition:
      "How well a player serves your specific roster. War Room labels this as roster-specific value rather than using an unexplained fit score.",
    example:
      "A slightly lower overall-ranked wide receiver can fit better when your second WR starter is still empty.",
    aliases: ["roster fit", "roster-specific value", "roster value"],
  },
  {
    term: "Floor",
    shortDefinition:
      "A conservative estimate of a player's likely outcome when things go worse than expected.",
    example:
      "A veteran with a stable role may have a safer floor than an unproven rookie.",
  },
  {
    term: "Ceiling",
    shortDefinition:
      "An optimistic estimate of a player's likely outcome when things go well.",
    example:
      "A young receiver earning a larger role may have a higher ceiling but more risk.",
  },
  {
    term: "Draft now",
    shortDefinition:
      "The model believes the player is valuable now and may not survive until your next turn.",
    example:
      "Draft now when a needed Tier 2 running back has only a 24% chance to reach your next pick.",
    aliases: ["draft-now"],
  },
  {
    term: "Wait",
    shortDefinition:
      "The model expects the player or a close replacement to remain available at your next turn.",
    example:
      "Wait when three similar quarterbacks remain and the preferred one has an 86% survival chance.",
    aliases: ["safe to wait", "wait probability"],
  },
  {
    term: "FLEX",
    shortDefinition:
      "A starting slot that can usually hold an RB, WR or TE.",
    example:
      "Your third running back may fill FLEX after your required RB starters are complete.",
  },
  {
    term: "SUPER_FLEX",
    shortDefinition:
      "A flexible starting slot that also allows a quarterback, making quarterbacks more valuable.",
    example:
      "In SUPER_FLEX, a second starting quarterback is usually an essential starter rather than optional depth.",
    aliases: ["superflex", "OP"],
  },
];

export const WALKTHROUGH_STEPS: WalkthroughStep[] = [
  {
    id: "welcome",
    title: "Welcome to War Room",
    description:
      "War Room watches your Sleeper league and turns the live board into one clear next decision.",
    points: [
      "Nothing here drafts a player for you; you still make the pick in Sleeper.",
      "The recommendation changes with your roster, league settings and every selection.",
      "You can restart this tour at any time from Help.",
    ],
  },
  {
    id: "navigation",
    title: "The left side is your map",
    description:
      "Overview prepares you, Draft Room guides the live draft, and the remaining tabs handle research and season decisions.",
    points: HELP_TABS.map((tab) => `${tab.name}: ${tab.purpose}`),
  },
  {
    id: "sync",
    title: "Sleeper stays the source of truth",
    description:
      "War Room reads your league, roster, settings, draft order and selections from Sleeper. It never makes a Sleeper pick.",
    points: [
      "During a live draft, picks are checked every five seconds.",
      "When another team selects a player, that player leaves the available list and recommendations recalculate.",
      "The connection label and update time tell you whether the screen is current.",
    ],
  },
  {
    id: "rankings",
    title: "Rankings and recommendations answer different questions",
    description:
      "Draft Rankings contains the complete available-player list. The next-pick recommendation asks which available player best helps your roster right now.",
    points: [
      "Overall rank measures the player without assuming your roster needs.",
      "Roster value adds open starters, depth, scarcity, risk, bye weeks and opponent demand.",
      "A lower overall-ranked player can correctly become the better next pick.",
    ],
    example: {
      title: "Simulated choice: overall #11 WR versus overall #17 RB",
      detail:
        "You already have three wide receivers but still need a second starting running back. The RB can lead the next-pick recommendation because filling the essential starter is worth more than optional WR depth.",
    },
  },
  {
    id: "why",
    title: "Use “Why this pick” before trusting the answer",
    description:
      "The proof view separates overall value from roster-specific effects and shows every positive and negative reason.",
    points: [
      "Check need, tier scarcity, ADP, injury, bye week and wait probability.",
      "Read why the leader beats the alternatives and what each alternative trades away.",
      "Lower confidence means important data is missing, stale or only partially modeled.",
    ],
    example: {
      title: "Simulated proof",
      detail:
        "RB A leads by 6 roster-value points: +8 for an empty RB starter and +4 for a final tier player, offset by −2 injury risk. WR B is safer overall but adds only bench depth.",
    },
  },
  {
    id: "wait",
    title: "Draft now versus Wait is about opportunity cost",
    description:
      "The advice estimates what happens before your next turn, not whether a player is simply good.",
    points: [
      "Draft now: the player is unlikely to survive or the fallback is substantially weaker.",
      "Wait: the player or a close alternative is likely to remain.",
      "Pending: Sleeper has not supplied enough draft-order information to calculate the next turn.",
    ],
    example: {
      title: "Simulated wait decision",
      detail:
        "TE A has a 78% chance to survive and two similar TEs remain, while the last Tier 2 RB has only a 19% chance. Draft the RB now and reconsider TE next turn.",
    },
  },
  {
    id: "recovery",
    title: "Phone, reconnecting and offline fallback",
    description:
      "On a phone, use the bottom navigation for the main draft screens and the menu for every tab. Rotate only when you want more ranking columns.",
    points: [
      "If disconnected, keep the current tab open; War Room retains the last successful league, picks and rankings snapshots.",
      "When the browser reconnects, league data refreshes automatically. Use Refresh if the update time still looks old.",
      "If service does not return, use the saved rankings and emergency instructions in Help or Safety, then make the pick manually in Sleeper.",
    ],
  },
];

export const LIVE_DRAFT_CHECKLIST = [
  "Sleeper draft room is open in another tab or device.",
  "War Room says Sleeper connected and shows a recent sync time.",
  "Draft order and my next pick are visible.",
  "War Room is unlocked so rankings and recommendations can load.",
  "Phone or laptop is charging and the screen will stay awake.",
  "I know where Draft Rankings and the emergency offline instructions are.",
];

export function searchGlossary(query: string) {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return GLOSSARY;
  return GLOSSARY.filter((entry) =>
    [entry.term, entry.shortDefinition, entry.example, ...(entry.aliases ?? [])]
      .join(" ")
      .toLocaleLowerCase()
      .includes(normalized)
  );
}
