export type ScoringSupport = "supported" | "partial" | "unsupported";
export type ScoringConfidence = "high" | "medium" | "low";

export interface ScoringFormulaTerm {
  key: string;
  label: string;
  stat: string;
  projectedStat: number | null;
  multiplier: number;
  points: number | null;
  support: ScoringSupport;
  note: string;
}

export interface ScoringCategoryCoverage {
  key: string;
  value: number;
  label: string;
  support: ScoringSupport;
  detail: string;
}

export interface LeagueScoringPlayer {
  id: string;
  name: string;
  position: string;
  projectionStats: Record<string, number>;
  providerProjectedPoints: number | null;
}

export interface LeagueScoringResult {
  id: string;
  projectedPoints: number | null;
  leagueRank: number | null;
  leaguePositionRank: number | null;
  leagueTier: number | null;
  replacementValue: number | null;
  scarcityAdjustedValue: number | null;
  scoringConfidence: ScoringConfidence;
  scoringCoverage: number;
  scoringFormula: ScoringFormulaTerm[];
  scoringWarnings: string[];
  leagueScoringMode:
    | "rebuilt"
    | "partially-rebuilt"
    | "provider-fallback"
    | "unavailable";
}

export interface LeagueScoringBoard {
  players: LeagueScoringResult[];
  categories: ScoringCategoryCoverage[];
  supportedCategories: number;
  partialCategories: number;
  unsupportedCategories: number;
}

export interface LeagueScoringContext {
  teamCount: number;
  rosterCounts: Record<string, number>;
  benchSlots: number;
  flexSlots: number;
  superFlexSlots: number;
  idpSlots: number;
  scoring: Array<{ key: string; value: number }>;
}

interface SimpleRule {
  label: string;
  stat: string;
  positions: readonly string[];
}

const OFFENSE = ["QB", "RB", "WR", "TE"] as const;
const BALL_CARRIERS = ["QB", "RB", "WR", "TE"] as const;
const RECEIVERS = ["RB", "WR", "TE"] as const;
const DEFENDERS = ["DST", "DL", "DE", "DT", "LB", "DB", "CB", "S", "IDP"] as const;
const IDP = ["DL", "DE", "DT", "LB", "DB", "CB", "S", "IDP"] as const;
const KICK_DISTANCE_KEYS = [
  "fgm_0_19",
  "fgm_20_29",
  "fgm_30_39",
  "fgm_40_49",
  "fgm_50p",
] as const;
const TWO_POINT_KEYS = ["pass_2pt", "rush_2pt", "rec_2pt"] as const;

