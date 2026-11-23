// ============================================================================
// GOVERNOR — NationStates-Style Monthly Docket (4 Issues) & State of the City Report
// 1. Generates 4 distinct grounded municipal dilemmas every month (1 per core
//    pillar: Crime, Pollution, Land Value, Traffic), each with 3 distinct
//    ideological/mathematical preset options + Option 4 (Custom Executive Override).
// 2. Generates the structured Monthly "State of the City" Summary Report with
//    month-over-month deltas, 1-sentence pillar status assessments, fiscal recap,
//    tension trajectories, and appointee competence/loyalty impacts.
// ============================================================================

import {
  ActiveCustomPolicy,
  CivicPillar,
  CulturePointsState,
  DepartmentHeadsState,
  DocketPresetOption,
  HeatmapMetric,
  MonthlyCityReport,
  MonthlyDocketIssue,
  PillarReportEntry,
  PoliticalCompassProfile,
  TensionMetersState,
  TreasuryState,
  VALID_CIVIC_PILLARS,
  VoterSentimentState,
} from "../types/simulation";
import { parseAndClampAIPolicyResponse } from "./aiGuardrails";

export const DOCKET_PRESET_CAPITAL_COST = 0;
export const DOCKET_CUSTOM_CAPITAL_COST = 20;
export const REPEAL_POLICY_CAPITAL_COST = 10;
export const PUBLIC_ADDRESS_TREASURY_COST = 250_000;
export const PUBLIC_ADDRESS_CAPITAL_GAIN = 20;
export const MONTHLY_BASE_CAPITAL_STIPEND = 20;
export const MONTHLY_MANDATE_CAPITAL_BONUS = 10;

// ----------------------------------------------------------------------------
// 1. Grounded Municipal Dilemma Templates (4 Pillars x Multiple Rotating Issues)
// ----------------------------------------------------------------------------

interface RawIssueTemplate {
  templateId?: string;
  title: string;
  briefing: string;
  presets: Array<{
    stanceLabel: string;
    optionTitle: string;
    description: string;
    capitalCost?: number;
    rawEffect: unknown;
  }>;
}

const CRIME_DOCKET_POOL: RawIssueTemplate[] = [
  {
    title: "The Midnight Freight Yard Heists",
    briefing:
      "Organized crews are stripping copper and hijacking cargo containers from outer industrial rail yards after midnight. Warehouse owners demand armed tactical patrols, while union reps warn that heavy-handed sweeps will spark strikes.",
    presets: [
      {
        stanceLabel: "Tough on Crime",
        optionTitle: "Deploy Armed Tactical Rail Patrols",
        description:
          "Authorize overtime precinct sweeps and mandatory ID checkpoints across all industrial freight yards.",
        capitalCost: 10,
        rawEffect: {
          policy_name: "Tactical Freight Sweep Order",
          vibe_feed_headline:
            "Armed precinct units lock down industrial rail yards in midnight sweep.",
          budget_impact: { monthly_change: -35000 },
          heatmap_modifiers: [
            { metric: "crime", change: -12 },
            { metric: "land_value", change: 4 },
          ],
          demographic_approval: [
            { demographic: "business", change: 9 },
            { demographic: "wealthy", change: 6 },
            { demographic: "working_class", change: -7 },
          ],
          unintended_consequence_trigger:
            "Night-shift dockworkers stage slowdowns over checkpoint delays.",
        },
      },
      {
        stanceLabel: "Community Reform",
        optionTitle: "Fund Late-Night Apprenticeship & Lighting",
        description:
          "Install high-lumen solar floodlights and hire local youth stewards for paid night-watch apprenticeships.",
        capitalCost: 10,
        rawEffect: {
          policy_name: "Safe Yards Apprenticeship Act",
          vibe_feed_headline:
            "Mayor funds floodlights and union youth watch across freight corridors.",
          budget_impact: { monthly_change: -45000 },
          heatmap_modifiers: [
            { metric: "crime", change: -8 },
            { metric: "pollution", change: -3 },
          ],
          demographic_approval: [
            { demographic: "working_class", change: 10 },
            { demographic: "environmentalists", change: 5 },
            { demographic: "wealthy", change: -4 },
          ],
          unintended_consequence_trigger: null,
        },
      },
      {
        stanceLabel: "Privatized Enforcement",
        optionTitle: "Mandate Corporate Security Co-Pay",
        description:
          "Require logistics firms to fund licensed private drone and guard patrols in exchange for tax credits.",
        capitalCost: 10,
        rawEffect: {
          policy_name: "Private Rail Guard Mandate",
          vibe_feed_headline:
            "Private security drones patrol freight yards under municipal co-pay.",
          budget_impact: { monthly_change: 15000 },
          heatmap_modifiers: [
            { metric: "crime", change: -7 },
            { metric: "land_value", change: 5 },
          ],
          demographic_approval: [
            { demographic: "wealthy", change: 5 },
            { demographic: "working_class", change: -9 },
            { demographic: "business", change: -3 },
          ],
          unintended_consequence_trigger:
            "Civil liberties groups challenge private drone surveillance range.",
        },
      },
    ],
  },
  {
    title: "Encampment Clearance vs. Shelter Triage",
    briefing:
      "Merchants near the Civic Plaza report rising petty theft and open-air contraband markets, demanding immediate clearance. Social workers warn that sweeps without shelter beds merely push crime into residential wards.",
    presets: [
      {
        stanceLabel: "Law & Order Sweep",
        optionTitle: "Enforce Zero-Tolerance Plaza Zone",
        description:
          "Clear downtown plazas within 48 hours and station permanent foot patrols at commercial intersections.",
        capitalCost: 10,
        rawEffect: {
          policy_name: "Civic Plaza Zero-Tolerance",
          vibe_feed_headline:
            "Police clear central plazas as downtown merchants applaud crackdown.",
          budget_impact: { monthly_change: -25000 },
          heatmap_modifiers: [
            { metric: "crime", change: -11 },
            { metric: "land_value", change: 6 },
          ],
          demographic_approval: [
            { demographic: "business", change: 10 },
            { demographic: "wealthy", change: 8 },
            { demographic: "working_class", change: -10 },
          ],
          unintended_consequence_trigger:
            "Outer residential wards report a sudden uptick in displaced vagrancy.",
        },
      },
      {
        stanceLabel: "Progressive Triage",
        optionTitle: "Convert Vacant Warehouses to Triage Hubs",
        description:
          "Lease empty municipal warehouses for 24/7 housing-first triage, addiction clinics, and social patrol teams.",
        capitalCost: 10,
        rawEffect: {
          policy_name: "Housing-First Triage Charter",
          vibe_feed_headline:
            "City converts vacant warehouses into 24/7 shelter and clinic hubs.",
          budget_impact: { monthly_change: -55000 },
          heatmap_modifiers: [
            { metric: "crime", change: -9 },
            { metric: "land_value", change: -3 },
          ],
          demographic_approval: [
            { demographic: "working_class", change: 11 },
            { demographic: "environmentalists", change: 6 },
            { demographic: "wealthy", change: -7 },
          ],
          unintended_consequence_trigger: null,
        },
      },
      {
        stanceLabel: "Fiscal Restraint",
        optionTitle: "Levy Business Improvement District Assessment",
        description:
          "Assess a mandatory security fee on downtown storefronts to fund dedicated plaza ambassadors.",
        capitalCost: 10,
        rawEffect: {
          policy_name: "Downtown Security Levy",
          vibe_feed_headline:
            "Storefront security levy funds unarmed downtown plaza ambassadors.",
          budget_impact: { monthly_change: 25000 },
          heatmap_modifiers: [{ metric: "crime", change: -5 }],
          demographic_approval: [
            { demographic: "business", change: -6 },
            { demographic: "working_class", change: 4 },
          ],
          unintended_consequence_trigger: null,
        },
      },
    ],
  },
  {
    title: "Algorithmic Predictive Policing Controversy",
    briefing:
      "A tech vendor is offering the Police Department an AI gunshot-detection and predictive patrol dispatch suite. Privacy advocates call it unconstitutional profiling, while precinct captains say it will cut response times in half.",
    presets: [
      {
        stanceLabel: "Technocrat Authority",
        optionTitle: "Deploy Citywide Acoustic & Predictive Grid",
        description:
          "Install automated sensor arrays across all high-crime tiles and route patrol cars algorithmically.",
        capitalCost: 10,
        rawEffect: {
          policy_name: "Predictive Patrol Sensor Grid",
          vibe_feed_headline:
            "AI gunshot sensors and predictive patrol routing go live citywide.",
          budget_impact: { monthly_change: -40000 },
          heatmap_modifiers: [
            { metric: "crime", change: -14 },
            { metric: "land_value", change: 5 },
          ],
          demographic_approval: [
            { demographic: "wealthy", change: 9 },
            { demographic: "business", change: 8 },
            { demographic: "working_class", change: -9 },
          ],
          unintended_consequence_trigger:
            "False-positive sensor dispatches trigger civil rights audit demands.",
        },
      },
      {
        stanceLabel: "Civil Liberties Guard",
        optionTitle: "Ban Predictive Algorithms & Hire Beat Officers",
        description:
          "Outlaw automated profiling software and invest in foot-patrol officers assigned to their home neighborhoods.",
        capitalCost: 10,
        rawEffect: {
          policy_name: "Neighborhood Beat Policing Act",
          vibe_feed_headline:
            "Mayor bans predictive policing AI in favor of local neighborhood beat cops.",
          budget_impact: { monthly_change: -50000 },
          heatmap_modifiers: [{ metric: "crime", change: -9 }],
          demographic_approval: [
            { demographic: "working_class", change: 11 },
            { demographic: "environmentalists", change: 5 },
            { demographic: "business", change: -4 },
          ],
          unintended_consequence_trigger: null,
        },
      },
      {
        stanceLabel: "Austerity Audit",
        optionTitle: "Sell Surplus Precinct Fleet & Consolidate Dispatch",
        description:
          "Reject the vendor contract, merge regional dispatch desks, and auction underutilized patrol vehicles.",
        capitalCost: 10,
        rawEffect: {
          policy_name: "Precinct Fleet Consolidation",
          vibe_feed_headline:
            "Administration consolidates police dispatch desks to trim municipal deficit.",
          budget_impact: { monthly_change: 40000 },
          heatmap_modifiers: [{ metric: "crime", change: 5 }],
          demographic_approval: [
            { demographic: "wealthy", change: -5 },
            { demographic: "business", change: -4 },
            { demographic: "working_class", change: 2 },
          ],
          unintended_consequence_trigger:
            "Outer-ring 911 response times lengthen by four minutes.",
        },
      },
    ],
  },
  {
    title: "Harbor Dockside Contraband Smuggling Ring",
    briefing:
      "Customs inspectors warn that organized syndicates are using untraceable night barges to move illicit cargo through Meridian Harbor's older piers.",
    presets: [
      {
        stanceLabel: "Maritime Crackdown",
        optionTitle: "Charter Harbor Patrol Gunboats & Sonar Nets",
        description:
          "Deploy interdiction boats and mandatory container X-ray scanners across every commercial pier.",
        capitalCost: 15,
        rawEffect: {
          policy_name: "Harbor Interdiction Taskforce",
          vibe_feed_headline:
            "Police gunboats and X-ray scanners shut down dockside smuggling ring.",
          budget_impact: { monthly_change: -45000 },
          heatmap_modifiers: [
            { metric: "crime", change: -13 },
            { metric: "traffic", change: 4 },
          ],
          demographic_approval: [
            { demographic: "wealthy", change: 8 },
            { demographic: "business", change: 6 },
            { demographic: "working_class", change: -5 },
          ],
          unintended_consequence_trigger:
            "Container inspection queues slow morning freight turnaround.",
        },
      },
      {
        stanceLabel: "Whistleblower Accord",
        optionTitle: "Partner with Longshoremen Union Stewards",
        description:
          "Establish a confidential union tip bounty and protect dockworkers who report illicit manifest tampering.",
        capitalCost: -5,
        rawEffect: {
          policy_name: "Dockworker Integrity Bounty",
          vibe_feed_headline:
            "Longshoremen union stewards partner with city to expose contraband.",
          budget_impact: { monthly_change: -20000 },
          heatmap_modifiers: [{ metric: "crime", change: -9 }],
          demographic_approval: [
            { demographic: "working_class", change: 11 },
            { demographic: "business", change: 4 },
          ],
          unintended_consequence_trigger: null,
        },
      },
      {
        stanceLabel: "Port Privatization",
        optionTitle: "Lease Pier Security to Global Maritime Insurers",
        description:
          "Transfer pier policing liability to shipping underwriters in exchange for an annual harbor concession fee.",
        capitalCost: 0,
        rawEffect: {
          policy_name: "Maritime Underwriter Security Lease",
          vibe_feed_headline:
            "Global shipping insurers take over pier security under port lease.",
          budget_impact: { monthly_change: 30000 },
          heatmap_modifiers: [{ metric: "crime", change: -6 }],
          demographic_approval: [
            { demographic: "business", change: 8 },
            { demographic: "working_class", change: -7 },
          ],
          unintended_consequence_trigger: null,
        },
      },
    ],
  },
  {
    title: "Nightlife District Noise & Brawl Clampdown",
    briefing:
      "Residents bordering the entertainment strip complain of 3 AM street brawls and illegal after-hours clubs, while hospitality owners warn that early curfews will bankrupt local venues.",
    presets: [
      {
        stanceLabel: "Strict Curfew",
        optionTitle: "Enforce 1:00 AM Last-Call & Liquor License Audits",
        description:
          "Mandate a 1:00 AM alcohol cutoff and revoke permits from any venue cited for disorderly conduct.",
        capitalCost: 15,
        rawEffect: {
          policy_name: "Nightlife Curfew Ordinance",
          vibe_feed_headline:
            "Strict 1 AM last-call curfew quells street brawls but angers club owners.",
          budget_impact: { monthly_change: -15000 },
          heatmap_modifiers: [
            { metric: "crime", change: -11 },
            { metric: "land_value", change: 3 },
          ],
          demographic_approval: [
            { demographic: "wealthy", change: 9 },
            { demographic: "business", change: -10 },
            { demographic: "working_class", change: -4 },
          ],
          unintended_consequence_trigger:
            "Hospitality tax receipts dip as nightlife shifts to neighboring towns.",
        },
      },
      {
        stanceLabel: "Safe-Ride & De-Escalation",
        optionTitle: "Deploy Late-Night Shuttles & Civilian Mediators",
        description:
          "Designate pedestrian-only weekend nightlife plazas staffed by trained de-escalation medics and free night buses.",
        capitalCost: -5,
        rawEffect: {
          policy_name: "Night-Owl Safe Plaza Charter",
          vibe_feed_headline:
            "Pedestrian nightlife plazas and free night shuttles curb late-night brawls.",
          budget_impact: { monthly_change: -30000 },
          heatmap_modifiers: [
            { metric: "crime", change: -8 },
            { metric: "traffic", change: -5 },
          ],
          demographic_approval: [
            { demographic: "working_class", change: 10 },
            { demographic: "business", change: 7 },
          ],
          unintended_consequence_trigger: null,
        },
      },
      {
        stanceLabel: "Hospitality Surcharge",
        optionTitle: "Levy Late-Night Venue Overtime Policing Fee",
        description:
          "Allow clubs to stay open until 4 AM if they pay a monthly late-night policing surcharge.",
        capitalCost: 0,
        rawEffect: {
          policy_name: "Late-Night Venue Surcharge",
          vibe_feed_headline:
            "4 AM nightlife permits fund dedicated weekend precinct overtime.",
          budget_impact: { monthly_change: 35000 },
          heatmap_modifiers: [{ metric: "crime", change: -5 }],
          demographic_approval: [
            { demographic: "business", change: 4 },
            { demographic: "wealthy", change: -3 },
          ],
          unintended_consequence_trigger: null,
        },
      },
    ],
  },
];

