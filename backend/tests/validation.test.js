import assert from 'node:assert/strict';
import { validateScheduleInput } from '../src/validation.js';
import { slotIndex } from '../src/constants.js';
import { generateSchedule } from '../src/scheduler.js';

function testSlotIndex() {
  assert.equal(slotIndex('Monday', 0), 0);
  assert.equal(slotIndex('Saturday', 12), 5 * 24 + 12);
  assert.equal(slotIndex('InvalidDay', 10), null);
  assert.equal(slotIndex('Monday', 24), null);
}

function testOverlapRejected() {
  const body = {
    activities: [
      {
        id: 'A1',
        name: 'Kelas A',
        is_fixed: true,
        energy_cost: 3,
        fixed_slots: [{ day: 'Monday', start_hour: 10, end_hour: 12 }],
      },
      {
        id: 'A2',
        name: 'Kelas B',
        is_fixed: true,
        energy_cost: 3,
        fixed_slots: [{ day: 'Monday', start_hour: 11, end_hour: 13 }],
      },
    ],
  };
  const result = validateScheduleInput(body);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('overlap')));
}

function testFlexibleFeasibility() {
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const body = {
    activities: [
      {
        id: 'FIX',
        name: 'Full Week',
        is_fixed: true,
        energy_cost: 4,
        fixed_slots: days.map((day) => ({ day, start_hour: 0, end_hour: 24 })),
      },
      {
        id: 'FLEX',
        name: 'Study',
        is_fixed: false,
        energy_cost: 2,
        total_duration_hours: 5,
      },
    ],
  };
  const result = validateScheduleInput(body);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('only')));
}

function testGenerateKerjaScenario() {
  const result = generateSchedule(
    {
      user_preferences: { max_daily_energy_cap: 15, default_sleep_start: 23, default_sleep_end: 5 },
      activities: [
        {
          id: 'ACT_KERJA',
          name: 'Kerja',
          is_fixed: true,
          energy_cost: 5,
          fixed_slots: [
            { day: 'Monday', start_hour: 15, end_hour: 23 },
            { day: 'Saturday', start_hour: 12, end_hour: 20 },
          ],
        },
        {
          id: 'ACT_FLEX',
          name: 'Coding',
          is_fixed: false,
          energy_cost: 5,
          total_duration_hours: 8,
        },
      ],
    },
    { seed: 15 }
  );

  assert.equal(result.success, true);
  assert.equal(result.schedule.slots.length, 168);
  assert.ok(Array.isArray(result.warnings));
}

function testFlexibleHoursPlacedWithFixedActivity() {
  const result = generateSchedule(
    {
      user_preferences: { max_daily_energy_cap: 15, default_sleep_start: 23, default_sleep_end: 5 },
      activities: [
        {
          id: 'ACT_1',
          name: 'sekolah',
          is_fixed: true,
          energy_cost: 3,
          fixed_slots: [{ day: 'Monday', start_hour: 9, end_hour: 10 }],
        },
        {
          id: 'ACT_2',
          name: 'main',
          is_fixed: false,
          energy_cost: 3,
          total_duration_hours: 2,
        },
      ],
    },
    { seed: 42 }
  );

  const flexHours = result.schedule.slots.filter((s) => s.activity_id === 'ACT_2').length;
  assert.equal(result.success, true);
  assert.equal(flexHours, 2);
  assert.equal(result.fitness_breakdown?.hard, undefined);
}

function testNoActivitiesDuringSleepHours() {
  const result = generateSchedule(
    {
      user_preferences: { max_daily_energy_cap: 15, default_sleep_start: 23, default_sleep_end: 7 },
      activities: [
        {
          id: 'ACT_1',
          name: 'sekolah',
          is_fixed: true,
          energy_cost: 3,
          fixed_slots: [{ day: 'Monday', start_hour: 9, end_hour: 10 }],
        },
        {
          id: 'ACT_2',
          name: 'main',
          is_fixed: false,
          energy_cost: 3,
          total_duration_hours: 4,
        },
      ],
    },
    { seed: 99 }
  );

  const sleepStart = 23;
  const sleepEnd = 7;
  const violations = result.schedule.slots.filter((slot) => {
    const hour = slot.hour;
    const inSleep =
      sleepStart > sleepEnd ? hour >= sleepStart || hour < sleepEnd : hour >= sleepStart && hour < sleepEnd;
    return inSleep && slot.activity_id != null;
  });

  assert.equal(violations.length, 0, 'flexible activities must not be placed during sleep');
  assert.equal(result.fitness_breakdown?.hard, undefined);
}

function testFixedSlotDuringSleepRejected() {
  const result = validateScheduleInput({
    user_preferences: { default_sleep_start: 23, default_sleep_end: 7 },
    activities: [
      {
        id: 'ACT_1',
        name: 'shift malam',
        is_fixed: true,
        energy_cost: 3,
        fixed_slots: [{ day: 'Thursday', start_hour: 5, end_hour: 6 }],
      },
    ],
  });

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('jam tidur')));
}

testSlotIndex();
testOverlapRejected();
testFlexibleFeasibility();
testGenerateKerjaScenario();
testFlexibleHoursPlacedWithFixedActivity();
testNoActivitiesDuringSleepHours();
testFixedSlotDuringSleepRejected();

console.log('All validation tests passed');