const SIMPLE_RULES: Record<string, SimpleRule> = {
  pass_yd: { label: "Passing yards", stat: "pass_yds", positions: ["QB"] },
  pass_td: { label: "Passing touchdowns", stat: "pass_tds", positions: ["QB"] },
  pass_int: { label: "Interceptions thrown", stat: "pass_ints", positions: ["QB"] },
  pass_att: { label: "Passing attempts", stat: "pass_att", positions: ["QB"] },
  pass_cmp: { label: "Completions", stat: "pass_cmp", positions: ["QB"] },
  rush_yd: { label: "Rushing yards", stat: "rush_yds", positions: BALL_CARRIERS },
  rush_td: { label: "Rushing touchdowns", stat: "rush_tds", positions: BALL_CARRIERS },
  rush_att: { label: "Rushing attempts", stat: "rush_att", positions: BALL_CARRIERS },
  rec: { label: "Receptions", stat: "rec_rec", positions: RECEIVERS },
  rec_yd: { label: "Receiving yards", stat: "rec_yds", positions: RECEIVERS },
  rec_td: { label: "Receiving touchdowns", stat: "rec_tds", positions: RECEIVERS },
  bonus_rec_te: { label: "Tight-end reception premium", stat: "rec_rec", positions: ["TE"] },
  xpm: { label: "Extra points made", stat: "xpt", positions: ["K"] },
  fgm: { label: "Field goals made", stat: "fg", positions: ["K"] },
  sack: { label: "Sacks", stat: "def_sack", positions: DEFENDERS },
  int: { label: "Defensive interceptions", stat: "def_int", positions: DEFENDERS },
  def_td: { label: "Defensive touchdowns", stat: "def_td", positions: DEFENDERS },
  safe: { label: "Safeties", stat: "def_safety", positions: DEFENDERS },
  ff: { label: "Forced fumbles", stat: "def_ff", positions: DEFENDERS },
  fum_rec: { label: "Fumble recoveries", stat: "def_fr", positions: DEFENDERS },
  tackle_solo: { label: "Solo tackles", stat: "def_tackle", positions: IDP },
  tackle_ast: { label: "Assisted tackles", stat: "def_assist", positions: IDP },
  tackle_loss: { label: "Tackles for loss", stat: "def_tlost", positions: IDP },
  pass_defended: { label: "Passes defended", stat: "def_pd", positions: IDP },
  bonus_pass_yd_300: {
    label: "300-yard passing games",
    stat: "pass_yds_300",
    positions: ["QB"],
  },
  bonus_pass_yd_400: {
    label: "400-yard passing games",
    stat: "pass_yds_400",
    positions: ["QB"],
  },
  bonus_rush_yd_100: {
    label: "100-yard rushing games",
    stat: "rush_yds_100",
    positions: BALL_CARRIERS,
  },
  bonus_rush_yd_200: {
    label: "200-yard rushing games",
    stat: "rush_yds_200",
    positions: BALL_CARRIERS,
  },
  bonus_rec_yd_100: {
    label: "100-yard receiving games",
    stat: "rec_yds_100",
    positions: RECEIVERS,
  },
  bonus_rec_yd_200: {
    label: "200-yard receiving games",
    stat: "rec_yds_200",
    positions: RECEIVERS,
  },
  bonus_rush_rec_yd_100: {
    label: "100-yard scrimmage games",
    stat: "scrimage_yards_100",
    positions: BALL_CARRIERS,
  },
  bonus_rush_rec_yd_200: {
    label: "200-yard scrimmage games",
    stat: "scrimage_yards_200",
    positions: BALL_CARRIERS,
  },
  pts_allow_0: { label: "0 points allowed", stat: "def_pa_a", positions: ["DST"] },
  pts_allow_1_6: { label: "1–6 points allowed", stat: "def_pa_b", positions: ["DST"] },
  pts_allow_7_13: { label: "7–13 points allowed", stat: "def_pa_c", positions: ["DST"] },
  pts_allow_14_20: { label: "14–20 points allowed", stat: "def_pa_d", positions: ["DST"] },
  pts_allow_21_27: { label: "21–27 points allowed", stat: "def_pa_e", positions: ["DST"] },
  pts_allow_28_34: { label: "28–34 points allowed", stat: "def_pa_f", positions: ["DST"] },
  pts_allow_35p: { label: "35+ points allowed", stat: "def_pa_g", positions: ["DST"] },
  def_st_td: {
    label: "Defense/special-teams return touchdowns",
    stat: "def_retd",
    positions: ["DST"],
  },
  st_td: {
    label: "Individual return touchdowns",
    stat: "ret_tds",
    positions: [...OFFENSE, "K"],
  },
};

const LABELS: Record<string, string> = {
  pass_fd: "Passing first downs",
  rush_fd: "Rushing first downs",
  rec_fd: "Receiving first downs",
  fum_lost: "Fumbles lost",
  fum: "Fumbles",
  fgmiss: "Missed field goals",
  xpmiss: "Missed extra points",
  blk_kick: "Blocked kicks",
  fum_rec_td: "Fumble-recovery touchdowns",
  def_st_ff: "Defense/special-teams forced fumbles",
  def_st_fum_rec: "Defense/special-teams fumble recoveries",
  st_ff: "Individual special-teams forced fumbles",
  st_fum_rec: "Individual special-teams fumble recoveries",
};

const DERIVED_RULES = new Set([
  "pass_inc",
  "fgmiss",
  "fum",
  "fum_lost",
  "def_st_td",
  "st_td",
]);