const POLLUTION_DOCKET_POOL: RawIssueTemplate[] = [
  {
    title: "Smokestack Scrubbers vs. Foundry Jobs",
    briefing:
      "Air quality monitors in the central industrial corridor recorded sulfur dioxide levels three times the federal limit. Environmentalists demand immediate wet-scrubber retrofits, while foundry owners threaten layoffs if compliance costs spike.",
    presets: [
      {
        stanceLabel: "Green Mandate",
        optionTitle: "Enforce Mandatory Wet-Scrubber Retrofits",
        description:
          "Give heavy industry 30 days to install HEPA and sulfur scrubbers or face daily emissions fines.",
        capitalCost: 10,
        rawEffect: {
          policy_name: "Clean Air Scrubber Mandate",
          vibe_feed_headline:
            "Strict smokestack scrubber mandate slashes industrial sulfur emissions.",
          budget_impact: { monthly_change: 20000 },
          heatmap_modifiers: [
            { metric: "pollution", change: -14 },
            { metric: "land_value", change: 5 },
          ],
          demographic_approval: [
            { demographic: "environmentalists", change: 13 },
            { demographic: "business", change: -11 },
            { demographic: "working_class", change: -4 },
          ],
          unintended_consequence_trigger:
            "Two legacy foundries freeze hiring citing compliance costs.",
        },
      },
      {
        stanceLabel: "Public Green Subsidy",
        optionTitle: "Co-Fund Clean Kiln Electrification Grants",
        description:
          "Use municipal treasury grants to cover 70% of factory electrification so no union workers are laid off.",
        capitalCost: 10,
        rawEffect: {
          policy_name: "Green Foundry Transition Grant",
          vibe_feed_headline:
            "City subsidizes clean electric kilns to protect both air quality and jobs.",
          budget_impact: { monthly_change: -60000 },
          heatmap_modifiers: [
            { metric: "pollution", change: -12 },
            { metric: "land_value", change: 4 },
          ],
          demographic_approval: [
            { demographic: "environmentalists", change: 10 },
            { demographic: "working_class", change: 9 },
            { demographic: "business", change: 5 },
            { demographic: "wealthy", change: -6 },
          ],
          unintended_consequence_trigger: null,
        },
      },
      {
        stanceLabel: "Industrial Deregulation",
        optionTitle: "Grant 12-Month Emissions Waiver for Export Growth",
        description:
          "Waive particulate caps in exchange for an immediate industrial expansion levy paid to the city treasury.",
        capitalCost: 10,
        rawEffect: {
          policy_name: "Industrial Output Waiver",
          vibe_feed_headline:
            "Mayor grants foundry emissions waiver in exchange for industrial tax windfall.",
          budget_impact: { monthly_change: 55000 },
          heatmap_modifiers: [
            { metric: "pollution", change: 12 },
            { metric: "land_value", change: -5 },
          ],
          demographic_approval: [
            { demographic: "business", change: 11 },
            { demographic: "working_class", change: 4 },
            { demographic: "environmentalists", change: -14 },
          ],
          unintended_consequence_trigger:
            "Haze advisories prompt protests outside the EPA Bureau.",
        },
      },
    ],
  },
  {
    title: "Harbor Stormwater & Chemical Runoff Crisis",
    briefing:
      "Heavy rains are flushing untreated street runoff and chemical residue into Meridian Harbor, threatening local fisheries and waterfront parks.",
    presets: [
      {
        stanceLabel: "Ecological Infrastructure",
        optionTitle: "Build Bioswale Wetlands & Filtration Basins",
        description:
          "Construct natural wetland filtration corridors along the harbor rim to scrub runoff organically.",
        capitalCost: 10,
        rawEffect: {
          policy_name: "Harbor Bioswale Filtration Act",
          vibe_feed_headline:
            "Engineered harbor wetlands begin filtering toxic stormwater runoff.",
          budget_impact: { monthly_change: -50000 },
          heatmap_modifiers: [
            { metric: "pollution", change: -13 },
            { metric: "land_value", change: 7 },
          ],
          demographic_approval: [
            { demographic: "environmentalists", change: 12 },
            { demographic: "wealthy", change: 6 },
            { demographic: "working_class", change: 5 },
          ],
          unintended_consequence_trigger: null,
        },
      },
      {
        stanceLabel: "Polluter Pays Tariff",
        optionTitle: "Levy Impervious Surface & Effluent Surcharge",
        description:
          "Tax commercial parking lots and chemical plants by square footage to pay for sewer upgrades.",
        capitalCost: 10,
        rawEffect: {
          policy_name: "Commercial Runoff Surcharge",
          vibe_feed_headline:
            "New commercial runoff tax funds harbor water treatment retrofits.",
          budget_impact: { monthly_change: 35000 },
          heatmap_modifiers: [{ metric: "pollution", change: -8 }],
          demographic_approval: [
            { demographic: "environmentalists", change: 9 },
            { demographic: "business", change: -9 },
          ],
          unintended_consequence_trigger: null,
        },
      },
      {
        stanceLabel: "Austerity Deferral",
        optionTitle: "Authorize Deep-Channel Dilution Pumping",
        description:
          "Pump untreated overflow further offshore during peak storms to avoid expensive treatment plant outlays.",
        capitalCost: 10,
        rawEffect: {
          policy_name: "Offshore Outfall Protocol",
          vibe_feed_headline:
            "City diverts storm overflow offshore to avoid costly sewer bond.",
          budget_impact: { monthly_change: 25000 },
          heatmap_modifiers: [
            { metric: "pollution", change: 9 },
            { metric: "land_value", change: -4 },
          ],
          demographic_approval: [
            { demographic: "environmentalists", change: -13 },
            { demographic: "business", change: 5 },
          ],
          unintended_consequence_trigger:
            "Coastal watchdog groups post red-flag advisories at public beaches.",
        },
      },
    ],
  },
  {
    title: "Municipal Waste Incinerator vs. Zero-Waste Mandate",
    briefing:
      "The territory's primary landfill is at 94% capacity. Waste haulers propose an energy-from-waste incinerator, while green coalitions demand mandatory commercial composting and packaging bans.",
    presets: [
      {
        stanceLabel: "Zero-Waste Circular",
        optionTitle: "Enact Single-Use Packaging Ban & Curbside Compost",
        description:
          "Launch universal organic waste collection and ban non-recyclable commercial foam and plastics.",
        capitalCost: 10,
        rawEffect: {
          policy_name: "Zero-Waste Circular Charter",
          vibe_feed_headline:
            "City launches universal composting and bans single-use plastics.",
          budget_impact: { monthly_change: -35000 },
          heatmap_modifiers: [
            { metric: "pollution", change: -11 },
            { metric: "land_value", change: 4 },
          ],
          demographic_approval: [
            { demographic: "environmentalists", change: 13 },
            { demographic: "business", change: -6 },
            { demographic: "working_class", change: 4 },
          ],
          unintended_consequence_trigger: null,
        },
      },
      {
        stanceLabel: "Corporate Waste-to-Energy",
        optionTitle: "Approve Private Waste-to-Energy Turbine Plant",
        description:
          "Allow a private utility to burn municipal refuse for grid electricity, generating lease revenue.",
        capitalCost: 10,
        rawEffect: {
          policy_name: "Refuse Power Concession",
          vibe_feed_headline:
            "Private waste-to-energy incinerator approved, easing landfill crunch.",
          budget_impact: { monthly_change: 45000 },
          heatmap_modifiers: [
            { metric: "pollution", change: 8 },
            { metric: "land_value", change: -3 },
          ],
          demographic_approval: [
            { demographic: "business", change: 10 },
            { demographic: "environmentalists", change: -14 },
          ],
          unintended_consequence_trigger:
            "Downwind neighborhoods petition against incinerator ash plumes.",
        },
      },
      {
        stanceLabel: "Export Haulage",
        optionTitle: "Contract Out-of-County Rail Waste Export",
        description:
          "Ship excess municipal solid waste to remote rural landfills via nightly freight trains.",
        capitalCost: 10,
        rawEffect: {
          policy_name: "Regional Waste Rail Haul",
          vibe_feed_headline:
            "Territory signs rail haulage contract to export surplus landfill waste.",
          budget_impact: { monthly_change: -25000 },
          heatmap_modifiers: [
            { metric: "pollution", change: -6 },
            { metric: "traffic", change: -3 },
          ],
          demographic_approval: [
            { demographic: "wealthy", change: 5 },
            { demographic: "environmentalists", change: 3 },
          ],
          unintended_consequence_trigger: null,
        },
      },
    ],
  },
  {
    title: "Data Center Cooling Tower & Grid Emissions Surge",
    briefing:
      "Hyperscale AI data centers in the eastern corridor are drawing massive peak-hour diesel backup power and venting superheated cooling water into local creeks.",
    presets: [
      {
        stanceLabel: "Strict Carbon & Thermal Cap",
        optionTitle: "Mandate Closed-Loop Cooling & 100% Renewable PPAs",
        description:
          "Require all data centers to install closed-loop chillers and fund grid-scale battery storage.",
        capitalCost: 15,
        rawEffect: {
          policy_name: "Clean Data Center Mandate",
          vibe_feed_headline:
            "Mayor mandates closed-loop cooling and green power for data centers.",
          budget_impact: { monthly_change: -10000 },
          heatmap_modifiers: [
            { metric: "pollution", change: -13 },
            { metric: "land_value", change: 4 },
          ],
          demographic_approval: [
            { demographic: "environmentalists", change: 13 },
            { demographic: "business", change: -8 },
          ],
          unintended_consequence_trigger: null,
        },
      },
      {
        stanceLabel: "District Heating Partnership",
        optionTitle: "Capture Server Waste Heat for Public Housing",
        description:
          "Co-fund insulated district heat pipes that route data center thermal exhaust to warm nearby residential blocks.",
        capitalCost: -5,
        rawEffect: {
          policy_name: "District Waste-Heat Grid",
          vibe_feed_headline:
            "Data center waste heat piped into residential blocks to cut utility bills.",
          budget_impact: { monthly_change: -35000 },
          heatmap_modifiers: [
            { metric: "pollution", change: -10 },
            { metric: "land_value", change: 6 },
          ],
          demographic_approval: [
            { demographic: "working_class", change: 10 },
            { demographic: "environmentalists", change: 10 },
            { demographic: "business", change: 4 },
          ],
          unintended_consequence_trigger: null,
        },
      },
      {
        stanceLabel: "Kilowatt Surcharge",
        optionTitle: "Levy Peak-Demand Megawatt Tariff on Server Farms",
        description:
          "Tax industrial power draws above 20 MW and deposit proceeds directly into the municipal reserve.",
        capitalCost: 0,
        rawEffect: {
          policy_name: "Hyperscale Kilowatt Tariff",
          vibe_feed_headline:
            "Megawatt tariff on server farms generates fresh treasury revenue.",
          budget_impact: { monthly_change: 50000 },
          heatmap_modifiers: [{ metric: "pollution", change: -5 }],
          demographic_approval: [
            { demographic: "environmentalists", change: 6 },
            { demographic: "business", change: -7 },
          ],
          unintended_consequence_trigger: null,
        },
      },
    ],
  },
  {
    title: "Diesel Port Drayage & School Asthma Cluster",
    briefing:
      "Pediatric clinics near the freight arterial report a sharp spike in childhood asthma linked to idling pre-2010 diesel drayage trucks queuing outside container gates.",
    presets: [
      {
        stanceLabel: "Zero-Emission Zone",
        optionTitle: "Ban Pre-2020 Diesel Rigs from Inner Port Gates",
        description:
          "Bar older diesel trucks from city streets effective immediately, permitting only electric or hydrogen haulers.",
        capitalCost: 15,
        rawEffect: {
          policy_name: "Clean Port Drayage Ban",
          vibe_feed_headline:
            "City bans older diesel freight rigs from port gates to protect schools.",
          budget_impact: { monthly_change: -20000 },
          heatmap_modifiers: [
            { metric: "pollution", change: -15 },
            { metric: "traffic", change: -5 },
          ],
          demographic_approval: [
            { demographic: "environmentalists", change: 14 },
            { demographic: "working_class", change: 6 },
            { demographic: "business", change: -12 },
          ],
          unintended_consequence_trigger:
            "Independent owner-operator truckers stage a slow-roll protest.",
        },
      },
      {
        stanceLabel: "Electric Rig Trade-In",
        optionTitle: "Launch Municipal Electric Rig Voucher & School HEPA Program",
        description:
          "Install industrial HEPA filtration in every school and offer $25K trade-in vouchers for clean trucks.",
        capitalCost: -5,
        rawEffect: {
          policy_name: "Clean Air Schools & Fleet Act",
          vibe_feed_headline:
            "City installs school air scrubbers and funds electric truck trade-ins.",
          budget_impact: { monthly_change: -55000 },
          heatmap_modifiers: [
            { metric: "pollution", change: -11 },
            { metric: "land_value", change: 5 },
          ],
          demographic_approval: [
            { demographic: "working_class", change: 11 },
            { demographic: "environmentalists", change: 10 },
            { demographic: "business", change: 3 },
          ],
          unintended_consequence_trigger: null,
        },
      },
      {
        stanceLabel: "Idling Fines",
        optionTitle: "Enforce Automated 3-Minute Anti-Idling Citations",
        description:
          "Deploy acoustic and thermal roadside sensors that fine trucks idling longer than 3 minutes near schools.",
        capitalCost: 0,
        rawEffect: {
          policy_name: "Automated Anti-Idling Tariff",
          vibe_feed_headline:
            "Thermal sensors ticket idling diesel trucks near residential wards.",
          budget_impact: { monthly_change: 25000 },
          heatmap_modifiers: [{ metric: "pollution", change: -7 }],
          demographic_approval: [
            { demographic: "environmentalists", change: 7 },
            { demographic: "business", change: -5 },
          ],
          unintended_consequence_trigger: null,
        },
      },
    ],
  },
];

