import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  describeOutside,
  describeSchedule,
  evaluateSchedule,
  localNow,
  parseSchedule,
  resolveService,
  type Schedule,
} from "./schedule";

/** İstanbul yerel saatinden (UTC+3, DST yok) bir an üretir. */
function istanbul(date: string, time: string): Date {
  return new Date(`${date}T${time}:00+03:00`);
}

const everyDay = [0, 1, 2, 3, 4, 5, 6];

function sched(partial: Partial<Schedule>): Schedule {
  return { starts_on: null, ends_on: null, windows: [], outside: "show", ...partial };
}

describe("parseSchedule", () => {
  it("returns null for empty / invalid / non-object values", () => {
    assert.equal(parseSchedule(null), null);
    assert.equal(parseSchedule("x"), null);
    assert.equal(parseSchedule([]), null);
    assert.equal(parseSchedule({}), null);
    assert.equal(parseSchedule({ windows: [] }), null);
    assert.equal(parseSchedule({ windows: [{ days: [], start: "10:00", end: "12:00" }] }), null);
  });

  it("drops malformed windows and keeps valid ones", () => {
    const s = parseSchedule({
      windows: [
        { days: [1, 1, 2, 9], start: "11:00", end: "16:00" },
        { days: [1], start: "25:00", end: "16:00" },
        { days: [1], start: "10:00" },
        "junk",
      ],
    });
    assert.deepEqual(s?.windows, [{ days: [1, 2], start: "11:00", end: "16:00" }]);
    assert.equal(s?.outside, "show");
  });

  it("treats equal or missing times as all day", () => {
    const s = parseSchedule({ windows: [{ days: [6, 0], start: "08:00", end: "08:00" }] });
    assert.deepEqual(s?.windows, [{ days: [0, 6], start: null, end: null }]);
  });

  it("validates dates, swaps reversed ranges and keeps hide mode", () => {
    const s = parseSchedule({ starts_on: "2026-03-05", ends_on: "2026-03-01", outside: "hide" });
    assert.equal(s?.starts_on, "2026-03-01");
    assert.equal(s?.ends_on, "2026-03-05");
    assert.equal(s?.outside, "hide");
    assert.equal(parseSchedule({ starts_on: "2026-02-31" }), null);
  });
});

describe("localNow", () => {
  it("uses the venue time zone, not the machine one", () => {
    // 23:30 UTC = 02:30 ertesi gün İstanbul
    const l = localNow(new Date("2026-11-16T23:30:00Z"));
    assert.equal(l.date, "2026-11-17");
    assert.equal(l.minutes, 2 * 60 + 30);
    assert.equal(l.dow, 2); // 17 Kasım 2026 Salı
  });
});

describe("evaluateSchedule", () => {
  it("no schedule = always available", () => {
    assert.equal(evaluateSchedule(null, new Date()).available, true);
  });

  const pizza = sched({ windows: [{ days: everyDay, start: "11:00", end: "16:00" }] });

  it("is available inside and unavailable outside a daily window", () => {
    assert.equal(evaluateSchedule(pizza, istanbul("2026-11-16", "11:00")).available, true);
    assert.equal(evaluateSchedule(pizza, istanbul("2026-11-16", "15:59")).available, true);
    assert.equal(evaluateSchedule(pizza, istanbul("2026-11-16", "16:00")).available, false);
    assert.equal(evaluateSchedule(pizza, istanbul("2026-11-16", "10:59")).available, false);
  });

  it("reports the next start today, tomorrow", () => {
    const early = evaluateSchedule(pizza, istanbul("2026-11-16", "09:00"));
    assert.deepEqual(early.next, { date: "2026-11-16", minutes: 11 * 60 });
    const late = evaluateSchedule(pizza, istanbul("2026-11-16", "20:00"));
    assert.deepEqual(late.next, { date: "2026-11-17", minutes: 11 * 60 });
  });

  it("respects weekdays (16 Kasım 2026 is Monday)", () => {
    const weekend = sched({ windows: [{ days: [0, 6], start: "09:00", end: "12:00" }] });
    const mon = evaluateSchedule(weekend, istanbul("2026-11-16", "10:00"));
    assert.equal(mon.available, false);
    assert.deepEqual(mon.next, { date: "2026-11-21", minutes: 9 * 60 }); // Cumartesi
    assert.equal(evaluateSchedule(weekend, istanbul("2026-11-21", "10:00")).available, true);
  });

  it("supports windows crossing midnight, including the morning after", () => {
    const night = sched({ windows: [{ days: [5], start: "22:00", end: "02:00" }] }); // Cuma
    assert.equal(evaluateSchedule(night, istanbul("2026-11-20", "23:00")).available, true); // Cuma 23:00
    assert.equal(evaluateSchedule(night, istanbul("2026-11-21", "01:30")).available, true); // Cmt 01:30
    assert.equal(evaluateSchedule(night, istanbul("2026-11-21", "02:00")).available, false);
    assert.equal(evaluateSchedule(night, istanbul("2026-11-21", "23:00")).available, false); // Cmt akşamı değil
    assert.equal(evaluateSchedule(night, istanbul("2026-11-20", "01:30")).available, false); // Per sabahı değil
  });

  it("handles all-day windows and date ranges", () => {
    const campaign = sched({ starts_on: "2026-12-01", ends_on: "2026-12-05" });
    const before = evaluateSchedule(campaign, istanbul("2026-11-30", "12:00"));
    assert.equal(before.available, false);
    assert.equal(before.ended, false);
    assert.deepEqual(before.next, { date: "2026-12-01", minutes: 0 });
    assert.equal(evaluateSchedule(campaign, istanbul("2026-12-05", "23:59")).available, true);
    const after = evaluateSchedule(campaign, istanbul("2026-12-06", "00:00"));
    assert.equal(after.available, false);
    assert.equal(after.ended, true);
    assert.equal(after.next, null);
  });

  it("date range limits the windows too", () => {
    const s = sched({
      starts_on: "2026-12-01",
      windows: [{ days: everyDay, start: "11:00", end: "16:00" }],
    });
    const before = evaluateSchedule(s, istanbul("2026-11-16", "12:00"));
    assert.equal(before.available, false);
    assert.deepEqual(before.next, { date: "2026-12-01", minutes: 11 * 60 });
  });

  it("midnight spill-over stops at the end date", () => {
    const s = sched({ ends_on: "2026-11-20", windows: [{ days: everyDay, start: "22:00", end: "02:00" }] });
    assert.equal(evaluateSchedule(s, istanbul("2026-11-21", "01:00")).available, true); // 20'sinin devamı
    assert.equal(evaluateSchedule(s, istanbul("2026-11-21", "23:00")).available, false);
  });
});

