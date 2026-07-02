import type { AgentRole, HealthState, Point } from "./types/simulation";

export type NamedAgentSeed = {
  readonly id: string;
  readonly name: string;
  readonly role: AgentRole;
  readonly state: HealthState;
  readonly pixel_coords: Point;
};

export const NAMED_AGENT_SEED: readonly NamedAgentSeed[] = [
  {
    id: "A01",
    name: "Liu Wei",
    role: "passenger",
    state: "healthy",
    pixel_coords: { x: 210, y: 98 },
  },
  {
    id: "A02",
    name: "Marisol Vega",
    role: "passenger",
    state: "exposed",
    pixel_coords: { x: 406, y: 210 },
  },
  {
    id: "A03",
    name: "Dre Okafor",
    role: "passenger",
    state: "symptomatic",
    pixel_coords: { x: 266, y: 350 },
  },
  {
    id: "A04",
    name: "Yuki Tanaka",
    role: "passenger",
    state: "pre_symptomatic",
    pixel_coords: { x: 154, y: 350 },
  },
  {
    id: "A05",
    name: "Petra Stern",
    role: "passenger",
    state: "isolated",
    pixel_coords: { x: 266, y: 350 },
  },
  {
    id: "A06",
    name: "Omar Haddad",
    role: "crew",
    state: "healthy",
    pixel_coords: { x: 546, y: 210 },
  },
  {
    id: "A07",
    name: "Inez Cruz",
    role: "crew",
    state: "healthy",
    pixel_coords: { x: 154, y: 350 },
  },
  {
    id: "A08",
    name: "Roman Kade",
    role: "passenger",
    state: "recovered",
    pixel_coords: { x: 798, y: 350 },
  },
  {
    id: "A09",
    name: "Sora Matsui",
    role: "passenger",
    state: "healthy",
    pixel_coords: { x: 798, y: 350 },
  },
  {
    id: "A10",
    name: "Felipe Romero",
    role: "crew",
    state: "healthy",
    pixel_coords: { x: 938, y: 210 },
  },
  {
    id: "A11",
    name: "Aisha N'Diaye",
    role: "passenger",
    state: "exposed",
    pixel_coords: { x: 504, y: 350 },
  },
  {
    id: "A12",
    name: "Carl Brandt",
    role: "passenger",
    state: "exposed",
    pixel_coords: { x: 658, y: 210 },
  },
  {
    id: "A13",
    name: "Sven Lindqvist",
    role: "crew",
    state: "healthy",
    pixel_coords: { x: 938, y: 350 },
  },
  {
    id: "A14",
    name: "Mei-ling Zhao",
    role: "passenger",
    state: "pre_symptomatic",
    pixel_coords: { x: 336, y: 280 },
  },
  {
    id: "A15",
    name: "Hana Park",
    role: "passenger",
    state: "healthy",
    pixel_coords: { x: 476, y: 350 },
  },
  {
    id: "A16",
    name: "Tomás Reyes",
    role: "passenger",
    state: "exposed",
    pixel_coords: { x: 658, y: 462 },
  },
];

export function getNamedAgentSeed(): readonly NamedAgentSeed[] {
  return NAMED_AGENT_SEED;
}