const LAND_VALUE_DOCKET_POOL: RawIssueTemplate[] = [
  {
    title: "The Waterfront High-Rise Upzoning Battle",
    briefing:
      "A luxury developer consortium wants height restrictions lifted along the harbor to build glass condo towers and a tech promenade. Tenant unions fear gentrification will price working families out of adjacent blocks.",
    presets: [
      {
        stanceLabel: "Pro-Growth Corporate",
        optionTitle: "Approve High-Density Luxury & Tech Promenade",
        description:
          "Fast-track waterfront sky-tower permits and grant a 5-year commercial ground-lease incentive.",
        capitalCost: 10,
        rawEffect: {
          policy_name: "Harbor Skyline Upzoning Act",
          vibe_feed_headline:
            "Tower cranes rise over harbor as Mayor approves luxury tech promenade.",
          budget_impact: { monthly_change: 50000 },
          heatmap_modifiers: [
            { metric: "land_value", change: 14 },
            { metric: "traffic", change: 6 },
          ],
          demographic_approval: [
            { demographic: "wealthy", change: 12 },
            { demographic: "business", change: 12 },
            { demographic: "working_class", change: -10 },
          ],
          unintended_consequence_trigger:
            "Rents in adjacent working-class wards jump 11% on speculation.",
        },
      },
      {
        stanceLabel: "Inclusionary Housing",
        optionTitle: "Mandate 35% Affordable Units & Rent Stabilization",
        description:
          "Allow mid-rise mixed development only if 35% of units are permanently deeded to working families.",
        capitalCost: 10,
        rawEffect: {
          policy_name: "Inclusionary Waterfront Charter",
          vibe_feed_headline:
            "Waterfront rezoning pairs mixed-income housing with rent caps.",
          budget_impact: { monthly_change: -20000 },
          heatmap_modifiers: [
            { metric: "land_value", change: 6 },
            { metric: "crime", change: -4 },
          ],
          demographic_approval: [
            { demographic: "working_class", change: 12 },
            { demographic: "environmentalists", change: 5 },
            { demographic: "wealthy", change: -5 },
            { demographic: "business", change: -4 },
          ],
          unintended_consequence_trigger: null,
        },
      },
      {
        stanceLabel: "Greenbelt Preservation",
        optionTitle: "Dedicate Waterfront as Public Botanical Esplanade",
        description:
          "Reject private towers and bond a public riverwalk park that boosts nearby neighborhood desirability.",
        capitalCost: 10,
        rawEffect: {
          policy_name: "Harbor Botanical Esplanade",
          vibe_feed_headline:
            "Mayor blocks condo towers to build public waterfront botanical park.",
          budget_impact: { monthly_change: -45000 },
          heatmap_modifiers: [
            { metric: "land_value", change: 9 },
            { metric: "pollution", change: -7 },
          ],
          demographic_approval: [
            { demographic: "environmentalists", change: 13 },
            { demographic: "working_class", change: 6 },
            { demographic: "business", change: -7 },
          ],
          unintended_consequence_trigger: null,
        },
      },
    ],
  },
  {
    title: "Blighted Commercial Strip & Vacancy Tax",
    briefing:
      "Speculative landlords are holding dozens of boarded-up storefronts empty along central avenues waiting for land prices to peak, depressing foot traffic and neighborhood vitality.",
    presets: [
      {
        stanceLabel: "Populist Vacancy Levy",
        optionTitle: "Enact Punitive Vacant Storefront Tax",
        description:
          "Tax commercial properties left empty for >6 months and lease them to local small business co-ops.",
        capitalCost: 10,
        rawEffect: {
          policy_name: "Storefront Vacancy Levy",
          vibe_feed_headline:
            "Vacancy tax forces speculators to open shuttered storefronts to local shops.",
          budget_impact: { monthly_change: 40000 },
          heatmap_modifiers: [
            { metric: "land_value", change: 8 },
            { metric: "crime", change: -5 },
          ],
          demographic_approval: [
            { demographic: "working_class", change: 11 },
            { demographic: "wealthy", change: -9 },
            { demographic: "business", change: 4 },
          ],
          unintended_consequence_trigger: null,
        },
      },
      {
        stanceLabel: "Enterprise Tax Abatement",
        optionTitle: "Create Zero-Tax Pop-Up & Arts District",
        description:
          "Waive municipal licensing and property fees for startups, galleries, and night markets moving into vacant blocks.",
        capitalCost: 10,
        rawEffect: {
          policy_name: "Cultural Enterprise Zone Act",
          vibe_feed_headline:
            "Tax-free startup and arts district revitalizes shuttered commercial corridor.",
          budget_impact: { monthly_change: -30000 },
          heatmap_modifiers: [
            { metric: "land_value", change: 12 },
            { metric: "crime", change: -4 },
          ],
          demographic_approval: [
            { demographic: "business", change: 10 },
            { demographic: "wealthy", change: 7 },
            { demographic: "working_class", change: 6 },
          ],
          unintended_consequence_trigger: null,
        },
      },
      {
        stanceLabel: "Austerity Auction",
        optionTitle: "Auction Tax-Delinquent Lots to REITs",
        description:
          "Conduct an immediate bulk auction of tax-delinquent parcels to institutional real estate funds.",
        capitalCost: 10,
        rawEffect: {
          policy_name: "Delinquent Parcel Bulk Sale",
          vibe_feed_headline:
            "City auctions blighted lots to real estate funds for immediate revenue.",
          budget_impact: { monthly_change: 60000 },
          heatmap_modifiers: [{ metric: "land_value", change: 7 }],
          demographic_approval: [
            { demographic: "wealthy", change: 9 },
            { demographic: "working_class", change: -8 },
          ],
          unintended_consequence_trigger:
            "Community land trusts protest institutional buyouts of local blocks.",
        },
      },
    ],
  },
  {
    title: "Short-Term Vacation Rental Boom vs. Tenant Squeeze",
    briefing:
      "Investors have converted over 1,400 apartments into nightly tourist rentals, driving up property values for owners while shrinking long-term rental inventory for workers.",
    presets: [
      {
        stanceLabel: "Tenant Protection Ban",
        optionTitle: "Cap Short-Term Rentals to Primary Residences Only",
        description:
          "Outlaw multi-unit investor vacation rentals and return apartments to the long-term workforce housing market.",
        capitalCost: 15,
        rawEffect: {
          policy_name: "Workforce Housing Rental Cap",
          vibe_feed_headline:
            "City bans investor vacation rentals to return apartments to local workers.",
          budget_impact: { monthly_change: -15000 },
          heatmap_modifiers: [
            { metric: "land_value", change: -4 },
            { metric: "crime", change: -5 },
          ],
          demographic_approval: [
            { demographic: "working_class", change: 13 },
            { demographic: "wealthy", change: -10 },
            { demographic: "business", change: -5 },
          ],
          unintended_consequence_trigger: null,
        },
      },
      {
        stanceLabel: "Tourism Occupancy Pact",
        optionTitle: "Levy 12% Hotel Parity Tax for Affordable Housing Trust",
        description:
          "Permit licensed vacation rentals but tax nightly bookings at 12% to build workforce apartments.",
        capitalCost: -5,
        rawEffect: {
          policy_name: "Short-Term Lodging Housing Trust",
          vibe_feed_headline:
            "12% vacation rental tax funds municipal workforce housing trust.",
          budget_impact: { monthly_change: 40000 },
          heatmap_modifiers: [{ metric: "land_value", change: 6 }],
          demographic_approval: [
            { demographic: "working_class", change: 8 },
            { demographic: "business", change: 5 },
          ],
          unintended_consequence_trigger: null,
        },
      },
      {
        stanceLabel: "Free-Market Property Rights",
        optionTitle: "Deregulate Hospitality & Short-Term Sublets",
        description:
          "Remove zoning caps on short-term rentals to maximize property appreciation and tourism spending.",
        capitalCost: 0,
        rawEffect: {
          policy_name: "Hospitality Deregulation Act",
          vibe_feed_headline:
            "Deregulated vacation rentals fuel property boom across core wards.",
          budget_impact: { monthly_change: 25000 },
          heatmap_modifiers: [
            { metric: "land_value", change: 12 },
            { metric: "traffic", change: 4 },
          ],
          demographic_approval: [
            { demographic: "wealthy", change: 11 },
            { demographic: "business", change: 8 },
            { demographic: "working_class", change: -11 },
          ],
          unintended_consequence_trigger:
            "Service-sector workers warn of worsening rental affordability.",
        },
      },
    ],
  },
  {
    title: "Historic Brownstone Preservation vs. Transit-Oriented Towers",
    briefing:
      "Preservationists want to landmark 12 blocks of 19th-century masonry rowhouses near the central station, blocking a planned mixed-use transit tower development.",
    presets: [
      {
        stanceLabel: "YIMBY Transit Density",
        optionTitle: "Override Landmark Freeze for 20-Story Transit Towers",
        description:
          "Authorize high-density residential and retail towers within 500 meters of all rail stations.",
        capitalCost: 15,
        rawEffect: {
          policy_name: "Transit-Oriented Density Act",
          vibe_feed_headline:
            "Mayor overrides landmark freeze to build high-density transit towers.",
          budget_impact: { monthly_change: 45000 },
          heatmap_modifiers: [
            { metric: "land_value", change: 13 },
            { metric: "traffic", change: -5 },
          ],
          demographic_approval: [
            { demographic: "business", change: 11 },
            { demographic: "working_class", change: 7 },
            { demographic: "wealthy", change: -9 },
          ],
          unintended_consequence_trigger: null,
        },
      },
      {
        stanceLabel: "Facade Transfer Compromise",
        optionTitle: "Preserve Historic Facades & Transfer Air Rights",
        description:
          "Require builders to restore historic ground-floor stone facades while transferring height rights to adjacent lots.",
        capitalCost: -5,
        rawEffect: {
          policy_name: "Heritage Air-Rights Compact",
          vibe_feed_headline:
            "Air-rights compromise saves historic brownstones while adding housing.",
          budget_impact: { monthly_change: 15000 },
          heatmap_modifiers: [{ metric: "land_value", change: 9 }],
          demographic_approval: [
            { demographic: "wealthy", change: 7 },
            { demographic: "working_class", change: 6 },
            { demographic: "environmentalists", change: 5 },
          ],
          unintended_consequence_trigger: null,
        },
      },
      {
        stanceLabel: "Strict Heritage District",
        optionTitle: "Enact Permanent Historic Landmark Moratorium",
        description:
          "Grant full landmark protection to the 12-block district, boosting boutique estate prestige.",
        capitalCost: 0,
        rawEffect: {
          policy_name: "Historic Brownstone Sanctuary",
          vibe_feed_headline:
            "Historic landmark designation protects 19th-century rowhouse ward.",
          budget_impact: { monthly_change: -10000 },
          heatmap_modifiers: [{ metric: "land_value", change: 7 }],
          demographic_approval: [
            { demographic: "wealthy", change: 10 },
            { demographic: "business", change: -6 },
          ],
          unintended_consequence_trigger: null,
        },
      },
    ],
  },
  {
    title: "Brownfield Shipyard Remediation & Stadium Bid",
    briefing:
      "A sports franchise owner offers to build a waterfront arena on a contaminated former shipyard if the city shares toxic soil remediation costs.",
    presets: [
      {
        stanceLabel: "Public Green Parkland",
        optionTitle: "Reject Stadium & Remediate Shipyard into Solar Tech Park",
        description:
          "Clean up the toxic shipyard using public green bonds and lease parcels to clean-tech manufacturers.",
        capitalCost: 15,
        rawEffect: {
          policy_name: "Shipyard Clean-Tech Campus",
          vibe_feed_headline:
            "Remediated shipyard transformed into clean-tech manufacturing campus.",
          budget_impact: { monthly_change: -40000 },
          heatmap_modifiers: [
            { metric: "land_value", change: 11 },
            { metric: "pollution", change: -10 },
          ],
          demographic_approval: [
            { demographic: "environmentalists", change: 12 },
            { demographic: "working_class", change: 8 },
          ],
          unintended_consequence_trigger: null,
        },
      },
      {
        stanceLabel: "Community Benefits Arena",
        optionTitle: "Approve Arena Only with 100% Private Cleanup & Union Jobs",
        description:
          "Require the franchise to pay full soil remediation and guarantee union wages in exchange for zoning approval.",
        capitalCost: -5,
        rawEffect: {
          policy_name: "Waterfront Arena Labor Compact",
          vibe_feed_headline:
            "Franchise funds shipyard toxic cleanup under union stadium compact.",
          budget_impact: { monthly_change: 35000 },
          heatmap_modifiers: [
            { metric: "land_value", change: 10 },
            { metric: "pollution", change: -5 },
            { metric: "traffic", change: 5 },
          ],
          demographic_approval: [
            { demographic: "working_class", change: 11 },
            { demographic: "business", change: 9 },
          ],
          unintended_consequence_trigger: null,
        },
      },
      {
        stanceLabel: "Corporate Subsidy",
        optionTitle: "Co-Fund Stadium & Entertainment District Tax Increment",
        description:
          "Commit $50K/mo in municipal site prep to anchor a high-value commercial entertainment complex.",
        capitalCost: 0,
        rawEffect: {
          policy_name: "Arena Entertainment TIF District",
          vibe_feed_headline:
            "City co-funds waterfront stadium to anchor luxury entertainment district.",
          budget_impact: { monthly_change: -50000 },
          heatmap_modifiers: [
            { metric: "land_value", change: 15 },
            { metric: "traffic", change: 8 },
          ],
          demographic_approval: [
            { demographic: "business", change: 12 },
            { demographic: "wealthy", change: 9 },
            { demographic: "environmentalists", change: -8 },
          ],
          unintended_consequence_trigger:
            "Game-day traffic surges strain harbor approach ramps.",
        },
      },
    ],
  },
];

