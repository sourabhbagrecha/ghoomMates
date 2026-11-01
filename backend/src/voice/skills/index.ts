// Skill registry. A new voice capability = one file in this folder + one entry here.
import { expenses } from './expenses.ts';
import { navigation } from './navigation.ts';
import { reel } from './reel.ts';
import type { Skill } from './types.ts';

export const SKILLS: Skill[] = [expenses, reel, navigation];

export type { Skill, SkillContext, SessionState, TripDetail, TripMember, Tool } from './types.ts';