function humanize(key: string) {
  return LABELS[key] ??
    key
      .replaceAll("_", " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase())
      .replaceAll("Td", "TD")
      .replaceAll("Yd", "yards");
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function rounded(value: number) {
  return Math.round(value * 100) / 100;
}

function normalizedPosition(position: string) {
  const value = position.toUpperCase();
  if (value === "DEF" || value === "D") return "DST";
  if (value === "DE" || value === "DT") return "DL";
  if (value === "CB" || value === "S") return "DB";
  return value;
}

function applies(rule: SimpleRule, position: string) {
  const normalized = normalizedPosition(position);
  return rule.positions.some(
    (candidate) => normalizedPosition(candidate) === normalized,
  );
}

function directTerm(
  key: string,
  multiplier: number,
  rule: SimpleRule,
  stats: Record<string, number>,
): ScoringFormulaTerm {
  const value = stats[rule.stat];
  if (!finite(value)) {
    return {
      key,
      label: rule.label,
      stat: rule.stat,
      projectedStat: null,
      multiplier,
      points: null,
      support: "unsupported",
      note: `FantasyPros did not return ${rule.stat} for this player.`,
    };
  }
  return {
    key,
    label: rule.label,
    stat: rule.stat,
    projectedStat: value,
    multiplier,
    points: rounded(value * multiplier),
    support: "supported",
    note: `${rounded(value)} × ${multiplier}`,
  };
}

function partialTerm(
  key: string,
  label: string,
  stat: string,
  projectedStat: number | null,
  multiplier: number,
  points: number | null,
  note: string,
): ScoringFormulaTerm {
  return {
    key,
    label,
    stat,
    projectedStat,
    multiplier,
    points: points === null ? null : rounded(points),
    support: "partial",
    note,
  };
}

function unsupportedTerm(
  key: string,
  multiplier: number,
  detail: string,
): ScoringFormulaTerm {
  return {
    key,
    label: humanize(key),
    stat: "not projected",
    projectedStat: null,
    multiplier,
    points: null,
    support: "unsupported",
    note: detail,
  };
}

function scoringMap(context: LeagueScoringContext) {
  return new Map(context.scoring.map((item) => [item.key, item.value]));
}

function allProjectionStats(players: LeagueScoringPlayer[]) {
  const result = new Set<string>();
  for (const player of players) {
    for (const key of Object.keys(player.projectionStats)) result.add(key);
  }
  return result;
}

function categoryCoverage(
  context: LeagueScoringContext,
  players: LeagueScoringPlayer[],
): ScoringCategoryCoverage[] {
  const availableStats = allProjectionStats(players);
  const scoring = scoringMap(context);
  const activeDistanceRules = KICK_DISTANCE_KEYS.filter(
    (key) => (scoring.get(key) ?? 0) !== 0,
  );
  const activeTwoPointRules = TWO_POINT_KEYS.filter(
    (key) => (scoring.get(key) ?? 0) !== 0,
  );
  const completeDistanceSet =
    activeDistanceRules.length === KICK_DISTANCE_KEYS.length;
  const uniformDistance =
    completeDistanceSet &&
    new Set(activeDistanceRules.map((key) => scoring.get(key))).size === 1;
  const uniformTwoPoint =
    activeTwoPointRules.length > 1 &&
    new Set(activeTwoPointRules.map((key) => scoring.get(key))).size === 1;

  return context.scoring.map(({ key, value }) => {
    if (value === 0) {
      return {
        key,
        value,
        label: humanize(key),
        support: "supported",
        detail: "This category is set to zero and does not affect rankings.",
      };
    }
    const simple = SIMPLE_RULES[key];
    if (simple) {
      const available = availableStats.has(simple.stat);
      return {
        key,
        value,
        label: simple.label,
        support: available ? "supported" : "unsupported",
        detail: available
          ? `Rebuilt from FantasyPros ${simple.stat} projections.`
          : `FantasyPros did not return the required ${simple.stat} projection.`,
      };
    }
    if ((KICK_DISTANCE_KEYS as readonly string[]).includes(key)) {
      return {
        key,
        value,
        label: humanize(key),
        support: uniformDistance && availableStats.has("fg")
          ? "supported"
          : availableStats.has("fg")
            ? "partial"
            : "unsupported",
        detail: uniformDistance
          ? "Every field-goal distance is worth the same amount, so total field goals are sufficient."
          : availableStats.has("fg")
            ? "Total field goals are projected, but the distance distribution is not. Only the guaranteed distance floor is modeled."
            : "FantasyPros did not return field-goal projections.",
      };
    }
    if ((TWO_POINT_KEYS as readonly string[]).includes(key)) {
      return {
        key,
        value,
        label: humanize(key),
        support: uniformTwoPoint && availableStats.has("2pt_tds")
          ? "supported"
          : availableStats.has("2pt_tds")
            ? "partial"
            : "unsupported",
        detail: uniformTwoPoint
          ? "All two-point conversions have the same value, so the combined projection is sufficient."
          : availableStats.has("2pt_tds")
            ? "FantasyPros combines passing, rushing and receiving two-point conversions, so different category values cannot be separated exactly."
            : "FantasyPros did not return a two-point conversion projection.",
      };
    }
    if (key === "pass_inc") {
      const available = availableStats.has("pass_att") && availableStats.has("pass_cmp");
      return {
        key,
        value,
        label: "Incomplete passes",
        support: available ? "supported" : "unsupported",
        detail: available
          ? "Derived exactly as passing attempts minus completions."
          : "Passing attempts and completions are both required.",
      };
    }
    if (key === "fgmiss") {
      const available = availableStats.has("fga") && availableStats.has("fg");
      return {
        key,
        value,
        label: "Missed field goals",
        support: available ? "supported" : "unsupported",
        detail: available
          ? "Derived exactly as field-goal attempts minus field goals made."
          : "Field-goal attempts and makes are both required.",
      };
    }
    if (key === "fum") {
      return {
        key,
        value,
        label: "Fumbles",
        support: availableStats.has("fumbles") ? "supported" : "unsupported",
        detail: availableStats.has("fumbles")
          ? "Rebuilt from projected total fumbles."
          : "FantasyPros did not return fumble projections.",
      };
    }
    if (key === "fum_lost") {
      return {
        key,
        value,
        label: "Fumbles lost",
        support: availableStats.has("fumbles") ? "partial" : "unsupported",
        detail: availableStats.has("fumbles")
          ? "FantasyPros projects total fumbles, not fumbles lost. The engine visibly estimates 50% as lost."
          : "FantasyPros did not return fumble projections.",
      };
    }
    const unavailableKind = /(^|_)(fd|first_down)(_|$)/.test(key)
      ? "first-down counts"
      : /(^|_)(long|40p|50p)(_|$)/.test(key)
        ? "long-play counts"
        : /(^|_)(ret_yd|return_yd)(_|$)/.test(key)
          ? "return yardage"
          : /(^|_)(xpmiss)(_|$)/.test(key)
            ? "extra-point attempts"
            : "the required underlying statistic";
    return {
      key,
      value,
      label: humanize(key),
      support: "unsupported",
      detail: `The current projection feed does not provide reliable ${unavailableKind}; this category is not silently estimated.`,
    };
  });
}

function scorePlayer(
  player: LeagueScoringPlayer,
  context: LeagueScoringContext,
): Omit<
  LeagueScoringResult,
  | "leagueRank"
  | "leaguePositionRank"
  | "leagueTier"
  | "replacementValue"
  | "scarcityAdjustedValue"
> {
  const scoring = scoringMap(context);
  const stats = player.projectionStats;
  const position = normalizedPosition(player.position);
  const formula: ScoringFormulaTerm[] = [];
  const handled = new Set<string>();

  for (const { key, value } of context.scoring) {
    if (value === 0) {
      handled.add(key);
      continue;
    }
    const rule = SIMPLE_RULES[key];
    if (!rule || !applies(rule, position)) continue;
    formula.push(directTerm(key, value, rule, stats));
    handled.add(key);
  }

  const passIncomplete = scoring.get("pass_inc");
  if (position === "QB" && finite(passIncomplete) && passIncomplete !== 0) {
    const attempts = stats.pass_att;
    const completions = stats.pass_cmp;
    if (finite(attempts) && finite(completions)) {
      const incompletions = Math.max(0, attempts - completions);
      formula.push({
        key: "pass_inc",
        label: "Incomplete passes",
        stat: "pass_att − pass_cmp",
        projectedStat: rounded(incompletions),
        multiplier: passIncomplete,
        points: rounded(incompletions * passIncomplete),
        support: "supported",
        note: `(${rounded(attempts)} − ${rounded(completions)}) × ${passIncomplete}`,
      });
    } else {
      formula.push(
        unsupportedTerm(
          "pass_inc",
          passIncomplete,
          "Passing attempts and completions were not both projected.",
        ),
      );
    }
    handled.add("pass_inc");
  }

  const fumbles = stats.fumbles;
  const fumbleValue = scoring.get("fum");
  if (OFFENSE.includes(position as (typeof OFFENSE)[number]) && finite(fumbleValue) && fumbleValue !== 0) {
    formula.push(
      finite(fumbles)
        ? {
          key: "fum",
          label: "Fumbles",
          stat: "fumbles",
          projectedStat: fumbles,
          multiplier: fumbleValue,
          points: rounded(fumbles * fumbleValue),
          support: "supported",
          note: `${rounded(fumbles)} × ${fumbleValue}`,
        }
        : unsupportedTerm("fum", fumbleValue, "Total fumbles were not projected."),
    );
    handled.add("fum");
  }
  const fumblesLostValue = scoring.get("fum_lost");
  if (
    OFFENSE.includes(position as (typeof OFFENSE)[number]) &&
    finite(fumblesLostValue) &&
    fumblesLostValue !== 0
  ) {
    formula.push(
      finite(fumbles)
        ? partialTerm(
          "fum_lost",
          "Fumbles lost",
          "fumbles × estimated 50% lost",
          rounded(fumbles * 0.5),
          fumblesLostValue,
          fumbles * 0.5 * fumblesLostValue,
          `${rounded(fumbles)} total fumbles × 50% estimated lost × ${fumblesLostValue}`,
        )
        : unsupportedTerm(
          "fum_lost",
          fumblesLostValue,
          "FantasyPros did not return total fumbles; fumbles lost cannot be estimated.",
        ),
    );
    handled.add("fum_lost");
  }

  if (position === "K") {
    const missValue = scoring.get("fgmiss");
    if (finite(missValue) && missValue !== 0) {
      const attempts = stats.fga;
      const made = stats.fg;
      if (finite(attempts) && finite(made)) {
        const missed = Math.max(0, attempts - made);
        formula.push({
          key: "fgmiss",
          label: "Missed field goals",
          stat: "fga − fg",
          projectedStat: rounded(missed),
          multiplier: missValue,
          points: rounded(missed * missValue),
          support: "supported",
          note: `(${rounded(attempts)} − ${rounded(made)}) × ${missValue}`,
        });
      } else {
        formula.push(
          unsupportedTerm(
            "fgmiss",
            missValue,
            "Field-goal attempts and makes were not both projected.",
          ),
        );
      }
      handled.add("fgmiss");
    }

    const activeDistanceRules = KICK_DISTANCE_KEYS.filter(
      (key) => (scoring.get(key) ?? 0) !== 0,
    );
    if (activeDistanceRules.length) {
      const values = activeDistanceRules.map((key) => scoring.get(key) ?? 0);
      const complete = activeDistanceRules.length === KICK_DISTANCE_KEYS.length;
      const uniform = complete && new Set(values).size === 1;
      const made = stats.fg;
      const floor = Math.min(...values);
      formula.push(
        finite(made)
          ? {
            key: activeDistanceRules.join("+"),
            label: uniform
              ? "Field goals made"
              : "Field-goal distance floor",
            stat: "fg",
            projectedStat: made,
            multiplier: floor,
            points: rounded(made * floor),
            support: uniform ? "supported" : "partial",
            note: uniform
              ? `${rounded(made)} total field goals × ${floor}; every distance band has the same value`
              : `${rounded(made)} total field goals × ${floor} guaranteed points; distance bonuses are unmodeled`,
          }
          : unsupportedTerm(
            activeDistanceRules.join("+"),
            floor,
            "Total field goals were not projected.",
          ),
      );
      activeDistanceRules.forEach((key) => handled.add(key));
    }
  }

  if (OFFENSE.includes(position as (typeof OFFENSE)[number])) {
    const activeTwoPointRules = TWO_POINT_KEYS.filter(
      (key) => (scoring.get(key) ?? 0) !== 0,
    );
    if (activeTwoPointRules.length) {
      const values = activeTwoPointRules.map((key) => scoring.get(key) ?? 0);
      const uniform = activeTwoPointRules.length > 1 && new Set(values).size === 1;
      const multiplier = Math.min(...values);
      const conversions = stats["2pt_tds"];
      formula.push(
        finite(conversions)
          ? {
            key: activeTwoPointRules.join("+"),
            label: "Two-point conversions",
            stat: "2pt_tds",
            projectedStat: conversions,
            multiplier,
            points: rounded(conversions * multiplier),
            support: uniform ? "supported" : "partial",
            note: uniform
              ? `${rounded(conversions)} combined conversions × ${multiplier}; all conversion types score equally`
              : `${rounded(conversions)} combined conversions × ${multiplier} minimum value; types cannot be separated`,
          }
          : unsupportedTerm(
            activeTwoPointRules.join("+"),
            multiplier,
            "Combined two-point conversions were not projected.",
          ),
      );
      activeTwoPointRules.forEach((key) => handled.add(key));
    }
  }

  for (const { key, value } of context.scoring) {
    if (value === 0 || handled.has(key) || SIMPLE_RULES[key]) continue;
    if (
      (KICK_DISTANCE_KEYS as readonly string[]).includes(key) ||
      (TWO_POINT_KEYS as readonly string[]).includes(key) ||
      DERIVED_RULES.has(key)
    ) {
      continue;
    }
    const appliesToPlayer =
      position === "K"
        ? /^(fg|xp)/.test(key)
        : position === "DST"
          ? /^(def_|st_|pts_allow|yds_allow|sack|int|ff|fum_rec|safe|blk)/.test(key)
          : IDP.includes(position as (typeof IDP)[number])
            ? /^(idp_|tackle|pass_defended|sack|int|ff|fum_rec|safe|def_td)/.test(key)
            : /^(pass_|rush_|rec_|bonus_|fum|st_|ret_)/.test(key);
    if (appliesToPlayer) {
      formula.push(
        unsupportedTerm(
          key,
          value,
          "The projection feed does not contain the required underlying statistic, so this category contributes no hidden points.",
        ),
      );
    }
  }

  const supported = formula.filter((term) => term.support === "supported");
  const partial = formula.filter((term) => term.support === "partial");
  const unsupported = formula.filter((term) => term.support === "unsupported");
  const modeledPoints = formula.reduce(
    (total, term) => total + (term.points ?? 0),
    0,
  );
  const modeledTerms = supported.length + partial.length;
  const totalTerms = formula.length;
  const coverage = totalTerms
    ? (supported.length + partial.length * 0.5) / totalTerms
    : 0;
  const hasRebuild = modeledTerms > 0;
  const projectedPoints = hasRebuild
    ? rounded(modeledPoints)
    : player.providerProjectedPoints;
  const mode: LeagueScoringResult["leagueScoringMode"] = hasRebuild
    ? partial.length || unsupported.length
      ? "partially-rebuilt"
      : "rebuilt"
    : finite(player.providerProjectedPoints)
      ? "provider-fallback"
      : "unavailable";
  const confidence: ScoringConfidence =
    mode === "rebuilt" && coverage >= 0.95
      ? "high"
      : hasRebuild && coverage >= 0.6
        ? "medium"
        : "low";
  const warnings = [
    ...partial.map((term) => `${term.label}: ${term.note}`),
    ...unsupported.map((term) => `${term.label}: ${term.note}`),
  ];
  if (mode === "provider-fallback") {
    warnings.unshift(
      "The custom formula could not be rebuilt from component statistics. The provider's default projection is shown as a low-confidence fallback.",
    );
  }

  return {
    id: player.id,
    projectedPoints,
    scoringConfidence: confidence,
    scoringCoverage: rounded(coverage * 100),
    scoringFormula: formula,
    scoringWarnings: warnings,
    leagueScoringMode: mode,
  };
}

function normalizedRosterCount(
  counts: Record<string, number>,
  position: string,
) {
  const normalized = normalizedPosition(position);
  return Object.entries(counts).reduce((total, [slot, count]) => {
    return normalizedPosition(slot) === normalized ? total + count : total;
  }, 0);
}

function demandPerTeam(position: string, context: LeagueScoringContext) {
  const normalized = normalizedPosition(position);
  const direct = normalizedRosterCount(context.rosterCounts, normalized);
  const directIdp =
    normalizedRosterCount(context.rosterCounts, "DL") +
    normalizedRosterCount(context.rosterCounts, "LB") +
    normalizedRosterCount(context.rosterCounts, "DB");
  const idpFlexSlots = Math.max(0, context.idpSlots - directIdp);
  const flexShare =
    normalized === "RB"
      ? 0.35
      : normalized === "WR"
        ? 0.45
        : normalized === "TE"
          ? 0.2
          : 0;
  const superFlexShare = normalized === "QB" ? 0.9 : flexShare * 0.1;
  const idpShare = ["DL", "LB", "DB"].includes(normalized)
    ? idpFlexSlots / 3
    : 0;
  const benchShare =
    normalized === "QB"
      ? 0.06
      : normalized === "RB"
        ? 0.32
        : normalized === "WR"
          ? 0.36
          : normalized === "TE"
            ? 0.12
            : normalized === "K" || normalized === "DST"
              ? 0.02
              : ["DL", "LB", "DB"].includes(normalized)
                ? 0.04
                : 0;
  return (
    direct +
    context.flexSlots * flexShare +
    context.superFlexSlots * superFlexShare +
    idpShare +
    context.benchSlots * benchShare
  );
}

function tierForPosition(
  positionResults: Array<LeagueScoringResult & { position: string }>,
) {
  let tier = 1;
  let playersInTier = 0;
  let previous = positionResults[0]?.scarcityAdjustedValue ?? null;
  for (const player of positionResults) {
    const value = player.scarcityAdjustedValue;
    if (
      previous !== null &&
      value !== null &&
      playersInTier > 0 &&
      (previous - value >= Math.max(4, Math.abs(previous) * 0.12) ||
        playersInTier >= 8)
    ) {
      tier += 1;
      playersInTier = 0;
    }
    player.leagueTier = value === null ? null : tier;
    if (value !== null) {
      previous = value;
      playersInTier += 1;
    }
  }
}

export function buildLeagueScoringBoard(
  players: LeagueScoringPlayer[],
  context: LeagueScoringContext,
): LeagueScoringBoard {
  type RankedResult = LeagueScoringResult & { position: string };
  const base: RankedResult[] = players.map((player) => ({
    ...scorePlayer(player, context),
    position: normalizedPosition(player.position),
    leagueRank: null,
    leaguePositionRank: null,
    leagueTier: null,
    replacementValue: null,
    scarcityAdjustedValue: null,
  }));
  const byPosition = new Map<string, typeof base>();
  for (const player of base) {
    const current = byPosition.get(player.position);
    if (current) current.push(player);
    else byPosition.set(player.position, [player]);
  }

  for (const [position, group] of byPosition) {
    group.sort(
      (left, right) =>
        (right.projectedPoints ?? Number.MIN_SAFE_INTEGER) -
          (left.projectedPoints ?? Number.MIN_SAFE_INTEGER) ||
        left.id.localeCompare(right.id),
    );
    const demand = Math.max(
      1,
      Math.round(demandPerTeam(position, context) * context.teamCount),
    );
    const replacement =
      group[Math.min(group.length - 1, demand)]?.projectedPoints ?? null;
    group.forEach((player, index) => {
      player.leaguePositionRank = player.projectedPoints === null ? null : index + 1;
      player.replacementValue =
        player.projectedPoints === null || replacement === null
          ? null
          : rounded(player.projectedPoints - replacement);
      const demandPressure = Math.min(
        12,
        (demand / Math.max(group.length, 1)) * 8,
      );
      player.scarcityAdjustedValue =
        player.projectedPoints === null || player.replacementValue === null
          ? null
          : rounded(
            player.replacementValue +
              player.projectedPoints * 0.04 +
              demandPressure,
          );
    });
    group.sort(
      (left, right) =>
        (right.scarcityAdjustedValue ?? Number.MIN_SAFE_INTEGER) -
          (left.scarcityAdjustedValue ?? Number.MIN_SAFE_INTEGER) ||
        (right.projectedPoints ?? Number.MIN_SAFE_INTEGER) -
          (left.projectedPoints ?? Number.MIN_SAFE_INTEGER),
    );
    tierForPosition(group);
  }

  const ranked = [...base].sort(
    (left, right) =>
      (right.scarcityAdjustedValue ?? Number.MIN_SAFE_INTEGER) -
        (left.scarcityAdjustedValue ?? Number.MIN_SAFE_INTEGER) ||
      (right.projectedPoints ?? Number.MIN_SAFE_INTEGER) -
        (left.projectedPoints ?? Number.MIN_SAFE_INTEGER) ||
      left.id.localeCompare(right.id),
  );
  ranked.forEach((player, index) => {
    player.leagueRank = player.scarcityAdjustedValue === null ? null : index + 1;
  });

  const categories = categoryCoverage(context, players);
  return {
    players: ranked,
    categories,
    supportedCategories: categories.filter(
      (category) => category.value !== 0 && category.support === "supported",
    ).length,
    partialCategories: categories.filter(
      (category) => category.value !== 0 && category.support === "partial",
    ).length,
    unsupportedCategories: categories.filter(
      (category) => category.value !== 0 && category.support === "unsupported",
    ).length,
  };
}