const TRAFFIC_DOCKET_POOL: RawIssueTemplate[] = [
  {
    title: "The Crosstown Viaduct Bottleneck",
    briefing:
      "Morning commutes across the central viaduct have slowed to 11 mph. The Highway Lobby wants an expanded 8-lane express deck, while transit advocates push for dedicated Bus Rapid Transit (BRT) and protected bike superhighways.",
    presets: [
      {
        stanceLabel: "Green Transit First",
        optionTitle: "Convert Center Lanes to Express BRT & Rail",
        description:
          "Repaint two highway lanes for high-frequency electric articulated buses and automated signal priority.",
        capitalCost: 10,
        rawEffect: {
          policy_name: "Crosstown Express BRT Corridor",
          vibe_feed_headline:
            "Dedicated electric bus lanes slash crosstown commuter delays by 35%.",
          budget_impact: { monthly_change: -45000 },
          heatmap_modifiers: [
            { metric: "traffic", change: -14 },
            { metric: "pollution", change: -8 },
            { metric: "land_value", change: 5 },
          ],
          demographic_approval: [
            { demographic: "working_class", change: 11 },
            { demographic: "environmentalists", change: 12 },
            { demographic: "wealthy", change: -4 },
          ],
          unintended_consequence_trigger: null,
        },
      },
      {
        stanceLabel: "Market Congestion Pricing",
        optionTitle: "Install Dynamic Peak-Hour Electronic Tolling",
        description:
          "Charge solo drivers $8 during rush hour to enter the central grid, funding road resurfacing with the proceeds.",
        capitalCost: 10,
        rawEffect: {
          policy_name: "Dynamic Viaduct Toll Ring",
          vibe_feed_headline:
            "Peak-hour electronic tolls clear viaduct gridlock and boost treasury.",
          budget_impact: { monthly_change: 55000 },
          heatmap_modifiers: [
            { metric: "traffic", change: -13 },
            { metric: "pollution", change: -6 },
          ],
          demographic_approval: [
            { demographic: "environmentalists", change: 9 },
            { demographic: "wealthy", change: 6 },
            { demographic: "working_class", change: -11 },
          ],
          unintended_consequence_trigger:
            "Suburban drivers complain of regressive daily toll costs.",
        },
      },
      {
        stanceLabel: "Freight & Auto Expansion",
        optionTitle: "Widen Viaduct Approaches & Synchronize Signals",
        description:
          "Add dedicated commercial turn-outs and AI traffic lights to speed up freight trucks and private cars.",
        capitalCost: 10,
        rawEffect: {
          policy_name: "Arterial Signal & Lane Expansion",
          vibe_feed_headline:
            "Widened viaduct approaches and smart signals accelerate freight flow.",
          budget_impact: { monthly_change: -40000 },
          heatmap_modifiers: [
            { metric: "traffic", change: -10 },
            { metric: "pollution", change: 5 },
          ],
          demographic_approval: [
            { demographic: "business", change: 12 },
            { demographic: "wealthy", change: 6 },
            { demographic: "environmentalists", change: -9 },
          ],
          unintended_consequence_trigger: null,
        },
      },
    ],
  },
  {
    title: "Last-Mile Delivery Van Gridlock",
    briefing:
      "Double-parked e-commerce delivery vans are blocking curb lanes across commercial wards, causing cascading bus delays and fender-benders.",
    presets: [
      {
        stanceLabel: "Micro-Mobility & Cargo Hubs",
        optionTitle: "Mandate Neighborhood E-Cargo Bike Micro-Hubs",
        description:
          "Ban heavy delivery vans from narrow core streets during daytime hours in favor of electric cargo micro-hubs.",
        capitalCost: 10,
        rawEffect: {
          policy_name: "Zero-Emission Curb Micro-Hubs",
          vibe_feed_headline:
            "E-cargo micro-hubs replace double-parked delivery vans in core wards.",
          budget_impact: { monthly_change: -25000 },
          heatmap_modifiers: [
            { metric: "traffic", change: -12 },
            { metric: "pollution", change: -7 },
          ],
          demographic_approval: [
            { demographic: "environmentalists", change: 11 },
            { demographic: "working_class", change: 6 },
            { demographic: "business", change: -4 },
          ],
          unintended_consequence_trigger: null,
        },
      },
      {
        stanceLabel: "Revenue Enforcement",
        optionTitle: "Deploy Automated Bus-Mounted Curb Cameras",
        description:
          "Equip city buses with forward cameras that automatically ticket double-parked commercial vehicles.",
        capitalCost: 10,
        rawEffect: {
          policy_name: "Automated Curb Lane Enforcement",
          vibe_feed_headline:
            "Bus-mounted cameras issue automated fines to double-parked vans.",
          budget_impact: { monthly_change: 40000 },
          heatmap_modifiers: [{ metric: "traffic", change: -10 }],
          demographic_approval: [
            { demographic: "working_class", change: 7 },
            { demographic: "business", change: -7 },
          ],
          unintended_consequence_trigger: null,
        },
      },
      {
        stanceLabel: "Commercial Night Window",
        optionTitle: "Incentivize Off-Peak Midnight Freight Deliveries",
        description:
          "Grant tax rebates to retailers and warehouses that shift 80% of freight drop-offs between 11 PM and 5 AM.",
        capitalCost: 10,
        rawEffect: {
          policy_name: "Night-Window Logistics Rebate",
          vibe_feed_headline:
            "Retailers shift freight deliveries to midnight hours under tax rebate.",
          budget_impact: { monthly_change: -15000 },
          heatmap_modifiers: [
            { metric: "traffic", change: -11 },
            { metric: "land_value", change: 3 },
          ],
          demographic_approval: [
            { demographic: "business", change: 10 },
            { demographic: "wealthy", change: 4 },
          ],
          unintended_consequence_trigger: null,
        },
      },
    ],
  },
  {
    title: "Autonomous Robo-Taxi Fleet Standstill",
    briefing:
      "Two rival autonomous ride-hail companies have deployed 900 driverless taxis that frequently stall at complex downtown intersections, infuriating taxi unions and emergency responders.",
    presets: [
      {
        stanceLabel: "Strict Municipal Revocation",
        optionTitle: "Suspend Robo-Taxi Permits Until Safety Audit",
        description:
          "Impound stalled autonomous vehicles and restrict ride-hail permits to human-driven union cabs.",
        capitalCost: 15,
        rawEffect: {
          policy_name: "Autonomous Fleet Moratorium",
          vibe_feed_headline:
            "Mayor suspends robo-taxi operating permits after downtown intersections stall.",
          budget_impact: { monthly_change: -10000 },
          heatmap_modifiers: [{ metric: "traffic", change: -12 }],
          demographic_approval: [
            { demographic: "working_class", change: 12 },
            { demographic: "business", change: -10 },
          ],
          unintended_consequence_trigger: null,
        },
      },
      {
        stanceLabel: "Transit Integration Accord",
        optionTitle: "Restrict Robo-Taxis to Outer Rail FeederShuttles",
        description:
          "Ban empty robo-taxi cruising downtown and require fleets to serve outer-ward commuter rail stations.",
        capitalCost: -5,
        rawEffect: {
          policy_name: "Autonomous Rail Feeder Compact",
          vibe_feed_headline:
            "Robo-taxis redirected to outer commuter rail feeder routes.",
          budget_impact: { monthly_change: 20000 },
          heatmap_modifiers: [
            { metric: "traffic", change: -11 },
            { metric: "pollution", change: -4 },
          ],
          demographic_approval: [
            { demographic: "working_class", change: 8 },
            { demographic: "environmentalists", change: 7 },
            { demographic: "business", change: 4 },
          ],
          unintended_consequence_trigger: null,
        },
      },
      {
        stanceLabel: "Smart Corridor Licensing",
        optionTitle: "Sell Priority V2X Telemetry Licenses to Fleet Operators",
        description:
          "Charge autonomous tech firms $50K/mo for dedicated municipal traffic-signal telemetry feeds.",
        capitalCost: 0,
        rawEffect: {
          policy_name: "Autonomous Telemetry Franchise",
          vibe_feed_headline:
            "Tech fleets pay city for smart traffic-light telemetry access.",
          budget_impact: { monthly_change: 50000 },
          heatmap_modifiers: [
            { metric: "traffic", change: -8 },
            { metric: "land_value", change: 4 },
          ],
          demographic_approval: [
            { demographic: "business", change: 11 },
            { demographic: "working_class", change: -6 },
          ],
          unintended_consequence_trigger: null,
        },
      },
    ],
  },
  {
    title: "Harbor Drawbridge & Freight Rail Grade Separation",
    briefing:
      "At-grade freight trains and drawbridge lifts across the southern shipping canal halt surface traffic 14 times a day, backing up arterial avenues for miles.",
    presets: [
      {
        stanceLabel: "Mega-Project Trench",
        optionTitle: "Excavate Below-Grade Rail Trench & Overpasses",
        description:
          "Sink the freight rail line below street level so trains and commuter avenues never intersect.",
        capitalCost: 15,
        rawEffect: {
          policy_name: "Harbor Rail Trench Separation",
          vibe_feed_headline:
            "Below-grade rail trench eliminates harbor crossing bottlenecks.",
          budget_impact: { monthly_change: -70000 },
          heatmap_modifiers: [
            { metric: "traffic", change: -16 },
            { metric: "land_value", change: 7 },
          ],
          demographic_approval: [
            { demographic: "business", change: 12 },
            { demographic: "working_class", change: 10 },
          ],
          unintended_consequence_trigger: null,
        },
      },
      {
        stanceLabel: "Scheduled Window Accord",
        optionTitle: "Restrict Bridge Lifts & Long Trains to Off-Peak Hours",
        description:
          "Prohibit drawbridge openings and 100-car freight trains during 7–10 AM and 4–7 PM rush windows.",
        capitalCost: -5,
        rawEffect: {
          policy_name: "Rush-Hour Drawbridge Lock",
          vibe_feed_headline:
            "Peak-hour drawbridge ban clears morning and evening bridge backups.",
          budget_impact: { monthly_change: 0 },
          heatmap_modifiers: [{ metric: "traffic", change: -11 }],
          demographic_approval: [
            { demographic: "working_class", change: 10 },
            { demographic: "wealthy", change: 6 },
            { demographic: "business", change: -4 },
          ],
          unintended_consequence_trigger: null,
        },
      },
      {
        stanceLabel: "Canal Barge Toll",
        optionTitle: "Levy Maritime Bridge-Lift Fee on Private Barges",
        description:
          "Charge commercial vessels a per-lift canal toll to discourage daytime bridge openings.",
        capitalCost: 0,
        rawEffect: {
          policy_name: "Maritime Bridge-Lift Tariff",
          vibe_feed_headline:
            "Canal bridge-lift tariff nudges barges toward nighttime transit.",
          budget_impact: { monthly_change: 35000 },
          heatmap_modifiers: [{ metric: "traffic", change: -7 }],
          demographic_approval: [
            { demographic: "working_class", change: 5 },
            { demographic: "business", change: -5 },
          ],
          unintended_consequence_trigger: null,
        },
      },
    ],
  },
  {
    title: "Subway Fare Evasion vs. Free-Fare Equity Debate",
    briefing:
      "The Transit Authority reports a $400K quarterly revenue shortfall from turnstile jumping, proposing full-height steel fare gates while transit riders demand fare-free buses.",
    presets: [
      {
        stanceLabel: "Fortified Turnstiles",
        optionTitle: "Install Full-Height Automated Steel Fare Gates",
        description:
          "Retrofit every central transit station with floor-to-ceiling fare gates and transit fare inspectors.",
        capitalCost: 15,
        rawEffect: {
          policy_name: "Transit Fare Gate Fortification",
          vibe_feed_headline:
            "Floor-to-ceiling steel turnstiles recapture transit fare revenue.",
          budget_impact: { monthly_change: 35000 },
          heatmap_modifiers: [
            { metric: "crime", change: -6 },
            { metric: "traffic", change: -4 },
          ],
          demographic_approval: [
            { demographic: "wealthy", change: 9 },
            { demographic: "business", change: 7 },
            { demographic: "working_class", change: -9 },
          ],
          unintended_consequence_trigger: null,
        },
      },
      {
        stanceLabel: "Low-Income Youth & Worker Pass",
        optionTitle: "Launch Half-Price Employer & Student Transit Pass",
        description:
          "Partner with local employers and schools to bulk-purchase discounted monthly commuter passes.",
        capitalCost: -5,
        rawEffect: {
          policy_name: "Commuter Bulk Pass Partnership",
          vibe_feed_headline:
            "Discounted employer and student transit passes boost rail ridership.",
          budget_impact: { monthly_change: 15000 },
          heatmap_modifiers: [
            { metric: "traffic", change: -11 },
            { metric: "pollution", change: -5 },
          ],
          demographic_approval: [
            { demographic: "working_class", change: 11 },
            { demographic: "environmentalists", change: 8 },
            { demographic: "business", change: 5 },
          ],
          unintended_consequence_trigger: null,
        },
      },
      {
        stanceLabel: "Universal Fare-Free Transit",
        optionTitle: "Eliminate Bus & Subway Fares Citywide",
        description:
          "Make all public transit 100% free to maximize ridership and pull cars off the road.",
        capitalCost: 0,
        rawEffect: {
          policy_name: "Universal Fare-Free Transit Act",
          vibe_feed_headline:
            "Transit ridership surges 28% after city eliminates bus and rail fares.",
          budget_impact: { monthly_change: -60000 },
          heatmap_modifiers: [
            { metric: "traffic", change: -15 },
            { metric: "pollution", change: -8 },
          ],
          demographic_approval: [
            { demographic: "working_class", change: 14 },
            { demographic: "environmentalists", change: 12 },
            { demographic: "wealthy", change: -7 },
          ],
          unintended_consequence_trigger: null,
        },
      },
    ],
  },
];

