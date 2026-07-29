export type LeagueStatus = "pre_draft" | "drafting" | "in_season" | "complete";

export interface League {
  league_id: string;
  name: string;
  season: string;
  status: LeagueStatus;
  total_rosters: number;
  draft_id: string;
  previous_league_id: string | null;
  roster_positions: string[];
  settings: {
    num_teams: number;
    playoff_teams: number;
    playoff_week_start: number;
    reserve_slots: number;
    waiver_budget: number;
    trade_deadline: number;
    max_keepers: number;
    [key: string]: number;
  };
  scoring_settings: {
    rec?: number;
    pass_td?: number;
    pass_int?: number;
    [key: string]: number | undefined;
  };
}

export interface Draft {
  draft_id: string;
  league_id: string;
  type: "snake" | "linear" | "auction";
  status: "pre_draft" | "drafting" | "complete";
  start_time: number | null;
  draft_order: Record<string, number> | null;
  slot_to_roster_id: Record<string, number>;
  settings: {
    teams: number;
    rounds: number;
    pick_timer: number;
    slots_qb: number;
    slots_rb: number;
    slots_wr: number;
    slots_te: number;
    slots_flex: number;
    slots_k: number;
    slots_def: number;
    slots_bn: number;
  };
}

export interface SleeperDraftPick {
  player_id: string;
  picked_by: string;
  roster_id: number | string;
  round: number;
  draft_slot: number;
  pick_no: number;
  is_keeper: boolean | null;
  metadata: {
    first_name?: string;
    last_name?: string;
    team?: string;
    position?: string;
    injury_status?: string;
    [key: string]: string | undefined;
  };
}

export interface SleeperPlayer {
  player_id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  position: string | null;
  fantasy_positions: string[] | null;
  team: string | null;
  injury_status: string | null;
  status: string | null;
  age: number | null;
  years_exp: number | null;
}

export interface LeagueUser {
  user_id: string;
  display_name: string;
  avatar: string | null;
  metadata: {
    team_name?: string;
  } | null;
}

export interface Roster {
  roster_id: number;
  owner_id: string;
  players: string[];
  keepers: string[];
  reserve: string[];
  starters: string[];
  settings: {
    wins: number;
    losses: number;
    ties: number;
    waiver_position: number;
    waiver_budget_used: number;
    [key: string]: number;
  };
}

export interface SleeperTrendingPlayer {
  player_id: string;
  count: number;
}

export interface SleeperTransaction {
  transaction_id: string;
  type: "waiver" | "free_agent" | "trade" | string;
  status: "complete" | "failed" | "pending" | string;
  status_updated: number;
  created: number;
  leg: number;
  roster_ids: number[];
  adds: Record<string, number> | null;
  drops: Record<string, number> | null;
  settings: {
    waiver_bid?: number;
    seq?: number;
    priority?: number;
    [key: string]: number | undefined;
  } | null;
  metadata: Record<string, string> | null;
}

export interface SleeperMatchup {
  roster_id: number;
  matchup_id: number | null;
  points: number;
  custom_points: number | null;
  starters: string[];
  players: string[];
  starters_points?: number[];
  players_points?: Record<string, number>;
}

export interface NflState {
  week: number;
  display_week: number;
  leg: number;
  season: string;
  season_type: "pre" | "regular" | "post";
}

export interface LeagueSnapshot {
  league: League;
  draft: Draft;
  users: LeagueUser[];
  rosters: Roster[];
  fetchedAt: number;
}

export interface WeeklyOutlook {
  state: NflState;
  currentWeek: number;
  regularSeasonWeeks: number;
  matchupsByWeek: Record<number, SleeperMatchup[]>;
  fetchedAt: number;
}
