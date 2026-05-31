import { describe, it, expect } from "vitest";
import { classFormSchema } from "./classForm";
import { tomorrowSofiaDate } from "../format/sofiaTime";

describe("classFormSchema", () => {
  const tomorrow = tomorrowSofiaDate();
  const dayAfterTomorrow = new Date(tomorrow.getTime() + 86400000);

  describe("valid inputs", () => {
    it("should accept a complete valid class form", () => {
      const input = {
        date: dayAfterTomorrow,
        time: "18:30",
        duration: "60",
        practiceId: "vinyasa-flow",
        trainerIds: ["trainer1"],
        capacity: 15,
        depositEur: "20.00",
      };
      const result = classFormSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should accept all valid time formats", () => {
      const validTimes = ["00:00", "08:30", "12:00", "18:30", "23:59"];
      validTimes.forEach((time) => {
        const input = {
          date: dayAfterTomorrow,
          time,
          duration: "60",
          practiceId: "vinyasa-flow",
          trainerIds: ["trainer1"],
          capacity: 15,
          depositEur: "20.00",
        };
        const result = classFormSchema.safeParse(input);
        expect(result.success).toBe(true);
      });
    });

    it("should accept valid EUR formats", () => {
      const validEurFormats = ["0", "15", "20.00", "0.50", "100.99"];
      validEurFormats.forEach((eur) => {
        const input = {
          date: dayAfterTomorrow,
          time: "18:30",
          duration: "60",
          practiceId: "vinyasa-flow",
          trainerIds: ["trainer1"],
          capacity: 15,
          depositEur: eur,
        };
        const result = classFormSchema.safeParse(input);
        expect(result.success).toBe(true);
      });
    });

    it("should accept all valid durations", () => {
      const validDurations = ["45", "55", "60", "70", "80", "90", "100", "120"];
      validDurations.forEach((duration) => {
        const input = {
          date: dayAfterTomorrow,
          time: "18:30",
          duration,
          practiceId: "vinyasa-flow",
          trainerIds: ["trainer1"],
          capacity: 15,
          depositEur: "20.00",
        };
        const result = classFormSchema.safeParse(input);
        expect(result.success).toBe(true);
      });
    });

    it("should accept 1 or 2 trainers", () => {
      const oneTrainer = {
        date: dayAfterTomorrow,
        time: "18:30",
        duration: "60",
        practiceId: "vinyasa-flow",
        trainerIds: ["trainer1"],
        capacity: 15,
        depositEur: "20.00",
      };
      expect(classFormSchema.safeParse(oneTrainer).success).toBe(true);

      const twoTrainers = {
        date: dayAfterTomorrow,
        time: "18:30",
        duration: "60",
        practiceId: "vinyasa-flow",
        trainerIds: ["trainer1", "trainer2"],
        capacity: 15,
        depositEur: "20.00",
      };
      expect(classFormSchema.safeParse(twoTrainers).success).toBe(true);
    });

    it("should accept capacity between 1 and 50", () => {
      const input = {
        date: dayAfterTomorrow,
        time: "18:30",
        duration: "60",
        practiceId: "vinyasa-flow",
        trainerIds: ["trainer1"],
        depositEur: "20.00",
      };
      for (let cap = 1; cap <= 50; cap++) {
        const result = classFormSchema.safeParse({ ...input, capacity: cap });
        expect(result.success).toBe(true);
      }
    });

    it("should accept optional classId, isSpecialEvent, and eventNotes", () => {
      const input = {
        classId: "existing-id",
        date: dayAfterTomorrow,
        time: "18:30",
        duration: "60",
        practiceId: "vinyasa-flow",
        trainerIds: ["trainer1"],
        capacity: 15,
        depositEur: "20.00",
        isSpecialEvent: true,
        eventNotes: "Special workshop",
      };
      const result = classFormSchema.safeParse(input);
      expect(result.success).toBe(true);
    });
  });

  describe("invalid inputs", () => {
    it("should reject past dates", () => {
      const input = {
        // 7 days ago — always strictly in the past regardless of run time
        date: new Date(tomorrow.getTime() - 8 * 86400000),
        time: "18:30",
        duration: "60",
        practiceId: "vinyasa-flow",
        trainerIds: ["trainer1"],
        capacity: 15,
        depositEur: "20.00",
      };
      const result = classFormSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("should reject a time less than 30 minutes in the future", () => {
      // 10 minutes from now in Sofia local time, today's Sofia date.
      const sofiaParts = Object.fromEntries(
        new Intl.DateTimeFormat("en-CA", {
          timeZone: "Europe/Sofia",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        })
          .formatToParts(new Date(Date.now() + 10 * 60 * 1000))
          .map((p) => [p.type, p.value]),
      );
      const date = new Date(
        `${sofiaParts.year}-${sofiaParts.month}-${sofiaParts.day}T00:00:00Z`,
      );
      const time = `${sofiaParts.hour}:${sofiaParts.minute}`;
      const result = classFormSchema.safeParse({
        date,
        time,
        duration: "60",
        practiceId: "vinyasa-flow",
        trainerIds: ["trainer1"],
        capacity: 15,
        depositEur: "20.00",
      });
      expect(result.success).toBe(false);
    });

    it("should reject invalid time formats", () => {
      const invalidTimes = ["18:3", "18:300", "18-30", "1830", "1:30", "999:99"];
      invalidTimes.forEach((time) => {
        const input = {
          date: dayAfterTomorrow,
          time,
          duration: "60",
          practiceId: "vinyasa-flow",
          trainerIds: ["trainer1"],
          capacity: 15,
          depositEur: "20.00",
        };
        const result = classFormSchema.safeParse(input);
        expect(result.success).toBe(false);
      });
    });

    it("should reject invalid durations", () => {
      const invalidDurations = ["30", "50", "75", "110", "150", "1"];
      invalidDurations.forEach((duration) => {
        const input = {
          date: dayAfterTomorrow,
          time: "18:30",
          duration,
          practiceId: "vinyasa-flow",
          trainerIds: ["trainer1"],
          capacity: 15,
          depositEur: "20.00",
        };
        const result = classFormSchema.safeParse(input);
        expect(result.success).toBe(false);
      });
    });

    it("should reject invalid EUR formats", () => {
      const invalidEurs = ["20.5", "20.000", "abc", "20,00", "€20"];
      invalidEurs.forEach((eur) => {
        const input = {
          date: dayAfterTomorrow,
          time: "18:30",
          duration: "60",
          practiceId: "vinyasa-flow",
          trainerIds: ["trainer1"],
          capacity: 15,
          depositEur: eur,
        };
        const result = classFormSchema.safeParse(input);
        expect(result.success).toBe(false);
      });
    });

    it("should reject capacity < 1 or > 50", () => {
      const input = {
        date: dayAfterTomorrow,
        time: "18:30",
        duration: "60",
        practiceId: "vinyasa-flow",
        trainerIds: ["trainer1"],
        depositEur: "20.00",
      };
      expect(classFormSchema.safeParse({ ...input, capacity: 0 }).success).toBe(false);
      expect(classFormSchema.safeParse({ ...input, capacity: 51 }).success).toBe(false);
      expect(classFormSchema.safeParse({ ...input, capacity: -1 }).success).toBe(false);
      expect(classFormSchema.safeParse({ ...input, capacity: 100 }).success).toBe(false);
    });

    it("should reject 0 trainers", () => {
      const input = {
        date: dayAfterTomorrow,
        time: "18:30",
        duration: "60",
        practiceId: "vinyasa-flow",
        trainerIds: [],
        capacity: 15,
        depositEur: "20.00",
      };
      const result = classFormSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("should reject > 2 trainers", () => {
      const input = {
        date: dayAfterTomorrow,
        time: "18:30",
        duration: "60",
        practiceId: "vinyasa-flow",
        trainerIds: ["trainer1", "trainer2", "trainer3"],
        capacity: 15,
        depositEur: "20.00",
      };
      const result = classFormSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("should reject empty practiceId", () => {
      const input = {
        date: dayAfterTomorrow,
        time: "18:30",
        duration: "60",
        practiceId: "",
        trainerIds: ["trainer1"],
        capacity: 15,
        depositEur: "20.00",
      };
      const result = classFormSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("should reject non-integer capacity", () => {
      const input = {
        date: dayAfterTomorrow,
        time: "18:30",
        duration: "60",
        practiceId: "vinyasa-flow",
        trainerIds: ["trainer1"],
        capacity: 15.5,
        depositEur: "20.00",
      };
      const result = classFormSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe("optional fields", () => {
    it("should allow omitting classId", () => {
      const input = {
        date: dayAfterTomorrow,
        time: "18:30",
        duration: "60",
        practiceId: "vinyasa-flow",
        trainerIds: ["trainer1"],
        capacity: 15,
        depositEur: "20.00",
      };
      const result = classFormSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should allow omitting eventNotes", () => {
      const input = {
        date: dayAfterTomorrow,
        time: "18:30",
        duration: "60",
        practiceId: "vinyasa-flow",
        trainerIds: ["trainer1"],
        capacity: 15,
        depositEur: "20.00",
      };
      const result = classFormSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should default isSpecialEvent to false", () => {
      const input = {
        date: dayAfterTomorrow,
        time: "18:30",
        duration: "60",
        practiceId: "vinyasa-flow",
        trainerIds: ["trainer1"],
        capacity: 15,
        depositEur: "20.00",
      };
      const result = classFormSchema.safeParse(input);
      if (result.success) {
        expect(result.data.isSpecialEvent).toBe(false);
      }
    });
  });
});