const EDUCATION_DOCKET_POOL: RawIssueTemplate[] = [
  {
    templateId: "edu-1",
    title: "Trade Academies vs. Tablet Laptops",
    briefing:
      "District high schools face overflowing shop classes while tech vendors lobby for mandatory tablet subscriptions.",
    presets: [
      {
        stanceLabel: "Vocational Trade Guilds",
        optionTitle: "Fund Apprenticeship & Welding Academies",
        description:
          "Build hands-on trade workshops in partnership with local unions.",
        rawEffect: {
          policy_name: "Municipal Trade Academies",
          vibe_feed_headline:
            "City opens tuition-free vocational trade academies for high schoolers.",
          budget_impact: { monthly_change: -28000 },
          heatmap_modifiers: [
            { metric: "education", change: 14 },
            { metric: "crime", change: -5 },
          ],
          demographic_approval: [
            { demographic: "working_class", change: 8 },
            { demographic: "business", change: 4 },
          ],
          unintended_consequence_trigger:
            "Teen apprentices start undercutting licensed contractors on weekend repairs.",
        },
      },
      {
        stanceLabel: "Library & Literacy Blitz",
        optionTitle: "Extend Night Library Hours & Tutoring",
        description:
          "Keep neighborhood libraries open until 10 PM with free literacy mentors.",
        rawEffect: {
          policy_name: "24/7 Library Tutoring",
          vibe_feed_headline:
            "Neighborhood libraries expand late-night tutoring and homework clubs.",
          budget_impact: { monthly_change: -14000 },
          heatmap_modifiers: [{ metric: "education", change: 9 }],
          demographic_approval: [
            { demographic: "working_class", change: 5 },
            { demographic: "environmentalists", change: 3 },
          ],
          unintended_consequence_trigger: "None",
        },
      },
      {
        stanceLabel: "EdTech Voucher Pilot",
        optionTitle: "Approve Corporate Tablet & Charter Pilot",
        description:
          "Let private tech firms sponsor classroom devices in exchange for curriculum input.",
        rawEffect: {
          policy_name: "EdTech Classroom Pilot",
          vibe_feed_headline:
            "Private tech consortium outfits city classrooms with ad-free tablets.",
          budget_impact: { monthly_change: 8000 },
          heatmap_modifiers: [{ metric: "education", change: 5 }],
          demographic_approval: [
            { demographic: "business", change: 6 },
            { demographic: "working_class", change: -4 },
          ],
          unintended_consequence_trigger:
            "Students jailbreak school tablets within 48 hours to run retro arcade emulators.",
        },
      },
    ],
  },
  {
    templateId: "edu-2",
    title: "Overcrowded Elementary Wings",
    briefing:
      "Baby-boom enrollment has forced three elementary schools into drafty parking-lot trailers.",
    presets: [
      {
        stanceLabel: "Universal Pre-K & Wings",
        optionTitle: "Construct Modular Timber Classrooms",
        description:
          "Fast-track green school wings and universal pre-K staffing.",
        rawEffect: {
          policy_name: "Universal Pre-K Expansion",
          vibe_feed_headline:
            "City fast-tracks new timber school wings and universal pre-K.",
          budget_impact: { monthly_change: -35000 },
          heatmap_modifiers: [
            { metric: "education", change: 15 },
            { metric: "land_value", change: 5 },
          ],
          demographic_approval: [
            { demographic: "working_class", change: 9 },
            { demographic: "wealthy", change: 3 },
          ],
          unintended_consequence_trigger: "None",
        },
      },
      {
        stanceLabel: "Staggered Split Shifts",
        optionTitle: "Adopt Morning/Afternoon Split Schedules",
        description:
          "Double building capacity by running two staggered school shifts.",
        rawEffect: {
          policy_name: "Split-Shift Schooling",
          vibe_feed_headline:
            "School board adopts staggered morning and afternoon shifts to save cash.",
          budget_impact: { monthly_change: 5000 },
          heatmap_modifiers: [
            { metric: "education", change: -4 },
            { metric: "traffic", change: 4 },
          ],
          demographic_approval: [
            { demographic: "business", change: 3 },
            { demographic: "working_class", change: -7 },
          ],
          unintended_consequence_trigger:
            "Commuter parents revolt over twice-daily school drop-off gridlock.",
        },
      },
      {
        stanceLabel: "Redraw Catchment Zones",
        optionTitle: "Rebalance District Boundaries",
        description:
          "Bus students from packed wards to under-enrolled schools across town.",
        rawEffect: {
          policy_name: "School Catchment Rebalance",
          vibe_feed_headline:
            "City redraws elementary catchment maps to balance classroom sizes.",
          budget_impact: { monthly_change: -8000 },
          heatmap_modifiers: [{ metric: "education", change: 7 }],
          demographic_approval: [
            { demographic: "working_class", change: 4 },
            { demographic: "wealthy", change: -5 },
          ],
          unintended_consequence_trigger: "None",
        },
      },
    ],
  },
];

