// Skill registry. A new voice capability = one file in this folder + one entry here.
import { crowds } from './crowds.ts';
import { events } from './events.ts';
import { expenses } from './expenses.ts';
import { experiences } from './experiences.ts';
import { memory } from './memory.ts';
import { navigation } from './navigation.ts';
import type { Skill } from './types.ts';

export const SKILLS: Skill[] = [expenses, experiences, crowds, events, memory, navigation];

export type { Skill, SkillContext, SessionState, TripDetail, Tool } from './types.ts';