describe("resolveService", () => {
  const now = istanbul("2026-11-16", "20:00");
  const dayOnly = sched({ windows: [{ days: everyDay, start: "11:00", end: "16:00" }] });
  const dayOnlyHidden = sched({ outside: "hide", windows: [{ days: everyDay, start: "11:00", end: "16:00" }] });

  it("visible + no outside when nothing is scheduled", () => {
    const r = resolveService([{ level: "menu", schedule: null }, { level: "product", schedule: null }], now);
    assert.deepEqual(r, { visible: true, outside: null });
  });

  it("show mode keeps the item visible and flags the most specific level", () => {
    const r = resolveService(
      [
        { level: "menu", schedule: dayOnly },
        { level: "product", schedule: dayOnly },
      ],
      now
    );
    assert.equal(r.visible, true);
    assert.equal(r.outside?.level, "product");
  });

  it("hide mode at any level hides the item", () => {
    const r = resolveService(
      [
        { level: "menu", schedule: null },
        { level: "category", schedule: dayOnlyHidden },
      ],
      now
    );
    assert.equal(r.visible, false);
  });

  it("inside the window nothing is flagged", () => {
    const r = resolveService([{ level: "menu", schedule: dayOnly }], istanbul("2026-11-16", "12:00"));
    assert.deepEqual(r, { visible: true, outside: null });
  });
});

describe("text helpers", () => {
  const pizza = sched({ windows: [{ days: everyDay, start: "11:00", end: "16:00" }] });

  it("describes schedules in three languages", () => {
    assert.equal(describeSchedule(pizza, "tr"), "Her gün 11:00–16:00");
    assert.equal(describeSchedule(pizza, "en"), "Every day 11:00–16:00");
    assert.equal(
      describeSchedule(sched({ windows: [{ days: [1, 2, 3, 4, 5], start: "07:00", end: "11:00" }] }), "tr"),
      "Hafta içi 07:00–11:00"
    );
    assert.equal(
      describeSchedule(sched({ windows: [{ days: [6, 1], start: null, end: null }] }), "tr"),
      "Pzt, Cmt tüm gün"
    );
    assert.equal(describeSchedule(null, "tr"), "");
  });

  it("describes when service restarts", () => {
    const now = istanbul("2026-11-16", "20:00");
    assert.equal(describeOutside(evaluateSchedule(pizza, now), "tr", now), "Şu an servis dışı · Yarın 11:00'de başlar");
    const morning = istanbul("2026-11-16", "09:00");
    assert.equal(
      describeOutside(evaluateSchedule(pizza, morning), "tr", morning),
      "Şu an servis dışı · 11:00'de başlar"
    );
    const ended = sched({ ends_on: "2026-11-01" });
    assert.equal(describeOutside(evaluateSchedule(ended, now), "tr", now), "Şu an servis dışı · Sona erdi");
  });
});