const HEALTH_DOCKET_POOL: RawIssueTemplate[] = [
  {
    templateId: "health-1",
    title: "ER Bottleneck & Walk-In Clinics",
    briefing:
      "Downtown emergency rooms are jammed with routine flu cases while outer wards lack late-night urgent care.",
    presets: [
      {
        stanceLabel: "Neighborhood Walk-In Clinics",
        optionTitle: "Open 6 Municipal Urgent-Care Clinics",
        description:
          "Staff city-run walk-in clinics in underserved neighborhoods.",
        rawEffect: {
          policy_name: "Neighborhood Urgent Clinics",
          vibe_feed_headline:
            "City opens six public walk-in clinics to relieve ER bottlenecks.",
          budget_impact: { monthly_change: -32000 },
          heatmap_modifiers: [{ metric: "health", change: 15 }],
          demographic_approval: [
            { demographic: "working_class", change: 9 },
            { demographic: "environmentalists", change: 4 },
          ],
          unintended_consequence_trigger: "None",
        },
      },
      {
        stanceLabel: "Mobile Telehealth Vans",
        optionTitle: "Deploy Nurse-Practitioner Outreach Vans",
        description:
          "Send mobile triage vans directly to transit hubs and senior centers.",
        rawEffect: {
          policy_name: "Mobile Triage Clinics",
          vibe_feed_headline:
            "Fleet of mobile nurse-practitioner vans hits neighborhood plazas.",
          budget_impact: { monthly_change: -15000 },
          heatmap_modifiers: [{ metric: "health", change: 10 }],
          demographic_approval: [
            { demographic: "working_class", change: 6 },
            { demographic: "business", change: 2 },
          ],
          unintended_consequence_trigger: "None",
        },
      },
      {
        stanceLabel: "Private Hospital Tax Credit",
        optionTitle: "Subsidize Private ER Expansion",
        description:
          "Offer corporate tax rebates to private hospital networks adding beds.",
        rawEffect: {
          policy_name: "Private Hospital Rebate",
          vibe_feed_headline:
            "City grants tax rebates to private hospital chains for ER beds.",
          budget_impact: { monthly_change: -18000 },
          heatmap_modifiers: [{ metric: "health", change: 6 }],
          demographic_approval: [
            { demographic: "business", change: 7 },
            { demographic: "wealthy", change: 5 },
            { demographic: "working_class", change: -5 },
          ],
          unintended_consequence_trigger:
            "Private ERs tack on a $45 'municipal facility convenience fee' to every bandage.",
        },
      },
    ],
  },
  {
    templateId: "health-2",
    title: "Mental Health & Street Outreach",
    briefing:
      "First responders report 40% of night calls involve untreated mental-health crises rather than violent crime.",
    presets: [
      {
        stanceLabel: "Unarmed Crisis Medics",
        optionTitle: "Launch 24/7 Street Crisis Response Teams",
        description:
          "Pair paramedics and social workers to handle non-violent emergency calls.",
        rawEffect: {
          policy_name: "Crisis Medic Outreach",
          vibe_feed_headline:
            "Unarmed medic & counselor teams take over mental-health 911 calls.",
          budget_impact: { monthly_change: -24000 },
          heatmap_modifiers: [
            { metric: "health", change: 13 },
            { metric: "crime", change: -4 },
          ],
          demographic_approval: [
            { demographic: "working_class", change: 6 },
            { demographic: "environmentalists", change: 7 },
          ],
          unintended_consequence_trigger: "None",
        },
      },
      {
        stanceLabel: "Civic Wellness Grants",
        optionTitle: "Co-Fund Community Counseling Centers",
        description:
          "Partner with local nonprofits to expand outpatient therapy slots.",
        rawEffect: {
          policy_name: "Community Wellness Grants",
          vibe_feed_headline:
            "City co-funds neighborhood counseling and recovery centers.",
          budget_impact: { monthly_change: -12000 },
          heatmap_modifiers: [{ metric: "health", change: 8 }],
          demographic_approval: [
            { demographic: "working_class", change: 5 },
            { demographic: "wealthy", change: 2 },
          ],
          unintended_consequence_trigger: "None",
        },
      },
      {
        stanceLabel: "Strict Loitering Enforcement",
        optionTitle: "Mandate Shelter Clearance Sweeps",
        description:
          "Direct patrol officers to clear downtown plazas without adding clinic beds.",
        rawEffect: {
          policy_name: "Plaza Clearance Mandate",
          vibe_feed_headline:
            "Police clear downtown plazas amid outcry from street-health advocates.",
          budget_impact: { monthly_change: -6000 },
          heatmap_modifiers: [
            { metric: "health", change: -7 },
            { metric: "land_value", change: 4 },
          ],
          demographic_approval: [
            { demographic: "wealthy", change: 5 },
            { demographic: "working_class", change: -6 },
            { demographic: "environmentalists", change: -7 },
          ],
          unintended_consequence_trigger:
            "Displaced residents crowd emergency room waiting rooms overnight.",
        },
      },
    ],
  },
];

const PILLAR_TEMPLATE_POOLS: Record<CivicPillar, RawIssueTemplate[]> = {
  crime: CRIME_DOCKET_POOL,
  pollution: POLLUTION_DOCKET_POOL,
  land_value: LAND_VALUE_DOCKET_POOL,
  traffic: TRAFFIC_DOCKET_POOL,
  education: EDUCATION_DOCKET_POOL,
  health: HEALTH_DOCKET_POOL,
};

// ----------------------------------------------------------------------------
// 2. Non-Repetitive & Sequel-Aware Generator for the 4 Monthly Legislative Issues
// ----------------------------------------------------------------------------

/**
 * Generates a dynamic Follow-Up Arc / Unintended Consequence Sequel Issue
 * building directly on a recently enacted law (`parentLaw`) for a given pillar.
 */
function buildSequelFollowUpIssueForLaw(
  turn: number,
  pillar: CivicPillar,
  parentLaw: ActiveCustomPolicy
): MonthlyDocketIssue {
  const lawName = parentLaw.policy_name;
  const fallout =
    parentLaw.unintended_consequence_trigger ||
    "secondary compliance friction across local districts";
  const balancedCapitalCosts: [number, number, number] = [15, -5, 0];

  const sequelTemplates: Record<
    CivicPillar,
    {
      title: string;
      briefing: string;
      presets: Array<{
        stanceLabel: string;
        optionTitle: string;
        description: string;
        rawEffect: unknown;
      }>;
    }
  > = {
    crime: {
      title: `Aftermath of "${lawName}": Compliance Backlash & Enforcement Gap`,
      briefing: `Following your enactment of "${lawName}", precinct commanders report a new secondary flashpoint: ${fallout}. Critics demand immediate amendments while hardliners want enforcement doubled down.`,
      presets: [
        {
          stanceLabel: "Hardline Enforcement",
          optionTitle: `Double Down on "${lawName}" Compliance Sweeps`,
          description:
            "Authorize emergency compliance enforcement units to crush resistance to the new directive.",
          rawEffect: {
            policy_name: `${lawName.slice(0, 22)} Enforcement Surge`,
            vibe_feed_headline: `Mayor doubles down on "${lawName}" with strict enforcement sweeps.`,
            budget_impact: { monthly_change: -35000 },
            heatmap_modifiers: [{ metric: "crime", change: -12 }],
            demographic_approval: [
              { demographic: "wealthy", change: 8 },
              { demographic: "working_class", change: -8 },
            ],
            unintended_consequence_trigger: null,
          },
        },
        {
          stanceLabel: "Community Amendment",
          optionTitle: "Convene Citizen Oversight & Hardship Relief Board",
          description:
            "Amend the law with neighborhood hardship waivers and union mediation panels.",
          rawEffect: {
            policy_name: `${lawName.slice(0, 22)} Relief Accord`,
            vibe_feed_headline: `Citizen oversight accord resolves backlash over "${lawName}".`,
            budget_impact: { monthly_change: -20000 },
            heatmap_modifiers: [
              { metric: "crime", change: -7 },
              { metric: "land_value", change: 4 },
            ],
            demographic_approval: [
              { demographic: "working_class", change: 11 },
              { demographic: "business", change: 5 },
            ],
            unintended_consequence_trigger: null,
          },
        },
        {
          stanceLabel: "Fiscal Fine-Tuning",
          optionTitle: "Convert Violations into Civil Compliance Fines",
          description:
            "Replace criminal penalties with tiered civil fines that feed directly into the municipal treasury.",
          rawEffect: {
            policy_name: `${lawName.slice(0, 22)} Civil Tariff`,
            vibe_feed_headline: `Civil compliance fines under "${lawName}" boost municipal revenue.`,
            budget_impact: { monthly_change: 35000 },
            heatmap_modifiers: [{ metric: "crime", change: -5 }],
            demographic_approval: [
              { demographic: "business", change: -4 },
              { demographic: "working_class", change: 4 },
            ],
            unintended_consequence_trigger: null,
          },
        },
      ],
    },
    pollution: {
      title: `Sequel to "${lawName}": Industrial Retrofit & Audit Dispute`,
      briefing: `Two months into "${lawName}", environmental inspectors flag a new complication: ${fallout}. Small manufacturers warn of bankruptcy without relief, while green activists demand zero exemptions.`,
      presets: [
        {
          stanceLabel: "Zero-Exemption EPA",
          optionTitle: "Enforce Strict Audits & Shut Non-Compliant Plants",
          description:
            "Refuse all delay petitions and levy maximum environmental penalties under the law.",
          rawEffect: {
            policy_name: `${lawName.slice(0, 22)} Strict Audit`,
            vibe_feed_headline: `EPA inspectors enforce strict zero-exemption audits under "${lawName}".`,
            budget_impact: { monthly_change: 25000 },
            heatmap_modifiers: [{ metric: "pollution", change: -14 }],
            demographic_approval: [
              { demographic: "environmentalists", change: 13 },
              { demographic: "business", change: -10 },
            ],
            unintended_consequence_trigger: null,
          },
        },
        {
          stanceLabel: "Green Transition Co-Op",
          optionTitle: "Issue Low-Interest Municipal Retrofit Micro-Loans",
          description:
            "Help small workshops meet the new environmental standard without laying off workers.",
          rawEffect: {
            policy_name: `${lawName.slice(0, 22)} Green Loans`,
            vibe_feed_headline: `Municipal green micro-loans keep workshops open under "${lawName}".`,
            budget_impact: { monthly_change: -30000 },
            heatmap_modifiers: [
              { metric: "pollution", change: -10 },
              { metric: "land_value", change: 4 },
            ],
            demographic_approval: [
              { demographic: "working_class", change: 9 },
              { demographic: "environmentalists", change: 9 },
              { demographic: "business", change: 6 },
            ],
            unintended_consequence_trigger: null,
          },
        },
        {
          stanceLabel: "Compliance Offset Market",
          optionTitle: "Allow Tradable Carbon & Effluent Offset Credits",
          description:
            "Let firms purchase municipal carbon credits to phase in compliance over 6 months.",
          rawEffect: {
            policy_name: `${lawName.slice(0, 22)} Offset Market`,
            vibe_feed_headline: `Carbon credit offset market eases business transition under "${lawName}".`,
            budget_impact: { monthly_change: 40000 },
            heatmap_modifiers: [{ metric: "pollution", change: -6 }],
            demographic_approval: [
              { demographic: "business", change: 9 },
              { demographic: "environmentalists", change: -6 },
            ],
            unintended_consequence_trigger: null,
          },
        },
      ],
    },
    land_value: {
      title: `Ripple Effect of "${lawName}": Property Assessment & Zoning Appeal`,
      briefing: `Your passage of "${lawName}" triggered rapid market shifts across adjacent wards: ${fallout}. Commercial landlords and neighborhood associations have filed competing zoning appeals.`,
      presets: [
        {
          stanceLabel: "Pro-Development Fast-Track",
          optionTitle: `Expand "${lawName}" Upzoning to Adjacent Corridors`,
          description:
            "Capitalize on market momentum by expanding commercial density variances citywide.",
          rawEffect: {
            policy_name: `${lawName.slice(0, 22)} Zoning Expansion`,
            vibe_feed_headline: `Mayor expands "${lawName}" development incentives across adjacent wards.`,
            budget_impact: { monthly_change: 45000 },
            heatmap_modifiers: [{ metric: "land_value", change: 13 }],
            demographic_approval: [
              { demographic: "business", change: 11 },
              { demographic: "wealthy", change: 9 },
              { demographic: "working_class", change: -8 },
            ],
            unintended_consequence_trigger: null,
          },
        },
        {
          stanceLabel: "Anti-Displacement Shield",
          optionTitle: "Pair Law with Long-Term Resident Property Tax Freeze",
          description:
            "Protect working families and small shops from sudden assessment spikes caused by the law.",
          rawEffect: {
            policy_name: `${lawName.slice(0, 22)} Resident Shield`,
            vibe_feed_headline: `Property tax freeze shields long-term residents after "${lawName}".`,
            budget_impact: { monthly_change: -20000 },
            heatmap_modifiers: [
              { metric: "land_value", change: 7 },
              { metric: "crime", change: -4 },
            ],
            demographic_approval: [
              { demographic: "working_class", change: 12 },
              { demographic: "wealthy", change: 4 },
            ],
            unintended_consequence_trigger: null,
          },
        },
        {
          stanceLabel: "Value Capture Fee",
          optionTitle: "Levy 15% Windfall Value-Capture Impact Fee",
          description:
            "Capture a portion of windfall real estate gains created by the policy for the public treasury.",
          rawEffect: {
            policy_name: `${lawName.slice(0, 22)} Windfall Levy`,
            vibe_feed_headline: `Windfall value-capture fee recoups public gains from "${lawName}".`,
            budget_impact: { monthly_change: 50000 },
            heatmap_modifiers: [{ metric: "land_value", change: 5 }],
            demographic_approval: [
              { demographic: "working_class", change: 7 },
              { demographic: "wealthy", change: -7 },
            ],
            unintended_consequence_trigger: null,
          },
        },
      ],
    },
    traffic: {
      title: `Bottleneck After "${lawName}": Commuter & Freight Rerouting Clash`,
      briefing: `Traffic engineers report that "${lawName}" has reshaped daily commuter flows, causing a new dispute: ${fallout}. Freight dispatchers and transit riders are demanding phase-two adjustments.`,
      presets: [
        {
          stanceLabel: "Rapid Transit Priority",
          optionTitle: "Dedicate Spillover Arterials to High-Speed Shuttles",
          description:
            "Lock in transit gains by converting spillover bottlenecks into signal-prioritized express lanes.",
          rawEffect: {
            policy_name: `${lawName.slice(0, 22)} Express Phase II`,
            vibe_feed_headline: `Phase-two express transit lanes clear spillover from "${lawName}".`,
            budget_impact: { monthly_change: -35000 },
            heatmap_modifiers: [
              { metric: "traffic", change: -14 },
              { metric: "pollution", change: -6 },
            ],
            demographic_approval: [
              { demographic: "working_class", change: 10 },
              { demographic: "environmentalists", change: 10 },
            ],
            unintended_consequence_trigger: null,
          },
        },
        {
          stanceLabel: "Smart Freight Bypass",
          optionTitle: "Open AI-Synchronized Ring-Road Freight Bypass",
          description:
            "Coordinate traffic signals along outer perimeter avenues so trucks bypass residential wards.",
          rawEffect: {
            policy_name: `${lawName.slice(0, 22)} Freight Bypass`,
            vibe_feed_headline: `Smart ring-road freight bypass resolves "${lawName}" detour bottlenecks.`,
            budget_impact: { monthly_change: -15000 },
            heatmap_modifiers: [{ metric: "traffic", change: -11 }],
            demographic_approval: [
              { demographic: "business", change: 10 },
              { demographic: "working_class", change: 7 },
            ],
            unintended_consequence_trigger: null,
          },
        },
        {
          stanceLabel: "Peak Corridor Pass",
          optionTitle: "Sell Commercial Express-Lane Permits",
          description:
            "Allow commercial couriers to purchase monthly express-lane passes, raising steady revenue.",
          rawEffect: {
            policy_name: `${lawName.slice(0, 22)} Courier Permit`,
            vibe_feed_headline: `Commercial express permits monetize "${lawName}" transit corridors.`,
            budget_impact: { monthly_change: 40000 },
            heatmap_modifiers: [{ metric: "traffic", change: -7 }],
            demographic_approval: [
              { demographic: "business", change: 7 },
              { demographic: "working_class", change: -4 },
            ],
            unintended_consequence_trigger: null,
          },
        },
      ],
    },
    education: {
      title: `Post-${lawName.slice(0, 20)} School & Workforce Ripple`,
      briefing: `Following "${lawName}", district teachers and parent unions are demanding updated resources to handle shifting enrollment and skills demand.`,
      presets: [
        {
          stanceLabel: "Teacher Retention Grant",
          optionTitle: `Fund Classroom Grants Under "${lawName}"`,
          description:
            "Direct targeted stipends to public school educators and trade mentors.",
          rawEffect: {
            policy_name: `${lawName.slice(0, 20)} School Grant`,
            vibe_feed_headline: `City funds classroom stipends to reinforce "${lawName}".`,
            budget_impact: { monthly_change: -22000 },
            heatmap_modifiers: [{ metric: "education", change: 12 }],
            demographic_approval: [{ demographic: "working_class", change: 7 }],
            unintended_consequence_trigger: null,
          },
        },
        {
          stanceLabel: "Library Makerspace",
          optionTitle: "Open After-School Tech & Trade Labs",
          description:
            "Convert spare library basements into community workshops.",
          rawEffect: {
            policy_name: `${lawName.slice(0, 20)} Makerspace`,
            vibe_feed_headline: `Library workshops expand youth training after "${lawName}".`,
            budget_impact: { monthly_change: -10000 },
            heatmap_modifiers: [{ metric: "education", change: 7 }],
            demographic_approval: [{ demographic: "working_class", change: 4 }],
            unintended_consequence_trigger: null,
          },
        },
        {
          stanceLabel: "Industry Mentorship",
          optionTitle: "Partner with Local Employers",
          description:
            "Invite local firms to sponsor paid student internships.",
          rawEffect: {
            policy_name: `${lawName.slice(0, 20)} Internships`,
            vibe_feed_headline: `Local firms sponsor student apprenticeships after "${lawName}".`,
            budget_impact: { monthly_change: 10000 },
            heatmap_modifiers: [{ metric: "education", change: 6 }],
            demographic_approval: [{ demographic: "business", change: 6 }],
            unintended_consequence_trigger: null,
          },
        },
      ],
    },
    health: {
      title: `Post-${lawName.slice(0, 20)} Clinic & Welfare Strain`,
      briefing: `Following "${lawName}", neighborhood clinics report new patient bottlenecks and are calling for targeted public-health follow-up.`,
      presets: [
        {
          stanceLabel: "Expand Clinic Hours",
          optionTitle: `Add Night Shift Nurses for "${lawName}"`,
          description:
            "Extend evening clinic hours across high-need wards.",
          rawEffect: {
            policy_name: `${lawName.slice(0, 20)} Night Clinics`,
            vibe_feed_headline: `Evening clinic shifts relieve patient lines after "${lawName}".`,
            budget_impact: { monthly_change: -24000 },
            heatmap_modifiers: [{ metric: "health", change: 12 }],
            demographic_approval: [{ demographic: "working_class", change: 8 }],
            unintended_consequence_trigger: null,
          },
        },
        {
          stanceLabel: "Preventive Screening",
          optionTitle: "Launch Mobile Health Checkups",
          description:
            "Deploy preventive screening vans to transit plazas.",
          rawEffect: {
            policy_name: `${lawName.slice(0, 20)} Screening`,
            vibe_feed_headline: `Mobile health vans bring checkups to plazas after "${lawName}".`,
            budget_impact: { monthly_change: -10000 },
            heatmap_modifiers: [{ metric: "health", change: 7 }],
            demographic_approval: [{ demographic: "working_class", change: 5 }],
            unintended_consequence_trigger: null,
          },
        },
        {
          stanceLabel: "Co-Pay Standardization",
          optionTitle: "Streamline Clinic Billing",
          description:
            "Standardize administrative billing to trim clinic deficits.",
          rawEffect: {
            policy_name: `${lawName.slice(0, 20)} Billing Fix`,
            vibe_feed_headline: `Clinic billing overhaul trims red ink after "${lawName}".`,
            budget_impact: { monthly_change: 12000 },
            heatmap_modifiers: [{ metric: "health", change: 3 }],
            demographic_approval: [{ demographic: "business", change: 4 }],
            unintended_consequence_trigger: null,
          },
        },
      ],
    },
  };

  const chosen = sequelTemplates[pillar];
  const clampedPresets = chosen.presets.map((p, idx): DocketPresetOption => ({
    id: `docket-${turn}-${pillar}-seq-opt-${idx + 1}`,
    stanceLabel: p.stanceLabel,
    optionTitle: p.optionTitle,
    description: p.description,
    capitalCost: balancedCapitalCosts[idx] ?? 0,
    policyEffect: parseAndClampAIPolicyResponse(JSON.stringify(p.rawEffect)),
  })) as [DocketPresetOption, DocketPresetOption, DocketPresetOption];

  return {
    id: `issue-${turn}-${pillar}`,
    turn,
    pillar,
    title: chosen.title,
    briefing: chosen.briefing,
    status: "PENDING",
    isFollowUpArc: true,
    parentLawTitle: lawName,
    presets: clampedPresets,
  };
}

