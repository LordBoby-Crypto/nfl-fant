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

export interface LeagueSnapshot {
  league: League;
  draft: Draft;
  users: LeagueUser[];
  rosters: Roster[];
  fetchedAt: number;
}