/**
 * Generates the 4 Monthly Legislative Issues for `turn`:
 * - Uses anti-repetition memory (`pastIssueTitles` and `usedFallbackTemplateIds`) so the
 *   20-dilemma fallback pool never repeats back-to-back.
 * - If the player has enacted laws (`recentLaws`), automatically turns 1 of the 4 monthly
 *   issues into a reactive `FOLLOW-UP ARC` sequel building directly on a past law!
 */
export function generateMonthlyDocketForTurn(
  turn: number,
  options?: {
    pastIssueTitles?: string[];
    usedFallbackTemplateIds?: string[];
    recentLaws?: ActiveCustomPolicy[];
  }
): {
  issues: MonthlyDocketIssue[];
  newlyUsedTemplateIds: string[];
  newTitles: string[];
} {
  // Rotate/sample 4 distinct pillars out of the 6 Core Pillars every turn
  const shuffledSix = [...VALID_CIVIC_PILLARS];
  for (let i = shuffledSix.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffledSix[i], shuffledSix[j]] = [shuffledSix[j], shuffledSix[i]];
  }
  const pillars: CivicPillar[] = shuffledSix.slice(0, 4);
  const pastTitlesSet = new Set(
    (options?.pastIssueTitles ?? []).map((t) => t.toLowerCase().trim())
  );
  const usedIdsSet = new Set(options?.usedFallbackTemplateIds ?? []);
  const recentLaws = options?.recentLaws ?? [];

  const newlyUsedTemplateIds: string[] = [];
  const newTitles: string[] = [];

  // Assign up to 2 Follow-Up Arc sequels to distinct pillars when recentLaws exist
  const sequelMap = new Map<CivicPillar, ActiveCustomPolicy>();
  if (turn > 1 && recentLaws.length > 0) {
    for (const law of recentLaws) {
      if (sequelMap.size >= 2) break;
      const alreadySequelled = Array.from(pastTitlesSet).some((pt) =>
        pt.includes(law.policy_name.toLowerCase())
      );
      if (alreadySequelled) continue;

      const primaryMetric = law.heatmap_modifiers?.[0]?.metric;
      const targetPillar =
        primaryMetric && !sequelMap.has(primaryMetric)
          ? primaryMetric
          : pillars.find((p) => !sequelMap.has(p));

      if (targetPillar) {
        sequelMap.set(targetPillar, law);
      }
    }
  }

  const balancedCapitalCosts: [number, number, number] = [15, -5, 0];

  const issues = pillars.map((pillar): MonthlyDocketIssue => {
    // 1. If this pillar is designated for a reactive Follow-Up Arc sequel, build it from the enacted law
    const sequelParentLaw = sequelMap.get(pillar);
    if (sequelParentLaw) {
      const sequelIssue = buildSequelFollowUpIssueForLaw(
        turn,
        pillar,
        sequelParentLaw
      );
      newTitles.push(sequelIssue.title);
      return sequelIssue;
    }

    // 2. Otherwise select an unused dilemma from the 5-per-pillar (20 total) pool
    const pool = PILLAR_TEMPLATE_POOLS[pillar];
    let selectedIdx = (turn - 1) % pool.length;

    for (let offset = 0; offset < pool.length; offset++) {
      const idx = (turn - 1 + offset) % pool.length;
      const templateId = `${pillar}-${idx}`;
      const candidateTitle = pool[idx].title.toLowerCase().trim();
      if (!usedIdsSet.has(templateId) && !pastTitlesSet.has(candidateTitle)) {
        selectedIdx = idx;
        break;
      }
    }

    const chosenTemplateId = `${pillar}-${selectedIdx}`;
    newlyUsedTemplateIds.push(chosenTemplateId);

    const template = pool[selectedIdx];
    newTitles.push(template.title);

    const clampedPresets = template.presets.map((p, idx): DocketPresetOption => ({
      id: `docket-${turn}-${pillar}-opt-${idx + 1}`,
      stanceLabel: p.stanceLabel,
      optionTitle: p.optionTitle,
      description: p.description,
      capitalCost: balancedCapitalCosts[idx] ?? 0,
      policyEffect: parseAndClampAIPolicyResponse(JSON.stringify(p.rawEffect)),
    })) as [DocketPresetOption, DocketPresetOption, DocketPresetOption];

    return {
      id: `issue-${turn}-${pillar}`,
      turn,
      pillar,
      title: template.title,
      briefing: template.briefing,
      status: "PENDING",
      isFollowUpArc: false,
      presets: clampedPresets,
    };
  });

  return {
    issues,
    newlyUsedTemplateIds,
    newTitles,
  };
}

// ----------------------------------------------------------------------------
// 3. Generator for the Monthly "State of the City" Summary Report
// ----------------------------------------------------------------------------

function buildPillarAssessment(
  metric: HeatmapMetric,
  currentValue: number,
  delta: number
): string {
  const roundedVal = Math.round(currentValue);
  const roundedDelta = Math.round(delta * 10) / 10;
  const trendWord =
    roundedDelta > 0.5
      ? "climbing"
      : roundedDelta < -0.5
      ? "declining"
      : "holding steady";

  if (metric === "crime") {
    if (roundedVal >= 70) {
      return `Crime is at critical levels (${roundedVal}/100, ${trendWord}), threatening civil order and outer-ward business confidence.`;
    }
    if (roundedVal >= 45) {
      return `Street crime remains a moderate concern (${roundedVal}/100, ${trendWord}) requiring steady precinct funding.`;
    }
    return `Public safety is strong (${roundedVal}/100, ${trendWord}), bolstering neighborhood stability and property values.`;
  }

  if (metric === "pollution") {
    if (roundedVal >= 70) {
      return `Hazardous smog and industrial runoff (${roundedVal}/100, ${trendWord}) are pushing Sanitation Tension toward a public health crisis.`;
    }
    if (roundedVal >= 45) {
      return `Particulate emissions (${roundedVal}/100, ${trendWord}) remain elevated across manufacturing corridors.`;
    }
    return `Air and watershed quality are clean (${roundedVal}/100, ${trendWord}), earning strong praise from environmental voters.`;
  }

  if (metric === "land_value") {
    if (roundedVal >= 70) {
      return `High property valuations (${roundedVal}/100, ${trendWord}) are driving robust tax receipts and commercial investment.`;
    }
    if (roundedVal >= 45) {
      return `Real estate values are balanced (${roundedVal}/100, ${trendWord}) across residential and commercial sectors.`;
    }
    return `Depressed land values (${roundedVal}/100, ${trendWord}) are eroding the property tax base and deterring developers.`;
  }

  // traffic
  if (roundedVal >= 70) {
    return `Severe arterial gridlock (${roundedVal}/100, ${trendWord}) is choking commuter corridors and driving Transit Tension skyward.`;
  }
  if (roundedVal >= 45) {
    return `Commuter congestion (${roundedVal}/100, ${trendWord}) is noticeable during peak freight and rush-hour windows.`;
  }
  return `Arterial transit and port freight are flowing smoothly (${roundedVal}/100, ${trendWord}) across the 10x10 grid.`;
}

export function buildMonthlyCityReport(params: {
  turn: number;
  month: number;
  year: number;
  currentAverages: Record<HeatmapMetric, number>;
  previousAverages: Record<HeatmapMetric, number>;
  treasury: TreasuryState;
  currentTensions: TensionMetersState;
  previousTensions: TensionMetersState;
  departmentHeads: DepartmentHeadsState;
  previousCapital?: number;
  currentCapital?: number;
  baseStipend?: number;
  mandateBonus?: number;
}): MonthlyCityReport {
  const {
    turn,
    month,
    year,
    currentAverages,
    previousAverages,
    treasury,
    currentTensions,
    previousTensions,
    departmentHeads,
    previousCapital = 60,
    currentCapital = 60,
    baseStipend = MONTHLY_BASE_CAPITAL_STIPEND,
    mandateBonus = 0,
  } = params;

  const labels: Record<HeatmapMetric, string> = {
    crime: "Crime & Public Safety",
    pollution: "Pollution & Sanitation",
    land_value: "Land Value & Real Estate",
    traffic: "Traffic & Arterial Transit",
  };

  const pillars = {} as Record<HeatmapMetric, PillarReportEntry>;
  for (const metric of ["crime", "pollution", "land_value", "traffic"] as HeatmapMetric[]) {
    const curr = Math.round(currentAverages[metric] * 10) / 10;
    const prev = Math.round(previousAverages[metric] * 10) / 10;
    const delta = Math.round((curr - prev) * 10) / 10;
    pillars[metric] = {
      metric,
      label: labels[metric],
      currentValue: curr,
      previousValue: prev,
      delta,
      assessment: buildPillarAssessment(metric, curr, delta),
    };
  }

  const netSign = treasury.monthlyNet >= 0 ? "+" : "-";
  const fiscalSummary =
    treasury.reserves < 0
      ? `ALERT: Municipal Treasury is in deficit ($${treasury.reserves.toLocaleString()}) with a ${netSign}$${Math.abs(
          treasury.monthlyNet
        ).toLocaleString()}/mo net cash flow.`
      : `Treasury holds $${treasury.reserves.toLocaleString()} in reserves with a ${netSign}$${Math.abs(
          treasury.monthlyNet
        ).toLocaleString()}/mo net operating balance.`;

  const tensionDeltas: TensionMetersState = {
    Crime: Math.round((currentTensions.Crime - previousTensions.Crime) * 10) / 10,
    Transit: Math.round((currentTensions.Transit - previousTensions.Transit) * 10) / 10,
    Sanitation:
      Math.round((currentTensions.Sanitation - previousTensions.Sanitation) * 10) / 10,
  };

  const highestTension = (["Crime", "Transit", "Sanitation"] as const).reduce(
    (maxKey, k) => (currentTensions[k] > currentTensions[maxKey] ? k : maxKey),
    "Crime" as const
  );

  const tensionSummary =
    currentTensions[highestTension] >= 80
      ? `WARNING: ${highestTension} Tension is at ${Math.round(
          currentTensions[highestTension]
        )}/100—imminent Boiling Point crisis risk if unaddressed!`
      : `Highest pressure vector is ${highestTension} Tension at ${Math.round(
          currentTensions[highestTension]
        )}/100.`;

  const staffRecap: string[] = [];
  const roleEntries: Array<{ key: keyof DepartmentHeadsState; title: string }> = [
    { key: "PoliceChief", title: "Police Chief" },
    { key: "TransitDirector", title: "Transit Director" },
    { key: "SanitationHead", title: "Sanitation Head" },
  ];

  for (const r of roleEntries) {
    const npc = departmentHeads[r.key];
    if (!npc) {
      staffRecap.push(`${r.title}: VACANT (0% upkeep modifier — interview candidates in Right Panel).`);
    } else {
      const modPct = (npc.competence - 50) * 0.5;
      const modText =
        modPct >= 0
          ? `-${modPct.toFixed(1)}% upkeep discount`
          : `+${Math.abs(modPct).toFixed(1)}% upkeep penalty`;
      const leakText = npc.loyalty < 40 ? " | LOW LOYALTY LEAK RISK (<40)" : "";
      staffRecap.push(
        `${r.title} ${npc.name} (${npc.alignment}): Competence ${npc.competence}/100 (${modText}), Loyalty ${npc.loyalty}/100${leakText}.`
      );
    }
  }

  const totalCapitalGained = baseStipend + mandateBonus;
  const capitalSummaryText =
    turn === 1
      ? `Inaugural Term Stipend: Starting with ${Math.round(
          currentCapital
        )}/100 Political Capital (+${MONTHLY_BASE_CAPITAL_STIPEND}/mo base regeneration +10 Mandate Bonus when Approval >= 50%).`
      : mandateBonus > 0
      ? `Regenerated +${totalCapitalGained} Political Capital (+${baseStipend} Base Monthly Stipend, +${mandateBonus} Public Mandate Bonus for >=50% Approval). Current Capital: ${Math.round(
          currentCapital
        )}/100.`
      : `Regenerated +${totalCapitalGained} Political Capital (+${baseStipend} Base Monthly Stipend; +0 Mandate Bonus because Approval is below 50%). Current Capital: ${Math.round(
          currentCapital
        )}/100.`;

  return {
    turn,
    month,
    year,
    pillars,
    fiscalRecap: {
      lastMonthNet: treasury.monthlyNet,
      reserves: treasury.reserves,
      revenue: treasury.monthlyRevenue,
      expenses: treasury.monthlyExpenses,
      policyRecurringNet: treasury.customPolicyRecurringNet,
      summaryText: fiscalSummary,
    },
    tensionRecap: {
      tensions: { ...currentTensions },
      tensionDeltas,
      summaryText: tensionSummary,
    },
    politicalCapitalRecap: {
      previousCapital,
      currentCapital,
      baseStipend,
      mandateBonus,
      totalGained: totalCapitalGained,
      summaryText: capitalSummaryText,
    },
    staffRecap,
  };
}

// ----------------------------------------------------------------------------
// 4. 2-Axis Political Compass & Leadership Archetype Evaluator
// ----------------------------------------------------------------------------

/**
 * Computes and updates the player's 2-Axis Political Compass & Leadership Profile:
 * - Economic Axis: -100 (Interventionist / Socialist) <-> +100 (Free-Market / Corporatist)
 *   Driven by tax rates, public department spending, and pro-business vs. labor/progressive policies.
 * - Governance Axis: -100 (Technocratic / Libertarian) <-> +100 (Authoritarian / Law & Order)
 *   Driven by policing/surveillance spend, firing scapegoats, and unilateral executive overrides vs. consensus docket votes.
 */
export function evaluatePoliticalCompassProfile(params: {
  turn: number;
  treasury: TreasuryState;
  voterSentiment: VoterSentimentState;
  culturePoints: CulturePointsState;
  currentAverages: Record<HeatmapMetric, number>;
  enactedPoliciesCount: number;
  previousCompass?: PoliticalCompassProfile;
  economicNudge?: number;
  governanceNudge?: number;
}): PoliticalCompassProfile {
  const {
    turn,
    treasury,
    voterSentiment,
    culturePoints,
    currentAverages,
    enactedPoliciesCount,
    previousCompass,
    economicNudge = 0,
    governanceNudge = 0,
  } = params;

  // Baseline structural signals from tax sliders & department allocations
  const avgTaxBurden =
    (treasury.taxRates.incomeTaxPct / 15 +
      treasury.taxRates.corporateTaxPct / 20 +
      treasury.taxRates.propertyTaxPct / 5) /
    3; // 0..1

  const socialAndGreenSpend =
    treasury.departments.socialServices + treasury.departments.environmental;
  const safetySpend = treasury.departments.publicSafety;

  // Economic signal: High corporate/Austerity points & low taxes push positive (+100 Free-Market/Corporatist);
  // High Progressive points, high social/green spend, and higher taxes push negative (-100 Interventionist/Socialist).
  const cultureEconSignal =
    (culturePoints.Corporate * 11 +
      culturePoints.Austerity * 8 -
      culturePoints.Progressive * 13);
  const taxEconSignal = (0.45 - avgTaxBurden) * 45;
  const spendEconSignal = (250_000 - socialAndGreenSpend) / 12_000;

  const baseEcon = previousCompass ? previousCompass.economicAxis * 0.55 : 0;
  const rawEconomic =
    baseEcon +
    (cultureEconSignal + taxEconSignal + spendEconSignal) * 0.45 +
    economicNudge;
  const economicAxis = Math.round(
    Math.max(-100, Math.min(100, rawEconomic))
  );

  // Governance signal: High publicSafety spend, Austerity/Law&Order actions, and unilateral executive decrees push positive (+100 Authoritarian/Law & Order);
  // Progressive/Technocratic consensus docket votes push negative (-100 Technocratic/Libertarian).
  const safetyGovSignal = (safetySpend - 150_000) / 8_000;
  const cultureGovSignal =
    culturePoints.Austerity * 5 - culturePoints.Progressive * 7;
  const baseGov = previousCompass ? previousCompass.governanceAxis * 0.65 : 0;
  const rawGovernance =
    baseGov +
    (safetyGovSignal + cultureGovSignal) * 0.35 +
    governanceNudge;
  const governanceAxis = Math.round(
    Math.max(-100, Math.min(100, rawGovernance))
  );

  // Assign Dynamic Leader Title & 2-Sentence Editorial Blurb based on quadrant & city metrics
  let leaderTitle = "Pragmatic Centrist";
  let sentence1 =
    "Local pundits describe your administration as a steady, pragmatic coalition builder balancing competing civic factions.";

  if (Math.abs(economicAxis) < 18 && Math.abs(governanceAxis) < 18) {
    leaderTitle = turn <= 2 ? "Pragmatic Centrist" : "Consensus Technocrat";
    sentence1 =
      "City Hall reporters characterize your tenure as a calibrated centrist balancing act that avoids ideological extremes.";
  } else if (economicAxis <= -18 && governanceAxis <= -10) {
    if (currentAverages.pollution < 45 || culturePoints.Progressive >= 3) {
      leaderTitle = "Green Technocrat";
      sentence1 =
        "Editorial boards hail your administration as a 'Green Technocrat' vanguard, pairing aggressive environmental standards with data-driven public investment.";
    } else {
      leaderTitle = "Tax-and-Spend Reformer";
      sentence1 =
        "Commentators label you a 'Tax-and-Spend Reformer' unapologetically expanding the municipal safety net and labor protections.";
    }
  } else if (economicAxis <= -18 && governanceAxis > -10) {
    leaderTitle = "Iron-Fisted Populist";
    sentence1 =
      "Talk radio dubs you an 'Iron-Fisted Populist'—championing working-class interventionism while wielding aggressive executive authority to enforce order.";
  } else if (economicAxis >= 18 && governanceAxis >= 15) {
    leaderTitle = "Law & Order Corporatist";
    sentence1 =
      "Financial columnists praise your 'Law & Order Corporatist' doctrine, combining pro-business fiscal discipline with uncompromising precinct enforcement.";
  } else if (economicAxis >= 18 && governanceAxis < 15) {
    leaderTitle = "Chamber of Commerce Darling";
    sentence1 =
      "Downtown executives celebrate you as a 'Chamber of Commerce Darling' cutting red tape, protecting property values, and courting private capital.";
  } else if (governanceAxis >= 22) {
    leaderTitle = "Executive Strongman";
    sentence1 =
      "Watchdog groups warn of an emerging 'Executive Strongman' style at City Hall as you lean heavily on public safety crackdowns and unilateral decrees.";
  } else if (governanceAxis <= -22) {
    leaderTitle = "Civic Libertarian";
    sentence1 =
      "Policy institutes categorize your leadership as 'Civic Libertarian,' favoring decentralized neighborhood solutions over heavy-handed policing.";
  }

  const approvalRounded = Math.round(voterSentiment.overallApproval);
  const sentence2 =
    treasury.reserves < 0
      ? `However, with the treasury sitting at -$${Math.abs(
          treasury.reserves
        ).toLocaleString()} and voter approval at ${approvalRounded}%, bond analysts question how long the city can finance your agenda.`
      : approvalRounded >= 55
      ? `Backed by a ${approvalRounded}% public mandate, $${treasury.reserves.toLocaleString()} in reserves, and ${enactedPoliciesCount} enacted laws, your coalition currently dominates the political narrative.`
      : `With approval hovering at ${approvalRounded}% across ${enactedPoliciesCount} enacted directives, opposition critics warn that your coalition remains vulnerable ahead of the Turn 24 ballot.`;

  return {
    economicAxis,
    governanceAxis,
    leaderTitle,
    editorialBlurb: `${sentence1} ${sentence2}`,
  };
}
